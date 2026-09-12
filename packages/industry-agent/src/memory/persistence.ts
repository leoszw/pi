import type { JsonObject } from "../contracts/index.ts";
import type { WorkingMemorySnapshotRecord, WorkingMemoryState } from "./types.ts";

export function toWorkingMemorySnapshotRecord(state: WorkingMemoryState): WorkingMemorySnapshotRecord {
	const content: JsonObject = {
		revision: state.revision,
		resolvedEntities: state.resolvedEntities ?? null,
		lastResultSet: state.lastResultSet ?? null,
		activeFilters: state.activeFilters ?? null,
		activeProject: state.activeProject ?? null,
		selectedRows: state.selectedRows ?? null,
		recentToolResults: state.recentToolResults,
		createdAt: state.createdAt,
		updatedAt: state.updatedAt,
	};
	return {
		memoryType: "WORKING_MEMORY_V1",
		conversationId: state.scope.conversationId,
		tenantId: state.scope.tenantId,
		userId: state.scope.userId,
		companyId: state.scope.companyId,
		projectId: state.activeProject?.value ?? state.lastResultSet?.projectId ?? state.selectedRows?.projectId ?? state.resolvedEntities?.projectId ?? null,
		status: "ACTIVE",
		content,
		sourceTraceId: state.lastUpdatedTraceId,
		validUntil: state.expiresAt,
	};
}
