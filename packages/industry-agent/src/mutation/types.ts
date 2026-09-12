import type { JsonObject, MutationOperation, RequestContext, ToolDefinition, ToolInvocation, ToolResult, UIAction } from "../contracts/index.ts";

export interface MutationScope {
	userId: string;
	tenantId: string;
	companyId: string;
	projectId: string;
}

export interface MutationEntityPolicy {
	entityType: string;
	createPermission: string;
	updatePermission: string;
	deletePermission: string;
	allowedCreateFields?: readonly string[];
	allowedUpdateFields?: readonly string[];
	immutableFields?: readonly string[];
	softDelete: true;
	maxBatchSize?: number;
}

export interface MutationPolicyRegistry {
	get(entityType: string): MutationEntityPolicy | undefined;
}

export interface MutationPermissionInput extends MutationScope {
	permission: string;
	toolName: string;
	entityType?: string;
	operation?: MutationOperation;
}

export interface MutationPermissionService {
	authorize(input: MutationPermissionInput): Promise<boolean>;
}

export interface MutableBusinessRecord {
	entityType: string;
	entityId: string;
	version: string;
	data: JsonObject;
	deletedAt?: string;
}

export interface MutationReadRepository {
	getRecord(
		entityType: string,
		entityId: string,
		scope: MutationScope,
		options?: { includeDeleted?: boolean },
	): Promise<MutableBusinessRecord | undefined>;
}

export interface MutationWriteSession {
	getRecord(entityType: string, entityId: string, scope: MutationScope, options?: { includeDeleted?: boolean }): Promise<MutableBusinessRecord | undefined>;
	create(entityType: string, data: JsonObject, scope: MutationScope): Promise<MutableBusinessRecord>;
	update(entityType: string, entityId: string, patch: JsonObject, expectedVersion: string, scope: MutationScope): Promise<MutableBusinessRecord>;
	softDelete(entityType: string, entityId: string, expectedVersion: string, scope: MutationScope): Promise<MutableBusinessRecord>;
	consumeApproval(nonce: string, operationId: string, at: string): Promise<boolean>;
}

export interface MutationWriteGateway {
	transaction<T>(work: (session: MutationWriteSession) => Promise<T>): Promise<T>;
}

export interface MutationBusinessValidationInput {
	stage: "PREPARE" | "COMMIT";
	operation: MutationOperation;
	entityType: string;
	scope: MutationScope;
	targets: readonly MutationTargetProposal[];
}

export interface MutationBusinessValidator {
	validate(input: MutationBusinessValidationInput): Promise<void>;
}

export type MutationProposalStatus = "PREPARED" | "APPROVED" | "COMMITTED" | "FAILED" | "CANCELLED";

export interface MutationTargetProposal {
	entityId?: string;
	recordVersion: string;
	before?: JsonObject;
	after?: JsonObject;
}

export interface MutationDiffEntry {
	entityId?: string;
	field: string;
	before?: unknown;
	after?: unknown;
}

export interface MutationProposalRecord {
	operationId: string;
	traceId: string;
	requestId: string;
	operation: MutationOperation;
	entityType: string;
	scope: MutationScope;
	targets: readonly MutationTargetProposal[];
	recordVersion: string;
	digest: string;
	affectedCount: number;
	representativeSamples: readonly MutationTargetProposal[];
	diff: readonly MutationDiffEntry[];
	status: MutationProposalStatus;
	createdAt: string;
	approvedAt?: string;
	committedAt?: string;
	resultEntityIds?: readonly string[];
}

export interface MutationProposalRepository {
	save(proposal: MutationProposalRecord): Promise<void>;
	get(operationId: string): Promise<MutationProposalRecord | undefined>;
	update(proposal: MutationProposalRecord): Promise<void>;
}

export interface ApprovalTokenPayload extends MutationScope {
	nonce: string;
	operationId: string;
	operationDigest: string;
	recordVersion: string;
	issuedAt: string;
	expiresAt: string;
}

export interface ApprovalTokenService {
	issue(payload: ApprovalTokenPayload): string;
	verify(token: string): ApprovalTokenPayload;
}

export interface ApprovalIssueRecord extends ApprovalTokenPayload {
	status: "ISSUED" | "CONSUMED";
	consumedAt?: string;
}

export interface ApprovalRepository {
	issue(record: ApprovalIssueRecord): Promise<void>;
}

export interface MutationAuditEvent {
	eventId: string;
	traceId: string;
	requestId: string;
	operationId: string;
	eventType: "PREPARED" | "APPROVED" | "COMMIT_STARTED" | "COMMITTED" | "FAILED" | "REJECTED";
	scope: MutationScope;
	entityType: string;
	operation: MutationOperation;
	digest: string;
	recordVersion: string;
	details?: JsonObject;
	createdAt: string;
}

export interface MutationAuditSink {
	record(event: MutationAuditEvent): Promise<void>;
}

export interface MutationTraceSink {
	recordMutation(stage: string, details: Readonly<Record<string, unknown>>): void;
}

export interface MutationPrepareResult {
	proposal: MutationProposalRecord;
	uiActions: readonly UIAction[];
}

export interface MutationApprovalResult {
	operationId: string;
	approvalToken: string;
	expiresAt: string;
}

export interface MutationCommitResult {
	operationId: string;
	status: "COMMITTED";
	records: readonly MutableBusinessRecord[];
	verified: true;
}

export interface MutationRuntimeOptions {
	policies: MutationPolicyRegistry;
	permissions: MutationPermissionService;
	validator: MutationBusinessValidator;
	readRepository: MutationReadRepository;
	writeGateway: MutationWriteGateway;
	proposals: MutationProposalRepository;
	approvals: ApprovalRepository;
	approvalTokens: ApprovalTokenService;
	audit: MutationAuditSink;
	trace?: MutationTraceSink;
	idFactory?: () => string;
	now?: () => Date;
	approvalTtlMs?: number;
}

export interface MutationToolRuntime {
	execute(invocation: ToolInvocation): Promise<ToolResult>;
	listDefinitions(): readonly ToolDefinition[];
	approve(operationId: string, context: RequestContext, confirmedByUser: true): Promise<MutationApprovalResult>;
}
