import { randomUUID } from "node:crypto";
import type { JsonObject, MutationOperation, RequestContext, ToolInvocation, ToolResult } from "../contracts/index.ts";
import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import { getMutationToolDefinition, MUTATION_TOOL_DEFINITIONS } from "./definitions.ts";
import { computeBatchRecordVersion, computeMutationDigest, stableJson } from "./digest.ts";
import { mutationPermissionFor } from "./in-memory.ts";
import type {
	ApprovalTokenPayload,
	MutableBusinessRecord,
	MutationAuditEvent,
	MutationCommitResult,
	MutationEntityPolicy,
	MutationPrepareResult,
	MutationProposalRecord,
	MutationRuntimeOptions,
	MutationScope,
	MutationTargetProposal,
	MutationToolRuntime,
} from "./types.ts";
import { buildMutationUiActions } from "./ui-actions.ts";
import { assertPolicyFields, requireMutationScope, validateMutationArgs } from "./validation.ts";

function sameScope(left: MutationScope, right: MutationScope): boolean {
	return (
		left.userId === right.userId &&
		left.tenantId === right.tenantId &&
		left.companyId === right.companyId &&
		left.projectId === right.projectId
	);
}
function errorResult(invocation: ToolInvocation, error: unknown): ToolResult {
	if (error instanceof IndustryAgentError)
		return { toolCallId: invocation.toolCallId, ok: false, error: { code: error.code, message: error.message } };
	return {
		toolCallId: invocation.toolCallId,
		ok: false,
		error: { code: "REPOSITORY_ERROR", message: error instanceof Error ? error.message : String(error) },
	};
}
function changed(before: unknown, after: unknown): boolean {
	return stableJson(before) !== stableJson(after);
}
function buildDiff(operation: MutationOperation, targets: readonly MutationTargetProposal[]) {
	const output: { entityId?: string; field: string; before?: unknown; after?: unknown }[] = [];
	for (const target of targets) {
		if (operation === "DELETE") {
			output.push({
				...(target.entityId ? { entityId: target.entityId } : {}),
				field: "_softDeleted",
				before: false,
				after: true,
			});
			const reason = target.after?._deleteReason;
			if (reason !== undefined)
				output.push({
					...(target.entityId ? { entityId: target.entityId } : {}),
					field: "_deleteReason",
					after: reason,
				});
			continue;
		}
		const before = target.before ?? {};
		const after = target.after ?? {};
		const fields = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
		for (const field of fields)
			if (changed(before[field], after[field]))
				output.push({
					...(target.entityId ? { entityId: target.entityId } : {}),
					field,
					...(before[field] === undefined ? {} : { before: before[field] }),
					...(after[field] === undefined ? {} : { after: after[field] }),
				});
	}
	return output;
}
function proposalDigestInput(proposal: MutationProposalRecord) {
	return {
		operationId: proposal.operationId,
		traceId: proposal.traceId,
		requestId: proposal.requestId,
		operation: proposal.operation,
		entityType: proposal.entityType,
		scope: proposal.scope,
		targets: proposal.targets,
		recordVersion: proposal.recordVersion,
		affectedCount: proposal.affectedCount,
		representativeSamples: proposal.representativeSamples,
		diff: proposal.diff,
	};
}
function bindMatches(payload: ApprovalTokenPayload, proposal: MutationProposalRecord, scope: MutationScope): boolean {
	return (
		payload.operationId === proposal.operationId &&
		payload.operationDigest === proposal.digest &&
		payload.recordVersion === proposal.recordVersion &&
		payload.userId === scope.userId &&
		payload.tenantId === scope.tenantId &&
		payload.companyId === scope.companyId &&
		payload.projectId === scope.projectId
	);
}

export class MutationRuntime implements MutationToolRuntime {
	private readonly options: MutationRuntimeOptions;
	private readonly now: () => Date;
	private readonly idFactory: () => string;
	private readonly approvalTtlMs: number;
	constructor(options: MutationRuntimeOptions) {
		this.options = options;
		this.now = options.now ?? (() => new Date());
		this.idFactory = options.idFactory ?? (() => randomUUID());
		this.approvalTtlMs = options.approvalTtlMs ?? 5 * 60_000;
	}
	listDefinitions() {
		return MUTATION_TOOL_DEFINITIONS;
	}

