import {
	readdir,
	readFile,
	writeFile,
	mkdir,
	unlink,
	rmdir,
	rename,
	stat,
	cp,
} from "node:fs/promises";
import path from "node:path";
import type { Stats } from "node:fs";

import { z } from "zod";
import type { FunctionDeclaration } from "@google/genai";

import { hatchet } from "../hatchet";
import { zodToGoogleGenAISchema } from "../utils/google-genai-schema";

// --- Zod Schemas ---

const ListDirInputSchema = z.object({
	directoryPath: z.string().describe("The path to the directory to list."),
});
const ListDirOutputSchema = z.object({
	entries: z.array(z.object({ name: z.string(), isDirectory: z.boolean() })),
});

const ReadFileInputSchema = z.object({
	filePath: z.string().describe("The path to the file to read."),
	encoding: z
		.string()
		.optional()
		.describe(
			"Optional text encoding (e.g., 'utf8', 'base64'). Defaults to 'utf8'.",
		),
});
const ReadFileOutputSchema = z.object({
	content: z.string(),
});

const WriteFileInputSchema = z.object({
	filePath: z.string().describe("The path to the file to write to."),
	content: z.string().describe("The content to write to the file."),
	encoding: z
		.string()
		.optional()
		.describe(
			"Optional text encoding (e.g., 'utf8', 'base64'). Defaults to 'utf8'.",
		),
});
const WriteFileOutputSchema = z.object({
	success: z.boolean(),
});

const CreateDirInputSchema = z.object({
	directoryPath: z
		.string()
		.describe("The path where the new directory should be created."),
	recursive: z
		.boolean()
		.optional()
		.describe(
			"If true, create parent directories as needed. Defaults to false.",
		),
});
const CreateDirOutputSchema = z.object({
	success: z.boolean(),
});

const DeleteFileInputSchema = z.object({
	filePath: z.string().describe("The path to the file to delete."),
});
const DeleteFileOutputSchema = z.object({
	success: z.boolean(),
});

const DeleteDirInputSchema = z.object({
	directoryPath: z.string().describe("The path to the directory to delete."),
	recursive: z
		.boolean()
		.optional()
		.describe(
			"If true, delete the directory and its contents recursively. Defaults to false.",
		),
});
const DeleteDirOutputSchema = z.object({
	success: z.boolean(),
});

const MoveRenameInputSchema = z.object({
	sourcePath: z.string().describe("The current path of the file or directory."),
	destinationPath: z
		.string()
		.describe("The new path for the file or directory."),
});
const MoveRenameOutputSchema = z.object({
	success: z.boolean(),
});

const CheckExistsInputSchema = z.object({
	pathToCheck: z.string().describe("The path to check for existence."),
});
const CheckExistsOutputSchema = z.object({
	exists: z.boolean(),
});

// Define a serializable version of Stats, as the original Stats object isn't directly serializable by Zod easily
const SerializableStatsSchema = z.object({
	isFile: z.boolean(),
	isDirectory: z.boolean(),
	isBlockDevice: z.boolean(),
	isCharacterDevice: z.boolean(),
	isSymbolicLink: z.boolean(),
	isFIFO: z.boolean(),
	isSocket: z.boolean(),
	dev: z.number(),
	ino: z.number(),
	mode: z.number(),
	nlink: z.number(),
	uid: z.number(),
	gid: z.number(),
	rdev: z.number(),
	size: z.number(),
	blksize: z.number(),
	blocks: z.number(),
	atimeMs: z.number(),
	mtimeMs: z.number(),
	ctimeMs: z.number(),
	birthtimeMs: z.number(),
	atime: z.string().describe("ISO string representation"),
	mtime: z.string().describe("ISO string representation"),
	ctime: z.string().describe("ISO string representation"),
	birthtime: z.string().describe("ISO string representation"),
});

const GetStatsInputSchema = z.object({
	pathToCheck: z
		.string()
		.describe("The path to the file or directory to get stats for."),
});
const GetStatsOutputSchema = z.object({
	stats: SerializableStatsSchema.nullable().describe(
		"Stats object or null if path doesn't exist",
	),
});

const CopyInputSchema = z.object({
	sourcePath: z.string().describe("The path of the file or directory to copy."),
	destinationPath: z
		.string()
		.describe("The path where the copy should be created."),
	recursive: z
		.boolean()
		.optional()
		.describe(
			"If true, copy directories recursively. Required for directories. Defaults to false.",
		),
});
const CopyOutputSchema = z.object({
	success: z.boolean(),
});

