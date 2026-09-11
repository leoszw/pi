import type {
	TraceErrorRecord,
	TraceLlmCallRecord,
	TraceRecord,
	TraceRetrievalRecord,
	TraceSnapshot,
	TraceSpanRecord,
	TraceToolCallRecord,
} from "./types.ts";

export interface TraceRepository {
	saveTrace(record: TraceRecord): Promise<void>;
	saveSpan(record: TraceSpanRecord): Promise<void>;
	saveLlmCall(record: TraceLlmCallRecord): Promise<void>;
	saveToolCall(record: TraceToolCallRecord): Promise<void>;
	saveRetrieval(record: TraceRetrievalRecord): Promise<void>;
	saveError(record: TraceErrorRecord): Promise<void>;
	getSnapshot(traceId: string): Promise<TraceSnapshot | undefined>;
}
