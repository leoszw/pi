import type { JsonObject } from "../contracts/index.ts";

export type CanonicalEntityType = "ENGINEERING_POSITION" | "BOQ_ITEM" | (string & {});
export type EntityStatus = "ACTIVE" | "DELETED";

export interface EntityScope {
	tenantId: string;
	industryId?: string;
	companyId?: string;
	projectId?: string;
}

export interface CanonicalEntity {
	entityId: string;
	entityType: CanonicalEntityType;
	canonicalName: string;
	entityCode?: string;
	parentEntityId?: string;
	scope: EntityScope;
	sourceSystem: string;
	sourceRecordId: string;
	sourceVersion: string;
	indexVersion?: string;
	status: EntityStatus;
	attributes: JsonObject;
	sourceUpdatedAt?: string;
	createdAt: string;
	updatedAt: string;
}

export type EntityAliasType = "CANONICAL" | "BUSINESS" | "ABBREVIATION" | "LEGACY" | "SYNONYM";
export type EntityAliasSource = "SOURCE" | "ONTOLOGY" | "USER_CONFIRMED" | "RULE";

export interface EntityAlias {
	aliasId: string;
	entityId: string;
	alias: string;
	normalizedAlias: string;
	aliasType: EntityAliasType;
	source: EntityAliasSource;
	confidence: number;
	createdAt: string;
}

export interface EntityEmbeddingMeta {
	metaId: string;
	entityId: string;
	embeddingProfile: string;
	embeddingModel: string;
	embeddingDimension: number;
	indexName: string;
	indexVersion: string;
	documentId: string;
	inputHash: string;
	indexedAt: string;
	metadata: JsonObject;
}

export interface OntologyItem {
	ontologyId: string;
	ontologyType: string;
	code: string;
	name: string;
	parentOntologyId?: string;
	scope: Pick<EntityScope, "tenantId" | "industryId">;
	aliases: readonly string[];
	version: string;
	status: "ACTIVE" | "INACTIVE";
	metadata: JsonObject;
}

export interface EntityScopeQuery {
	tenantId: string;
	industryId?: string;
	companyId?: string;
	projectId?: string;
}

export interface EntityListQuery extends EntityScopeQuery {
	entityType?: CanonicalEntityType;
	status?: EntityStatus;
}

export interface EntityHierarchyPath {
	entityIds: readonly string[];
	names: readonly string[];
	depth: number;
	incomplete: boolean;
	missingParentEntityId?: string;
}

export interface EntitySourceVersions {
	sourceSystem: string;
	sourceVersion: string;
	indexVersion?: string;
	now?: () => Date;
}
