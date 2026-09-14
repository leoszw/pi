import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import { normalizeEntityAlias } from "./normalization.ts";
import type { EntityRepository } from "./repository.ts";
import type {
	CanonicalEntity,
	EntityAlias,
	EntityEmbeddingMeta,
	EntityListQuery,
	EntityScopeQuery,
	OntologyItem,
} from "./types.ts";

function matchesScope(entity: CanonicalEntity, scope: EntityScopeQuery): boolean {
	return (
		entity.scope.tenantId === scope.tenantId &&
		(scope.industryId === undefined || entity.scope.industryId === scope.industryId) &&
		(scope.companyId === undefined || entity.scope.companyId === scope.companyId) &&
		(scope.projectId === undefined || entity.scope.projectId === scope.projectId)
	);
}

function embeddingKey(entityId: string, embeddingProfile: string, indexVersion: string): string {
	return `${entityId}\u0000${embeddingProfile}\u0000${indexVersion}`;
}

export class InMemoryEntityRepository implements EntityRepository {
	private readonly entities = new Map<string, CanonicalEntity>();
	private readonly aliases = new Map<string, EntityAlias>();
	private readonly embeddingMeta = new Map<string, EntityEmbeddingMeta>();
	private readonly ontology = new Map<string, OntologyItem>();

	async getEntityById(entityId: string, scope: EntityScopeQuery): Promise<CanonicalEntity | undefined> {
		const entity = this.entities.get(entityId);
		return entity && matchesScope(entity, scope) ? structuredClone(entity) : undefined;
	}

	async listEntities(query: EntityListQuery): Promise<readonly CanonicalEntity[]> {
		return Array.from(this.entities.values())
			.filter((entity) => matchesScope(entity, query))
			.filter((entity) => query.entityType === undefined || entity.entityType === query.entityType)
			.filter((entity) => query.status === undefined || entity.status === query.status)
			.sort((left, right) => left.entityId.localeCompare(right.entityId))
			.map((entity) => structuredClone(entity));
	}

	async upsertEntity(entity: CanonicalEntity): Promise<void> {
		if (entity.entityId.trim().length === 0 || entity.scope.tenantId.trim().length === 0) {
			throw new IndustryAgentError("REPOSITORY_ERROR", "entityId and tenantId must not be empty");
		}
		this.entities.set(entity.entityId, structuredClone(entity));
	}

	async listAliases(entityId: string, scope: EntityScopeQuery): Promise<readonly EntityAlias[]> {
		if (!(await this.getEntityById(entityId, scope))) return [];
		return Array.from(this.aliases.values())
			.filter((alias) => alias.entityId === entityId)
			.sort((left, right) => left.normalizedAlias.localeCompare(right.normalizedAlias))
			.map((alias) => structuredClone(alias));
	}

	async findByAlias(alias: string, query: EntityListQuery): Promise<readonly CanonicalEntity[]> {
		const normalized = normalizeEntityAlias(alias);
		const entityIds = new Set(
			Array.from(this.aliases.values())
				.filter((candidate) => candidate.normalizedAlias === normalized)
				.map((candidate) => candidate.entityId),
		);
		return (await this.listEntities(query)).filter((entity) => entityIds.has(entity.entityId));
	}

	async upsertAlias(alias: EntityAlias): Promise<void> {
		const entity = this.entities.get(alias.entityId);
		if (!entity) throw new IndustryAgentError("REPOSITORY_ERROR", `entity not found for alias: ${alias.entityId}`);
		if (alias.confidence < 0 || alias.confidence > 1) {
			throw new IndustryAgentError("REPOSITORY_ERROR", "alias confidence must be between 0 and 1");
		}
		const normalizedAlias = normalizeEntityAlias(alias.alias);
		this.aliases.set(alias.aliasId, structuredClone({ ...alias, normalizedAlias }));
	}

	async getEmbeddingMeta(
		entityId: string,
		embeddingProfile: string,
		indexVersion: string,
	): Promise<EntityEmbeddingMeta | undefined> {
		const value = this.embeddingMeta.get(embeddingKey(entityId, embeddingProfile, indexVersion));
		return value ? structuredClone(value) : undefined;
	}

	async upsertEmbeddingMeta(meta: EntityEmbeddingMeta): Promise<void> {
		if (!this.entities.has(meta.entityId)) {
			throw new IndustryAgentError("REPOSITORY_ERROR", `entity not found for embedding metadata: ${meta.entityId}`);
		}
		if (!Number.isInteger(meta.embeddingDimension) || meta.embeddingDimension <= 0) {
			throw new IndustryAgentError("REPOSITORY_ERROR", "embeddingDimension must be a positive integer");
		}
		this.embeddingMeta.set(
			embeddingKey(meta.entityId, meta.embeddingProfile, meta.indexVersion),
			structuredClone(meta),
		);
	}

	async listOntologyItems(tenantId: string, ontologyType?: string): Promise<readonly OntologyItem[]> {
		return Array.from(this.ontology.values())
			.filter((item) => item.scope.tenantId === tenantId)
			.filter((item) => ontologyType === undefined || item.ontologyType === ontologyType)
			.sort((left, right) => left.code.localeCompare(right.code))
			.map((item) => structuredClone(item));
	}

	async upsertOntologyItem(item: OntologyItem): Promise<void> {
		this.ontology.set(item.ontologyId, structuredClone(item));
	}
}
