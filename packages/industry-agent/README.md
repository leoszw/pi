# @earendil-works/pi-industry-agent

Industry-specific extension layer built on top of Pi Agent Core.

Phase 0 established request context creation, shared contracts, the Pi Agent gateway, Tool Registry, uniform errors, and repository abstractions.

Phase 1 added request-scoped observability with Pi Telemetry integration, structured LLM/Tool/Retrieval/Error records, token/cost aggregation, redaction, and trace detail/timeline/tree/stats query services.

Phase 2 adds a deterministic semantic layer between natural language and business tools:

- `QueryParser` produces a stable `SemanticFrame`;
- chainage normalization (`K12+300 -> 12300`, range normalization included);
- side normalization with hard/soft confidence rules;
- engineering unit normalization;
- BOQ code normalization;
- date and relative-date normalization;
- project/segment context resolution;
- deictic context references such as “这个 / 那些 / 刚才的”;
- canonical JSON ordering and hard-filter generation;
- parse failures fall back to an `UNKNOWN` frame instead of blocking the Agent request;
- each constraint preserves `confidence`, `source`, and `mode`;
- only hard constraints are emitted into `filters`.

Request-context `project_id` remains an authoritative hard scope. A conflicting project mentioned in semantic context is kept only as a soft candidate so semantic parsing cannot expand an already-scoped request across projects.

The Gateway records the generated `SemanticFrame` into the Phase 1 trace and passes it to the runtime factory as an optional third argument. Existing runtime factories that only consume `RequestContext` remain valid.

Entity persistence/search, OpenSearch hybrid retrieval, mutation execution, and RAG remain outside Phase 2.

## Database rule

The package still does not connect to MySQL. Existing SQL files remain generated and statically reviewed only; no migration or DDL/DML is executed in Phase 2.

## Temporary workspace registration

The package manifest is present, but the root workspace list temporarily excludes this package so the existing checked-in `package-lock.json` remains valid without hand-editing generated lock data. Root build, type-check, and test commands explicitly cover the package. When a lockfile can be regenerated with npm, remove the exclusion and register the package as a normal workspace.
