import type { SemanticContext } from "../context/semantic-context.ts";
import type { WorkingMemoryContextView, WorkingMemoryResolution } from "./types.ts";

export function mergeWorkingMemorySemanticContext(
	base: SemanticContext | undefined,
	view: WorkingMemoryContextView,
	resolution: WorkingMemoryResolution,
): SemanticContext {
	const memoryEntityIds = resolution.entityIds.length ? resolution.entityIds : view.resolvedEntities.map((entity) => entity.entityId);
	const recentEntityIds = Array.from(new Set([...(base?.recentEntityIds ?? []), ...memoryEntityIds]));
	const project = base?.project ?? (view.effectiveProjectId ? { id: view.effectiveProjectId } : undefined);
	return {
		...(recentEntityIds.length ? { recentEntityIds } : {}),
		...(project ? { project } : {}),
		...(base?.segment ? { segment: base.segment } : {}),
	};
}