	async execute(invocation: ToolInvocation): Promise<ToolResult> {
		const definition = getMutationToolDefinition(invocation.toolName, invocation.toolVersion);
		if (!definition)
			return errorResult(
				invocation,
				new IndustryAgentError(
					"TOOL_NOT_FOUND",
					`Tool not found: ${invocation.toolName}@${invocation.toolVersion}`,
				),
			);
		this.options.trace?.recordMutation("tool_start", {
			toolCallId: invocation.toolCallId,
			toolName: invocation.toolName,
			traceId: invocation.context.traceId,
		});
		try {
			const scope = requireMutationScope(invocation.context);
			if (
				!definition.permission ||
				!(await this.options.permissions.authorize({
					...scope,
					permission: definition.permission,
					toolName: definition.name,
				}))
			)
				throw new IndustryAgentError(
					"TOOL_ACCESS_DENIED",
					`Permission denied: ${definition.permission ?? "missing"}`,
				);
			const args = validateMutationArgs(definition.name, invocation.args);
			let data: unknown;
			if (args.kind === "prepare_create")
				data = await this.prepareCreate(args.entityType, args.values, scope, definition.name, invocation.context);
			else if (args.kind === "prepare_update")
				data = await this.prepareUpdate(
					args.entityType,
					args.entityIds,
					args.patch,
					scope,
					definition.name,
					invocation.context,
				);
			else if (args.kind === "prepare_delete")
				data = await this.prepareDelete(
					args.entityType,
					args.entityIds,
					scope,
					definition.name,
					invocation.context,
					args.reason,
				);
			else
				data = await this.commit(args.operationId, args.approvalToken, scope, definition.name, invocation.context);
			const result: ToolResult = { toolCallId: invocation.toolCallId, ok: true, data };
			this.options.trace?.recordMutation("tool_end", {
				toolCallId: invocation.toolCallId,
				toolName: invocation.toolName,
				ok: true,
			});
			return result;
		} catch (error) {
			const result = errorResult(invocation, error);
			this.options.trace?.recordMutation("tool_end", {
				toolCallId: invocation.toolCallId,
				toolName: invocation.toolName,
				ok: false,
				code: result.error?.code,
			});
			return result;
		}
	}

	async approve(operationId: string, context: RequestContext, confirmedByUser: true) {
		if (confirmedByUser !== true)
			throw new IndustryAgentError("MUTATION_APPROVAL_REQUIRED", "Explicit UI confirmation is required");
		const scope = requireMutationScope(context);
		const proposal = await this.requireProposal(operationId);
		this.assertProposalScope(proposal, scope);
		if (proposal.status !== "PREPARED")
			throw new IndustryAgentError(
				"MUTATION_APPROVAL_INVALID",
				`Proposal is not awaiting approval: ${proposal.status}`,
			);
		const policy = this.requirePolicy(proposal.entityType);
		await this.requireEntityPermission(scope, policy, proposal.operation, "mutation_ui_approval");
		this.assertProposalDigest(proposal);
		const issuedAt = this.now().toISOString();
		const expiresAt = new Date(Date.parse(issuedAt) + this.approvalTtlMs).toISOString();
		const payload: ApprovalTokenPayload = {
			...scope,
			nonce: this.idFactory(),
			operationId,
			operationDigest: proposal.digest,
			recordVersion: proposal.recordVersion,
			issuedAt,
			expiresAt,
		};
		await this.options.approvals.issue({ ...payload, status: "ISSUED" });
		await this.options.proposals.update({ ...proposal, status: "APPROVED", approvedAt: issuedAt });
		await this.audit(proposal, "APPROVED", context, { nonce: payload.nonce, expiresAt });
		this.options.trace?.recordMutation("approved", { operationId, digest: proposal.digest, expiresAt });
		return { operationId, approvalToken: this.options.approvalTokens.issue(payload), expiresAt };
	}

