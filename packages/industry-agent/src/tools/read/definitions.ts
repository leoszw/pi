import type { JsonObject, ToolDefinition } from "../../contracts/index.ts";

const SCOPE_RULE = "SERVER_REQUEST_CONTEXT: userId+tenantId+companyId+projectId; tool args cannot override scope";
const RETRY_POLICY: JsonObject = { maxAttempts: 2, retryOn: ["timeout", "transient_read_error"] };

function objectSchema(properties: JsonObject, required: readonly string[] = []): JsonObject {
	return { type: "object", additionalProperties: false, properties, ...(required.length ? { required } : {}) };
}

const searchInput = objectSchema(
	{
		query: { type: "string", minLength: 1, maxLength: 2000 },
		topK: { type: "integer", minimum: 1, maximum: 50 },
		leafOnly: { type: ["boolean", "null"] },
		debug: { type: "boolean" },
	},
	["query"],
);

const searchOutput = objectSchema(
	{
		parsedQuery: { type: "object" },
		confidence: { type: "object" },
		results: { type: "array", items: { type: "object" } },
		debug: { type: "object" },
	},
	["parsedQuery", "confidence", "results"],
);

const evidenceSchema: JsonObject = objectSchema(
	{
		sourceId: { type: "string" },
		sourceVersion: { type: "string" },
		updatedAt: { type: "string" },
		unit: { type: "string" },
	},
	["sourceId", "sourceVersion"],
);

function definition(
	input: Omit<
		ToolDefinition,
		"riskLevel" | "requiresConfirmation" | "supportsDryRun" | "idempotent" | "dataScopeRule" | "retryPolicy"
	>,
): ToolDefinition {
	return {
		...input,
		dataScopeRule: SCOPE_RULE,
		riskLevel: "LOW",
		requiresConfirmation: false,
		supportsDryRun: false,
		idempotent: true,
		retryPolicy: RETRY_POLICY,
	};
}

export const READ_TOOL_DEFINITIONS: readonly ToolDefinition[] = [
	definition({
		name: "search_engineering_positions",
		version: "1.0.0",
		domain: "engineering_position",
		action: "SEARCH",
		description: "Search engineering positions inside the server-bound project scope.",
		inputSchema: searchInput,
		outputSchema: searchOutput,
		allowedEntityTypes: ["ENGINEERING_POSITION"],
		permission: "engineering.position.search",
		timeoutMs: 6000,
	}),
	definition({
		name: "get_engineering_position",
		version: "1.0.0",
		domain: "engineering_position",
		action: "READ",
		description: "Read one engineering position by ID inside the server-bound project scope.",
		inputSchema: objectSchema({ engineeringId: { type: "string", minLength: 1 } }, ["engineeringId"]),
		outputSchema: objectSchema(
			{
				engineeringId: { type: "string" },
				projectId: { type: "string" },
				engineeringName: { type: "string" },
				engineeringCode: { type: "string" },
				unitEngineeringId: { type: "string" },
				unitEngineeringName: { type: "string" },
				parentEngineeringId: { type: "string" },
				engineeringFullName: { type: "string" },
				engineeringCategoryName: { type: "string" },
				engineeringTypeName: { type: "string" },
				alignmentCode: { type: "string" },
				chainageStartM: { type: "number" },
				chainageEndM: { type: "number" },
				isMinUnit: { type: "boolean" },
				evidence: evidenceSchema,
			},
			["engineeringId", "projectId", "engineeringName", "isMinUnit", "evidence"],
		),
		allowedEntityTypes: ["ENGINEERING_POSITION"],
		permission: "engineering.position.read",
		timeoutMs: 3000,
	}),
	definition({
		name: "search_boq",
		version: "1.0.0",
		domain: "boq",
		action: "SEARCH",
		description: "Search BOQ items inside the server-bound project scope using the server catalog.",
		inputSchema: searchInput,
		outputSchema: searchOutput,
		allowedEntityTypes: ["BOQ_ITEM"],
		permission: "boq.search",
		timeoutMs: 6000,
	}),
	definition({
		name: "get_boq_item",
		version: "1.0.0",
		domain: "boq",
		action: "READ",
		description: "Read one BOQ item by ledger ID inside the server-bound project scope.",
		inputSchema: objectSchema({ ledgerId: { type: "string", minLength: 1 } }, ["ledgerId"]),
		outputSchema: objectSchema(
			{
				ledgerId: { type: "string" },
				projectId: { type: "string" },
				sectionId: { type: "string" },
				sectionName: { type: "string" },
				ledgerCode: { type: "string" },
				ledgerName: { type: "string" },
				unit: { type: "string" },
				evidence: evidenceSchema,
			},
			["ledgerId", "projectId", "ledgerCode", "ledgerName", "evidence"],
		),
		allowedEntityTypes: ["BOQ_ITEM"],
		permission: "boq.read",
		timeoutMs: 3000,
	}),
	definition({
		name: "query_quantity",
		version: "1.0.0",
		domain: "quantity",
		action: "READ",
		description: "Read authoritative quantity values after an engineering-position or BOQ entity has been resolved.",
		inputSchema: objectSchema(
			{
				entityType: { type: "string", enum: ["ENGINEERING_POSITION", "BOQ_ITEM"] },
				entityId: { type: "string", minLength: 1 },
				fields: {
					type: "array",
					uniqueItems: true,
					items: { type: "string", enum: ["design_quantity", "use_quantity", "contract_num", "change_after_num"] },
				},
			},
			["entityType", "entityId"],
		),
		outputSchema: objectSchema(
			{
				entityType: { type: "string" },
				entityId: { type: "string" },
				projectId: { type: "string" },
				values: { type: "object" },
				evidence: evidenceSchema,
			},
			["entityType", "entityId", "projectId", "values", "evidence"],
		),
		allowedEntityTypes: ["ENGINEERING_POSITION", "BOQ_ITEM"],
		permission: "quantity.read",
		timeoutMs: 3000,
	}),
	definition({
		name: "list_project_documents",
		version: "1.0.0",
		domain: "document",
		action: "READ",
		description: "List document metadata for the server-bound project scope.",
		inputSchema: objectSchema({
			query: { type: "string", maxLength: 500 },
			documentType: { type: "string", maxLength: 128 },
			limit: { type: "integer", minimum: 1, maximum: 100 },
		}),
		outputSchema: objectSchema({ documents: { type: "array", items: { type: "object" } } }, ["documents"]),
		allowedEntityTypes: ["DOCUMENT"],
		permission: "documents.list",
		timeoutMs: 3000,
	}),
];

export function getReadToolDefinition(name: string, version: string): ToolDefinition | undefined {
	return READ_TOOL_DEFINITIONS.find((item) => item.name === name && item.version === version);
}
