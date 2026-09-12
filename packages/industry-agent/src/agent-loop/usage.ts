import type { AgentLoopUsage } from "./types.ts";

export const ZERO_AGENT_LOOP_USAGE: AgentLoopUsage = {
	inputTokens: 0,
	outputTokens: 0,
	cachedTokens: 0,
	reasoningTokens: 0,
	totalTokens: 0,
	costUsd: 0,
};

export function addAgentLoopUsage(left: AgentLoopUsage, right: AgentLoopUsage): AgentLoopUsage {
	return {
		inputTokens: left.inputTokens + right.inputTokens,
		outputTokens: left.outputTokens + right.outputTokens,
		cachedTokens: left.cachedTokens + right.cachedTokens,
		reasoningTokens: left.reasoningTokens + right.reasoningTokens,
		totalTokens: left.totalTokens + right.totalTokens,
		costUsd: left.costUsd + right.costUsd,
	};
}
