import type { SemanticFrame, ToolAction } from "../contracts/index.ts";

export type TraceStatus = "RUNNING" | "COMPLETED" | "FAILED" | "ABORTED";
export type TraceSpanStatus = "RUNNING" | "OK" | "ERROR" | "ABORTED";
export type TraceOperationStatus = "RUNNING" | "OK" | "ERROR" | "ABORTED";

export interface TraceUsageTotals {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	reasoningTokens: number;
	totalTokens: number;
	costAmount: number;
}

export interface TraceRecord {
	traceId: string;
	requestId: string;
	conversationId: string;
	userId: string;
	tenantId: string;
	companyId?: string;
	projectId?: string;
	status: TraceStatus;
	originalQuery: string;
	semanticFrame?: SemanticFrame;
	finalResponse?: string;
	totals: TraceUsageTotals;
	llmCallCount: number;
	toolCallCount: number;
	retrievalCount: number;
	errorCount: number;
	startedAt: string;
	endedAt?: string;
}

export interface TraceSpanEventRecord {
	name: string;
	timestamp: string;
	attributes: Readonly<Record<string, unknown>>;
}

export interface TraceSpanRecord {
	spanId: string;
	traceId: string;
	sequence: number;
	parentSpanId?: string;
	spanType: "AGENT" | "TURN" | "TELEMETRY";
	name: string;
	status: TraceSpanStatus;
	attributes: Readonly<Record<string, unknown>>;
	events: readonly TraceSpanEventRecord[];
	startedAt: string;
	endedAt?: string;
}

export interface TraceLlmCallRecord {
	callId: string;
	traceId: string;
	sequence: number;
	spanId?: string;
	provider: string;
	model: string;
	modelVersion?: string;
	status: TraceOperationStatus;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	reasoningTokens: number;
	totalTokens: number;
	costAmount: number;
	latencyMs?: number;
	requestMetadata?: Readonly<Record<string, unknown>>;
	responseMetadata?: Readonly<Record<string, unknown>>;
	startedAt: string;
	endedAt?: string;
}

export interface TraceToolCallRecord {
	callId: string;
	traceId: string;
	sequence: number;
	spanId?: string;
	toolName: string;
	toolVersion?: string;
	action?: ToolAction;
	status: TraceOperationStatus;
	input?: unknown;
	output?: unknown;
	latencyMs?: number;
	startedAt: string;
	endedAt?: string;
}

export interface TraceRetrievalRecord {
	eventId: string;
	traceId: string;
	sequence: number;
	spanId?: string;
	retrievalType: string;
	status: TraceOperationStatus;
	query: string;
	filters: Readonly<Record<string, unknown>>;
	candidates: readonly Readonly<Record<string, unknown>>[];
	indexVersion?: string;
	modelVersion?: string;
	latencyMs?: number;
	startedAt: string;
	endedAt?: string;
}

export interface TraceErrorRecord {
	errorId: string;
	traceId: string;
	sequence: number;
	spanId?: string;
	code: string;
	message: string;
	details?: unknown;
	retriable: boolean;
	createdAt: string;
}

export interface TraceSnapshot {
	trace: TraceRecord;
	spans: readonly TraceSpanRecord[];
	llmCalls: readonly TraceLlmCallRecord[];
	toolCalls: readonly TraceToolCallRecord[];
	retrievals: readonly TraceRetrievalRecord[];
	errors: readonly TraceErrorRecord[];
}

export interface TraceRetrievalInput {
	retrievalType: string;
	status: Exclude<TraceOperationStatus, "RUNNING">;
	query: string;
	filters?: Readonly<Record<string, unknown>>;
	candidates?: readonly Readonly<Record<string, unknown>>[];
	indexVersion?: string;
	modelVersion?: string;
	spanId?: string;
	startedAt?: string;
	endedAt?: string;
	latencyMs?: number;
}

export interface TraceToolMetadata {
	toolVersion?: string;
	action?: ToolAction;
}

export interface TraceQueryScope {
	tenantId: string;
	userId?: string;
	companyId?: string;
	projectId?: string;
}

export type TraceTimelineKind = "span" | "llm" | "tool" | "retrieval" | "error";

export interface TraceTimelineItem {
	sequence: number;
	kind: TraceTimelineKind;
	id: string;
	name: string;
	status: string;
	spanId?: string;
	parentSpanId?: string;
	timestamp: string;
	endedAt?: string;
	details: Readonly<Record<string, unknown>>;
}

export interface TraceTreeNode {
	span: TraceSpanRecord;
	operations: readonly TraceTimelineItem[];
	children: readonly TraceTreeNode[];
}

export interface TraceTree {
	roots: readonly TraceTreeNode[];
	unscopedOperations: readonly TraceTimelineItem[];
}

export interface TraceStats {
	traceId: string;
	status: TraceStatus;
	durationMs?: number;
	llmCallCount: number;
	toolCallCount: number;
	retrievalCount: number;
	errorCount: number;
	totals: TraceUsageTotals;
}
