import type { JsonObject, ToolDefinition } from "../contracts/index.ts";

const SCOPE_RULE = "SERVER_REQUEST_CONTEXT: userId+tenantId+companyId+projectId; tool args cannot override scope";
const NO_RETRY: JsonObject = { maxAttempts: 1, retryOn: [] };

function objectSchema(properties: JsonObject, required: readonly string[] = []): JsonObject {
	return { type: "object", additionalProperties: false, properties, ...(required.length ? { required } : {}) };
}

const entityType = { type: "string", minLength: 1, maxLength: 128 };
const values = { type: "object", additionalProperties: true };
const entityIds = { type: "array", minItems: 1, maxItems: 100, uniqueItems: true, items: { type: "string", minLength: 1 } };
const prepareOutput = objectSchema({ proposal: { type: "object" }, uiActions: { type: "array", items: { type: "object" } } }, ["proposal", "uiActions"]);

function prepareDefinition(input: Pick<ToolDefinition, "name"|"domain"|"action"|"description"|"inputSchema">): ToolDefinition {
	return {
		...input,
		version: "1.0.0",
		outputSchema: prepareOutput,
		allowedEntityTypes: ["*"],
		permission: "mutation.prepare",
		dataScopeRule: SCOPE_RULE,
		riskLevel: "HIGH",
		requiresConfirmation: false,
		supportsDryRun: true,
		idempotent: false,
		timeoutMs: 5000,
		retryPolicy: NO_RETRY,
	};
}

export const MUTATION_TOOL_DEFINITIONS: readonly ToolDefinition[] = [
	prepareDefinition({
		name: "prepare_create", domain: "mutation", action: "CREATE",
		description: "Prepare a create proposal and human-readable diff. Does not write business data.",
		inputSchema: objectSchema({ entityType, values }, ["entityType", "values"]),
	}),
	prepareDefinition({
		name: "prepare_update", domain: "mutation", action: "UPDATE",
		description: "Prepare one or more optimistic-lock updates. Does not write business data.",
		inputSchema: objectSchema({ entityType, entityIds, patch: values }, ["entityType", "entityIds", "patch"]),
	}),
	prepareDefinition({
		name: "prepare_delete", domain: "mutation", action: "DELETE",
		description: "Prepare one or more soft deletes. Does not write business data.",
		inputSchema: objectSchema({ entityType, entityIds, reason: { type: "string", maxLength: 1000 } }, ["entityType", "entityIds"]),
	}),
	{
		name: "commit_mutation", version: "1.0.0", domain: "mutation", action: "UPDATE",
		description: "Commit an already prepared mutation using a trusted-UI one-time approval token.",
		inputSchema: objectSchema({ operationId: { type: "string", minLength: 1 }, approvalToken: { type: "string", minLength: 1 } }, ["operationId", "approvalToken"]),
		outputSchema: objectSchema({ operationId: { type: "string" }, status: { type: "string", enum: ["COMMITTED"] }, records: { type: "array", items: { type: "object" } }, verified: { type: "boolean" } }, ["operationId", "status", "records", "verified"]),
		allowedEntityTypes: ["*"], permission: "mutation.commit", dataScopeRule: SCOPE_RULE,
		riskLevel: "CRITICAL", requiresConfirmation: true, supportsDryRun: false, idempotent: false, timeoutMs: 10000, retryPolicy: NO_RETRY,
	},
];

export function getMutationToolDefinition(name: string, version: string): ToolDefinition | undefined {
	return MUTATION_TOOL_DEFINITIONS.find((definition) => definition.name === name && definition.version === version);
}
