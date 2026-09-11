import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import type { TraceRepository } from "./repository.ts";
import type {
	TraceQueryScope,
	TraceSnapshot,
	TraceStats,
	TraceTimelineItem,
	TraceTree,
	TraceTreeNode,
} from "./types.ts";

export const TRACE_API_ROUTES = {
	trace: "/api/traces/{trace_id}",
	timeline: "/api/traces/{trace_id}/timeline",
	tree: "/api/traces/{trace_id}/tree",
	stats: "/api/traces/{trace_id}/stats",
} as const;

function assertScope(snapshot: TraceSnapshot, scope: TraceQueryScope): void {
	const trace = snapshot.trace;
	const denied =
		trace.tenantId !== scope.tenantId ||
		(scope.userId !== undefined && trace.userId !== scope.userId) ||
		(scope.companyId !== undefined && trace.companyId !== scope.companyId) ||
		(scope.projectId !== undefined && trace.projectId !== scope.projectId);
	if (denied) {
		throw new IndustryAgentError("TRACE_ACCESS_DENIED", "trace is outside the requested access scope", {
			details: { traceId: trace.traceId },
		});
	}
}

function timelineFromSnapshot(snapshot: TraceSnapshot): TraceTimelineItem[] {
	const items: TraceTimelineItem[] = [];
	for (const span of snapshot.spans) {
		items.push({
			sequence: span.sequence,
			kind: "span",
			id: span.spanId,
			name: span.name,
			status: span.status,
			spanId: span.spanId,
			parentSpanId: span.parentSpanId,
			timestamp: span.startedAt,
			endedAt: span.endedAt,
			details: { spanType: span.spanType, attributes: span.attributes, events: span.events },
		});
	}
	for (const call of snapshot.llmCalls) {
		items.push({
			sequence: call.sequence,
			kind: "llm",
			id: call.callId,
			name: `${call.provider}:${call.model}`,
			status: call.status,
			spanId: call.spanId,
			timestamp: call.startedAt,
			endedAt: call.endedAt,
			details: {
				modelVersion: call.modelVersion,
				inputTokens: call.inputTokens,
				outputTokens: call.outputTokens,
				cacheReadTokens: call.cacheReadTokens,
				cacheWriteTokens: call.cacheWriteTokens,
				reasoningTokens: call.reasoningTokens,
				totalTokens: call.totalTokens,
				costAmount: call.costAmount,
				latencyMs: call.latencyMs,
				requestMetadata: call.requestMetadata,
				responseMetadata: call.responseMetadata,
			},
		});
	}
	for (const call of snapshot.toolCalls) {
		items.push({
			sequence: call.sequence,
			kind: "tool",
			id: call.callId,
			name: call.toolName,
			status: call.status,
			spanId: call.spanId,
			timestamp: call.startedAt,
			endedAt: call.endedAt,
			details: {
				toolVersion: call.toolVersion,
				action: call.action,
				input: call.input,
				output: call.output,
				latencyMs: call.latencyMs,
			},
		});
	}
	for (const retrieval of snapshot.retrievals) {
		items.push({
			sequence: retrieval.sequence,
			kind: "retrieval",
			id: retrieval.eventId,
			name: retrieval.retrievalType,
			status: retrieval.status,
			spanId: retrieval.spanId,
			timestamp: retrieval.startedAt,
			endedAt: retrieval.endedAt,
			details: {
				query: retrieval.query,
				filters: retrieval.filters,
				candidates: retrieval.candidates,
				indexVersion: retrieval.indexVersion,
				modelVersion: retrieval.modelVersion,
				latencyMs: retrieval.latencyMs,
			},
		});
	}
	for (const error of snapshot.errors) {
		items.push({
			sequence: error.sequence,
			kind: "error",
			id: error.errorId,
			name: error.code,
			status: "ERROR",
			spanId: error.spanId,
			timestamp: error.createdAt,
			details: { message: error.message, details: error.details, retriable: error.retriable },
		});
	}
	return items.sort((left, right) => left.sequence - right.sequence);
}

