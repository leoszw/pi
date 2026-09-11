# MySQL schema assets

This directory contains reviewable MySQL 8.x schema artifacts for the industry-agent implementation.

## Phase 0 rule

The SQL files are generated artifacts only. They must not be connected to a MySQL instance or executed during Phase 0.

Review order:

1. migration syntax and schema semantics;
2. indexes and foreign-key relationships;
3. scope fields and identifier precision;
4. rollback ordering;
5. explicit `NOT EXECUTED` confirmation.

Business identifiers are represented as character columns so 18-digit or larger identifiers never depend on JavaScript `Number` precision. Dense vectors are not stored here; OpenSearch will own retrieval vectors in later phases.

Migration order is `001_trace.sql` then `002_conversation_memory.sql`. Rollback must run in reverse order: `002_conversation_memory.rollback.sql` before `001_trace.rollback.sql`, because conversation and memory rows reference trace records.
