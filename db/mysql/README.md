# MySQL schema assets

This directory contains reviewable MySQL 8.x schema artifacts for the industry-agent implementation.

## Current rule

The SQL files are generated artifacts only. They must not be connected to a MySQL instance or executed during the current implementation stages unless the user explicitly enables database execution later.

Phase 1 extends `001_trace.sql` so trace data can preserve global per-request sequence numbers, Pi telemetry span events, SemanticFrame snapshots, detailed token usage, retrieval/error counts, and final aggregate cost metadata.

Review order:

1. migration syntax and schema semantics;
2. indexes and foreign-key relationships;
3. scope fields and identifier precision;
4. rollback ordering;
5. trace ordering and observability field completeness;
6. explicit `NOT EXECUTED` confirmation.

Business identifiers are represented as character columns so 18-digit or larger identifiers never depend on JavaScript `Number` precision. Dense vectors are not stored here; OpenSearch will own retrieval vectors in later phases.

Migration order is `001_trace.sql` then `002_conversation_memory.sql`. Rollback must run in reverse order: `002_conversation_memory.rollback.sql` before `001_trace.rollback.sql`, because conversation and memory rows reference trace records.

`sequence_no` is assigned monotonically inside one request trace and is used to merge span, LLM, tool, retrieval, and error records into a stable timeline. It is intentionally indexed per table rather than globally constrained across tables.
