-- PI Industry Agent - Phase 3
-- Canonical entity, alias, ontology and embedding metadata schema for MySQL 8.x.
-- REVIEW STATUS: GENERATED FOR STATIC REVIEW ONLY. NOT EXECUTED.

CREATE TABLE entity (
	entity_id VARCHAR(128) COLLATE utf8mb4_0900_bin NOT NULL,
	entity_type VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	canonical_name VARCHAR(1024) NOT NULL,
	entity_code VARCHAR(256) COLLATE utf8mb4_0900_bin NULL,
	parent_entity_id VARCHAR(128) COLLATE utf8mb4_0900_bin NULL,
	tenant_id VARCHAR(128) COLLATE utf8mb4_0900_bin NOT NULL,
	industry_id VARCHAR(128) COLLATE utf8mb4_0900_bin NULL,
	company_id VARCHAR(128) COLLATE utf8mb4_0900_bin NULL,
	project_id VARCHAR(128) COLLATE utf8mb4_0900_bin NULL,
	source_system VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	source_record_id VARCHAR(128) COLLATE utf8mb4_0900_bin NOT NULL,
	source_version VARCHAR(191) COLLATE utf8mb4_0900_bin NOT NULL,
	index_version VARCHAR(191) COLLATE utf8mb4_0900_bin NULL,
	status VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'ACTIVE',
	attributes_json JSON NULL,
	source_updated_at DATETIME(3) NULL,
	created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	PRIMARY KEY (entity_id),
	UNIQUE KEY uk_entity_source (tenant_id, source_system, entity_type, source_record_id),
	KEY idx_entity_scope_type (tenant_id, company_id, project_id, entity_type, status),
	KEY idx_entity_code_scope (tenant_id, project_id, entity_type, entity_code),
	KEY idx_entity_parent (parent_entity_id),
	KEY idx_entity_source_cursor (source_system, source_updated_at, source_record_id),
	CONSTRAINT fk_entity_parent
		FOREIGN KEY (parent_entity_id) REFERENCES entity (entity_id)
		ON UPDATE RESTRICT ON DELETE RESTRICT,
	CONSTRAINT chk_entity_status
		CHECK (status IN ('ACTIVE', 'DELETED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE entity_alias (
	alias_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	entity_id VARCHAR(128) COLLATE utf8mb4_0900_bin NOT NULL,
	alias_text VARCHAR(512) NOT NULL,
	normalized_alias VARCHAR(512) NOT NULL,
	alias_type VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	alias_source VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	confidence DECIMAL(5, 4) NOT NULL,
	created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	PRIMARY KEY (alias_id),
	UNIQUE KEY uk_entity_alias_identity (entity_id, alias_type, normalized_alias),
	KEY idx_entity_alias_normalized (normalized_alias(191)),
	CONSTRAINT fk_entity_alias_entity
		FOREIGN KEY (entity_id) REFERENCES entity (entity_id)
		ON UPDATE RESTRICT ON DELETE RESTRICT,
	CONSTRAINT chk_entity_alias_confidence
		CHECK (confidence >= 0 AND confidence <= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE ontology_item (
	ontology_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	tenant_id VARCHAR(128) COLLATE utf8mb4_0900_bin NOT NULL,
	industry_id VARCHAR(128) COLLATE utf8mb4_0900_bin NULL,
	ontology_type VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	item_code VARCHAR(191) COLLATE utf8mb4_0900_bin NOT NULL,
	item_name VARCHAR(512) NOT NULL,
	parent_ontology_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
	aliases_json JSON NULL,
	version VARCHAR(191) COLLATE utf8mb4_0900_bin NOT NULL,
	status VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'ACTIVE',
	metadata_json JSON NULL,
	created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	PRIMARY KEY (ontology_id),
	UNIQUE KEY uk_ontology_scope_code (tenant_id, ontology_type, item_code, version),
	KEY idx_ontology_parent (parent_ontology_id),
	KEY idx_ontology_scope_name (tenant_id, industry_id, ontology_type, item_name(191)),
	CONSTRAINT fk_ontology_parent
		FOREIGN KEY (parent_ontology_id) REFERENCES ontology_item (ontology_id)
		ON UPDATE RESTRICT ON DELETE RESTRICT,
	CONSTRAINT chk_ontology_status
		CHECK (status IN ('ACTIVE', 'INACTIVE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE entity_embedding_meta (
	meta_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	entity_id VARCHAR(128) COLLATE utf8mb4_0900_bin NOT NULL,
	embedding_profile VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	embedding_model VARCHAR(191) COLLATE utf8mb4_0900_bin NOT NULL,
	embedding_dimension INT UNSIGNED NOT NULL,
	index_name VARCHAR(191) COLLATE utf8mb4_0900_bin NOT NULL,
	index_version VARCHAR(191) COLLATE utf8mb4_0900_bin NOT NULL,
	document_id VARCHAR(191) COLLATE utf8mb4_0900_bin NOT NULL,
	input_hash VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	indexed_at DATETIME(3) NOT NULL,
	metadata_json JSON NULL,
	created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	PRIMARY KEY (meta_id),
	UNIQUE KEY uk_embedding_entity_profile_version (entity_id, embedding_profile, index_version),
	KEY idx_embedding_index_document (index_name, index_version, document_id),
	CONSTRAINT fk_embedding_meta_entity
		FOREIGN KEY (entity_id) REFERENCES entity (entity_id)
		ON UPDATE RESTRICT ON DELETE RESTRICT,
	CONSTRAINT chk_embedding_dimension
		CHECK (embedding_dimension > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
