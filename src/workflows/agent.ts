import { hatchet } from "../hatchet";

export type AgentTaskCreateInput = {
	name: string;
	description: string;
};

export type AgentTaskCreateOutput = {
	id: string;
};

export const agentTaskCreate = hatchet.task<
	AgentTaskCreateInput,
	AgentTaskCreateOutput
>({
	name: "agent-task-create",

	fn: async (input) => {
		return {
			id: "123",
		};
	},
});

export type AgentTaskListInput = {
	name: string;
	description: string;
};

export type AgentTaskListOutput = {
	id: string;
};

export const agentTaskList = hatchet.task<
	AgentTaskListInput,
	AgentTaskListOutput
>({
	name: "agent-task-list",

	fn: async (input) => {
		return {
			id: "123",
		};
	},
});
