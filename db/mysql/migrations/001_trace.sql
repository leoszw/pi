-- PI Industry Agent - Phase 0 / Phase 1
-- Trace and observability schema for MySQL 8.x.
-- REVIEW STATUS: GENERATED FOR STATIC REVIEW ONLY. NOT EXECUTED.

CREATE TABLE agent_trace (
	trace_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	conversation_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	user_id VARCHAR(128) COLLATE utf8mb4_0900_bin NOT NULL,
	tenant_id VARCHAR(128) COLLATE utf8mb4_0900_bin NOT NULL,
	company_id VARCHAR(128) COLLATE utf8mb4_0900_bin NULL,
	project_id VARCHAR(128) COLLATE utf8mb4_0900_bin NULL,
	status VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'RUNNING',
	original_query LONGTEXT NULL,
	semantic_frame_json JSON NULL,
	final_response LONGTEXT NULL,
	total_input_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
	total_output_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
	total_cache_read_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
	total_cache_write_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
	total_reasoning_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
	total_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
	total_cost_amount DECIMAL(20, 8) NOT NULL DEFAULT 0,
	llm_call_count INT UNSIGNED NOT NULL DEFAULT 0,
	tool_call_count INT UNSIGNED NOT NULL DEFAULT 0,
	retrieval_count INT UNSIGNED NOT NULL DEFAULT 0,
	error_count INT UNSIGNED NOT NULL DEFAULT 0,
	started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	ended_at DATETIME(3) NULL,
	created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
	PRIMARY KEY (trace_id),
	UNIQUE KEY uk_agent_trace_request_id (request_id),
	KEY idx_agent_trace_conversation_started (conversation_id, started_at),
	KEY idx_agent_trace_scope_started (tenant_id, company_id, project_id, started_at),
	KEY idx_agent_trace_user_started (tenant_id, user_id, started_at),
	KEY idx_agent_trace_status_started (status, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE agent_span (
	span_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	trace_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	sequence_no BIGINT UNSIGNED NOT NULL,
	parent_span_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
	span_type VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	name VARCHAR(191) NOT NULL,
	status VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'RUNNING',
	attributes_json JSON NULL,
	events_json JSON NULL,
	started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	ended_at DATETIME(3) NULL,
	created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	PRIMARY KEY (span_id),
	KEY idx_agent_span_trace_sequence (trace_id, sequence_no),
	KEY idx_agent_span_parent (parent_span_id),
	CONSTRAINT fk_agent_span_trace
		FOREIGN KEY (trace_id) REFERENCES agent_trace (trace_id)
		ON UPDATE RESTRICT ON DELETE RESTRICT,
	CONSTRAINT fk_agent_span_parent
		FOREIGN KEY (parent_span_id) REFERENCES agent_span (span_id)
		ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE llm_call (
	call_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	trace_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	sequence_no BIGINT UNSIGNED NOT NULL,
	span_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
	provider VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	model VARCHAR(191) NOT NULL,
	model_version VARCHAR(191) NULL,
	status VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	input_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
	output_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
	cache_read_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
	cache_write_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
	reasoning_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
	total_tokens BIGINT UNSIGNED NOT NULL DEFAULT 0,
	cost_amount DECIMAL(20, 8) NOT NULL DEFAULT 0,
	cost_currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NULL,
	latency_ms INT UNSIGNED NULL,
	request_metadata_json JSON NULL,
	response_metadata_json JSON NULL,
	started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	ended_at DATETIME(3) NULL,
	created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	PRIMARY KEY (call_id),
	KEY idx_llm_call_trace_sequence (trace_id, sequence_no),
	KEY idx_llm_call_span (span_id),
	KEY idx_llm_call_model_started (provider, model, started_at),
	CONSTRAINT fk_llm_call_trace
		FOREIGN KEY (trace_id) REFERENCES agent_trace (trace_id)
		ON UPDATE RESTRICT ON DELETE RESTRICT,
	CONSTRAINT fk_llm_call_span
		FOREIGN KEY (span_id) REFERENCES agent_span (span_id)
		ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE tool_call (
	call_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	trace_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	sequence_no BIGINT UNSIGNED NOT NULL,
	span_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
	tool_name VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	tool_version VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
	action VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NULL,
	status VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	input_json JSON NULL,
	output_json JSON NULL,
	latency_ms INT UNSIGNED NULL,
	started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	ended_at DATETIME(3) NULL,
	created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	PRIMARY KEY (call_id),
	KEY idx_tool_call_trace_sequence (trace_id, sequence_no),
	KEY idx_tool_call_span (span_id),
	KEY idx_tool_call_name_started (tool_name, started_at),
	CONSTRAINT fk_tool_call_trace
		FOREIGN KEY (trace_id) REFERENCES agent_trace (trace_id)
		ON UPDATE RESTRICT ON DELETE RESTRICT,
	CONSTRAINT fk_tool_call_span
		FOREIGN KEY (span_id) REFERENCES agent_span (span_id)
		ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE retrieval_event (
	event_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	trace_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	sequence_no BIGINT UNSIGNED NOT NULL,
	span_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
	retrieval_type VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	status VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	query_text TEXT NULL,
	filters_json JSON NULL,
	candidates_json JSON NULL,
	index_version VARCHAR(191) NULL,
	model_version VARCHAR(191) NULL,
	latency_ms INT UNSIGNED NULL,
	started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	ended_at DATETIME(3) NULL,
	created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	PRIMARY KEY (event_id),
	KEY idx_retrieval_event_trace_sequence (trace_id, sequence_no),
	KEY idx_retrieval_event_span (span_id),
	KEY idx_retrieval_event_type_started (retrieval_type, started_at),
	CONSTRAINT fk_retrieval_event_trace
		FOREIGN KEY (trace_id) REFERENCES agent_trace (trace_id)
		ON UPDATE RESTRICT ON DELETE RESTRICT,
	CONSTRAINT fk_retrieval_event_span
		FOREIGN KEY (span_id) REFERENCES agent_span (span_id)
		ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE agent_error (
	error_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	trace_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	sequence_no BIGINT UNSIGNED NOT NULL,
	span_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
	error_code VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
	message TEXT NOT NULL,
	details_json JSON NULL,
	retriable TINYINT(1) NOT NULL DEFAULT 0,
	created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	PRIMARY KEY (error_id),
	KEY idx_agent_error_trace_sequence (trace_id, sequence_no),
	KEY idx_agent_error_span (span_id),
	KEY idx_agent_error_code_created (error_code, created_at),
	CONSTRAINT fk_agent_error_trace
		FOREIGN KEY (trace_id) REFERENCES agent_trace (trace_id)
		ON UPDATE RESTRICT ON DELETE RESTRICT,
	CONSTRAINT fk_agent_error_span
		FOREIGN KEY (span_id) REFERENCES agent_span (span_id)
		ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