	private async prepareCreate(
		entityType: string,
		values: JsonObject,
		scope: MutationScope,
		toolName: string,
		context: RequestContext,
	): Promise<MutationPrepareResult> {
		const policy = this.requirePolicy(entityType);
		assertPolicyFields(policy, "CREATE", values);
		await this.requireEntityPermission(scope, policy, "CREATE", toolName);
		const targets: MutationTargetProposal[] = [{ recordVersion: "NEW", after: structuredClone(values) }];
		return this.savePrepared("CREATE", entityType, targets, scope, policy, context);
	}
	private async prepareUpdate(
		entityType: string,
		entityIds: readonly string[],
		patch: JsonObject,
		scope: MutationScope,
		toolName: string,
		context: RequestContext,
	): Promise<MutationPrepareResult> {
		const policy = this.requirePolicy(entityType);
		this.assertBatch(policy, entityIds);
		assertPolicyFields(policy, "UPDATE", patch);
		await this.requireEntityPermission(scope, policy, "UPDATE", toolName);
		const targets: MutationTargetProposal[] = [];
		for (const entityId of entityIds) {
			const current = await this.options.readRepository.getRecord(entityType, entityId, scope);
			if (!current)
				throw new IndustryAgentError("MUTATION_RECORD_NOT_FOUND", `Record not found: ${entityType}/${entityId}`);
			targets.push({
				entityId,
				recordVersion: current.version,
				before: current.data,
				after: { ...current.data, ...structuredClone(patch) },
			});
		}
		return this.savePrepared("UPDATE", entityType, targets, scope, policy, context);
	}
	private async prepareDelete(
		entityType: string,
		entityIds: readonly string[],
		scope: MutationScope,
		toolName: string,
		context: RequestContext,
		reason?: string,
	): Promise<MutationPrepareResult> {
		const policy = this.requirePolicy(entityType);
		this.assertBatch(policy, entityIds);
		if (!policy.softDelete)
			throw new IndustryAgentError("MUTATION_VALIDATION_ERROR", "Phase 7 delete requires softDelete policy");
		await this.requireEntityPermission(scope, policy, "DELETE", toolName);
		const targets: MutationTargetProposal[] = [];
		for (const entityId of entityIds) {
			const current = await this.options.readRepository.getRecord(entityType, entityId, scope);
			if (!current)
				throw new IndustryAgentError("MUTATION_RECORD_NOT_FOUND", `Record not found: ${entityType}/${entityId}`);
			targets.push({
				entityId,
				recordVersion: current.version,
				before: current.data,
				after: { ...current.data, _softDeleted: true, ...(reason ? { _deleteReason: reason } : {}) },
			});
		}
		return this.savePrepared("DELETE", entityType, targets, scope, policy, context);
	}
	private async savePrepared(
		operation: MutationOperation,
		entityType: string,
		targets: readonly MutationTargetProposal[],
		scope: MutationScope,
		_policy: MutationEntityPolicy,
		context: RequestContext,
	): Promise<MutationPrepareResult> {
		await this.options.validator.validate({ stage: "PREPARE", operation, entityType, scope, targets });
		const operationId = this.idFactory();
		const recordVersion = computeBatchRecordVersion(targets);
		const diff = buildDiff(operation, targets);
		const representativeSamples = targets.slice(0, 5).map((item) => structuredClone(item));
		const base = {
			operationId,
			traceId: context.traceId,
			requestId: context.requestId,
			operation,
			entityType,
			scope: structuredClone(scope),
			targets: targets.map((item) => structuredClone(item)),
			recordVersion,
			affectedCount: targets.length,
			representativeSamples,
			diff,
		};
		const digest = computeMutationDigest(base);
		const createdAt = this.now().toISOString();
		const proposal: MutationProposalRecord = { ...base, digest, status: "PREPARED", createdAt };
		await this.options.proposals.save(proposal);
		await this.audit(proposal, "PREPARED", context);
		this.options.trace?.recordMutation("prepared", {
			operationId,
			operation,
			entityType,
			affectedCount: targets.length,
			digest,
		});
		return { proposal, uiActions: buildMutationUiActions(proposal) };
	}

