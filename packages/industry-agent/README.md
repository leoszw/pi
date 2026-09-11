# @earendil-works/pi-industry-agent

Industry-specific extension layer built on top of Pi Agent Core.

Phase 0 established request context creation, shared contracts, the Pi Agent gateway, Tool Registry, uniform errors, and repository abstractions.

Phase 1 adds request-scoped observability:

- one `trace_id` per request;
- Pi Agent lifecycle spans and turn spans;
- Pi provider telemetry through `TelemetryContext` injection;
- structured LLM, Tool, Retrieval, and Error records;
- token/cost aggregation;
- configurable field redaction before persistence;
- stable per-trace sequence numbers for timeline reconstruction;
- tenant-scoped trace query services for detail, timeline, tree, and stats;
- passive persistence semantics so trace backend failures do not break Agent execution.

The host application maps `TraceQueryService` to these GET routes:

- `/api/traces/{trace_id}`
- `/api/traces/{trace_id}/timeline`
- `/api/traces/{trace_id}/tree`
- `/api/traces/{trace_id}/stats`

The package still does not connect to MySQL. `TraceRepository` is the persistence boundary and `InMemoryTraceRepository` is the Phase 1 reference/test backend. MySQL DDL remains generated and statically reviewed only; no migration or DDL/DML is executed.

Entity retrieval, mutation execution, and RAG remain outside Phase 1.

## Temporary workspace registration

The package manifest is present, but the root workspace list temporarily excludes this package so the existing checked-in `package-lock.json` remains valid without hand-editing generated lock data. Root build, type-check, and test commands explicitly cover the package. When a lockfile can be regenerated with npm, remove the exclusion and register the package as a normal workspace.
