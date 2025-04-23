import { hatchet } from "./hatchet";
import { llm } from "./workflows/llm";
import {
	listDir,
	readFileTask,
	writeFileTask,
	createDir,
	deleteFile,
	deleteDir,
	moveRename,
	checkExists,
	getStats,
	copy,
} from "./workflows/filesystem";
import {
	createContainer,
	runCommandInContainer,
	removeContainer,
} from "./workflows/computer"; // Import computer tasks

const worker = await hatchet.worker("worker", {
	workflows: [
		llm,
		// Filesystem tasks
		listDir,
		readFileTask,
		writeFileTask,
		createDir,
		deleteFile,
		deleteDir,
		moveRename,
		checkExists,
		getStats,
		copy,
		// Computer (Docker) tasks
		createContainer,
		runCommandInContainer,
		removeContainer,
	],
	slots: 100,
});

await worker.start();
