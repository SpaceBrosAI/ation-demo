import { hatchet } from "./hatchet";
import { llm } from "./workflows/llm";

const worker = await hatchet.worker("worker", {
	workflows: [llm],
	slots: 100,
});

await worker.start();