// --- List Directory Task ---

export const listDir = hatchet.task<
	z.infer<typeof ListDirInputSchema>,
	z.infer<typeof ListDirOutputSchema>
>({
	name: "list-directory",
	fn: async (input) => {
		const dirPath = path.resolve(input.directoryPath);
		const dirents = await readdir(dirPath, { withFileTypes: true });
		const entries = dirents.map((dirent) => ({
			name: dirent.name,
			isDirectory: dirent.isDirectory(),
		}));
		return { entries };
	},
});

// --- Read File Task ---

export const readFileTask = hatchet.task<
	z.infer<typeof ReadFileInputSchema>,
	z.infer<typeof ReadFileOutputSchema>
>({
	name: "read-file",
	fn: async (input) => {
		const filePath = path.resolve(input.filePath);
		const content = await readFile(filePath, {
			encoding: (input.encoding as BufferEncoding) || "utf8", // Cast needed as zod schema is string
		});
		return { content };
	},
});

// --- Write File Task ---

export const writeFileTask = hatchet.task<
	z.infer<typeof WriteFileInputSchema>,
	z.infer<typeof WriteFileOutputSchema>
>({
	name: "write-file",
	fn: async (input) => {
		const filePath = path.resolve(input.filePath);
		await writeFile(filePath, input.content, {
			encoding: (input.encoding as BufferEncoding) || "utf8", // Cast needed
		});
		return { success: true };
	},
});

// --- Create Directory Task ---

export const createDir = hatchet.task<
	z.infer<typeof CreateDirInputSchema>,
	z.infer<typeof CreateDirOutputSchema>
>({
	name: "create-directory",
	fn: async (input) => {
		const dirPath = path.resolve(input.directoryPath);
		await mkdir(dirPath, { recursive: input.recursive ?? false });
		return { success: true };
	},
});

// --- Delete File Task ---

export const deleteFile = hatchet.task<
	z.infer<typeof DeleteFileInputSchema>,
	z.infer<typeof DeleteFileOutputSchema>
>({
	name: "delete-file",
	fn: async (input) => {
		const filePath = path.resolve(input.filePath);
		await unlink(filePath);
		return { success: true };
	},
});

// --- Delete Directory Task ---

export const deleteDir = hatchet.task<
	z.infer<typeof DeleteDirInputSchema>,
	z.infer<typeof DeleteDirOutputSchema>
>({
	name: "delete-directory",
	fn: async (input) => {
		const dirPath = path.resolve(input.directoryPath);
		if (input.recursive) {
			await rmdir(dirPath, { recursive: true });
		} else {
			await rmdir(dirPath);
		}
		return { success: true };
	},
});

// --- Move/Rename Task ---

export const moveRename = hatchet.task<
	z.infer<typeof MoveRenameInputSchema>,
	z.infer<typeof MoveRenameOutputSchema>
>({
	name: "move-rename",
	fn: async (input) => {
		const source = path.resolve(input.sourcePath);
		const destination = path.resolve(input.destinationPath);
		await rename(source, destination);
		return { success: true };
	},
});

// --- Check Existence Task ---

export const checkExists = hatchet.task<
	z.infer<typeof CheckExistsInputSchema>,
	z.infer<typeof CheckExistsOutputSchema>
>({
	name: "check-exists",
	fn: async (input) => {
		const targetPath = path.resolve(input.pathToCheck);
		try {
			await stat(targetPath);
			return { exists: true };
		} catch (error: unknown) {
			if (
				typeof error === "object" &&
				error !== null &&
				(error as { code?: string }).code === "ENOENT"
			) {
				return { exists: false };
			}
			throw error;
		}
	},
});

// --- Get Stats Task ---

export const getStats = hatchet.task<
	z.infer<typeof GetStatsInputSchema>,
	z.infer<typeof GetStatsOutputSchema>
