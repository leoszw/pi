import {
	type AgentEvent,
	type AgentMessage,
	type SpanAttributes,
	type SpanOptions,
	type SpanStatus,
	type TelemetryContext,
	uuidv7,
} from "@earendil-works/pi-agent-core";
import type { RequestContext, SemanticFrame } from "../contracts/index.ts";
import { SchemaTraceRedactor, type TraceRedactor } from "./redaction.ts";
import type { TraceRepository } from "./repository.ts";
import { PersistentTraceTelemetryContext, type TraceTelemetrySink } from "./telemetry-context.ts";
import type {
	TraceErrorRecord,
	TraceLlmCallRecord,
	TraceOperationStatus,
	TraceRecord,
	TraceRetrievalInput,
	TraceRetrievalRecord,
	TraceSpanRecord,
	TraceToolCallRecord,
	TraceToolMetadata,
	TraceUsageTotals,
} from "./types.ts";

type AssistantAgentMessage = Extract<AgentMessage, { role: "assistant" }>;

export interface TraceCollectorOptions {
	repository: TraceRepository;
	idFactory?: () => string;
	now?: () => Date;
	redactor?: TraceRedactor;
	resolveToolMetadata?: (toolName: string) => TraceToolMetadata | undefined;
	onPersistenceError?: (error: unknown) => void;
}

const EMPTY_TOTALS: TraceUsageTotals = {
	inputTokens: 0,
	outputTokens: 0,
	cacheReadTokens: 0,
	cacheWriteTokens: 0,
	reasoningTokens: 0,
	totalTokens: 0,
	costAmount: 0,
};

function toRecord(value: unknown): Readonly<Record<string, unknown>> {
	if (value !== null && typeof value === "object" && !Array.isArray(value)) {
		return value as Readonly<Record<string, unknown>>;
	}
	return { value };
}

function errorDetails(error: unknown): Readonly<Record<string, unknown>> {
	if (error instanceof Error) {
		return { name: error.name, message: error.message };
	}
	return { value: String(error) };
}

function assistantText(message: AssistantAgentMessage): string {
	return message.content
		.filter((part): part is Extract<AssistantAgentMessage["content"][number], { type: "text" }> => part.type === "text")
		.map((part) => part.text)
		.join("");
}

function operationStatus(message: AssistantAgentMessage): TraceOperationStatus {
	if (message.stopReason === "error") return "ERROR";
	if (message.stopReason === "aborted") return "ABORTED";
	return "OK";
}

function durationMs(startedAt: string, endedAt: string): number | undefined {
	const value = Date.parse(endedAt) - Date.parse(startedAt);
	return Number.isFinite(value) && value >= 0 ? value : undefined;
}

export class TraceCollector implements TraceTelemetrySink {
	readonly telemetryContext: TelemetryContext;
	private readonly context: RequestContext;
	private readonly repository: TraceRepository;
	private readonly idFactory: () => string;
	private readonly now: () => Date;
	private readonly redactor: TraceRedactor;
	private readonly resolveToolMetadata?: (toolName: string) => TraceToolMetadata | undefined;
	private readonly onPersistenceError?: (error: unknown) => void;
	private pendingWrites: Promise<void> = Promise.resolve();
	private nextSequenceValue = 1;
	private terminalRecorded = false;
	private rootSpanId?: string;
	private activeTurnSpanId?: string;
	private activeLlmCallId?: string;
	private readonly spans = new Map<string, TraceSpanRecord>();
	private readonly llmCalls = new Map<string, TraceLlmCallRecord>();
	private readonly toolCalls = new Map<string, TraceToolCallRecord>();
	private readonly explicitTelemetryStatuses = new Set<string>();
	private trace: TraceRecord;

