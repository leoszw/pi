-- Phase 8 RAG ingestion metadata schema.
-- GENERATED FOR STATIC REVIEW ONLY. NOT EXECUTED.
-- Application startup must never execute this file automatically.

CREATE TABLE IF NOT EXISTS rag_document (
    document_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    trace_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    tenant_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    industry_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    project_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    department_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    owner_user_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    visibility ENUM('PRIVATE','PROJECT','COMPANY','INDUSTRY','TENANT') NOT NULL,
    scope_fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    file_name VARCHAR(512) NOT NULL,
    mime_type VARCHAR(191) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
    size_bytes BIGINT UNSIGNED NOT NULL,
    checksum_sha256 CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    storage_key VARCHAR(1024) NULL,
    status ENUM('RECEIVED','VALIDATING','STORED','PARSING','EXTRACTING','CHUNKING','ENRICHING','EMBEDDING','INDEXING','QUALITY_VALIDATING','READY','DEDUPLICATED','FAILED') NOT NULL,
    duplicate_of_document_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    parser_version VARCHAR(128) NULL,
    vision_version VARCHAR(128) NULL,
    chunker_version VARCHAR(128) NULL,
    embedding_version VARCHAR(128) NULL,
    lexical_index_version VARCHAR(128) NULL,
    vector_index_version VARCHAR(128) NULL,
    chunk_count INT UNSIGNED NOT NULL DEFAULT 0,
    metadata_json JSON NOT NULL,
    failure_stage VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    failure_code VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
    failure_message TEXT NULL,
    failure_retriable TINYINT(1) NULL,
    ready_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (document_id),
    KEY idx_rag_document_scope_status (tenant_id, company_id, project_id, status, updated_at),
    KEY idx_rag_document_checksum_scope (tenant_id, checksum_sha256, scope_fingerprint, status),
    KEY idx_rag_document_owner (tenant_id, owner_user_id, created_at),
    KEY idx_rag_document_trace (trace_id),
    CONSTRAINT fk_rag_document_duplicate FOREIGN KEY (duplicate_of_document_id) REFERENCES rag_document(document_id),
    CONSTRAINT chk_rag_document_size CHECK (size_bytes > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS rag_document_acl (
    document_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    subject_type ENUM('USER','ROLE','SECURITY_TAG') NOT NULL,
    subject_value VARCHAR(191) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (document_id, subject_type, subject_value),
    KEY idx_rag_document_acl_lookup (subject_type, subject_value, document_id),
    CONSTRAINT fk_rag_document_acl_document FOREIGN KEY (document_id) REFERENCES rag_document(document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS rag_chunk (
    chunk_id VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    document_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    parent_chunk_id VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NULL,
    source_block_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    ordinal_no INT UNSIGNED NOT NULL,
    chunk_type ENUM('TITLE','HEADING','CLAUSE','PARAGRAPH','TABLE','LIST','IMAGE','CAPTION','WINDOW') NOT NULL,
    content_text LONGTEXT NOT NULL,
    content_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    section_path_json JSON NOT NULL,
    page_start INT UNSIGNED NOT NULL,
    page_end INT UNSIGNED NOT NULL,
    tenant_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    industry_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    project_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    department_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    owner_user_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    visibility ENUM('PRIVATE','PROJECT','COMPANY','INDUSTRY','TENANT') NOT NULL,
    scope_fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    chunker_version VARCHAR(128) NOT NULL,
    embedding_version VARCHAR(128) NOT NULL,
    lexical_index_version VARCHAR(128) NOT NULL,
    vector_index_version VARCHAR(128) NOT NULL,
    metadata_json JSON NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (chunk_id),
    UNIQUE KEY uq_rag_chunk_ordinal (document_id, ordinal_no),
    KEY idx_rag_chunk_scope (tenant_id, company_id, project_id, visibility, document_id),
    KEY idx_rag_chunk_parent (parent_chunk_id),
    KEY idx_rag_chunk_page (document_id, page_start, page_end),
    CONSTRAINT fk_rag_chunk_document FOREIGN KEY (document_id) REFERENCES rag_document(document_id),
    CONSTRAINT fk_rag_chunk_parent FOREIGN KEY (parent_chunk_id) REFERENCES rag_chunk(chunk_id),
    CONSTRAINT chk_rag_chunk_pages CHECK (page_start >= 1 AND page_end >= page_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS rag_chunk_acl (
    chunk_id VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    subject_type ENUM('USER','ROLE','SECURITY_TAG') NOT NULL,
    subject_value VARCHAR(191) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (chunk_id, subject_type, subject_value),
    KEY idx_rag_chunk_acl_lookup (subject_type, subject_value, chunk_id),
    CONSTRAINT fk_rag_chunk_acl_chunk FOREIGN KEY (chunk_id) REFERENCES rag_chunk(chunk_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS rag_chunk_entity (
    chunk_id VARCHAR(160) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    entity_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (chunk_id, entity_id),
    KEY idx_rag_chunk_entity_lookup (entity_id, chunk_id),
    CONSTRAINT fk_rag_chunk_entity_chunk FOREIGN KEY (chunk_id) REFERENCES rag_chunk(chunk_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS rag_ingestion_event (
    event_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    document_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    trace_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    stage VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    event_status ENUM('START','OK','ERROR') NOT NULL,
    error_code VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
    details_json JSON NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (event_id),
    KEY idx_rag_ingestion_document (document_id, created_at),
    KEY idx_rag_ingestion_trace (trace_id, created_at),
    CONSTRAINT fk_rag_ingestion_document FOREIGN KEY (document_id) REFERENCES rag_document(document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
