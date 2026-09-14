import type { JsonObject, RequestContext } from "../contracts/index.ts";
import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import type { MutationEntityPolicy, MutationScope } from "./types.ts";

function asRecord(value: unknown, field: string): JsonObject {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new IndustryAgentError("MUTATION_VALIDATION_ERROR", `${field} must be an object`);
	return structuredClone(value as JsonObject);
}
function text(value: unknown, field: string): string {
	if (typeof value !== "string" || !value.trim())
		throw new IndustryAgentError("MUTATION_VALIDATION_ERROR", `${field} must be a non-empty string`);
	return value.trim();
}
function noUnknown(args: JsonObject, allowed: readonly string[]): void {
	const extras = Object.keys(args).filter((key) => !allowed.includes(key));
	if (extras.length)
		throw new IndustryAgentError("MUTATION_VALIDATION_ERROR", `Unexpected mutation arguments: ${extras.join(", ")}`);
}
function ids(value: unknown, max: number): readonly string[] {
	if (
		!Array.isArray(value) ||
		value.length === 0 ||
		value.length > max ||
		value.some((item) => typeof item !== "string" || !item.trim())
	) {
		throw new IndustryAgentError("MUTATION_VALIDATION_ERROR", `entityIds must contain 1..${max} non-empty strings`);
	}
	const normalized = value.map((item) => (item as string).trim());
	if (new Set(normalized).size !== normalized.length)
		throw new IndustryAgentError("MUTATION_VALIDATION_ERROR", "entityIds must be unique");
	return normalized;
}

export function requireMutationScope(context: RequestContext): MutationScope {
	if (!context.userId || !context.tenantId || !context.companyId || !context.projectId)
		throw new IndustryAgentError(
			"TOOL_SCOPE_REQUIRED",
			"Mutation runtime requires server-bound user, tenant, company, and project scope",
		);
	return {
		userId: context.userId,
		tenantId: context.tenantId,
		companyId: context.companyId,
		projectId: context.projectId,
	};
}

export type ValidatedMutationArgs =
	| { kind: "prepare_create"; entityType: string; values: JsonObject }
	| { kind: "prepare_update"; entityType: string; entityIds: readonly string[]; patch: JsonObject }
	| { kind: "prepare_delete"; entityType: string; entityIds: readonly string[]; reason?: string }
	| { kind: "commit_mutation"; operationId: string; approvalToken: string };

export function validateMutationArgs(name: string, raw: JsonObject, maxBatchSize = 100): ValidatedMutationArgs {
	switch (name) {
		case "prepare_create":
			noUnknown(raw, ["entityType", "values"]);
			return {
				kind: "prepare_create",
				entityType: text(raw.entityType, "entityType"),
				values: asRecord(raw.values, "values"),
			};
		case "prepare_update":
			noUnknown(raw, ["entityType", "entityIds", "patch"]);
			return {
				kind: "prepare_update",
				entityType: text(raw.entityType, "entityType"),
				entityIds: ids(raw.entityIds, maxBatchSize),
				patch: asRecord(raw.patch, "patch"),
			};
		case "prepare_delete": {
			noUnknown(raw, ["entityType", "entityIds", "reason"]);
			const reason = raw.reason === undefined ? undefined : text(raw.reason, "reason");
			return {
				kind: "prepare_delete",
				entityType: text(raw.entityType, "entityType"),
				entityIds: ids(raw.entityIds, maxBatchSize),
				...(reason ? { reason } : {}),
			};
		}
		case "commit_mutation":
			noUnknown(raw, ["operationId", "approvalToken"]);
			return {
				kind: "commit_mutation",
				operationId: text(raw.operationId, "operationId"),
				approvalToken: text(raw.approvalToken, "approvalToken"),
			};
		default:
			throw new IndustryAgentError("TOOL_NOT_FOUND", `Unsupported mutation tool: ${name}`);
	}
}

export function assertPolicyFields(
	policy: MutationEntityPolicy,
	operation: "CREATE" | "UPDATE",
	values: JsonObject,
): void {
	const allowed = operation === "CREATE" ? policy.allowedCreateFields : policy.allowedUpdateFields;
	if (allowed) {
		const invalid = Object.keys(values).filter((key) => !allowed.includes(key));
		if (invalid.length)
			throw new IndustryAgentError(
				"MUTATION_VALIDATION_ERROR",
				`Fields are not allowed for ${operation}: ${invalid.join(", ")}`,
			);
	}
	if (operation === "UPDATE" && policy.immutableFields) {
		const invalid = Object.keys(values).filter((key) => policy.immutableFields!.includes(key));
		if (invalid.length)
			throw new IndustryAgentError(
				"MUTATION_VALIDATION_ERROR",
				`Immutable fields cannot be updated: ${invalid.join(", ")}`,
			);
	}
}
