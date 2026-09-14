import type { RequestContext } from "../../contracts/index.ts";
import { IndustryAgentError } from "../../errors/industry-agent-error.ts";
import type { RagKnowledgeScope } from "./types.ts";

function normalizeList(values: readonly string[]): readonly string[] {
	return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}

export function normalizeRagScope(scope: RagKnowledgeScope): RagKnowledgeScope {
	return {
		tenantId: scope.tenantId.trim(),
		industryId: scope.industryId?.trim() || null,
		companyId: scope.companyId?.trim() || null,
		projectId: scope.projectId?.trim() || null,
		departmentId: scope.departmentId?.trim() || null,
		ownerUserId: scope.ownerUserId.trim(),
		visibility: scope.visibility,
		aclUsers: normalizeList(scope.aclUsers),
		aclRoles: normalizeList(scope.aclRoles),
		securityTags: normalizeList(scope.securityTags),
	};
}

export function validateRagScope(context: RequestContext, input: RagKnowledgeScope): RagKnowledgeScope {
	const scope = normalizeRagScope(input);
	if (!scope.tenantId || !scope.ownerUserId)
		throw new IndustryAgentError("RAG_SCOPE_INVALID", "RAG scope requires tenantId and ownerUserId");
	if (scope.tenantId !== context.tenantId)
		throw new IndustryAgentError("RAG_SCOPE_INVALID", "RAG tenant scope must match server RequestContext");
	if (scope.ownerUserId !== context.userId)
		throw new IndustryAgentError("RAG_SCOPE_INVALID", "RAG ownerUserId must match authenticated user");
	if (scope.companyId && context.companyId && scope.companyId !== context.companyId)
		throw new IndustryAgentError("RAG_SCOPE_INVALID", "RAG company scope conflicts with RequestContext");
	if (scope.projectId && context.projectId && scope.projectId !== context.projectId)
		throw new IndustryAgentError("RAG_SCOPE_INVALID", "RAG project scope conflicts with RequestContext");
	if (scope.visibility === "PROJECT" && !scope.projectId)
		throw new IndustryAgentError("RAG_SCOPE_INVALID", "PROJECT visibility requires projectId");
	if (scope.visibility === "COMPANY" && !scope.companyId)
		throw new IndustryAgentError("RAG_SCOPE_INVALID", "COMPANY visibility requires companyId");
	if (scope.visibility === "INDUSTRY" && !scope.industryId)
		throw new IndustryAgentError("RAG_SCOPE_INVALID", "INDUSTRY visibility requires industryId");
	return scope;
}

export function ragScopeFingerprint(scope: RagKnowledgeScope): string {
	return JSON.stringify({
		tenantId: scope.tenantId,
		industryId: scope.industryId,
		companyId: scope.companyId,
		projectId: scope.projectId,
		departmentId: scope.departmentId,
		ownerUserId: scope.ownerUserId,
		visibility: scope.visibility,
		aclUsers: [...scope.aclUsers],
		aclRoles: [...scope.aclRoles],
		securityTags: [...scope.securityTags],
	});
}
