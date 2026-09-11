export type Identifier = string;
export type JsonObject = Readonly<Record<string, unknown>>;

export type ConstraintMode = "hard" | "soft";
export type ConstraintSource = "user" | "context" | "rule" | "llm";

export interface RequestContext {
	traceId: Identifier;
	requestId: Identifier;
	conversationId: Identifier;
	userId: Identifier;
	tenantId: Identifier;
	companyId?: Identifier;
	projectId?: Identifier;
	createdAt: string;
}

export interface EntityMention {
	text: string;
	start: number;
	end: number;
	entityType?: string;
	confidence: number;
	source: ConstraintSource;
}

export interface SemanticConstraint {
	field: string;
	value: unknown;
	confidence: number;
	source: ConstraintSource;
	mode: ConstraintMode;
}

export interface SemanticFrame {
	originalText: string;
	intent: string;
	mentions: readonly EntityMention[];
	constraints: readonly SemanticConstraint[];
	filters: JsonObject;
	contextRefs: readonly Identifier[];
	requestedFields: readonly string[];
}

export interface EntityCandidate {
	entityId: Identifier;
	entityType: string;
	canonicalName: string;
	score: number;
	source: string;
	metadata?: JsonObject;
}

export interface ResolvedEntity {
	entityId: Identifier;
	entityType: string;
	canonicalName: string;
	confidence: number;
	evidence?: readonly string[];
}

export type ToolAction = "READ" | "SEARCH" | "CALCULATE" | "CREATE" | "UPDATE" | "DELETE" | "EXPORT";
export type ToolRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface ToolDefinition {
	name: string;
	version: string;
	domain: string;
	action: ToolAction;
	description: string;
	inputSchema: JsonObject;
	outputSchema: JsonObject;
	allowedEntityTypes: readonly string[];
	permission?: string;
	dataScopeRule?: string;
	riskLevel: ToolRiskLevel;
	requiresConfirmation: boolean;
	supportsDryRun: boolean;
	idempotent: boolean;
	timeoutMs: number;
	retryPolicy?: JsonObject;
}

export interface ToolInvocation {
	toolCallId: Identifier;
	toolName: string;
	toolVersion: string;
	args: JsonObject;
	context: RequestContext;
}

export interface ToolResult {
	toolCallId: Identifier;
	ok: boolean;
	data?: unknown;
	error?: {
		code: string;
		message: string;
	};
}

export type UIActionType =
	| "entity_picker"
	| "form"
	| "editable_form"
	| "diff"
	| "mutation_confirmation"
	| "table"
	| "multi_select"
	| "date_picker"
	| "report_preview"
	| "error_resolution";

export interface UIAction {
	id: Identifier;
	type: UIActionType;
	payload: JsonObject;
}

export type MutationOperation = "CREATE" | "UPDATE" | "DELETE";

export interface MutationProposal {
	operationId: Identifier;
	operation: MutationOperation;
	entityType: string;
	entityId?: Identifier;
	recordVersion?: string;
	before?: JsonObject;
	after?: JsonObject;
	digest: string;
	requiresConfirmation: true;
}

export type TraceEventType = "request" | "agent" | "llm" | "tool" | "retrieval" | "error" | "response";

export interface TraceEvent {
	traceId: Identifier;
	spanId?: Identifier;
	parentSpanId?: Identifier;
	type: TraceEventType;
	name: string;
	timestamp: string;
	attributes?: JsonObject;
}

export interface RetrievalCandidateDebug {
	entityId: Identifier;
	rank: number;
	source: string;
	score?: number;
	metadata?: JsonObject;
}

export interface RetrievalDebug {
	query: string;
	filters: JsonObject;
	candidates: readonly RetrievalCandidateDebug[];
	indexVersion?: string;
	modelVersion?: string;
}

export type KnowledgeVisibility = "PRIVATE" | "PROJECT" | "COMPANY" | "INDUSTRY" | "TENANT";

export interface KnowledgeScope {
	tenantId: Identifier;
	industryId?: Identifier;
	companyId?: Identifier;
	projectId?: Identifier;
	departmentId?: Identifier;
	ownerUserId?: Identifier;
	visibility: KnowledgeVisibility;
	aclUsers: readonly Identifier[];
	aclRoles: readonly string[];
	securityTags: readonly string[];
}
