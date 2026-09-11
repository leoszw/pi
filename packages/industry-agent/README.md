# @earendil-works/pi-industry-agent

Industry-specific extension layer built on top of Pi Agent Core.

Phase 0 established request context creation, shared contracts, the Pi Agent gateway, Tool Registry, uniform errors, and repository abstractions.

Phase 1 added request-scoped observability with Pi Telemetry integration, structured LLM/Tool/Retrieval/Error records, token/cost aggregation, redaction, and trace detail/timeline/tree/stats query services.

Phase 2 added deterministic `SemanticFrame` parsing, context resolution, canonical normalization, hard/soft constraints, and trace integration.

Phase 3 added the canonical entity foundation: entity/alias/ontology contracts, hierarchy and scope handling, source/index versions, engineering/BOQ source adapters, mock repositories, MySQL entity/retrieval metadata DDL, and reviewed retrieval-source views.

Phase 4 added engineering-position Hybrid Retrieval with Exact/BM25/two Dense arms, Weighted RRF, rerank, business features, confidence/debug output, OpenSearch transport boundaries, indexing orchestration, and benchmark metric utilities.

Phase 5 added BOQ Hybrid Retrieval with code/catalog routing, hierarchy, shared spec normalization, Exact/Token + BM25 + two Dense arms, active-arm Weighted RRF, rerank/business scoring, independent confidence, lexical degradation, indexing orchestration, and benchmark metrics.

Phase 6 adds READ Tools:

- `search_engineering_positions` and `search_boq` reuse the Phase 4/5 retrieval services;
- `get_engineering_position`, `get_boq_item`, `query_quantity`, and `list_project_documents` depend only on read-only repository ports;
- every ToolDefinition declares version, domain/action, JSON input/output schemas, allowed entity types, permission, server scope rule, risk, confirmation/dry-run/idempotency, timeout, and retry metadata;
- all six tools are `LOW` risk, idempotent, non-mutating, and never require confirmation;
- tool arguments cannot override `userId`, `tenantId`, `companyId`, or `projectId`; scope comes only from the server-bound `RequestContext`;
- the runtime requires all four scope fields and re-checks the tool permission against the exact user/tenant/company/project tuple before data access;
- BOQ search receives its `BoqQueryCatalog` from a server-side provider rather than from LLM arguments;
- authoritative read results carry `sourceId/sourceVersion` and optional `updatedAt/unit` evidence;
- quantity values are returned raw; sentinel values such as `-1` are not reinterpreted by retrieval or tool code;
- read-tool Trace hooks cover success and failure paths; normal Pi Agent execution is also captured by the existing Phase 1 tool execution events;
- in-memory permission/data/catalog implementations support tests before real service adapters are connected.

## Phase 6 integration boundaries

`ReadToolRuntime` accepts application-provided permission, data, retrieval, catalog and Trace ports. It does not own database credentials, SQL generation, network connections, OpenSearch clients, or model clients. The runtime rejects mutation actions and has no CREATE/UPDATE/DELETE path.

The first six READ tools require server-bound company and project scope. If either is missing, execution fails closed instead of allowing an LLM-supplied replacement scope.

## Database and fact rule

Phase 6 adds no MySQL tables and executes no existing SQL. Real adapters may later read authoritative business MySQL/API data, but this phase only defines read-only ports and mock implementations.

Contract price/quantity/amount, engineering quantities, changed values and sentinel semantics must come from authoritative read adapters. Retrieval text is never accepted as the source of a business fact.

No migration, DDL, DML, MySQL connection, OpenSearch network request, embedding-model call, reranker-model call, or mutation is executed by repository setup itself.

## Temporary workspace registration

The package manifest is present, but the root workspace list temporarily excludes this package so the existing checked-in `package-lock.json` remains valid without hand-editing generated lock data. Root build, type-check, and test commands explicitly cover the package. When a lockfile can be regenerated with npm, remove the exclusion and register the package as a normal workspace.