	constructor(context: RequestContext, originalQuery: string, options: TraceCollectorOptions) {
		this.context = context;
		this.repository = options.repository;
		this.idFactory = options.idFactory ?? uuidv7;
		this.now = options.now ?? (() => new Date());
		this.redactor = options.redactor ?? new SchemaTraceRedactor();
		this.resolveToolMetadata = options.resolveToolMetadata;
		this.onPersistenceError = options.onPersistenceError;
		this.trace = {
			traceId: context.traceId,
			requestId: context.requestId,
			conversationId: context.conversationId,
			userId: context.userId,
			tenantId: context.tenantId,
			companyId: context.companyId,
			projectId: context.projectId,
			status: "RUNNING",
			originalQuery,
			totals: { ...EMPTY_TOTALS },
			llmCallCount: 0,
			toolCallCount: 0,
			retrievalCount: 0,
			errorCount: 0,
			startedAt: context.createdAt,
		};
		this.telemetryContext = new PersistentTraceTelemetryContext(this);
		this.saveTrace();
	}

	recordSemanticFrame(frame: SemanticFrame): void {
		this.trace = { ...this.trace, semanticFrame: structuredClone(frame) };
		this.saveTrace();
	}

	recordAgentEvent(event: AgentEvent): void {
		switch (event.type) {
			case "agent_start":
				this.rootSpanId = this.openSpan("agent.run", "AGENT");
				break;
			case "turn_start":
				this.activeTurnSpanId = this.openSpan("agent.turn", "TURN", this.rootSpanId);
				break;
			case "message_start":
				if (event.message.role === "assistant") this.startLlmCall(event.message);
				break;
			case "message_end":
				if (event.message.role === "assistant") this.finishLlmCall(event.message);
				break;
			case "tool_execution_start":
				this.startToolCall(event.toolCallId, event.toolName, event.args);
				break;
			case "tool_execution_end":
				this.finishToolCall(event.toolCallId, event.toolName, event.result, event.isError);
				break;
			case "turn_end":
				this.closeActiveTurn(event.message);
				break;
			case "agent_end": {
				const terminalStatus = this.terminalStatusFromMessages(event.messages);
				const spanStatus = terminalStatus === "FAILED" ? "ERROR" : terminalStatus === "ABORTED" ? "ABORTED" : "OK";
				this.closeActiveTurn(undefined, spanStatus);
				if (this.rootSpanId) this.closeSpan(this.rootSpanId, spanStatus);
				this.recordTerminalFromMessages(event.messages);
				break;
			}
			case "message_update":
			case "tool_execution_update":
				break;
		}
	}

	recordRetrieval(input: TraceRetrievalInput): void {
		const now = this.timestamp();
		const startedAt = input.startedAt ?? now;
		const endedAt = input.endedAt ?? now;
		const record: TraceRetrievalRecord = {
			eventId: this.idFactory(),
			traceId: this.context.traceId,
			sequence: this.nextSequence(),
			spanId: input.spanId ?? this.activeTurnSpanId ?? this.rootSpanId,
			retrievalType: input.retrievalType,
			status: input.status,
			query: input.query,
			filters: toRecord(this.redactor.redact(input.filters ?? {})),
			candidates: (input.candidates ?? []).map((candidate) => toRecord(this.redactor.redact(candidate))),
			indexVersion: input.indexVersion,
			modelVersion: input.modelVersion,
			latencyMs: input.latencyMs ?? durationMs(startedAt, endedAt),
			startedAt,
			endedAt,
		};
		this.trace = { ...this.trace, retrievalCount: this.trace.retrievalCount + 1 };
		this.schedule(() => this.repository.saveRetrieval(record));
		this.saveTrace();
	}

	recordError(code: string, message: string, details?: unknown, retriable = false, spanId?: string): void {
		const record: TraceErrorRecord = {
			errorId: this.idFactory(),
			traceId: this.context.traceId,
			sequence: this.nextSequence(),
			spanId: spanId ?? this.activeTurnSpanId ?? this.rootSpanId,
			code,
			message,
			details: details === undefined ? undefined : this.redactor.redact(details),
			retriable,
			createdAt: this.timestamp(),
		};
		this.trace = { ...this.trace, errorCount: this.trace.errorCount + 1 };
		this.schedule(() => this.repository.saveError(record));
		this.saveTrace();
	}

