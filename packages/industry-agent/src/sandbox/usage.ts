import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import type { SandboxBudgetView, SandboxLimits, SandboxUsage } from "./types.ts";

export const ZERO_SANDBOX_USAGE: SandboxUsage = {
	inputTokens: 0,
	outputTokens: 0,
	cachedTokens: 0,
	reasoningTokens: 0,
	totalTokens: 0,
	costUsd: 0,
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateSandboxUsage(value: unknown): SandboxUsage {
	if (!isRecord(value))
		throw new IndustryAgentError("SANDBOX_USAGE_ACCOUNTING_INCOMPLETE", "Sandbox usage must be an object");
	const fields = ["inputTokens", "outputTokens", "cachedTokens", "reasoningTokens", "totalTokens"] as const;
	const tokens: Record<(typeof fields)[number], number> = {
		inputTokens: 0,
		outputTokens: 0,
		cachedTokens: 0,
		reasoningTokens: 0,
		totalTokens: 0,
	};
	for (const field of fields) {
		const item = value[field];
		if (typeof item !== "number" || !Number.isInteger(item) || item < 0)
			throw new IndustryAgentError("SANDBOX_USAGE_ACCOUNTING_INCOMPLETE", `Invalid usage field: ${field}`);
		tokens[field] = item;
	}
	if (tokens.totalTokens < tokens.inputTokens + tokens.outputTokens)
		throw new IndustryAgentError(
			"SANDBOX_USAGE_ACCOUNTING_INCOMPLETE",
			"totalTokens must cover inputTokens + outputTokens",
		);
	const costUsd = value.costUsd;
	if (typeof costUsd !== "number" || !Number.isFinite(costUsd) || costUsd < 0)
		throw new IndustryAgentError("SANDBOX_USAGE_ACCOUNTING_INCOMPLETE", "Invalid sandbox cost usage");
	return { ...tokens, costUsd };
}

export function addSandboxUsage(left: SandboxUsage, right: SandboxUsage): SandboxUsage {
	return {
		inputTokens: left.inputTokens + right.inputTokens,
		outputTokens: left.outputTokens + right.outputTokens,
		cachedTokens: left.cachedTokens + right.cachedTokens,
		reasoningTokens: left.reasoningTokens + right.reasoningTokens,
		totalTokens: left.totalTokens + right.totalTokens,
		costUsd: left.costUsd + right.costUsd,
	};
}

export function sandboxBudget(
	limits: SandboxLimits,
	usage: SandboxUsage,
	startedAt: number,
	nowMs: number,
): SandboxBudgetView {
	return {
		remainingTokens: Math.max(0, limits.maxTotalTokens - usage.totalTokens),
		remainingCostUsd: Math.max(0, limits.maxCostUsd - usage.costUsd),
		remainingDurationMs: Math.max(0, limits.maxDurationMs - Math.max(0, nowMs - startedAt)),
		maxRowsPerQuery: limits.maxRowsPerQuery,
		maxTotalRows: limits.maxTotalBrokerRows,
	};
}
