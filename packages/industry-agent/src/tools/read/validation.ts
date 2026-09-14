import type { JsonObject, ToolDefinition } from "../../contracts/index.ts";
import { IndustryAgentError } from "../../errors/industry-agent-error.ts";
import type { QuantityEntityType, QuantityField, ReadToolScope } from "./types.ts";

function record(args: JsonObject): Record<string, unknown> {
	return { ...args };
}
function text(value: unknown, field: string): string {
	if (typeof value !== "string" || !value.trim())
		throw new IndustryAgentError("TOOL_INPUT_INVALID", `${field} must be a non-empty string`);
	return value.trim();
}
function optionalBoolean(value: unknown, field: string): boolean | null | undefined {
	if (value === undefined) return undefined;
	if (value === null || typeof value === "boolean") return value;
	throw new IndustryAgentError("TOOL_INPUT_INVALID", `${field} must be boolean or null`);
}
function optionalStrictBoolean(value: unknown, field: string): boolean | undefined {
	if (value === undefined) return undefined;
	if (typeof value === "boolean") return value;
	throw new IndustryAgentError("TOOL_INPUT_INVALID", `${field} must be boolean`);
}
function optionalInteger(value: unknown, field: string, min: number, max: number): number | undefined {
	if (value === undefined) return undefined;
	if (!Number.isInteger(value) || (value as number) < min || (value as number) > max)
		throw new IndustryAgentError("TOOL_INPUT_INVALID", `${field} must be an integer between ${min} and ${max}`);
	return value as number;
}
function noUnknown(args: Record<string, unknown>, allowed: readonly string[]): void {
	const extras = Object.keys(args).filter((key) => !allowed.includes(key));
	if (extras.length)
		throw new IndustryAgentError("TOOL_INPUT_INVALID", `Unexpected tool arguments: ${extras.join(", ")}`);
}

export function requireReadScope(context: {
	userId: string;
	tenantId: string;
	companyId?: string;
	projectId?: string;
}): ReadToolScope {
	if (!context.userId || !context.tenantId || !context.companyId || !context.projectId) {
		throw new IndustryAgentError(
			"TOOL_SCOPE_REQUIRED",
			"READ tool requires server-bound user, tenant, company, and project scope",
		);
	}
	return {
		userId: context.userId,
		tenantId: context.tenantId,
		companyId: context.companyId,
		projectId: context.projectId,
	};
}

export type ValidatedReadArgs =
	| { kind: "search_engineering_positions"; query: string; topK?: number; leafOnly?: boolean | null; debug?: boolean }
	| { kind: "get_engineering_position"; engineeringId: string }
	| { kind: "search_boq"; query: string; topK?: number; leafOnly?: boolean | null; debug?: boolean }
	| { kind: "get_boq_item"; ledgerId: string }
	| { kind: "query_quantity"; entityType: QuantityEntityType; entityId: string; fields: readonly QuantityField[] }
	| { kind: "list_project_documents"; query?: string; documentType?: string; limit: number };

export function validateReadToolArgs(definition: ToolDefinition, rawArgs: JsonObject): ValidatedReadArgs {
	const args = record(rawArgs);
	switch (definition.name) {
		case "search_engineering_positions":
		case "search_boq": {
			noUnknown(args, ["query", "topK", "leafOnly", "debug"]);
			const common = {
				query: text(args.query, "query"),
				topK: optionalInteger(args.topK, "topK", 1, 50),
				leafOnly: optionalBoolean(args.leafOnly, "leafOnly"),
				debug: optionalStrictBoolean(args.debug, "debug"),
			};
			return definition.name === "search_engineering_positions"
				? { kind: "search_engineering_positions", ...common }
				: { kind: "search_boq", ...common };
		}
		case "get_engineering_position":
			noUnknown(args, ["engineeringId"]);
			return { kind: "get_engineering_position", engineeringId: text(args.engineeringId, "engineeringId") };
		case "get_boq_item":
			noUnknown(args, ["ledgerId"]);
			return { kind: "get_boq_item", ledgerId: text(args.ledgerId, "ledgerId") };
		case "query_quantity": {
			noUnknown(args, ["entityType", "entityId", "fields"]);
			const entityType = text(args.entityType, "entityType");
			if (entityType !== "ENGINEERING_POSITION" && entityType !== "BOQ_ITEM")
				throw new IndustryAgentError("TOOL_INPUT_INVALID", "entityType is not supported");
			const allowed = new Set<QuantityField>([
				"design_quantity",
				"use_quantity",
				"contract_num",
				"change_after_num",
			]);
			const requested = args.fields === undefined ? [] : args.fields;
			if (
				!Array.isArray(requested) ||
				requested.some((item) => typeof item !== "string" || !allowed.has(item as QuantityField))
			)
				throw new IndustryAgentError("TOOL_INPUT_INVALID", "fields contains an unsupported quantity field");
			const typedFields = requested as QuantityField[];
			const entityAllowed =
				entityType === "ENGINEERING_POSITION"
					? new Set<QuantityField>(["design_quantity", "use_quantity"])
					: new Set<QuantityField>(["contract_num", "change_after_num"]);
			if (typedFields.some((field) => !entityAllowed.has(field)))
				throw new IndustryAgentError("TOOL_INPUT_INVALID", `quantity field is not valid for ${entityType}`);
			return { kind: "query_quantity", entityType, entityId: text(args.entityId, "entityId"), fields: typedFields };
		}
		case "list_project_documents":
			noUnknown(args, ["query", "documentType", "limit"]);
			return {
				kind: "list_project_documents",
				...(args.query === undefined ? {} : { query: text(args.query, "query") }),
				...(args.documentType === undefined ? {} : { documentType: text(args.documentType, "documentType") }),
				limit: optionalInteger(args.limit, "limit", 1, 100) ?? 50,
			};
		default:
			throw new IndustryAgentError("TOOL_NOT_FOUND", `Unsupported READ tool: ${definition.name}`);
	}
}
