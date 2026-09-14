import { randomUUID } from "node:crypto";
import type { JsonObject, ToolInvocation, UIAction } from "../contracts/index.ts";
import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import type { MutationPrepareResult, MutationProposalRecord, MutationToolRuntime } from "../mutation/types.ts";
import type { SandboxMutationPreparer, SandboxMutationRecommendation } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUiAction(value: unknown): value is UIAction {
	return isRecord(value) && typeof value.id === "string" && typeof value.type === "string" && isRecord(value.payload);
}

function isProposal(value: unknown): value is MutationProposalRecord {
	return (
		isRecord(value) &&
		typeof value.operationId === "string" &&
		typeof value.digest === "string" &&
		value.status === "PREPARED" &&
		typeof value.entityType === "string"
	);
}

function isMutationPrepareResult(value: unknown): value is MutationPrepareResult {
	return (
		isRecord(value) &&
		isProposal(value.proposal) &&
		Array.isArray(value.uiActions) &&
		value.uiActions.every(isUiAction)
	);
}

function mapRecommendation(recommendation: SandboxMutationRecommendation): { toolName: string; args: JsonObject } {
	if (recommendation.operation === "CREATE") {
		return {
			toolName: "prepare_create",
			args: { entityType: recommendation.entityType, values: recommendation.values },
		};
	}
	if (recommendation.operation === "UPDATE") {
		return {
			toolName: "prepare_update",
			args: {
				entityType: recommendation.entityType,
				entityIds: [...recommendation.targetEntityIds],
				patch: recommendation.values,
			},
		};
	}
	return {
		toolName: "prepare_delete",
		args: {
			entityType: recommendation.entityType,
			entityIds: [...recommendation.targetEntityIds],
			...(recommendation.reason ? { reason: recommendation.reason } : {}),
		},
	};
}

export class MutationToolSandboxPreparer implements SandboxMutationPreparer {
	private readonly runtime: Pick<MutationToolRuntime, "execute">;
	private readonly idFactory: () => string;

	constructor(runtime: Pick<MutationToolRuntime, "execute">, idFactory: () => string = () => randomUUID()) {
		this.runtime = runtime;
		this.idFactory = idFactory;
	}

	async prepare(input: Parameters<SandboxMutationPreparer["prepare"]>[0]): Promise<MutationPrepareResult> {
		const mapped = mapRecommendation(input.recommendation);
		const invocation: ToolInvocation = {
			toolCallId: this.idFactory(),
			toolName: mapped.toolName,
			toolVersion: "1.0.0",
			args: mapped.args,
			context: input.context,
		};
		const result = await this.runtime.execute(invocation);
		if (!result.ok)
			throw new IndustryAgentError(
				"SANDBOX_MUTATION_PREPARE_FAILED",
				`Mutation prepare failed: ${result.error?.code ?? "unknown"}: ${result.error?.message ?? "unknown"}`,
			);
		if (!isMutationPrepareResult(result.data))
			throw new IndustryAgentError(
				"SANDBOX_MUTATION_PREPARE_FAILED",
				"Mutation prepare returned an invalid result shape",
			);
		return result.data;
	}
}
