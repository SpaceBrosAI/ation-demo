import { hatchet } from "../hatchet";
import {
	readdir,
	readFile,
	writeFile,
	mkdir,
	unlink,
	rmdir,
	rename,
	stat,
	cp, // Added cp
} from "node:fs/promises";
import path from "node:path";
import type { Stats } from "node:fs"; // Changed to type-only import

// --- List Directory Task ---

export type ListDirInput = {
	directoryPath: string;
};

export type ListDirOutput = {
	entries: { name: string; isDirectory: boolean }[];
};

export const listDir = hatchet.task<ListDirInput, ListDirOutput>({
	name: "list-directory",
	fn: async (input) => {
		const dirPath = path.resolve(input.directoryPath); // Resolve to absolute path for safety
		const dirents = await readdir(dirPath, { withFileTypes: true });
		const entries = dirents.map((dirent) => ({
			name: dirent.name,
			isDirectory: dirent.isDirectory(),
		}));
		return { entries };
	},
});

// --- Read File Task ---

export type ReadFileInput = {
	filePath: string;
	encoding?: BufferEncoding; // Optional encoding, defaults to utf8
};

export type ReadFileOutput = {
	content: string;
};

export const readFileTask = hatchet.task<ReadFileInput, ReadFileOutput>({
	name: "read-file",
	fn: async (input) => {
		const filePath = path.resolve(input.filePath);
		const content = await readFile(filePath, {
			encoding: input.encoding || "utf8",
		});
		return { content };
	},
});

// --- Write File Task ---

export type WriteFileInput = {
	filePath: string;
	content: string;
	encoding?: BufferEncoding; // Optional encoding, defaults to utf8
};

export type WriteFileOutput = {
	success: boolean;
};

export const writeFileTask = hatchet.task<WriteFileInput, WriteFileOutput>({
	name: "write-file",
	fn: async (input) => {
		const filePath = path.resolve(input.filePath);
		await writeFile(filePath, input.content, {
			encoding: input.encoding || "utf8",
		});
		return { success: true };
	},
});

// --- Create Directory Task ---

export type CreateDirInput = {
	directoryPath: string;
	recursive?: boolean; // Optional: create parent directories if they don't exist
};

export type CreateDirOutput = {
	success: boolean;
};

export const createDir = hatchet.task<CreateDirInput, CreateDirOutput>({
	name: "create-directory",
	fn: async (input) => {
		const dirPath = path.resolve(input.directoryPath);
		await mkdir(dirPath, { recursive: input.recursive ?? false });
		return { success: true };
	},
});

// --- Delete File Task ---

export type DeleteFileInput = {
	filePath: string;
};

export type DeleteFileOutput = {
	success: boolean;
};

export const deleteFile = hatchet.task<DeleteFileInput, DeleteFileOutput>({
	name: "delete-file",
	fn: async (input) => {
		const filePath = path.resolve(input.filePath);
		await unlink(filePath);
		return { success: true };
	},
});

// --- Delete Directory Task ---

export type DeleteDirInput = {
	directoryPath: string;
	recursive?: boolean; // Optional: delete contents recursively
};

export type DeleteDirOutput = {
	success: boolean;
};

export const deleteDir = hatchet.task<DeleteDirInput, DeleteDirOutput>({
	name: "delete-directory",
	fn: async (input) => {
		const dirPath = path.resolve(input.directoryPath);
		// Use rmdir for non-recursive, or rm with recursive option
		if (input.recursive) {
			await rmdir(dirPath, { recursive: true }); // Note: rmdir recursive is deprecated, prefer rm
			// Consider switching to: await rm(dirPath, { recursive: true, force: true });
		} else {
			await rmdir(dirPath);
		}
		return { success: true };
	},
});

// --- Move/Rename Task ---

export type MoveRenameInput = {
	sourcePath: string;
	destinationPath: string;
};

export type MoveRenameOutput = {
	success: boolean;
};

export const moveRename = hatchet.task<MoveRenameInput, MoveRenameOutput>({
	name: "move-rename",
	fn: async (input) => {
		const source = path.resolve(input.sourcePath);
		const destination = path.resolve(input.destinationPath);
		await rename(source, destination);
		return { success: true };
	},
});

// --- Check Existence Task ---

export type CheckExistsInput = {
	pathToCheck: string;
};

export type CheckExistsOutput = {
	exists: boolean;
};

export const checkExists = hatchet.task<CheckExistsInput, CheckExistsOutput>({
	name: "check-exists",
	fn: async (input) => {
		const targetPath = path.resolve(input.pathToCheck);
		try {
			await stat(targetPath);
			return { exists: true };
		} catch (error: unknown) {
			// Changed 'any' to 'unknown'
			// Type check for error code
			if (
				typeof error === "object" &&
				error !== null &&
				(error as { code?: string }).code === "ENOENT"
			) {
				return { exists: false };
			}
			// Re-throw other errors
			throw error;
		}
	},
});

// --- Get Stats Task ---

export type GetStatsInput = {
	pathToCheck: string;
};

// Define a serializable version of Stats, as the original Stats object isn't directly serializable
export type SerializableStats = {
	isFile: boolean;
	isDirectory: boolean;
	isBlockDevice: boolean;
	isCharacterDevice: boolean;
	isSymbolicLink: boolean;
	isFIFO: boolean;
	isSocket: boolean;
	dev: number;
	ino: number;
	mode: number;
	nlink: number;
	uid: number;
	gid: number;
	rdev: number;
	size: number;
	blksize: number;
	blocks: number;
	atimeMs: number;
	mtimeMs: number;
	ctimeMs: number;
	birthtimeMs: number;
	atime: string; // ISO string representation
	mtime: string; // ISO string representation
	ctime: string; // ISO string representation
	birthtime: string; // ISO string representation
};

export type GetStatsOutput = {
	stats: SerializableStats | null; // Return null if path doesn't exist
};

export const getStats = hatchet.task<GetStatsInput, GetStatsOutput>({
	name: "get-stats",
	fn: async (input) => {
		const targetPath = path.resolve(input.pathToCheck);
		try {
			const statsResult: Stats = await stat(targetPath);
			// Convert Stats object to a serializable format
			const serializableStats: SerializableStats = {
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
			// Changed 'any' to 'unknown'
			// Type check for error code
			if (
				typeof error === "object" &&
				error !== null &&
				(error as { code?: string }).code === "ENOENT"
			) {
				return { stats: null }; // Indicate not found by returning null
			}
			throw error;
		}
	},
});

// --- Copy File/Directory Task ---

export type CopyInput = {
	sourcePath: string;
	destinationPath: string;
	recursive?: boolean; // Required for copying directories
};

export type CopyOutput = {
	success: boolean;
};

export const copy = hatchet.task<CopyInput, CopyOutput>({
	name: "copy",
	fn: async (input) => {
		const source = path.resolve(input.sourcePath);
		const destination = path.resolve(input.destinationPath);
		await cp(source, destination, { recursive: input.recursive ?? false });
		return { success: true };
	},
});
