import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

import { hatchet } from "../hatchet";
import { ParentCondition } from "@hatchet-dev/typescript-sdk/v1/conditions/parent-condition";

export const models = {
	"openai/gpt-4.1": openai("gpt-4.1"),
	"openai/gpt-4o": openai("gpt-4o"),
	"openai/o3": openai("o3"),
	"openai/o3-mini-high": openai("o3-mini-high"),
	"openai/o4-mini-high": openai("o4-mini-high"),
	"google/gemini-2.5-flash": google("gemini-2.5-flash"),
	"google/gemini-2.5-pro": google("gemini-2.5-pro"),
	"anthropic/claude-3.7-sonnet": anthropic("claude-3.7-sonnet"),
} as const;

export type LLMModel = keyof typeof models;

export type LLMInput = {
	model: LLMModel;

	messages: {
		role: "user" | "assistant" | "system";
		content: string;
		reasoning?: string;
	}[];
};

export type LLMOutput = {
	text: string;
};

// export const llm = hatchet.task<LLMInput, LLMOutput>({
// 	name: "llm",

// 	fn: async (input) => {
// 		const model = models[input.model];

// 		const output = await generateText({
// 			model,
// 			messages: input.messages,
// 		});

// 		return {
// 			text: output.text,
// 		};
// 	},
// });

export const llm = hatchet.workflow<LLMInput, LLMOutput>({ name: "llm" });

const llmCacheRead = llm.task<LLMInput, LLMOutput>({
	name: "llm-cache-read",
	fn: async (input) => {
		return { text: "Hello, world!" };
	},
});

const llmRequest = llm.task<LLMInput, LLMOutput>({
	name: "llm-request",
	parents: [llmCacheRead],
	skipIf: [new ParentCondition(llmCacheRead, "text != ''")],
	fn: async (input) => {
		return { text: "Hello, world!" };
	},
});

const llmCacheWrite = llm.task<LLMInput, LLMOutput>({
	name: "llm-cache-write",
	parents: [llmRequest],
	fn: async (input) => {
		return { text: "Hello, world!" };
	},
});
