# @earendil-works/pi-industry-agent

Industry-specific extension layer built on top of Pi Agent Core.

Phase 0 provides only the foundation: request context creation, shared contracts, a thin Pi Agent gateway, a tool registry, a uniform error model, and repository abstractions with an in-memory implementation.

It intentionally does not include database connectivity, entity retrieval, mutation execution, RAG ingestion, or production telemetry persistence.

## Phase 0 workspace registration

The package manifest is present, but the root workspace list temporarily excludes this package so the existing checked-in `package-lock.json` remains valid without hand-editing generated lock data. Root build, type-check, and test commands explicitly cover the package during Phase 0. When a lockfile can be regenerated with npm, remove the exclusion and register the package as a normal workspace.
