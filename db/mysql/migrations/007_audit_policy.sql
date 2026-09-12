-- Phase 7 audit/policy metadata schema.
-- GENERATED FOR STATIC REVIEW ONLY. NOT EXECUTED.
-- Audit events are immutable: UPDATE and DELETE are blocked by triggers.

CREATE TABLE IF NOT EXISTS mutation_audit_policy (
    policy_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    tenant_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    entity_type VARCHAR(128) NOT NULL,
    policy_version VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    policy_json JSON NOT NULL,
    status ENUM('ACTIVE','RETIRED') NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (policy_id),
    UNIQUE KEY uq_mutation_audit_policy_version (tenant_id, entity_type, policy_version),
    KEY idx_mutation_audit_policy_active (tenant_id, entity_type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS mutation_audit_event (
    event_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    operation_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    trace_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    event_type ENUM('PREPARED','APPROVED','COMMIT_STARTED','COMMITTED','FAILED','REJECTED') NOT NULL,
    tenant_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    company_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    project_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    entity_type VARCHAR(128) NOT NULL,
    operation_type ENUM('CREATE','UPDATE','DELETE') NOT NULL,
    operation_digest CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    record_version VARCHAR(192) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    details_json JSON NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (event_id),
    KEY idx_mutation_audit_operation (operation_id, created_at),
    KEY idx_mutation_audit_scope (tenant_id, company_id, project_id, created_at),
    KEY idx_mutation_audit_trace (trace_id),
    CONSTRAINT fk_mutation_audit_operation FOREIGN KEY (operation_id) REFERENCES mutation_operation(operation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

DELIMITER $$
CREATE TRIGGER trg_mutation_audit_no_update
BEFORE UPDATE ON mutation_audit_event
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'mutation audit events are immutable';
END$$
CREATE TRIGGER trg_mutation_audit_no_delete
BEFORE DELETE ON mutation_audit_event
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'mutation audit events cannot be physically deleted';
END$$
DELIMITER ;
