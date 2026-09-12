import type { JsonObject, RequestContext, ResolvedEntity } from "../contracts/index.ts";

export type WorkingMemoryPersistableSource = "USER_EXPLICIT" | "TOOL_RESULT" | "SERVER_CONTEXT" | "SYSTEM_DERIVED";
export type WorkingMemoryCaptureSource = WorkingMemoryPersistableSource | "LLM_INFERENCE";

export interface WorkingMemoryScope {
	conversationId: string;
	tenantId: string;
	userId: string;
	companyId: string | null;
}

export interface WorkingMemoryValue<T> {
	value: T;
	source: WorkingMemoryPersistableSource;
	projectId: string | null;
	sourceTraceId: string;
	sourceRequestId: string;
	capturedAt: string;
}

export interface WorkingMemoryRow {
	rowId: string;
	entityId?: string;
	entityType?: string;
	label?: string;
	status?: string;
	data?: JsonObject;
}

export interface WorkingMemoryToolResult {
	toolCallId: string;
	toolName: string;
	resultRefs: readonly string[];
	summary?: string;
	continuationToken?: string;
	projectId: string | null;
	sourceTraceId: string;
	sourceRequestId: string;
	capturedAt: string;
	source: "TOOL_RESULT";
}

export interface WorkingMemoryState {
	scope: WorkingMemoryScope;
	revision: number;
	resolvedEntities?: WorkingMemoryValue<readonly ResolvedEntity[]>;
	lastResultSet?: WorkingMemoryValue<readonly WorkingMemoryRow[]>;
	activeFilters?: WorkingMemoryValue<JsonObject>;
	activeProject?: WorkingMemoryValue<string>;
	selectedRows?: WorkingMemoryValue<readonly WorkingMemoryRow[]>;
	recentToolResults: readonly WorkingMemoryToolResult[];
	lastUpdatedTraceId: string;
	createdAt: string;
	updatedAt: string;
	expiresAt: string;
}

export interface WorkingMemoryLimits {
	ttlMs: number;
	maxResolvedEntities: number;
	maxResultRows: number;
	maxSelectedRows: number;
	maxRecentToolResults: number;
	maxSnapshotChars: number;
}

export interface WorkingMemoryRepository {
	get(scope: WorkingMemoryScope): Promise<WorkingMemoryState | undefined>;
	save(state: WorkingMemoryState, expectedRevision: number | null): Promise<void>;
}

export type WorkingMemoryReferenceKind =
	| "CURRENT_SET"
	| "ORDINAL"
	| "APPLY_FILTER"
	| "CONTINUE"
	| "EXPORT_CURRENT"
	| "NONE";

export interface WorkingMemoryDerivedFilter {
	field: "status";
	operator: "SEMANTIC";
	value: "UNFINISHED";
	source: "USER_EXPLICIT";
}

export interface WorkingMemoryResolution {
	kind: WorkingMemoryReferenceKind;
	matchedText?: string;
	activeProjectId: string | null;
	rowIds: readonly string[];
	entityIds: readonly string[];
	selectedRow?: WorkingMemoryRow;
	derivedFilters: readonly WorkingMemoryDerivedFilter[];
	continueFrom?: WorkingMemoryToolResult;
	requiresClarification: boolean;
	reason?: string;
}

export interface WorkingMemoryServiceOptions {
	repository: WorkingMemoryRepository;
	limits?: Partial<WorkingMemoryLimits>;
	now?: () => Date;
}

export interface CaptureToolResultInput {
	toolCallId: string;
	toolName: string;
	resultRefs: readonly string[];
	summary?: string;
	continuationToken?: string;
}

export interface WorkingMemorySnapshotRecord {
	memoryType: "WORKING_MEMORY_V1";
	conversationId: string;
	tenantId: string;
	userId: string;
	companyId: string | null;
	projectId: string | null;
	status: "ACTIVE";
	content: JsonObject;
	sourceTraceId: string;
	validUntil: string;
}

export interface WorkingMemoryTraceSink {
	record(event: {
		traceId: string;
		requestId: string;
		conversationId: string;
		event: "LOAD" | "SAVE" | "RESOLVE" | "EXPIRED" | "SCOPE_FILTERED";
		details?: JsonObject;
	}): void;
}

export interface WorkingMemoryRuntimeOptions extends WorkingMemoryServiceOptions {
	trace?: WorkingMemoryTraceSink;
}

export interface WorkingMemoryContextView {
	state: WorkingMemoryState;
	effectiveProjectId: string | null;
	resolvedEntities: readonly ResolvedEntity[];
	lastResultSet: readonly WorkingMemoryRow[];
	activeFilters: JsonObject;
	selectedRows: readonly WorkingMemoryRow[];
	recentToolResults: readonly WorkingMemoryToolResult[];
}

export interface WorkingMemoryRequest {
	context: RequestContext;
	text: string;
}
