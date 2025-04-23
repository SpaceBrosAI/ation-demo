import { GoogleGenAI } from "@google/genai";

import { hatchet } from "../hatchet";

export type LLMInput = {
	model: string;
	text: string;
};

export type LLMOutput = {
	text: string;
};

export const llm = hatchet.task<LLMInput, LLMOutput>({
	name: "llm",

	fn: async (input: LLMInput, ctx) => {
		const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

		const output = await ai.models.generateContent({
			model: input.model,

			contents: [
				{
					parts: [{ text: input.text }],
				},
			],
		});

		// TODO: function calls

		return {
			text: output.text as string,
		};
	},
});
