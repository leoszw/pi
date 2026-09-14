import type { JsonObject, RequestContext, ToolDefinition, ToolInvocation, ToolResult } from "../contracts/index.ts";

export interface AgentLoopLimits {
	maxSteps: number;
	maxToolCalls: number;
	maxTotalTokens: number;
	maxCostUsd: number;
	maxDurationMs: number;
	maxOperationMs: number;
	maxHistoryItemChars: number;
}

export interface AgentLoopUsage {
	inputTokens: number;
	outputTokens: number;
	cachedTokens: number;
	reasoningTokens: number;
	totalTokens: number;
	costUsd: number;
}

export interface AgentLoopBudgetView {
	remainingSteps: number;
	remainingToolCalls: number;
	remainingTokens: number;
	remainingCostUsd: number;
	remainingDurationMs: number;
}

export interface AgentLoopGoal {
	goal: string;
	context: RequestContext;
	metadata?: JsonObject;
}

export interface AgentLoopToolAction {
	toolName: string;
	toolVersion: string;
	args: JsonObject;
	purpose: string;
}

export type AgentPlannerDecision =
	| { kind: "TOOL"; action: AgentLoopToolAction; usage: AgentLoopUsage }
	| { kind: "FINISH"; answer: string; usage: AgentLoopUsage }
	| { kind: "ASK_USER"; question: string; usage: AgentLoopUsage }
	| { kind: "FAIL"; reason: string; usage: AgentLoopUsage };

export type AgentVerificationDecision =
	| { kind: "SATISFIED"; answer: string; usage: AgentLoopUsage }
	| { kind: "REPLAN"; feedback: string; usage: AgentLoopUsage }
	| { kind: "ASK_USER"; question: string; usage: AgentLoopUsage }
	| { kind: "FAIL"; reason: string; usage: AgentLoopUsage };

export interface AgentLoopHistoryEntry {
	step: number;
	plannerDecision: AgentPlannerDecision["kind"];
	action?: AgentLoopToolAction;
	toolCallId?: string;
	toolResult?: ToolResult;
	verification?: AgentVerificationDecision["kind"];
	feedback?: string;
}

export interface AgentLoopSafetyContract {
	scopeSource: "SERVER_REQUEST_CONTEXT";
	toolOutputs: "UNTRUSTED_DATA";
	confirmationRequiredTools: "BLOCK_IN_LOOP";
	criticalTools: "BLOCK_IN_LOOP";
	scopeArgs: "STRIP_AND_REJECT_MISMATCH";
}

export interface AgentPlannerInput {
	goal: string;
	context: RequestContext;
	metadata?: JsonObject;
	history: readonly AgentLoopHistoryEntry[];
	availableTools: readonly ToolDefinition[];
	budget: AgentLoopBudgetView;
	safety: AgentLoopSafetyContract;
}

export interface AgentVerifierInput {
	goal: string;
	context: RequestContext;
	metadata?: JsonObject;
	step: number;
	action: AgentLoopToolAction;
	toolResult: ToolResult;
	history: readonly AgentLoopHistoryEntry[];
	budget: AgentLoopBudgetView;
	safety: AgentLoopSafetyContract;
}

export interface AgentLoopPlanner {
	readonly version: string;
	plan(input: AgentPlannerInput, signal: AbortSignal): Promise<AgentPlannerDecision>;
}

export interface AgentLoopVerifier {
	readonly version: string;
	verify(input: AgentVerifierInput, signal: AbortSignal): Promise<AgentVerificationDecision>;
}

export interface AgentLoopToolCatalog {
	list(): readonly ToolDefinition[];
	get(name: string, version: string): ToolDefinition | undefined;
}

export interface AgentLoopToolExecutionResult {
	result: ToolResult;
	usage: AgentLoopUsage;
	usageAccountingComplete: boolean;
}

export interface AgentLoopToolExecutor {
	execute(
		invocation: ToolInvocation,
		budget: AgentLoopBudgetView,
		signal: AbortSignal,
	): Promise<AgentLoopToolExecutionResult>;
}

export type AgentLoopTraceEventType =
	| "LOOP_START"
	| "PLAN_START"
	| "PLAN_END"
	| "ACT_START"
	| "ACT_END"
	| "VERIFY_START"
	| "VERIFY_END"
	| "REPLAN"
	| "TERMINATE";

export interface AgentLoopTraceEvent {
	traceId: string;
	requestId: string;
	event: AgentLoopTraceEventType;
	step?: number;
	details?: JsonObject;
}

export interface AgentLoopTraceSink {
	record(event: AgentLoopTraceEvent): void;
}

export type AgentLoopTermination =
	| "SUCCEEDED"
	| "USER_INPUT_REQUIRED"
	| "CONFIRMATION_REQUIRED"
	| "MAX_STEPS"
	| "MAX_TOOL_CALLS"
	| "TOKEN_BUDGET_EXCEEDED"
	| "COST_BUDGET_EXCEEDED"
	| "TIMEOUT"
	| "USAGE_ACCOUNTING_INCOMPLETE"
	| "FAILED";

export interface AgentLoopResult {
	status: AgentLoopTermination;
	answer?: string;
	question?: string;
	reason?: string;
	pendingAction?: AgentLoopToolAction;
	history: readonly AgentLoopHistoryEntry[];
	usage: AgentLoopUsage;
	usageAccountingComplete: boolean;
	steps: number;
	toolCalls: number;
	durationMs: number;
}

export interface AgentLoopServiceOptions {
	planner: AgentLoopPlanner;
	verifier: AgentLoopVerifier;
	tools: AgentLoopToolCatalog;
	executor: AgentLoopToolExecutor;
	limits: AgentLoopLimits;
	trace?: AgentLoopTraceSink;
	idFactory?: () => string;
	nowMs?: () => number;
}
