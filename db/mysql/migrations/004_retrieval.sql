-- PI Industry Agent - Phase 3
-- Retrieval index version registry and ETL checkpoint schema for MySQL 8.x.
-- REVIEW STATUS: GENERATED FOR STATIC REVIEW ONLY. NOT EXECUTED.
-- Dense vectors are intentionally not stored in MySQL. OpenSearch owns vector fields.

CREATE TABLE retrieval_index_version (
	index_version_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	tenant_id VARCHAR(128) COLLATE utf8mb4_0900_bin NOT NULL,
	entity_type VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	index_name VARCHAR(191) COLLATE utf8mb4_0900_bin NOT NULL,
	index_version VARCHAR(191) COLLATE utf8mb4_0900_bin NOT NULL,
	source_schema_version VARCHAR(191) COLLATE utf8mb4_0900_bin NOT NULL,
	embedding_model VARCHAR(191) COLLATE utf8mb4_0900_bin NULL,
	embedding_dimension INT UNSIGNED NULL,
	mapping_hash VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
	status VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'BUILDING',
	metadata_json JSON NULL,
	created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	activated_at DATETIME(3) NULL,
	retired_at DATETIME(3) NULL,
	PRIMARY KEY (index_version_id),
	UNIQUE KEY uk_retrieval_index_version (tenant_id, entity_type, index_name, index_version),
	KEY idx_retrieval_index_status (tenant_id, entity_type, status, activated_at),
	CONSTRAINT chk_retrieval_index_status
		CHECK (status IN ('BUILDING', 'ACTIVE', 'RETIRED', 'FAILED')),
	CONSTRAINT chk_retrieval_embedding_dimension
		CHECK (embedding_dimension IS NULL OR embedding_dimension > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE retrieval_sync_checkpoint (
	checkpoint_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	tenant_id VARCHAR(128) COLLATE utf8mb4_0900_bin NOT NULL,
	company_id VARCHAR(128) COLLATE utf8mb4_0900_bin NULL,
	project_id VARCHAR(128) COLLATE utf8mb4_0900_bin NULL,
	entity_type VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	source_name VARCHAR(191) COLLATE utf8mb4_0900_bin NOT NULL,
	index_version_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	cursor_updated_at DATETIME(3) NULL,
	cursor_record_id VARCHAR(128) COLLATE utf8mb4_0900_bin NULL,
	status VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'IDLE',
	last_success_at DATETIME(3) NULL,
	last_error_at DATETIME(3) NULL,
	metadata_json JSON NULL,
	created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	PRIMARY KEY (checkpoint_id),
	KEY idx_retrieval_checkpoint_scope (tenant_id, company_id, project_id, entity_type, source_name),
	KEY idx_retrieval_checkpoint_cursor (source_name, cursor_updated_at, cursor_record_id),
	CONSTRAINT fk_retrieval_checkpoint_index_version
		FOREIGN KEY (index_version_id) REFERENCES retrieval_index_version (index_version_id)
		ON UPDATE RESTRICT ON DELETE RESTRICT,
	CONSTRAINT chk_retrieval_checkpoint_status
		CHECK (status IN ('IDLE', 'RUNNING', 'FAILED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