	private async commit(
		operationId: string,
		approvalToken: string,
		scope: MutationScope,
		toolName: string,
		context: RequestContext,
	): Promise<MutationCommitResult> {
		const proposal = await this.requireProposal(operationId);
		this.assertProposalScope(proposal, scope);
		let policy: MutationEntityPolicy;
		let payload: ApprovalTokenPayload;
		const now = this.now().toISOString();
		try {
			if (proposal.status === "COMMITTED")
				throw new IndustryAgentError("MUTATION_APPROVAL_REPLAYED", "Mutation has already been committed");
			if (proposal.status !== "APPROVED")
				throw new IndustryAgentError("MUTATION_APPROVAL_REQUIRED", `Proposal is not approved: ${proposal.status}`);
			policy = this.requirePolicy(proposal.entityType);
			await this.requireEntityPermission(scope, policy, proposal.operation, toolName);
			this.assertProposalDigest(proposal);
			payload = this.options.approvalTokens.verify(approvalToken);
			if (Date.parse(payload.expiresAt) <= Date.parse(now))
				throw new IndustryAgentError("MUTATION_APPROVAL_EXPIRED", "Approval token has expired");
			if (!bindMatches(payload, proposal, scope))
				throw new IndustryAgentError(
					"MUTATION_DIGEST_MISMATCH",
					"Approval token does not match proposal scope, digest, operation, or record version",
				);
			await this.options.validator.validate({
				stage: "COMMIT",
				operation: proposal.operation,
				entityType: proposal.entityType,
				scope,
				targets: proposal.targets,
			});
		} catch (error) {
			await this.audit(proposal, "REJECTED", context, {
				code: error instanceof IndustryAgentError ? error.code : "REPOSITORY_ERROR",
				message: error instanceof Error ? error.message : String(error),
			});
			this.options.trace?.recordMutation("commit_rejected", {
				operationId,
				code: error instanceof IndustryAgentError ? error.code : "REPOSITORY_ERROR",
			});
			throw error;
		}
		await this.audit(proposal, "COMMIT_STARTED", context);
		this.options.trace?.recordMutation("commit_started", {
			operationId,
			digest: proposal.digest,
			recordVersion: proposal.recordVersion,
		});
		let verified: MutableBusinessRecord[];
		try {
			verified = await this.options.writeGateway.transaction(async (session) => {
				if (!(await session.consumeApproval(payload.nonce, operationId, now)))
					throw new IndustryAgentError(
						"MUTATION_APPROVAL_REPLAYED",
						"Approval token was already consumed or is no longer valid",
					);
				if (proposal.operation !== "CREATE") {
					for (const target of proposal.targets) {
						if (!target.entityId)
							throw new IndustryAgentError("MUTATION_VALIDATION_ERROR", "Mutation target is missing entityId");
						const current = await session.getRecord(proposal.entityType, target.entityId, scope);
						if (!current)
							throw new IndustryAgentError(
								"MUTATION_RECORD_NOT_FOUND",
								`Record not found: ${proposal.entityType}/${target.entityId}`,
							);
						if (current.version !== target.recordVersion)
							throw new IndustryAgentError(
								"MUTATION_VERSION_CONFLICT",
								`Record version changed: ${proposal.entityType}/${target.entityId}`,
							);
						if (stableJson(current.data) !== stableJson(target.before ?? {}))
							throw new IndustryAgentError(
								"MUTATION_DIGEST_MISMATCH",
								`Record content changed without matching proposal: ${proposal.entityType}/${target.entityId}`,
							);
					}
				}
				const output: MutableBusinessRecord[] = [];
				if (proposal.operation === "CREATE")
					output.push(await session.create(proposal.entityType, proposal.targets[0]?.after ?? {}, scope));
				else if (proposal.operation === "UPDATE")
					for (const target of proposal.targets)
						output.push(
							await session.update(
								proposal.entityType,
								target.entityId!,
								this.patchForTarget(target),
								target.recordVersion,
								scope,
							),
						);
				else
					for (const target of proposal.targets)
						output.push(
							await session.softDelete(proposal.entityType, target.entityId!, target.recordVersion, scope),
						);
				const reread: MutableBusinessRecord[] = [];
				for (const record of output) {
					const current = await session.getRecord(proposal.entityType, record.entityId, scope, {
						includeDeleted: true,
					});
					if (
						!current ||
						current.version !== record.version ||
						stableJson(current.data) !== stableJson(record.data)
					)
						throw new IndustryAgentError(
							"MUTATION_VERIFY_FAILED",
							`Transactional write-after-read verification failed: ${proposal.entityType}/${record.entityId}`,
						);
					if (proposal.operation === "DELETE" && !current.deletedAt)
						throw new IndustryAgentError(
							"MUTATION_VERIFY_FAILED",
							`Soft delete verification failed: ${proposal.entityType}/${record.entityId}`,
						);
					reread.push(current);
				}
				return reread;
			});
		} catch (error) {
			const code = error instanceof IndustryAgentError ? error.code : "REPOSITORY_ERROR";
			if (code !== "MUTATION_APPROVAL_REPLAYED") {
				try {
					await this.options.proposals.update({ ...proposal, status: "FAILED" });
				} catch (finalizationError) {
					this.options.trace?.recordMutation("failure_status_persist_failed", {
						operationId,
						message: finalizationError instanceof Error ? finalizationError.message : String(finalizationError),
					});
				}
				try {
					await this.audit(proposal, "FAILED", context, {
						code,
						message: error instanceof Error ? error.message : String(error),
					});
				} catch (auditError) {
					this.options.trace?.recordMutation("failure_audit_persist_failed", {
						operationId,
						message: auditError instanceof Error ? auditError.message : String(auditError),
					});
				}
			} else {
				try {
					await this.audit(proposal, "REJECTED", context, {
						code,
						message: error instanceof Error ? error.message : String(error),
						reconciliationRequired: true,
					});
				} catch (auditError) {
					this.options.trace?.recordMutation("replay_audit_persist_failed", {
						operationId,
						message: auditError instanceof Error ? auditError.message : String(auditError),
					});
				}
			}
			this.options.trace?.recordMutation("commit_failed", { operationId, code });
			throw error;
		}

		const entityIds = verified.map((record) => record.entityId);
		const committedAt = this.now().toISOString();
		try {
			await this.audit(proposal, "COMMITTED", context, { entityIds, verified: true });
			await this.options.proposals.update({
				...proposal,
				status: "COMMITTED",
				committedAt,
				resultEntityIds: entityIds,
			});
		} catch (error) {
			this.options.trace?.recordMutation("commit_finalization_failed", {
				operationId,
				entityIds,
				verified: true,
				message: error instanceof Error ? error.message : String(error),
			});
			throw new IndustryAgentError(
				"MUTATION_COMMIT_FINALIZATION_FAILED",
				"Business mutation was committed and verified, but audit/proposal finalization failed. Do not retry automatically; reconcile the operation state first.",
				{ cause: error, details: { operationId, businessWriteCommitted: true, verified: true, entityIds } },
			);
		}
		this.options.trace?.recordMutation("committed", { operationId, entityIds, verified: true });
		return { operationId, status: "COMMITTED", records: verified, verified: true };
	}

