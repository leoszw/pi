-- Phase 7 Mutation Runtime metadata schema.
-- GENERATED FOR STATIC REVIEW ONLY. NOT EXECUTED.
-- Do not run from application startup. Business-table writes are intentionally not defined here.

CREATE TABLE IF NOT EXISTS mutation_operation (
    operation_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    trace_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    tenant_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    project_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    operation_type ENUM('CREATE','UPDATE','DELETE') NOT NULL,
    entity_type VARCHAR(128) NOT NULL,
    operation_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    record_version VARCHAR(192) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    affected_count INT UNSIGNED NOT NULL,
    proposal_json JSON NOT NULL,
    status ENUM('PREPARED','APPROVED','COMMITTED','FAILED','CANCELLED') NOT NULL DEFAULT 'PREPARED',
    approved_at DATETIME(6) NULL,
    committed_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (operation_id),
    KEY idx_mutation_scope_created (tenant_id, company_id, project_id, created_at),
    KEY idx_mutation_status_created (status, created_at),
    KEY idx_mutation_trace (trace_id),
    CONSTRAINT chk_mutation_affected_count CHECK (affected_count > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS mutation_operation_target (
    operation_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    target_seq INT UNSIGNED NOT NULL,
    entity_id VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NULL,
    record_version VARCHAR(192) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    before_json JSON NULL,
    after_json JSON NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (operation_id, target_seq),
    KEY idx_mutation_target_entity (entity_id),
    CONSTRAINT fk_mutation_target_operation FOREIGN KEY (operation_id) REFERENCES mutation_operation(operation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS mutation_approval_token (
    approval_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    nonce_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    operation_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    operation_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    record_version VARCHAR(192) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    tenant_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    project_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    issued_at DATETIME(6) NOT NULL,
    expires_at DATETIME(6) NOT NULL,
    consumed_at DATETIME(6) NULL,
    status ENUM('ISSUED','CONSUMED','REVOKED') NOT NULL DEFAULT 'ISSUED',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (approval_id),
    UNIQUE KEY uq_mutation_approval_nonce (nonce_hash),
    KEY idx_mutation_approval_operation (operation_id, status),
    KEY idx_mutation_approval_expiry (status, expires_at),
    CONSTRAINT fk_mutation_approval_operation FOREIGN KEY (operation_id) REFERENCES mutation_operation(operation_id),
    CONSTRAINT chk_mutation_approval_expiry CHECK (expires_at > issued_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DELIMITER $$
CREATE TRIGGER trg_mutation_approval_no_delete
BEFORE DELETE ON mutation_approval_token
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'mutation approval records are append-preserved and cannot be physically deleted';
END$$
DELIMITER ;
