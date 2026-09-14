import type {
	CanonicalEntity,
	EntityAlias,
	EntityEmbeddingMeta,
	EntityListQuery,
	EntityScopeQuery,
	OntologyItem,
} from "./types.ts";

export interface EntityRepository {
	getEntityById(entityId: string, scope: EntityScopeQuery): Promise<CanonicalEntity | undefined>;
	listEntities(query: EntityListQuery): Promise<readonly CanonicalEntity[]>;
	upsertEntity(entity: CanonicalEntity): Promise<void>;
	listAliases(entityId: string, scope: EntityScopeQuery): Promise<readonly EntityAlias[]>;
	findByAlias(alias: string, query: EntityListQuery): Promise<readonly CanonicalEntity[]>;
	upsertAlias(alias: EntityAlias): Promise<void>;
	getEmbeddingMeta(
		entityId: string,
		embeddingProfile: string,
		indexVersion: string,
	): Promise<EntityEmbeddingMeta | undefined>;
	upsertEmbeddingMeta(meta: EntityEmbeddingMeta): Promise<void>;
	listOntologyItems(tenantId: string, ontologyType?: string): Promise<readonly OntologyItem[]>;
	upsertOntologyItem(item: OntologyItem): Promise<void>;
}
