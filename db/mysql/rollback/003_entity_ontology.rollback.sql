-- PI Industry Agent - Phase 3 rollback
-- REVIEW STATUS: GENERATED FOR STATIC REVIEW ONLY. NOT EXECUTED.
-- Destructive: removes canonical entity and ontology metadata.

DROP TABLE IF EXISTS entity_embedding_meta;
DROP TABLE IF EXISTS entity_alias;
DROP TABLE IF EXISTS ontology_item;
DROP TABLE IF EXISTS entity;
