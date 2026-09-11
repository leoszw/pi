import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import type { TraceRepository } from "./repository.ts";
import type {
	TraceErrorRecord,
	TraceLlmCallRecord,
	TraceRecord,
	TraceRetrievalRecord,
	TraceSnapshot,
	TraceSpanRecord,
	TraceToolCallRecord,
} from "./types.ts";

interface MutableTraceSnapshot {
	trace: TraceRecord;
	spans: TraceSpanRecord[];
	llmCalls: TraceLlmCallRecord[];
	toolCalls: TraceToolCallRecord[];
	retrievals: TraceRetrievalRecord[];
	errors: TraceErrorRecord[];
}

function upsertById<T>(records: T[], record: T, getId: (value: T) => string): void {
	const id = getId(record);
	const index = records.findIndex((item) => getId(item) === id);
	if (index === -1) {
		records.push(structuredClone(record));
		return;
	}
	records[index] = structuredClone(record);
}

export class InMemoryTraceRepository implements TraceRepository {
	private readonly snapshots = new Map<string, MutableTraceSnapshot>();

	async saveTrace(record: TraceRecord): Promise<void> {
		const current = this.snapshots.get(record.traceId);
		if (current) {
			current.trace = structuredClone(record);
			return;
		}
		this.snapshots.set(record.traceId, {
			trace: structuredClone(record),
			spans: [],
			llmCalls: [],
			toolCalls: [],
			retrievals: [],
			errors: [],
		});
	}

	async saveSpan(record: TraceSpanRecord): Promise<void> {
		upsertById(this.requireSnapshot(record.traceId).spans, record, (item) => item.spanId);
	}

	async saveLlmCall(record: TraceLlmCallRecord): Promise<void> {
		upsertById(this.requireSnapshot(record.traceId).llmCalls, record, (item) => item.callId);
	}

	async saveToolCall(record: TraceToolCallRecord): Promise<void> {
		upsertById(this.requireSnapshot(record.traceId).toolCalls, record, (item) => item.callId);
	}

	async saveRetrieval(record: TraceRetrievalRecord): Promise<void> {
		upsertById(this.requireSnapshot(record.traceId).retrievals, record, (item) => item.eventId);
	}

	async saveError(record: TraceErrorRecord): Promise<void> {
		upsertById(this.requireSnapshot(record.traceId).errors, record, (item) => item.errorId);
	}

	async getSnapshot(traceId: string): Promise<TraceSnapshot | undefined> {
		const snapshot = this.snapshots.get(traceId);
		return snapshot ? structuredClone(snapshot) : undefined;
	}

	private requireSnapshot(traceId: string): MutableTraceSnapshot {
		const snapshot = this.snapshots.get(traceId);
		if (!snapshot) {
			throw new IndustryAgentError("REPOSITORY_ERROR", `trace not initialized: ${traceId}`);
		}
		return snapshot;
	}
}