	async complete(messages: readonly AgentMessage[]): Promise<void> {
		if (!this.terminalRecorded) {
			this.recordTerminalFromMessages(messages);
		}
		await this.flush();
	}

	async fail(error: unknown): Promise<void> {
		if (!this.terminalRecorded) {
			this.recordError("AGENT_EXECUTION_ERROR", "Pi Agent execution failed", errorDetails(error));
			this.trace = { ...this.trace, status: "FAILED", endedAt: this.timestamp() };
			this.terminalRecorded = true;
			if (this.activeTurnSpanId) this.closeSpan(this.activeTurnSpanId, "ERROR");
			if (this.rootSpanId) this.closeSpan(this.rootSpanId, "ERROR");
			this.saveTrace();
		}
		await this.flush();
	}

	async flush(): Promise<void> {
		await this.pendingWrites;
	}

	startTelemetrySpan(parentSpanId: string | undefined, options: SpanOptions): string {
		return this.openSpan(options.name, "TELEMETRY", parentSpanId ?? this.activeTurnSpanId ?? this.rootSpanId, options.attributes);
	}

	addTelemetryEvent(spanId: string, name: string, attributes?: SpanAttributes): void {
		const span = this.spans.get(spanId);
		if (!span || span.endedAt) return;
		const event = {
			name,
			timestamp: this.timestamp(),
			attributes: toRecord(this.redactor.redact(attributes ?? {})),
		};
		const updated = { ...span, events: [...span.events, event] };
		this.spans.set(spanId, updated);
		this.schedule(() => this.repository.saveSpan(updated));
	}

	setTelemetryAttributes(spanId: string, attributes: SpanAttributes): void {
		const span = this.spans.get(spanId);
		if (!span || span.endedAt) return;
		const nextAttributes = toRecord(this.redactor.redact(attributes));
		const updated = { ...span, attributes: { ...span.attributes, ...nextAttributes } };
		this.spans.set(spanId, updated);
		this.schedule(() => this.repository.saveSpan(updated));
	}

	setTelemetryStatus(spanId: string, status: SpanStatus): void {
		const span = this.spans.get(spanId);
		if (!span || span.endedAt) return;
		this.explicitTelemetryStatuses.add(spanId);
		const attributes =
			status.status === "error" && status.error
				? { ...span.attributes, telemetryError: this.redactor.redact(status.error) }
				: span.attributes;
		const updated: TraceSpanRecord = {
			...span,
			status: status.status === "error" ? "ERROR" : "OK",
			attributes: toRecord(attributes),
		};
		this.spans.set(spanId, updated);
		this.schedule(() => this.repository.saveSpan(updated));
	}

	endTelemetrySpan(spanId: string, failed: boolean, error?: unknown): void {
		const span = this.spans.get(spanId);
		if (!span || span.endedAt) return;
		const explicit = this.explicitTelemetryStatuses.has(spanId);
		const status = explicit ? span.status : failed ? "ERROR" : "OK";
		const attributes = failed && error !== undefined && !explicit
			? { ...span.attributes, telemetryError: this.redactor.redact(errorDetails(error)) }
			: span.attributes;
		const updated: TraceSpanRecord = {
			...span,
			status,
			attributes: toRecord(attributes),
			endedAt: this.timestamp(),
		};
		this.spans.set(spanId, updated);
		this.schedule(() => this.repository.saveSpan(updated));
	}

