-- PI Industry Agent - Phase 3 rollback
-- REVIEW STATUS: GENERATED FOR STATIC REVIEW ONLY. NOT EXECUTED.
-- Destructive: removes retrieval index registry and ETL checkpoints.

DROP TABLE IF EXISTS retrieval_sync_checkpoint;
DROP TABLE IF EXISTS retrieval_index_version;
