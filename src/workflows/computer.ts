import { Writable } from "node:stream"; // Import Writable for type safety

import { z } from "zod";
import { zodToGoogleGenAISchema } from "../utils/google-genai-schema";
import type { FunctionDeclaration } from "@google/genai";
import type Docker from "dockerode"; // Import Dockerode types if needed

import { docker } from "../docker";
import { hatchet } from "../hatchet";

const CONTAINER_NAME = "container-name";

// --- Zod Schemas ---

// Schema for creating a container
const CreateContainerInputSchema = z.object({
	image: z.string().describe("The name of the Docker image to use."),
	cmd: z
		.array(z.string())
		.optional()
		.describe("Command to run in the container."),
	hostConfig: z
		.record(z.any())
		.optional()
		.describe(
			"Docker HostConfig options (e.g., Binds, PortBindings). Refer to Dockerode documentation.",
		),
	// Add other relevant Dockerode create options as needed
});
const CreateContainerOutputSchema = z.object({
	containerId: z.string().describe("The ID of the created container."),
	warnings: z
		.array(z.string())
		.optional()
		.describe("Any warnings returned by Docker."),
});

// Schema for running a command in a container
const RunCommandInputSchema = z.object({
	cmd: z
		.array(z.string())
		.describe("The command and its arguments to execute."),
	attachStdout: z
		.boolean()
		.optional()
		.default(true)
		.describe("Attach to stdout."),
	attachStderr: z
		.boolean()
		.optional()
		.default(true)
		.describe("Attach to stderr."),
	tty: z.boolean().optional().default(false).describe("Allocate a pseudo-TTY."),
	// Consider adding user, workingDir etc. if needed
});
const RunCommandOutputSchema = z.object({
	stdout: z.string().describe("Output from stdout."),
	stderr: z.string().describe("Output from stderr."),
	exitCode: z.number().nullable().describe("The exit code of the command."),
});

// Schema for removing a container
const RemoveContainerInputSchema = z.object({
	force: z
		.boolean()
		.optional()
		.default(false)
		.describe("Force the removal of a running container."),
	removeVolumes: z
		.boolean()
		.optional()
		.default(false)
		.describe("Remove the volumes associated with the container."),
});
const RemoveContainerOutputSchema = z.object({
	success: z.boolean(),
});

// --- Hatchet Tasks ---

export const createContainer = hatchet.task<
	z.infer<typeof CreateContainerInputSchema>,
	z.infer<typeof CreateContainerOutputSchema>
>({
	name: "create-docker-container",
	fn: async (input) => {
		try {
			// Check if container already exists
			let existingContainer: Docker.Container | null = null;
			try {
				existingContainer = docker.getContainer(CONTAINER_NAME);
				const inspectInfo = await existingContainer.inspect();
				console.log(
					`Container '${CONTAINER_NAME}' already exists with ID: ${inspectInfo.Id}`,
				);
				// Optionally start if not running?
				if (!inspectInfo.State.Running) {
					console.log(`Starting existing container '${CONTAINER_NAME}'...`);
					await existingContainer.start();
				}
				return {
					containerId: inspectInfo.Id,
				};
			} catch (error: unknown) {
				// If container not found (404), proceed to create
				if (
					!(
						typeof error === "object" &&
						error !== null &&
						"statusCode" in error &&
						(error as { statusCode?: number }).statusCode === 404
					)
				) {
					throw error; // Re-throw unexpected errors during inspection
				}
				// Container doesn't exist, ignore the 404 and proceed
				console.log(`Container '${CONTAINER_NAME}' not found, creating...`);
			}

			// Create the container if it didn't exist
			const container = await docker.createContainer({
				Image: input.image,
				Cmd: input.cmd,
				name: CONTAINER_NAME, // Use the fixed name
				HostConfig: input.hostConfig as Docker.HostConfig, // Cast needed as Zod schema is generic
				AttachStdout: true, // Required for logs/exec
				AttachStderr: true, // Required for logs/exec
				OpenStdin: false,
				Tty: false, // Generally false for non-interactive execs
			});
			await container.start(); // Start the container immediately after creation
			console.log(
				`Container '${CONTAINER_NAME}' created and started with ID: ${container.id}`,
			);
			return {
				containerId: container.id,
				// Dockerode createContainer response might have Warnings
				// warnings: (container as any).Warnings, // Adjust if needed based on actual response
			};
		} catch (error: unknown) {
			// Use unknown instead of any for create error
			console.error("Error in createContainer task:", error);
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(
				`Failed to ensure container '${CONTAINER_NAME}' exists: ${message}`,
			);
		}
	},
});

export const runCommandInContainer = hatchet.task<
	z.infer<typeof RunCommandInputSchema>,
	z.infer<typeof RunCommandOutputSchema>
