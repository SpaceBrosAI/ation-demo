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

const worker = await hatchet.worker("worker", {
	workflows: [
		llm,
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
	],
	slots: 100,
});

await worker.start();
