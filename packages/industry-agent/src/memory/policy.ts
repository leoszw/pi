import type { RequestContext } from "../contracts/index.ts";
import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import type { WorkingMemoryCaptureSource, WorkingMemoryPersistableSource, WorkingMemoryScope } from "./types.ts";

export function workingMemoryScope(context: RequestContext): WorkingMemoryScope {
	return {
		conversationId: context.conversationId,
		tenantId: context.tenantId,
		userId: context.userId,
		companyId: context.companyId ?? null,
	};
}

export function assertPersistableSource(source: WorkingMemoryCaptureSource): WorkingMemoryPersistableSource {
	if (source === "LLM_INFERENCE") {
		throw new IndustryAgentError("MEMORY_SOURCE_NOT_PERSISTABLE", "Unconfirmed LLM inference cannot be persisted as working memory");
	}
	return source;
}

export function assertSameWorkingMemoryScope(expected: WorkingMemoryScope, actual: WorkingMemoryScope): void {
	if (
		expected.conversationId !== actual.conversationId ||
		expected.tenantId !== actual.tenantId ||
		expected.userId !== actual.userId ||
		expected.companyId !== actual.companyId
	) {
		throw new IndustryAgentError("MEMORY_SCOPE_MISMATCH", "Working memory scope does not match the authenticated conversation scope");
	}
}

export function captureProjectId(context: RequestContext, activeProjectId: string | null): string | null {
	return context.projectId ?? activeProjectId;
}
