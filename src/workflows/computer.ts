import { PassThrough } from "node:stream";

import { z } from "zod";
import { zodToGoogleGenAISchema } from "../utils/google-genai-schema";
import type { FunctionDeclaration } from "@google/genai";
import type Docker from "dockerode";

import { docker } from "../docker";
import { hatchet } from "../hatchet";

const CONTAINER_NAME = "container-name";

// --- Zod Schemas ---

// Schema for creating a container
const CreateContainerInputSchema = z.object({
	image: z.string().describe("The name of the Docker image to use."),
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
});

// Schema for running a command in a container
const RunCommandInputSchema = z.object({
	cmd: z
		.array(z.string())
		.describe("The command and its arguments to execute."),
	workingDir: z
		.string()
		.optional()
		.describe("The working directory inside the container for the command."),
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
			let container: Docker.Container;
			try {
				container = docker.getContainer(CONTAINER_NAME);
				const info = await container.inspect();
				if (!info.State.Running) {
					await container.start();
				}
				return { containerId: info.Id };
			} catch (err: unknown) {
				if (
					typeof err === "object" &&
					err !== null &&
					"statusCode" in err &&
					typeof err.statusCode === "number" &&
					err.statusCode === 404
				) {
					// not found, proceed to create
				} else {
					throw err;
				}
			}
			container = await docker.createContainer({
				Image: input.image,
				name: CONTAINER_NAME,
				Cmd: ["tail", "-f", "/dev/null"],
				HostConfig: input.hostConfig as Docker.HostConfig,
			});
			await container.start();
			const id = container.id;
			return { containerId: id };
		} catch (error: unknown) {
			const msg = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to create container '${CONTAINER_NAME}': ${msg}`);
		}
	},
});

export const runCommandInContainer = hatchet.task<
	z.infer<typeof RunCommandInputSchema>,
	z.infer<typeof RunCommandOutputSchema>
>({
	name: "run-command-in-container",
	fn: async (input) => {
		const container = docker.getContainer(CONTAINER_NAME);
		await container.inspect();
		const execInst = await container.exec({
			Cmd: input.cmd,
			WorkingDir: input.workingDir ?? "/",
			AttachStdout: input.attachStdout ?? true,
			AttachStderr: input.attachStderr ?? true,
			Tty: input.tty ?? false,
		});
		const stream = await execInst.start({
			hijack: true,
			stdin: false,
			Tty: input.tty ?? false,
		});
		const stdoutBuffers: Buffer[] = [];
		const stderrBuffers: Buffer[] = [];
		if (input.tty) {
			stream.on("data", (chunk) =>
				stdoutBuffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
			);
		} else {
			const stdoutStream = new PassThrough();
			const stderrStream = new PassThrough();
			docker.modem.demuxStream(stream, stdoutStream, stderrStream);
			stdoutStream.on("data", (chunk) => stdoutBuffers.push(chunk));
			stderrStream.on("data", (chunk) => stderrBuffers.push(chunk));
		}
		await new Promise<void>((resolve, reject) => {
			stream.on("end", resolve);
			stream.on("error", reject);
		});
		const inspectData = await execInst.inspect();
		const exitCode = inspectData.ExitCode ?? null;
		const stdout = Buffer.concat(stdoutBuffers).toString("utf8");
		const stderr = input.tty
			? ""
			: Buffer.concat(stderrBuffers).toString("utf8");
		return { stdout, stderr, exitCode };
	},
});

export const removeContainer = hatchet.task<
	z.infer<typeof RemoveContainerInputSchema>,
	z.infer<typeof RemoveContainerOutputSchema>
>({
	name: "remove-docker-container",
	fn: async (input): Promise<z.infer<typeof RemoveContainerOutputSchema>> => {
		// Added explicit Promise return type
		try {
			const container = docker.getContainer(CONTAINER_NAME); // Use fixed name
			// Inspect and stop if running
			const info = await container.inspect();
			if (info.State.Running) {
				await container.stop();
				console.log(`Container '${CONTAINER_NAME}' stopped before removal.`);
			}
			console.log(`Attempting to remove container '${CONTAINER_NAME}'...`);
			await container.remove({
				force: input.force,
				v: input.removeVolumes, // 'v' corresponds to removeVolumes in Docker API
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
				// Even if not found, the desired state (container removed) is achieved, arguably.
				// Depending on desired semantics, you might return true or a specific status.
				// Returning false as it wasn't *actively* removed by this call.
				return { success: false }; // Indicate container wasn't found
			}
			console.error("Error removing container:", error);
			const message = error instanceof Error ? error.message : String(error);
			// Throw a new error, fulfilling the function's need to either return or throw
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
		description: `Ensures the specific Docker container named '${CONTAINER_NAME}' exists and is running using the specified image, creating it if necessary. The container runs a background process to stay alive. Returns the container ID.`,
		parameters: zodToGoogleGenAISchema(false, CreateContainerInputSchema),
		response: zodToGoogleGenAISchema(false, CreateContainerOutputSchema),
	},
	{
		name: "run-command-in-container",
		description: `Executes a command inside the specific Docker container named '${CONTAINER_NAME}' and returns its output and exit code. Optionally sets the working directory (defaults to '/').`,
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
