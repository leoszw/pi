import type { JsonObject, ToolResult } from "../contracts/index.ts";
import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import type { AgentLoopLimits, AgentLoopToolAction, AgentLoopToolExecutionResult, AgentLoopUsage, AgentPlannerDecision, AgentVerificationDecision } from "./types.ts";

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function requiredText(value: unknown, label: string): string {
	if (typeof value !== "string" || !value.trim()) throw new IndustryAgentError("AGENT_EXECUTION_ERROR", `${label} must be a non-empty string`);
	return value.trim();
}

export function validateAgentLoopLimits(limits: AgentLoopLimits): AgentLoopLimits {
	const integerFields: readonly (keyof Pick<AgentLoopLimits, "maxSteps" | "maxToolCalls" | "maxTotalTokens" | "maxDurationMs" | "maxOperationMs" | "maxHistoryItemChars">)[] = [
		"maxSteps", "maxToolCalls", "maxTotalTokens", "maxDurationMs", "maxOperationMs", "maxHistoryItemChars",
	];
	for (const field of integerFields) {
		const value = limits[field];
		if (!Number.isInteger(value) || value <= 0) throw new IndustryAgentError("INVALID_REQUEST", `${field} must be a positive integer`);
	}
	if (!Number.isFinite(limits.maxCostUsd) || limits.maxCostUsd <= 0) throw new IndustryAgentError("INVALID_REQUEST", "maxCostUsd must be positive");
	return limits;
}

export function validateAgentLoopUsage(value: unknown): AgentLoopUsage {
	if (!isRecord(value)) throw new IndustryAgentError("AGENT_EXECUTION_ERROR", "Model/tool usage must be an object");
	const fields = ["inputTokens", "outputTokens", "cachedTokens", "reasoningTokens", "totalTokens"] as const;
	const tokens: Record<(typeof fields)[number], number> = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0, totalTokens: 0 };
	for (const field of fields) {
		const item = value[field];
		if (typeof item !== "number" || !Number.isInteger(item) || item < 0) throw new IndustryAgentError("AGENT_EXECUTION_ERROR", `Invalid usage field: ${field}`);
		tokens[field] = item;
	}
	if (tokens.totalTokens < tokens.inputTokens + tokens.outputTokens) throw new IndustryAgentError("AGENT_EXECUTION_ERROR", "totalTokens must cover inputTokens + outputTokens");
	const costUsd = value["costUsd"];
	if (typeof costUsd !== "number" || !Number.isFinite(costUsd) || costUsd < 0) throw new IndustryAgentError("AGENT_EXECUTION_ERROR", "Invalid model/tool cost usage");
	return { ...tokens, costUsd };
}

function validateToolAction(value: unknown): AgentLoopToolAction {
	if (!isRecord(value)) throw new IndustryAgentError("AGENT_EXECUTION_ERROR", "Planner tool action must be an object");
	const args = value["args"];
	if (!isRecord(args)) throw new IndustryAgentError("AGENT_EXECUTION_ERROR", "Planner tool args must be a JSON object");
	return {
		toolName: requiredText(value["toolName"], "toolName"),
		toolVersion: requiredText(value["toolVersion"], "toolVersion"),
		args: structuredClone(args) as JsonObject,
		purpose: requiredText(value["purpose"], "tool purpose"),
	};
}

export function validatePlannerDecision(value: unknown): AgentPlannerDecision {
	if (!isRecord(value)) throw new IndustryAgentError("AGENT_EXECUTION_ERROR", "Planner decision must be an object");
	const kind = value["kind"];
	const usage = validateAgentLoopUsage(value["usage"]);
	if (kind === "TOOL") return { kind, action: validateToolAction(value["action"]), usage };
	if (kind === "FINISH") return { kind, answer: requiredText(value["answer"], "planner answer"), usage };
	if (kind === "ASK_USER") return { kind, question: requiredText(value["question"], "planner question"), usage };
	if (kind === "FAIL") return { kind, reason: requiredText(value["reason"], "planner failure reason"), usage };
	throw new IndustryAgentError("AGENT_EXECUTION_ERROR", `Unsupported planner decision kind: ${String(kind)}`);
}

export function validateVerificationDecision(value: unknown): AgentVerificationDecision {
	if (!isRecord(value)) throw new IndustryAgentError("AGENT_EXECUTION_ERROR", "Verifier decision must be an object");
	const kind = value["kind"];
	const usage = validateAgentLoopUsage(value["usage"]);
	if (kind === "SATISFIED") return { kind, answer: requiredText(value["answer"], "verification answer"), usage };
	if (kind === "REPLAN") return { kind, feedback: requiredText(value["feedback"], "verification feedback"), usage };
	if (kind === "ASK_USER") return { kind, question: requiredText(value["question"], "verification question"), usage };
	if (kind === "FAIL") return { kind, reason: requiredText(value["reason"], "verification failure reason"), usage };
	throw new IndustryAgentError("AGENT_EXECUTION_ERROR", `Unsupported verifier decision kind: ${String(kind)}`);
}

export function validateAgentLoopToolExecution(value: unknown, expectedToolCallId: string): AgentLoopToolExecutionResult {
	if (!isRecord(value)) throw new IndustryAgentError("AGENT_EXECUTION_ERROR", "Tool executor result must be an object");
	const rawResult = value["result"];
	if (!isRecord(rawResult) || rawResult["toolCallId"] !== expectedToolCallId || typeof rawResult["ok"] !== "boolean") {
		throw new IndustryAgentError("AGENT_EXECUTION_ERROR", "Tool executor returned an invalid ToolResult binding");
	}
	const rawError = rawResult["error"];
	let error: ToolResult["error"];
	if (rawError !== undefined) {
		if (!isRecord(rawError) || typeof rawError["code"] !== "string" || typeof rawError["message"] !== "string") throw new IndustryAgentError("AGENT_EXECUTION_ERROR", "Tool executor returned an invalid ToolResult error");
		error = { code: rawError["code"], message: rawError["message"] };
	}
	const result: ToolResult = {
		toolCallId: expectedToolCallId,
		ok: rawResult["ok"],
		...(rawResult["data"] === undefined ? {} : { data: rawResult["data"] }),
		...(error ? { error } : {}),
	};
	if (typeof value["usageAccountingComplete"] !== "boolean") throw new IndustryAgentError("AGENT_EXECUTION_ERROR", "Tool executor must declare usageAccountingComplete");
	return { result, usage: validateAgentLoopUsage(value["usage"]), usageAccountingComplete: value["usageAccountingComplete"] };
}
