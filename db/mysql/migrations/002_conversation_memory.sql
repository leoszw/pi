-- PI Industry Agent - Phase 0
-- Conversation and memory foundation for MySQL 8.x.
-- REVIEW STATUS: GENERATED FOR STATIC REVIEW ONLY. NOT EXECUTED.

CREATE TABLE conversation (
	conversation_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	tenant_id VARCHAR(128) COLLATE utf8mb4_0900_bin NOT NULL,
	user_id VARCHAR(128) COLLATE utf8mb4_0900_bin NOT NULL,
	company_id VARCHAR(128) COLLATE utf8mb4_0900_bin NULL,
	project_id VARCHAR(128) COLLATE utf8mb4_0900_bin NULL,
	title VARCHAR(512) NULL,
	status VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'ACTIVE',
	metadata_json JSON NULL,
	last_trace_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
	last_message_at DATETIME(3) NULL,
	created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	PRIMARY KEY (conversation_id),
	KEY idx_conversation_scope_updated (tenant_id, company_id, project_id, updated_at),
	KEY idx_conversation_user_updated (tenant_id, user_id, updated_at),
	KEY idx_conversation_last_trace (last_trace_id),
	CONSTRAINT fk_conversation_last_trace
		FOREIGN KEY (last_trace_id) REFERENCES agent_trace (trace_id)
		ON UPDATE RESTRICT ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE memory_item (
	memory_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	conversation_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
	tenant_id VARCHAR(128) COLLATE utf8mb4_0900_bin NOT NULL,
	user_id VARCHAR(128) COLLATE utf8mb4_0900_bin NOT NULL,
	company_id VARCHAR(128) COLLATE utf8mb4_0900_bin NULL,
	project_id VARCHAR(128) COLLATE utf8mb4_0900_bin NULL,
	memory_type VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	status VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'ACTIVE',
	summary TEXT NULL,
	content_json JSON NOT NULL,
	confidence DECIMAL(5, 4) NULL,
	source_trace_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
	valid_from DATETIME(3) NULL,
	valid_until DATETIME(3) NULL,
	created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	PRIMARY KEY (memory_id),
	KEY idx_memory_item_conversation_updated (conversation_id, updated_at),
	KEY idx_memory_item_scope_type (tenant_id, company_id, project_id, memory_type, status),
	KEY idx_memory_item_user_type (tenant_id, user_id, memory_type, status),
	KEY idx_memory_item_source_trace (source_trace_id),
	CONSTRAINT fk_memory_item_conversation
		FOREIGN KEY (conversation_id) REFERENCES conversation (conversation_id)
		ON UPDATE RESTRICT ON DELETE RESTRICT,
	CONSTRAINT fk_memory_item_source_trace
		FOREIGN KEY (source_trace_id) REFERENCES agent_trace (trace_id)
		ON UPDATE RESTRICT ON DELETE SET NULL,
	CONSTRAINT chk_memory_item_confidence
		CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE memory_link (
	link_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	from_memory_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	to_memory_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	relation_type VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	metadata_json JSON NULL,
	created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	PRIMARY KEY (link_id),
	UNIQUE KEY uk_memory_link_relation (from_memory_id, to_memory_id, relation_type),
	KEY idx_memory_link_to (to_memory_id),
	CONSTRAINT fk_memory_link_from
		FOREIGN KEY (from_memory_id) REFERENCES memory_item (memory_id)
		ON UPDATE RESTRICT ON DELETE RESTRICT,
	CONSTRAINT fk_memory_link_to
		FOREIGN KEY (to_memory_id) REFERENCES memory_item (memory_id)
		ON UPDATE RESTRICT ON DELETE RESTRICT,
	CONSTRAINT chk_memory_link_not_self
		CHECK (from_memory_id <> to_memory_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