function buildTree(snapshot: TraceSnapshot, timeline: readonly TraceTimelineItem[]): TraceTree {
	const operations = timeline.filter((item) => item.kind !== "span");
	const spansById = new Map(snapshot.spans.map((span) => [span.spanId, span] as const));
	const childrenByParent = new Map<string | undefined, typeof snapshot.spans>();
	for (const span of snapshot.spans) {
		const parentId = span.parentSpanId && spansById.has(span.parentSpanId) ? span.parentSpanId : undefined;
		const children = childrenByParent.get(parentId) ?? [];
		childrenByParent.set(parentId, [...children, span]);
	}
	const operationsBySpan = new Map<string, TraceTimelineItem[]>();
	const unscopedOperations: TraceTimelineItem[] = [];
	for (const operation of operations) {
		if (!operation.spanId || !spansById.has(operation.spanId)) {
			unscopedOperations.push(operation);
			continue;
		}
		const current = operationsBySpan.get(operation.spanId) ?? [];
		current.push(operation);
		operationsBySpan.set(operation.spanId, current);
	}

	const visited = new Set<string>();
	const buildNode = (spanId: string, ancestors: ReadonlySet<string>): TraceTreeNode => {
		const span = spansById.get(spanId);
		if (!span) {
			throw new IndustryAgentError("REPOSITORY_ERROR", `trace span missing: ${spanId}`);
		}
		if (ancestors.has(spanId)) {
			throw new IndustryAgentError("REPOSITORY_ERROR", `trace span cycle detected: ${spanId}`);
		}
		const nextAncestors = new Set(ancestors);
		nextAncestors.add(spanId);
		visited.add(spanId);
		const children = (childrenByParent.get(spanId) ?? []).map((child) => buildNode(child.spanId, nextAncestors));
		return { span, operations: operationsBySpan.get(spanId) ?? [], children };
	};

	const roots = (childrenByParent.get(undefined) ?? []).map((span) => buildNode(span.spanId, new Set()));
	if (visited.size !== snapshot.spans.length) {
		throw new IndustryAgentError("REPOSITORY_ERROR", "trace span graph is disconnected or cyclic");
	}
	return { roots, unscopedOperations };
}

export class TraceQueryService {
	private readonly repository: TraceRepository;

	constructor(repository: TraceRepository) {
		this.repository = repository;
	}

	async getTrace(traceId: string, scope: TraceQueryScope): Promise<TraceSnapshot> {
		const snapshot = await this.repository.getSnapshot(traceId);
		if (!snapshot) {
			throw new IndustryAgentError("TRACE_NOT_FOUND", `trace not found: ${traceId}`);
		}
		assertScope(snapshot, scope);
		return snapshot;
	}

	async getTimeline(traceId: string, scope: TraceQueryScope): Promise<readonly TraceTimelineItem[]> {
		return timelineFromSnapshot(await this.getTrace(traceId, scope));
	}

	async getTree(traceId: string, scope: TraceQueryScope): Promise<TraceTree> {
		const snapshot = await this.getTrace(traceId, scope);
		return buildTree(snapshot, timelineFromSnapshot(snapshot));
	}

	async getStats(traceId: string, scope: TraceQueryScope): Promise<TraceStats> {
		const snapshot = await this.getTrace(traceId, scope);
		const startedAt = Date.parse(snapshot.trace.startedAt);
		const endedAt = snapshot.trace.endedAt ? Date.parse(snapshot.trace.endedAt) : Number.NaN;
		const durationMs = Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt >= startedAt
			? endedAt - startedAt
			: undefined;
		return {
			traceId,
			status: snapshot.trace.status,
			durationMs,
			llmCallCount: snapshot.trace.llmCallCount,
			toolCallCount: snapshot.trace.toolCallCount,
			retrievalCount: snapshot.trace.retrievalCount,
			errorCount: snapshot.trace.errorCount,
			totals: snapshot.trace.totals,
		};
	}
}