>({
	name: "get-stats",
	fn: async (input) => {
		const targetPath = path.resolve(input.pathToCheck);
		try {
			const statsResult: Stats = await stat(targetPath);
			// Convert Stats object to a serializable format matching the Zod schema
			const serializableStats: z.infer<typeof SerializableStatsSchema> = {
				isFile: statsResult.isFile(),
				isDirectory: statsResult.isDirectory(),
				isBlockDevice: statsResult.isBlockDevice(),
				isCharacterDevice: statsResult.isCharacterDevice(),
				isSymbolicLink: statsResult.isSymbolicLink(),
				isFIFO: statsResult.isFIFO(),
				isSocket: statsResult.isSocket(),
				dev: statsResult.dev,
				ino: statsResult.ino,
				mode: statsResult.mode,
				nlink: statsResult.nlink,
				uid: statsResult.uid,
				gid: statsResult.gid,
				rdev: statsResult.rdev,
				size: statsResult.size,
				blksize: statsResult.blksize,
				blocks: statsResult.blocks,
				atimeMs: statsResult.atimeMs,
				mtimeMs: statsResult.mtimeMs,
				ctimeMs: statsResult.ctimeMs,
				birthtimeMs: statsResult.birthtimeMs,
				atime: statsResult.atime.toISOString(),
				mtime: statsResult.mtime.toISOString(),
				ctime: statsResult.ctime.toISOString(),
				birthtime: statsResult.birthtime.toISOString(),
			};
			return { stats: serializableStats };
		} catch (error: unknown) {
			if (
				typeof error === "object" &&
				error !== null &&
				(error as { code?: string }).code === "ENOENT"
			) {
				return { stats: null };
			}
			throw error;
		}
	},
});

// --- Copy File/Directory Task ---

export const copy = hatchet.task<
	z.infer<typeof CopyInputSchema>,
	z.infer<typeof CopyOutputSchema>
>({
	name: "copy",
	fn: async (input) => {
		const source = path.resolve(input.sourcePath);
		const destination = path.resolve(input.destinationPath);
		await cp(source, destination, { recursive: input.recursive ?? false });
		return { success: true };
	},
});

// --- Google GenAI Function Declarations (Generated from Zod Schemas) ---

export const filesystemTools: FunctionDeclaration[] = [
	{
		name: "list-directory",
		description:
			"Lists the contents (files and subdirectories) of a specified directory.",
		parameters: zodToGoogleGenAISchema(false, ListDirInputSchema),
		response: zodToGoogleGenAISchema(false, ListDirOutputSchema),
	},
	{
		name: "read-file",
		description: "Reads the content of a specified file.",
		parameters: zodToGoogleGenAISchema(false, ReadFileInputSchema),
		response: zodToGoogleGenAISchema(false, ReadFileOutputSchema),
	},
	{
		name: "write-file",
		description:
			"Writes content to a specified file, overwriting it if it exists or creating it if it doesn't.",
		parameters: zodToGoogleGenAISchema(false, WriteFileInputSchema),
		response: zodToGoogleGenAISchema(false, WriteFileOutputSchema),
	},
	{
		name: "create-directory",
		description: "Creates a new directory.",
		parameters: zodToGoogleGenAISchema(false, CreateDirInputSchema),
		response: zodToGoogleGenAISchema(false, CreateDirOutputSchema),
	},
	{
		name: "delete-file",
		description: "Deletes a specified file.",
		parameters: zodToGoogleGenAISchema(false, DeleteFileInputSchema),
		response: zodToGoogleGenAISchema(false, DeleteFileOutputSchema),
	},
	{
		name: "delete-directory",
		description: "Deletes a specified directory.",
		parameters: zodToGoogleGenAISchema(false, DeleteDirInputSchema),
		response: zodToGoogleGenAISchema(false, DeleteDirOutputSchema),
	},
	{
		name: "move-rename",
		description: "Moves or renames a file or directory.",
		parameters: zodToGoogleGenAISchema(false, MoveRenameInputSchema),
		response: zodToGoogleGenAISchema(false, MoveRenameOutputSchema),
	},
	{
		name: "check-exists",
		description: "Checks if a file or directory exists at the specified path.",
		parameters: zodToGoogleGenAISchema(false, CheckExistsInputSchema),
		response: zodToGoogleGenAISchema(false, CheckExistsOutputSchema),
	},
	{
		name: "get-stats",
		description:
			"Retrieves metadata (like size, type, modification time) for a file or directory.",
		parameters: zodToGoogleGenAISchema(false, GetStatsInputSchema),
		response: zodToGoogleGenAISchema(false, GetStatsOutputSchema),
	},
	{
		name: "copy",
		description: "Copies a file or directory.",
		parameters: zodToGoogleGenAISchema(false, CopyInputSchema),
		response: zodToGoogleGenAISchema(false, CopyOutputSchema),
	},
];