	private patchForTarget(target: MutationTargetProposal): JsonObject {
		const before = target.before ?? {},
			after = target.after ?? {};
		const patch: Record<string, unknown> = {};
		for (const key of Object.keys(after)) if (changed(before[key], after[key])) patch[key] = after[key];
		return patch;
	}
	private async requireProposal(operationId: string) {
		const proposal = await this.options.proposals.get(operationId);
		if (!proposal)
			throw new IndustryAgentError("MUTATION_PROPOSAL_NOT_FOUND", `Mutation proposal not found: ${operationId}`);
		return proposal;
	}
	private requirePolicy(entityType: string) {
		const policy = this.options.policies.get(entityType);
		if (!policy)
			throw new IndustryAgentError("MUTATION_POLICY_NOT_FOUND", `Mutation policy not found: ${entityType}`);
		return policy;
	}
	private assertBatch(policy: MutationEntityPolicy, ids: readonly string[]) {
		const max = policy.maxBatchSize ?? 100;
		if (ids.length > max)
			throw new IndustryAgentError("MUTATION_VALIDATION_ERROR", `Batch exceeds policy maximum ${max}`);
	}
	private assertProposalScope(proposal: MutationProposalRecord, scope: MutationScope) {
		if (!sameScope(proposal.scope, scope))
			throw new IndustryAgentError(
				"TOOL_ACCESS_DENIED",
				"Mutation proposal scope does not match current request context",
			);
	}
	private assertProposalDigest(proposal: MutationProposalRecord) {
		const digest = computeMutationDigest(proposalDigestInput(proposal));
		if (digest !== proposal.digest)
			throw new IndustryAgentError("MUTATION_DIGEST_MISMATCH", "Stored mutation proposal digest is invalid");
	}
	private async requireEntityPermission(
		scope: MutationScope,
		policy: MutationEntityPolicy,
		operation: MutationOperation,
		toolName: string,
	) {
		const permission = mutationPermissionFor(policy, operation);
		if (
			!(await this.options.permissions.authorize({
				...scope,
				permission,
				toolName,
				entityType: policy.entityType,
				operation,
			}))
		)
			throw new IndustryAgentError("TOOL_ACCESS_DENIED", `Permission denied: ${permission}`);
	}
	private async audit(
		proposal: MutationProposalRecord,
		eventType: MutationAuditEvent["eventType"],
		context: RequestContext,
		details?: JsonObject,
	) {
		await this.options.audit.record({
			eventId: this.idFactory(),
			traceId: context.traceId,
			requestId: context.requestId,
			operationId: proposal.operationId,
			eventType,
			scope: proposal.scope,
			entityType: proposal.entityType,
			operation: proposal.operation,
			digest: proposal.digest,
			recordVersion: proposal.recordVersion,
			...(details ? { details } : {}),
			createdAt: this.now().toISOString(),
		});
	}
}
