import type { JsonObject, MutationOperation } from "../contracts/index.ts";
import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import type {
	ApprovalIssueRecord, ApprovalRepository, MutableBusinessRecord, MutationAuditEvent, MutationAuditSink, MutationBusinessValidationInput,
	MutationBusinessValidator, MutationEntityPolicy, MutationPermissionInput, MutationPermissionService, MutationPolicyRegistry,
	MutationProposalRecord, MutationProposalRepository, MutationReadRepository, MutationScope, MutationTraceSink, MutationWriteGateway, MutationWriteSession,
} from "./types.ts";

function scopeKey(scope: MutationScope): string { return `${scope.userId}|${scope.tenantId}|${scope.companyId}|${scope.projectId}`; }
function recordKey(entityType: string, entityId: string): string { return `${entityType}:${entityId}`; }
function sameScope(left: MutationScope, right: MutationScope): boolean { return scopeKey(left) === scopeKey(right); }
function cloneRecord(record: StoredRecord): StoredRecord { return structuredClone(record); }
function bumpVersion(version: string): string {
	const match = /^(?:v)?(\d+)$/.exec(version);
	if (match) return String(Number(match[1]) + 1);
	return `${version}:next`;
}

interface StoredRecord { scope: MutationScope; record: MutableBusinessRecord; }

export class InMemoryMutationPolicyRegistry implements MutationPolicyRegistry {
	private readonly policies = new Map<string, MutationEntityPolicy>();
	constructor(policies: readonly MutationEntityPolicy[] = []) { for (const policy of policies) this.policies.set(policy.entityType, structuredClone(policy)); }
	get(entityType: string): MutationEntityPolicy | undefined { const value = this.policies.get(entityType); return value ? structuredClone(value) : undefined; }
}

export class InMemoryMutationPermissionService implements MutationPermissionService {
	private readonly grants = new Set<string>();
	grant(scope: MutationScope, permission: string): void { this.grants.add(`${scopeKey(scope)}|${permission}`); }
	async authorize(input: MutationPermissionInput): Promise<boolean> { return this.grants.has(`${scopeKey(input)}|${input.permission}`); }
}

export class AllowAllMutationBusinessValidator implements MutationBusinessValidator {
	async validate(_input: MutationBusinessValidationInput): Promise<void> {}
}

export class InMemoryMutationProposalRepository implements MutationProposalRepository {
	private readonly proposals = new Map<string, MutationProposalRecord>();
	async save(proposal: MutationProposalRecord): Promise<void> {
		if (this.proposals.has(proposal.operationId)) throw new IndustryAgentError("REPOSITORY_ERROR", `Duplicate operationId: ${proposal.operationId}`);
		this.proposals.set(proposal.operationId, structuredClone(proposal));
	}
	async get(operationId: string): Promise<MutationProposalRecord | undefined> { const value = this.proposals.get(operationId); return value ? structuredClone(value) : undefined; }
	async update(proposal: MutationProposalRecord): Promise<void> {
		if (!this.proposals.has(proposal.operationId)) throw new IndustryAgentError("REPOSITORY_ERROR", `Mutation proposal not found: ${proposal.operationId}`);
		this.proposals.set(proposal.operationId, structuredClone(proposal));
	}
}

export class InMemoryMutationAuditSink implements MutationAuditSink {
	readonly events: MutationAuditEvent[] = [];
	async record(event: MutationAuditEvent): Promise<void> { this.events.push(structuredClone(event)); }
}

export class InMemoryMutationTraceSink implements MutationTraceSink {
	readonly events: { stage: string; details: Readonly<Record<string, unknown>> }[] = [];
	recordMutation(stage: string, details: Readonly<Record<string, unknown>>): void { this.events.push({ stage, details: structuredClone(details) }); }
}

export interface InMemoryMutationSeed {
	scope: MutationScope;
	record: MutableBusinessRecord;
}

