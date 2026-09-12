import { describe, expect, it } from "vitest";
import type { JsonObject, RequestContext, ToolInvocation } from "../src/contracts/index.ts";
import { HmacApprovalTokenService } from "../src/mutation/approval-token.ts";
import {
	AllowAllMutationBusinessValidator, InMemoryMutationAuditSink, InMemoryMutationPermissionService, InMemoryMutationPolicyRegistry,
	InMemoryMutationProposalRepository, InMemoryMutationStore, InMemoryMutationTraceSink,
} from "../src/mutation/in-memory.ts";
import { MutationRuntime } from "../src/mutation/runtime.ts";
import type { MutationScope } from "../src/mutation/types.ts";

const scope: MutationScope = { userId:"u1",tenantId:"t1",companyId:"c1",projectId:"p1" };
const context: RequestContext = { traceId:"tr1",requestId:"r1",conversationId:"cv1",...scope,createdAt:"2026-09-12T00:00:00.000Z" };
const policy = { entityType:"ISSUE",createPermission:"issue.create",updatePermission:"issue.update",deletePermission:"issue.delete",allowedCreateFields:["name","status"],allowedUpdateFields:["name","status"],immutableFields:["id"],softDelete:true as const,maxBatchSize:10 };
function invocation(name:string,args:JsonObject,ctx=context): ToolInvocation { return { toolCallId:`tc-${name}`,toolName:name,toolVersion:"1.0.0",args,context:ctx }; }
function setup() {
	let id=0; const idFactory=()=>`id-${++id}`;
	const store=new InMemoryMutationStore([{ scope,record:{ entityType:"ISSUE",entityId:"i1",version:"1",data:{name:"Old",status:"OPEN"} } },{ scope,record:{ entityType:"ISSUE",entityId:"i2",version:"7",data:{name:"Two",status:"OPEN"} } }],()=>new Date("2026-09-12T00:00:00.000Z"));
	const permissions=new InMemoryMutationPermissionService(); for(const p of ["mutation.prepare","mutation.commit","issue.create","issue.update","issue.delete"]) permissions.grant(scope,p);
	const proposals=new InMemoryMutationProposalRepository(); const audit=new InMemoryMutationAuditSink(); const trace=new InMemoryMutationTraceSink();
	const runtime=new MutationRuntime({ policies:new InMemoryMutationPolicyRegistry([policy]),permissions,validator:new AllowAllMutationBusinessValidator(),readRepository:store,writeGateway:store,proposals,approvals:store,approvalTokens:new HmacApprovalTokenService("0123456789abcdef0123456789abcdef"),audit,trace,idFactory,now:()=>new Date("2026-09-12T00:00:00.000Z") });
	return {store,permissions,proposals,audit,trace,runtime};
}

describe("MutationRuntime",()=>{
	it("prepare does not mutate and commit requires trusted UI approval",async()=>{
		const x=setup(); const prepared=await x.runtime.execute(invocation("prepare_update",{entityType:"ISSUE",entityIds:["i1"],patch:{status:"DONE"}}));
		expect(prepared.ok).toBe(true); expect((await x.store.getRecord("ISSUE","i1",scope))?.version).toBe("1");
		const operationId=(prepared.data as {proposal:{operationId:string}}).proposal.operationId;
		const denied=await x.runtime.execute(invocation("commit_mutation",{operationId,approvalToken:"not-approved"}));
		expect(denied.ok).toBe(false); expect(denied.error?.code).toBe("MUTATION_APPROVAL_REQUIRED");
	});
	it("commits only the exact approved digest and rejects replay",async()=>{
		const x=setup(); const prepared=await x.runtime.execute(invocation("prepare_update",{entityType:"ISSUE",entityIds:["i1"],patch:{status:"DONE"}}));
		const operationId=(prepared.data as {proposal:{operationId:string}}).proposal.operationId; const approval=await x.runtime.approve(operationId,context,true);
		const committed=await x.runtime.execute(invocation("commit_mutation",{operationId,approvalToken:approval.approvalToken}));
		expect(committed.ok).toBe(true); expect((await x.store.getRecord("ISSUE","i1",scope))?.data.status).toBe("DONE");
		const replay=await x.runtime.execute(invocation("commit_mutation",{operationId,approvalToken:approval.approvalToken}));
		expect(replay.error?.code).toBe("MUTATION_APPROVAL_REPLAYED");
	});
	it("rejects optimistic lock changes after approval",async()=>{
		const x=setup(); const prepared=await x.runtime.execute(invocation("prepare_update",{entityType:"ISSUE",entityIds:["i1"],patch:{status:"DONE"}}));
		const operationId=(prepared.data as {proposal:{operationId:string}}).proposal.operationId; const approval=await x.runtime.approve(operationId,context,true);
		await x.store.transaction(async(session)=>{ await session.update("ISSUE","i1",{name:"Concurrent"},"1",scope); return undefined; });
		const result=await x.runtime.execute(invocation("commit_mutation",{operationId,approvalToken:approval.approvalToken}));
		expect(result.error?.code).toBe("MUTATION_VERSION_CONFLICT"); expect((await x.store.getRecord("ISSUE","i1",scope))?.data.status).toBe("OPEN");
	});
	it("uses soft delete by default and verifies reread",async()=>{
		const x=setup(); const prepared=await x.runtime.execute(invocation("prepare_delete",{entityType:"ISSUE",entityIds:["i1"],reason:"duplicate"}));
		const operationId=(prepared.data as {proposal:{operationId:string}}).proposal.operationId; const approval=await x.runtime.approve(operationId,context,true);
		const result=await x.runtime.execute(invocation("commit_mutation",{operationId,approvalToken:approval.approvalToken}));
		expect(result.ok).toBe(true); expect(await x.store.getRecord("ISSUE","i1",scope)).toBe(undefined);
		expect((await x.store.getRecord("ISSUE","i1",scope,{includeDeleted:true}))?.deletedAt).toBeTruthy();
	});
});