	private startLlmCall(message: AssistantAgentMessage): void {
		const callId = this.idFactory();
		const startedAt = this.timestamp();
		const record: TraceLlmCallRecord = {
			callId,
			traceId: this.context.traceId,
			sequence: this.nextSequence(),
			spanId: this.activeTurnSpanId ?? this.rootSpanId,
			provider: message.provider,
			model: message.model,
			modelVersion: message.responseModel,
			status: "RUNNING",
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			reasoningTokens: 0,
			totalTokens: 0,
			costAmount: 0,
			requestMetadata: { api: message.api },
			startedAt,
		};
		this.activeLlmCallId = callId;
		this.llmCalls.set(callId, record);
		this.trace = { ...this.trace, llmCallCount: this.trace.llmCallCount + 1 };
		this.schedule(() => this.repository.saveLlmCall(record));
		this.saveTrace();
	}

	private finishLlmCall(message: AssistantAgentMessage): void {
		let callId = this.activeLlmCallId;
		if (!callId || !this.llmCalls.has(callId)) {
			this.startLlmCall(message);
			callId = this.activeLlmCallId;
		}
		if (!callId) return;
		const current = this.llmCalls.get(callId);
		if (!current) return;
		const endedAt = this.timestamp();
		const usage = message.usage;
		const updated: TraceLlmCallRecord = {
			...current,
			provider: message.provider,
			model: message.model,
			modelVersion: message.responseModel,
			status: operationStatus(message),
			inputTokens: usage.input,
			outputTokens: usage.output,
			cacheReadTokens: usage.cacheRead,
			cacheWriteTokens: usage.cacheWrite,
			reasoningTokens: usage.reasoning ?? 0,
			totalTokens: usage.totalTokens,
			costAmount: usage.cost.total,
			latencyMs: durationMs(current.startedAt, endedAt),
			responseMetadata: toRecord(
				this.redactor.redact({
					responseId: message.responseId,
					responseModel: message.responseModel,
					providerThinkingLevel: message.providerThinkingLevel,
					stopReason: message.stopReason,
					rawStopReason: message.rawStopReason,
					endTurn: message.endTurn,
				}),
			),
			endedAt,
		};
		this.llmCalls.set(callId, updated);
		this.activeLlmCallId = undefined;
		this.trace = {
			...this.trace,
			totals: {
				inputTokens: this.trace.totals.inputTokens + usage.input,
				outputTokens: this.trace.totals.outputTokens + usage.output,
				cacheReadTokens: this.trace.totals.cacheReadTokens + usage.cacheRead,
				cacheWriteTokens: this.trace.totals.cacheWriteTokens + usage.cacheWrite,
				reasoningTokens: this.trace.totals.reasoningTokens + (usage.reasoning ?? 0),
				totalTokens: this.trace.totals.totalTokens + usage.totalTokens,
				costAmount: this.trace.totals.costAmount + usage.cost.total,
			},
		};
		this.schedule(() => this.repository.saveLlmCall(updated));
		if (message.stopReason === "error") {
			this.recordError("LLM_ERROR", message.errorMessage ?? "LLM request failed", {
				provider: message.provider,
				model: message.model,
			});
		}
		this.saveTrace();
	}

	private startToolCall(toolCallId: string, toolName: string, input: unknown): void {
		if (this.toolCalls.has(toolCallId)) return;
		const metadata = this.resolveToolMetadata?.(toolName);
		const record: TraceToolCallRecord = {
			callId: toolCallId,
			traceId: this.context.traceId,
			sequence: this.nextSequence(),
			spanId: this.activeTurnSpanId ?? this.rootSpanId,
			toolName,
			toolVersion: metadata?.toolVersion,
			action: metadata?.action,
			status: "RUNNING",
			input: this.redactor.redact(input),
			startedAt: this.timestamp(),
		};
		this.toolCalls.set(toolCallId, record);
		this.trace = { ...this.trace, toolCallCount: this.trace.toolCallCount + 1 };
		this.schedule(() => this.repository.saveToolCall(record));
		this.saveTrace();
	}

