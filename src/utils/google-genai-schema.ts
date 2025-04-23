// Maybe some day officially in
// https://googleapis.github.io/js-genai/main/functions/schema_helper.zodToGoogleGenAISchema.html

import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { Schema } from "@google/genai";
import { Type as GoogleGenAIType } from "@google/genai";

export function zodToGoogleGenAISchema(
	isVertexAI: boolean,
	schema: z.ZodObject<z.ZodRawShape>,
): Schema {
	// Use options to ensure definitions are generated
	const jsonSchemaResult = zodToJsonSchema(schema, {
		target: "jsonSchema7",
		definitions: { zodSchema: schema },
	});

	// Check if definitions exist
	if (
		!jsonSchemaResult.definitions ||
		!jsonSchemaResult.definitions.zodSchema
	) {
		throw new Error(
			"Could not generate JSON schema definitions from Zod schema.",
		);
	}

	const jsonSchema = jsonSchemaResult.definitions.zodSchema as Record<
		string,
		unknown
	>;
	// Pass isVertexAI along, though it's not used in the current processing logic
	return processJsonSchema(isVertexAI, jsonSchema);
}

// Helper function to map JSON Schema types to Google GenAI types
function mapJsonTypeToGoogleType(
	jsonType: string | string[] | undefined,
): GoogleGenAIType | undefined {
	if (jsonType === undefined) return undefined;
	// Handle cases where type can be an array (e.g., ["string", "null"])
	// We pick the first non-null type.
	const type = Array.isArray(jsonType)
		? jsonType.find((t) => t !== "null")
		: jsonType;

	switch (type) {
		case "string":
			return GoogleGenAIType.STRING;
		case "number":
			return GoogleGenAIType.NUMBER;
		case "integer":
			return GoogleGenAIType.INTEGER;
		case "boolean":
			return GoogleGenAIType.BOOLEAN;
		case "array":
			return GoogleGenAIType.ARRAY;
		case "object":
			return GoogleGenAIType.OBJECT;
		default:
			console.warn(
				`Unsupported JSON schema type encountered: ${type}. Mapping as OBJECT.`,
			);
			return GoogleGenAIType.OBJECT; // Default or throw error? Defaulting for now.
	}
}

// Recursive function to process schema properties
// Use unknown instead of any
function processSchemaProperties(
	properties: Record<string, unknown> | undefined,
): Record<string, Schema> | undefined {
	if (!properties) {
		return undefined;
	}
	const processedProperties: Record<string, Schema> = {};
	for (const key in properties) {
		if (Object.prototype.hasOwnProperty.call(properties, key)) {
			// Ensure the property is a valid schema object before processing
			if (typeof properties[key] === "object" && properties[key] !== null) {
				processedProperties[key] = processSingleSchema(
					properties[key] as Record<string, unknown>,
				);
			} else {
				console.warn(
					`Skipping invalid property schema for key '${key}'. Expected object, got: ${typeof properties[key]}`,
				);
			}
		}
	}
	return processedProperties;
}

// Function to process a single schema node (can be top-level or nested)
// Use unknown instead of any
function processSingleSchema(jsonSchema: Record<string, unknown>): Schema {
	// Use Partial<Schema> and assert type at the end
	const googleSchema: Partial<Schema> & { type: GoogleGenAIType } = {
		// Initialize with a default type, will be overwritten
		type: GoogleGenAIType.OBJECT,
	};

	const mappedType = mapJsonTypeToGoogleType(
		jsonSchema.type as string | string[] | undefined,
	);
	if (mappedType) {
		googleSchema.type = mappedType;
	} else {
		// Default type if mapping fails (e.g., unsupported type)
		console.warn(
			`Could not map JSON schema type: ${jsonSchema.type}. Defaulting to OBJECT.`,
		);
		googleSchema.type = GoogleGenAIType.OBJECT;
	}

	if (typeof jsonSchema.description === "string") {
		googleSchema.description = jsonSchema.description;
	}
	// Ensure enum is an array of strings
	if (Array.isArray(jsonSchema.enum)) {
		googleSchema.enum = jsonSchema.enum
			.filter(
				(e) =>
					typeof e === "string" ||
					typeof e === "number" ||
					typeof e === "boolean",
			)
			.map(String);
	}

	if (
		googleSchema.type === GoogleGenAIType.OBJECT &&
		typeof jsonSchema.properties === "object" &&
		jsonSchema.properties !== null
	) {
		googleSchema.properties = processSchemaProperties(
			jsonSchema.properties as Record<string, unknown>,
		);
		// Copy required array only if properties exist and it's an array of strings
		if (Array.isArray(jsonSchema.required)) {
			googleSchema.required = jsonSchema.required.filter(
				(r) => typeof r === "string",
			);
		}
	}

	if (googleSchema.type === GoogleGenAIType.ARRAY && jsonSchema.items) {
		// Ensure items is a schema object before processing.
		if (
			typeof jsonSchema.items === "object" &&
			jsonSchema.items !== null &&
			!Array.isArray(jsonSchema.items)
		) {
			googleSchema.items = processSingleSchema(
				jsonSchema.items as Record<string, unknown>,
			);
		} else {
			// Handle cases where items is not a schema object (e.g., boolean, array, missing)
			console.warn(
				`Unsupported 'items' format in array schema. Expected object, got: ${typeof jsonSchema.items}. Omitting items.`,
			);
		}
	}

	// Cast to Schema, assuming the structure is now compliant.
	// The structure is guaranteed to have 'type' due to initialization and mapping logic.
	return googleSchema as Schema;
}

function processJsonSchema(
	_isVertexAI: boolean, // Parameter currently unused, kept for signature compatibility
	jsonSchema: Record<string, unknown>,
): Schema {
	// Process the top-level JSON schema object
	return processSingleSchema(jsonSchema);
}