export class InMemoryMutationStore implements MutationReadRepository, MutationWriteGateway, ApprovalRepository {
	private records = new Map<string, StoredRecord>();
	private approvals = new Map<string, ApprovalIssueRecord>();
	private nextId = 1;
	private readonly now: () => Date;
	constructor(seeds: readonly InMemoryMutationSeed[] = [], now: () => Date = () => new Date()) {
		this.now = now;
		for (const seed of seeds) this.records.set(recordKey(seed.record.entityType, seed.record.entityId), { scope: structuredClone(seed.scope), record: structuredClone(seed.record) });
	}
	async getRecord(entityType: string, entityId: string, scope: MutationScope, options: { includeDeleted?: boolean } = {}): Promise<MutableBusinessRecord | undefined> {
		const stored = this.records.get(recordKey(entityType, entityId));
		if (!stored || !sameScope(stored.scope, scope) || (stored.record.deletedAt && !options.includeDeleted)) return undefined;
		return structuredClone(stored.record);
	}
	async issue(record: ApprovalIssueRecord): Promise<void> {
		if (this.approvals.has(record.nonce)) throw new IndustryAgentError("REPOSITORY_ERROR", "Duplicate approval nonce");
		this.approvals.set(record.nonce, structuredClone(record));
	}
	async transaction<T>(work: (session: MutationWriteSession) => Promise<T>): Promise<T> {
		const workingRecords = new Map(Array.from(this.records.entries(), ([key, value]) => [key, cloneRecord(value)]));
		const workingApprovals = new Map(Array.from(this.approvals.entries(), ([key, value]) => [key, structuredClone(value)]));
		let nextId = this.nextId;
		const session: MutationWriteSession = {
			getRecord: async (entityType, entityId, scope, options = {}) => {
				const stored = workingRecords.get(recordKey(entityType, entityId));
				if (!stored || !sameScope(stored.scope, scope) || (stored.record.deletedAt && !options.includeDeleted)) return undefined;
				return structuredClone(stored.record);
			},
			create: async (entityType, data, scope) => {
				let entityId: string;
				do { entityId = `mem-${nextId++}`; } while (workingRecords.has(recordKey(entityType, entityId)));
				const record: MutableBusinessRecord = { entityType, entityId, version: "1", data: structuredClone(data) };
				workingRecords.set(recordKey(entityType, entityId), { scope: structuredClone(scope), record: structuredClone(record) });
				return record;
			},
			update: async (entityType, entityId, patch, expectedVersion, scope) => {
				const key = recordKey(entityType, entityId); const stored = workingRecords.get(key);
				if (!stored || !sameScope(stored.scope, scope) || stored.record.deletedAt) throw new IndustryAgentError("MUTATION_RECORD_NOT_FOUND", `Record not found: ${entityType}/${entityId}`);
				if (stored.record.version !== expectedVersion) throw new IndustryAgentError("MUTATION_VERSION_CONFLICT", `Record version changed: ${entityType}/${entityId}`);
				const record: MutableBusinessRecord = { ...stored.record, version: bumpVersion(stored.record.version), data: { ...stored.record.data, ...structuredClone(patch) } };
				workingRecords.set(key, { scope: stored.scope, record: structuredClone(record) }); return record;
			},
			softDelete: async (entityType, entityId, expectedVersion, scope) => {
				const key = recordKey(entityType, entityId); const stored = workingRecords.get(key);
				if (!stored || !sameScope(stored.scope, scope) || stored.record.deletedAt) throw new IndustryAgentError("MUTATION_RECORD_NOT_FOUND", `Record not found: ${entityType}/${entityId}`);
				if (stored.record.version !== expectedVersion) throw new IndustryAgentError("MUTATION_VERSION_CONFLICT", `Record version changed: ${entityType}/${entityId}`);
				const record: MutableBusinessRecord = { ...stored.record, version: bumpVersion(stored.record.version), deletedAt: this.now().toISOString() };
				workingRecords.set(key, { scope: stored.scope, record: structuredClone(record) }); return record;
			},
			consumeApproval: async (nonce, operationId, at) => {
				const approval = workingApprovals.get(nonce);
				if (!approval || approval.operationId !== operationId || approval.status !== "ISSUED" || Date.parse(approval.expiresAt) <= Date.parse(at)) return false;
				workingApprovals.set(nonce, { ...approval, status: "CONSUMED", consumedAt: at }); return true;
			},
		};
		const result = await work(session);
		this.records = workingRecords; this.approvals = workingApprovals; this.nextId = nextId;
		return result;
	}
}

export function mutationPermissionFor(policy: MutationEntityPolicy, operation: MutationOperation): string {
	if (operation === "CREATE") return policy.createPermission;
	if (operation === "UPDATE") return policy.updatePermission;
	return policy.deletePermission;
}