	private finishToolCall(toolCallId: string, toolName: string, output: unknown, isError: boolean): void {
		if (!this.toolCalls.has(toolCallId)) this.startToolCall(toolCallId, toolName, {});
		const current = this.toolCalls.get(toolCallId);
		if (!current) return;
		const endedAt = this.timestamp();
		const updated: TraceToolCallRecord = {
			...current,
			status: isError ? "ERROR" : "OK",
			output: this.redactor.redact(output),
			latencyMs: durationMs(current.startedAt, endedAt),
			endedAt,
		};
		this.toolCalls.set(toolCallId, updated);
		this.schedule(() => this.repository.saveToolCall(updated));
		if (isError) this.recordError("TOOL_ERROR", `Tool failed: ${toolName}`, { toolCallId, toolName }, false, current.spanId);
	}

	private closeActiveTurn(
		message?: AgentMessage,
		forcedStatus?: Exclude<TraceSpanRecord["status"], "RUNNING">,
	): void {
		if (!this.activeTurnSpanId) return;
		let status: Exclude<TraceSpanRecord["status"], "RUNNING"> = forcedStatus ?? "OK";
		if (!forcedStatus && message?.role === "assistant") {
			if (message.stopReason === "error") status = "ERROR";
			if (message.stopReason === "aborted") status = "ABORTED";
		}
		this.closeSpan(this.activeTurnSpanId, status);
		this.activeTurnSpanId = undefined;
	}

	private terminalStatusFromMessages(messages: readonly AgentMessage[]): TraceRecord["status"] {
		const lastAssistant = [...messages].reverse().find(
			(message): message is AssistantAgentMessage => message.role === "assistant",
		);
		if (lastAssistant?.stopReason === "error") return "FAILED";
		if (lastAssistant?.stopReason === "aborted") return "ABORTED";
		return "COMPLETED";
	}

	private recordTerminalFromMessages(messages: readonly AgentMessage[]): void {
		if (this.terminalRecorded) return;
		const lastAssistant = [...messages].reverse().find(
			(message): message is AssistantAgentMessage => message.role === "assistant",
		);
		const status = this.terminalStatusFromMessages(messages);
		this.trace = {
			...this.trace,
			status,
			finalResponse: lastAssistant ? assistantText(lastAssistant) : this.trace.finalResponse,
			endedAt: this.timestamp(),
		};
		this.terminalRecorded = true;
		this.saveTrace();
	}

	private openSpan(
		name: string,
		spanType: TraceSpanRecord["spanType"],
		parentSpanId?: string,
		attributes?: SpanAttributes,
	): string {
		const spanId = this.idFactory();
		const record: TraceSpanRecord = {
			spanId,
			traceId: this.context.traceId,
			sequence: this.nextSequence(),
			parentSpanId,
			spanType,
			name,
			status: "RUNNING",
			attributes: toRecord(this.redactor.redact(attributes ?? {})),
			events: [],
			startedAt: this.timestamp(),
		};
		this.spans.set(spanId, record);
		this.schedule(() => this.repository.saveSpan(record));
		return spanId;
	}

	private closeSpan(spanId: string, status: Exclude<TraceSpanRecord["status"], "RUNNING">): void {
		const span = this.spans.get(spanId);
		if (!span || span.endedAt) return;
		const updated: TraceSpanRecord = { ...span, status, endedAt: this.timestamp() };
		this.spans.set(spanId, updated);
		this.schedule(() => this.repository.saveSpan(updated));
	}

	private saveTrace(): void {
		const snapshot = structuredClone(this.trace);
		this.schedule(() => this.repository.saveTrace(snapshot));
	}

	private schedule(operation: () => Promise<void>): void {
		this.pendingWrites = this.pendingWrites.then(operation).catch((error: unknown) => {
			try {
				this.onPersistenceError?.(error);
			} catch {
				// Trace recording must never break the agent request path.
			}
		});
	}

	private nextSequence(): number {
		const value = this.nextSequenceValue;
		this.nextSequenceValue += 1;
		return value;
	}

	private timestamp(): string {
		return this.now().toISOString();
	}
}
