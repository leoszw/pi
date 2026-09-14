import { describe, expect, it } from "vitest";
import type { JsonObject, RequestContext, ToolInvocation } from "../src/contracts/index.ts";
import { HmacApprovalTokenService } from "../src/mutation/approval-token.ts";
import {
	AllowAllMutationBusinessValidator,
	InMemoryMutationAuditSink,
	InMemoryMutationPermissionService,
	InMemoryMutationPolicyRegistry,
	InMemoryMutationProposalRepository,
	InMemoryMutationStore,
	InMemoryMutationTraceSink,
} from "../src/mutation/in-memory.ts";
import { MutationRuntime } from "../src/mutation/runtime.ts";
import type { MutationProposalRecord, MutationProposalRepository, MutationScope } from "../src/mutation/types.ts";

const scope: MutationScope = { userId: "u1", tenantId: "t1", companyId: "c1", projectId: "p1" };
const context: RequestContext = {
	traceId: "tr-finalize",
	requestId: "rq-finalize",
	conversationId: "cv-finalize",
	...scope,
	createdAt: "2026-09-12T00:00:00.000Z",
};
const policy = {
	entityType: "ISSUE",
	createPermission: "issue.create",
	updatePermission: "issue.update",
	deletePermission: "issue.delete",
	allowedUpdateFields: ["status"],
	softDelete: true as const,
};

function invocation(name: string, args: JsonObject): ToolInvocation {
	return { toolCallId: `tc-${name}`, toolName: name, toolVersion: "1.0.0", args, context };
}

class FailCommittedProposalRepository implements MutationProposalRepository {
	private readonly inner = new InMemoryMutationProposalRepository();
	async save(proposal: MutationProposalRecord): Promise<void> {
		await this.inner.save(proposal);
	}
	async get(operationId: string): Promise<MutationProposalRecord | undefined> {
		return this.inner.get(operationId);
	}
	async update(proposal: MutationProposalRecord): Promise<void> {
		if (proposal.status === "COMMITTED") throw new Error("simulated proposal finalization outage");
		await this.inner.update(proposal);
	}
}

describe("mutation commit finalization", () => {
	it("never marks an already committed business write as FAILED when control-plane finalization fails", async () => {
		let id = 0;
		const store = new InMemoryMutationStore([
			{ scope, record: { entityType: "ISSUE", entityId: "i1", version: "1", data: { status: "OPEN" } } },
		]);
		const permissions = new InMemoryMutationPermissionService();
		for (const permission of ["mutation.prepare", "mutation.commit", "issue.update"])
			permissions.grant(scope, permission);
		const proposals = new FailCommittedProposalRepository();
		const audit = new InMemoryMutationAuditSink();
		const trace = new InMemoryMutationTraceSink();
		const runtime = new MutationRuntime({
			policies: new InMemoryMutationPolicyRegistry([policy]),
			permissions,
			validator: new AllowAllMutationBusinessValidator(),
			readRepository: store,
			writeGateway: store,
			proposals,
			approvals: store,
			approvalTokens: new HmacApprovalTokenService("0123456789abcdef0123456789abcdef"),
			audit,
			trace,
			idFactory: () => `final-${++id}`,
			now: () => new Date("2026-09-12T00:00:00.000Z"),
		});

		const prepared = await runtime.execute(
			invocation("prepare_update", { entityType: "ISSUE", entityIds: ["i1"], patch: { status: "DONE" } }),
		);
		const operationId = (prepared.data as { proposal: { operationId: string } }).proposal.operationId;
		const approval = await runtime.approve(operationId, context, true);
		const committed = await runtime.execute(
			invocation("commit_mutation", { operationId, approvalToken: approval.approvalToken }),
		);

		expect(committed.ok).toBe(false);
		expect(committed.error?.code).toBe("MUTATION_COMMIT_FINALIZATION_FAILED");
		expect(committed.error?.message).toContain("committed and verified");
		expect((await store.getRecord("ISSUE", "i1", scope))?.data.status).toBe("DONE");
		expect((await proposals.get(operationId))?.status).toBe("APPROVED");
		expect(audit.events.some((event) => event.eventType === "COMMITTED")).toBe(true);
		expect(audit.events.some((event) => event.eventType === "FAILED")).toBe(false);
		expect(trace.events.some((event) => event.stage === "commit_finalization_failed")).toBe(true);

		const replay = await runtime.execute(
			invocation("commit_mutation", { operationId, approvalToken: approval.approvalToken }),
		);
		expect(replay.error?.code).toBe("MUTATION_APPROVAL_REPLAYED");
		expect((await proposals.get(operationId))?.status).toBe("APPROVED");
		expect(audit.events.some((event) => event.eventType === "FAILED")).toBe(false);
	});
});
