import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import type { EntityRepository } from "./repository.ts";
import type { EntityHierarchyPath, EntityScopeQuery } from "./types.ts";

export async function buildEntityHierarchyPath(
	entityId: string,
	repository: EntityRepository,
	scope: EntityScopeQuery,
	maxDepth = 16,
): Promise<EntityHierarchyPath> {
	if (!Number.isInteger(maxDepth) || maxDepth <= 0) {
		throw new IndustryAgentError("REPOSITORY_ERROR", "maxDepth must be a positive integer");
	}

	const ids: string[] = [];
	const names: string[] = [];
	const seen = new Set<string>();
	let currentId: string | undefined = entityId;
	let missingParentEntityId: string | undefined;

	while (currentId !== undefined) {
		if (seen.has(currentId)) {
			throw new IndustryAgentError("REPOSITORY_ERROR", `entity hierarchy cycle detected: ${currentId}`);
		}
		if (ids.length >= maxDepth) {
			throw new IndustryAgentError("REPOSITORY_ERROR", `entity hierarchy exceeds max depth: ${maxDepth}`);
		}
		seen.add(currentId);
		const entity = await repository.getEntityById(currentId, scope);
		if (!entity) {
			if (ids.length === 0) throw new IndustryAgentError("REPOSITORY_ERROR", `entity not found: ${entityId}`);
			missingParentEntityId = currentId;
			break;
		}
		ids.push(entity.entityId);
		names.push(entity.canonicalName);
		currentId = entity.parentEntityId;
	}

	ids.reverse();
	names.reverse();
	return {
		entityIds: ids,
		names,
		depth: Math.max(0, ids.length - 1),
		incomplete: missingParentEntityId !== undefined,
		missingParentEntityId,
	};
}
