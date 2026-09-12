import { IndustryAgentError } from "../../errors/industry-agent-error.ts";
import type { RagChunkRecord, RagDocumentRecord, RagKnowledgeScope } from "../ingestion/types.ts";
import type { RagQaAccessContext, RagQaAccessFilter, RagQaMetadataFilter } from "./types.ts";

function normalize(values: readonly string[] | undefined): readonly string[] | undefined {
	if (!values) return undefined;
	return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort();
}

export function validateMetadataFilter(input: RagQaMetadataFilter | undefined): RagQaMetadataFilter {
	if (!input) return {};
	const raw = input as Readonly<Record<string, unknown>>;
	const allowed = new Set(["documentIds", "mimeTypes", "entityIds", "sectionPrefix"]);
	for (const key of Object.keys(raw)) if (!allowed.has(key)) throw new IndustryAgentError("RAG_QA_INVALID_REQUEST", `Unsupported metadata filter: ${key}`);
	const documentIds = normalize(input.documentIds);
	const mimeTypes = normalize(input.mimeTypes);
	const entityIds = normalize(input.entityIds);
	const sectionPrefix = normalize(input.sectionPrefix);
	return {
		...(documentIds ? { documentIds } : {}),
		...(mimeTypes ? { mimeTypes } : {}),
		...(entityIds ? { entityIds } : {}),
		...(sectionPrefix ? { sectionPrefix } : {}),
	};
}

export function buildAccessFilter(access: RagQaAccessContext, metadataFilter: RagQaMetadataFilter, aclPolicyVersion: string): RagQaAccessFilter {
	if (!access.userId || !access.tenantId) throw new IndustryAgentError("RAG_QA_ACCESS_DENIED", "Authenticated RAG QA access context requires userId and tenantId");
	return {
		...access,
		roles: Array.from(new Set(access.roles)).sort(),
		securityTags: Array.from(new Set(access.securityTags)).sort(),
		aclPolicyVersion,
		metadataFilter,
		requireReady: true,
	};
}

function visibilityAllows(scope: RagKnowledgeScope, access: RagQaAccessContext): boolean {
	if (scope.tenantId !== access.tenantId) return false;
	switch (scope.visibility) {
		case "PRIVATE": return scope.ownerUserId === access.userId;
		case "PROJECT": return scope.projectId !== null && scope.projectId === access.projectId;
		case "COMPANY": return scope.companyId !== null && scope.companyId === access.companyId;
		case "INDUSTRY": return scope.industryId !== null && scope.industryId === access.industryId;
		case "TENANT": return true;
	}
}

function departmentAllows(scope: RagKnowledgeScope, access: RagQaAccessContext): boolean {
	if (scope.ownerUserId === access.userId || scope.departmentId === null) return true;
	return scope.departmentId === access.departmentId;
}

function explicitAclAllows(scope: RagKnowledgeScope, access: RagQaAccessContext): boolean {
	if (scope.ownerUserId === access.userId) return true;
	const hasIdentityAcl = scope.aclUsers.length > 0 || scope.aclRoles.length > 0;
	if (!hasIdentityAcl) return true;
	if (scope.aclUsers.includes(access.userId)) return true;
	return access.roles.some((role) => scope.aclRoles.includes(role));
}

function securityTagsAllow(scope: RagKnowledgeScope, access: RagQaAccessContext): boolean {
	return scope.securityTags.every((tag) => access.securityTags.includes(tag));
}

function metadataAllows(document: RagDocumentRecord, chunk: RagChunkRecord, filter: RagQaMetadataFilter): boolean {
	if (filter.documentIds?.length && !filter.documentIds.includes(document.documentId)) return false;
	if (filter.mimeTypes?.length && !filter.mimeTypes.includes(document.mimeType)) return false;
	if (filter.entityIds?.length && !filter.entityIds.some((id) => chunk.entityIds.includes(id))) return false;
	if (filter.sectionPrefix?.length) {
		if (chunk.sectionPath.length < filter.sectionPrefix.length) return false;
		for (let index = 0; index < filter.sectionPrefix.length; index += 1) if (chunk.sectionPath[index] !== filter.sectionPrefix[index]) return false;
	}
	return true;
}

export function isAccessible(document: RagDocumentRecord, chunk: RagChunkRecord, filter: RagQaAccessFilter): boolean {
	if (filter.requireReady && document.status !== "READY") return false;
	if (!visibilityAllows(document.scope, filter)) return false;
	if (!departmentAllows(document.scope, filter)) return false;
	if (!explicitAclAllows(document.scope, filter)) return false;
	if (!securityTagsAllow(document.scope, filter)) return false;
	if (!visibilityAllows(chunk.scope, filter)) return false;
	if (!departmentAllows(chunk.scope, filter)) return false;
	if (!explicitAclAllows(chunk.scope, filter)) return false;
	if (!securityTagsAllow(chunk.scope, filter)) return false;
	return metadataAllows(document, chunk, filter.metadataFilter);
}