>({
	name: "run-command-in-container",
	fn: async (input) => {
		try {
			const container = docker.getContainer(CONTAINER_NAME); // Use fixed name
			// Ensure container exists before trying to exec
			try {
				await container.inspect();
			} catch (error: unknown) {
				if (
					typeof error === "object" &&
					error !== null &&
					"statusCode" in error &&
					(error as { statusCode?: number }).statusCode === 404
				) {
					throw new Error(
						`Container '${CONTAINER_NAME}' does not exist. Please create it first.`,
					);
				}
				throw error; // Re-throw other inspection errors
			}

			const exec = await container.exec({
				Cmd: input.cmd,
				AttachStdout: input.attachStdout,
				AttachStderr: input.attachStderr,
				Tty: input.tty,
			});

			const stream = await exec.start({
				hijack: true,
				stdin: false, // Assuming no stdin interaction for now
				Tty: input.tty,
			});

			// Collect output
			let stdout = "";
			let stderr = "";

			// docker.modem.demuxStream is needed to separate stdout and stderr
			// If Tty is true, the stream is not multiplexed.
			if (input.tty) {
				stdout = await new Promise((resolve, reject) => {
					let output = "";
					stream.on("data", (chunk) => {
						output += chunk.toString("utf8");
					});
					stream.on("end", () => resolve(output));
					stream.on("error", reject);
				});
			} else {
				const outputs = await new Promise<{ stdout: string; stderr: string }>(
					(resolve, reject) => {
						let stdoutData = "";
						let stderrData = "";

						// Create simple Writable streams to capture output
						const stdoutStream = new Writable({
							write(chunk, encoding, callback) {
								stdoutData += chunk.toString("utf8");
								callback();
							},
						});
						const stderrStream = new Writable({
							write(chunk, encoding, callback) {
								stderrData += chunk.toString("utf8");
								callback();
							},
						});

						docker.modem.demuxStream(stream, stdoutStream, stderrStream);

						stream.on("end", () =>
							resolve({ stdout: stdoutData, stderr: stderrData }),
						);
						stream.on("error", reject);
					},
				);
				stdout = outputs.stdout;
				stderr = outputs.stderr;
			}

			// Get exit code
			const inspectResult = await exec.inspect();
			const exitCode = inspectResult.ExitCode;

			return { stdout, stderr, exitCode };
		} catch (error: unknown) {
			// Use unknown instead of any
			console.error("Error running command in container:", error);
			// Type check for Docker API error structure more safely
			let errorMessage = "Unknown error";
			let statusCode: number | string = "N/A";

			if (typeof error === "object" && error !== null) {
				const potentialError = error as {
					json?: { message?: string };
					message?: string;
					statusCode?: number | string;
				};

				if (
					potentialError.json &&
					typeof potentialError.json === "object" &&
					potentialError.json.message
				) {
					errorMessage = potentialError.json.message;
				} else if (potentialError.message) {
					errorMessage = potentialError.message;
				}

				if (potentialError.statusCode !== undefined) {
					statusCode = potentialError.statusCode;
				}
			}

			// Provide specific error if container doesn't exist
			if (statusCode === 404) {
				errorMessage = `Container '${CONTAINER_NAME}' not found.`;
			}
			throw new Error(
				`Failed to run command in container '${CONTAINER_NAME}' (Status: ${statusCode}): ${errorMessage}`,
			);
		}
	},
});

export const removeContainer = hatchet.task<
	z.infer<typeof RemoveContainerInputSchema>,
	z.infer<typeof RemoveContainerOutputSchema>
>({
	name: "remove-docker-container",
	fn: async (input) => {
		try {
			const container = docker.getContainer(CONTAINER_NAME); // Use fixed name
			console.log(`Attempting to remove container '${CONTAINER_NAME}'...`);
			await container.remove({
				force: input.force,
				v: input.removeVolumes, // 'v' corresponds to removeVolumes
			});
			console.log(`Container '${CONTAINER_NAME}' removed successfully.`);
			return { success: true };
		} catch (error: unknown) {
			// Use unknown instead of any
			// Handle cases where the container might not exist (e.g., status code 404)
			if (
				typeof error === "object" &&
				error !== null &&
				"statusCode" in error &&
				(error as { statusCode?: number }).statusCode === 404
			) {
				console.warn(`Container '${CONTAINER_NAME}' not found for removal.`);
				return { success: false }; // Indicate container wasn't found
			}
			console.error("Error removing container:", error);
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(
				`Failed to remove container '${CONTAINER_NAME}': ${message}`,
			);
		}
	},
});

// --- Google GenAI Function Declarations ---

export const computerTools: FunctionDeclaration[] = [
	{
		name: "create-docker-container",
		description: `Ensures the specific Docker container named '${CONTAINER_NAME}' exists and is running, creating it if necessary. Returns the container ID.`,
		parameters: zodToGoogleGenAISchema(false, CreateContainerInputSchema),
		response: zodToGoogleGenAISchema(false, CreateContainerOutputSchema),
	},
	{
		name: "run-command-in-container",
		description: `Executes a command inside the specific Docker container named '${CONTAINER_NAME}' and returns its output and exit code.`,
		parameters: zodToGoogleGenAISchema(false, RunCommandInputSchema),
		response: zodToGoogleGenAISchema(false, RunCommandOutputSchema),
	},
	{
		name: "remove-docker-container",
		description: `Removes the specific Docker container named '${CONTAINER_NAME}'.`,
		parameters: zodToGoogleGenAISchema(false, RemoveContainerInputSchema),
		response: zodToGoogleGenAISchema(false, RemoveContainerOutputSchema),
	},
];
