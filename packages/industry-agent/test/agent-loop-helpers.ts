import type { AgentLoopLimits, AgentLoopUsage } from "../src/agent-loop/index.ts";
import type { RequestContext, ToolDefinition } from "../src/contracts/index.ts";

export const zeroUsage = (): AgentLoopUsage => ({
	inputTokens: 0,
	outputTokens: 0,
	cachedTokens: 0,
	reasoningTokens: 0,
	totalTokens: 0,
	costUsd: 0,
});
export const usage = (tokens: number, costUsd = 0.01): AgentLoopUsage => ({
	inputTokens: tokens,
	outputTokens: 0,
	cachedTokens: 0,
	reasoningTokens: 0,
	totalTokens: tokens,
	costUsd,
});
export const context = (): RequestContext => ({
	traceId: "trace-1",
	requestId: "req-1",
	conversationId: "conv-1",
	userId: "u1",
	tenantId: "t1",
	companyId: "c1",
	projectId: "p1",
	createdAt: "2026-09-12T00:00:00.000Z",
});
export const limits = (override: Partial<AgentLoopLimits> = {}): AgentLoopLimits => ({
	maxSteps: 4,
	maxToolCalls: 3,
	maxTotalTokens: 1000,
	maxCostUsd: 1,
	maxDurationMs: 5000,
	maxOperationMs: 1000,
	maxHistoryItemChars: 20000,
	...override,
});
export const readTool = (): ToolDefinition => ({
	name: "search_boq",
	version: "1.0.0",
	domain: "boq",
	action: "SEARCH",
	description: "search",
	inputSchema: {},
	outputSchema: {},
	allowedEntityTypes: ["BOQ_ITEM"],
	dataScopeRule: "SERVER_REQUEST_CONTEXT: userId+tenantId+companyId+projectId",
	riskLevel: "LOW",
	requiresConfirmation: false,
	supportsDryRun: false,
	idempotent: true,
	timeoutMs: 1000,
});
export const prepareTool = (): ToolDefinition => ({
	name: "prepare_update",
	version: "1.0.0",
	domain: "mutation",
	action: "UPDATE",
	description: "prepare",
	inputSchema: {},
	outputSchema: {},
	allowedEntityTypes: ["*"],
	dataScopeRule: "SERVER_REQUEST_CONTEXT: userId+tenantId+companyId+projectId",
	riskLevel: "HIGH",
	requiresConfirmation: false,
	supportsDryRun: true,
	idempotent: false,
	timeoutMs: 1000,
});
export const commitTool = (): ToolDefinition => ({
	name: "commit_mutation",
	version: "1.0.0",
	domain: "mutation",
	action: "UPDATE",
	description: "commit",
	inputSchema: {},
	outputSchema: {},
	allowedEntityTypes: ["*"],
	dataScopeRule: "SERVER_REQUEST_CONTEXT: userId+tenantId+companyId+projectId",
	riskLevel: "CRITICAL",
	requiresConfirmation: true,
	supportsDryRun: false,
	idempotent: false,
	timeoutMs: 1000,
});
