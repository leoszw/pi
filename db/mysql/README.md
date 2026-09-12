# MySQL schema assets

This directory contains reviewable MySQL 8.x schema artifacts for the industry-agent implementation.

## Current rule

The SQL files are generated artifacts only. They must not be connected to a MySQL instance or executed during the current implementation stages unless the user explicitly enables database execution later.

Current generated migrations:

1. `001_trace.sql` - request trace, spans, LLM/tool/retrieval/error records;
2. `002_conversation_memory.sql` - conversation and memory foundation;
3. `003_entity_ontology.sql` - canonical entity, alias, ontology and OpenSearch embedding metadata;
4. `004_retrieval.sql` - retrieval index-version registry and incremental ETL checkpoints;
5. `005_mutation.sql` - mutation proposal, approval and write-control persistence;
6. `006_rag.sql` - scoped RAG document/chunk/ACL/entity/ingestion persistence;
7. `007_audit_policy.sql` - mutation audit and policy-supporting persistence.

Reviewed source views:

- `views/engineering_position_source.sql` - business IDs as strings, Chinese category/type mapping, unit-engineering name, alignment code, ascending numeric chainage and delete/update state;
- `views/boq_source.sql` - business IDs as strings, `section_id -> section_name`, normalized code/name/unit identity fields and delete/update state.

Review order:

1. migration syntax and schema semantics;
2. indexes and foreign-key relationships;
3. tenant/company/project scope fields and identifier precision;
4. source/index version fields;
5. source-view identity normalization and deletion visibility;
6. mutation approval/audit and RAG ACL fields;
7. rollback ordering;
8. explicit `NOT EXECUTED` confirmation.

Business identifiers are represented as character columns so 18-digit or larger identifiers never depend on JavaScript `Number` precision. Dense vectors are not stored in MySQL; OpenSearch owns retrieval vectors, while `entity_embedding_meta` stores only model/index/document/hash metadata.

Migration order is `001 -> 002 -> 003 -> 004 -> 005 -> 006 -> 007`. Rollback must run in reverse order: `007 -> 006 -> 005 -> 004 -> 003 -> 002 -> 001`.

`sequence_no` in Phase 1 is assigned monotonically inside one request trace and merges span, LLM, tool, retrieval, and error records into a stable timeline.

The retrieval source views expose authoritative quantity/price/amount columns only for source lookup/debug where required. Retrieval and embedding pipelines must exclude those values from embedding text; final factual answers must read them from the authoritative business source.

## Execution status

All migrations, rollbacks and source views in this directory remain **review artifacts only**. No MySQL connection, migration, DDL or DML execution is part of the current implementation history. Database execution requires a later explicit user approval and environment-specific rollout plan.
