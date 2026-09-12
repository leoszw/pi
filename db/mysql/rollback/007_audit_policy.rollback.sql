-- Phase 7 rollback. GENERATED FOR STATIC REVIEW ONLY. NOT EXECUTED.
DROP TRIGGER IF EXISTS trg_mutation_audit_no_delete;
DROP TRIGGER IF EXISTS trg_mutation_audit_no_update;
DROP TABLE IF EXISTS mutation_audit_event;
DROP TABLE IF EXISTS mutation_audit_policy;
