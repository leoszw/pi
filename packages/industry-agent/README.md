# @earendil-works/pi-industry-agent

Industry-specific extension layer built on top of Pi Agent Core.

Phase 0 established request context creation, shared contracts, the Pi Agent gateway, Tool Registry, uniform errors, and repository abstractions.

Phase 1 added request-scoped observability with Pi Telemetry integration, structured LLM/Tool/Retrieval/Error records, token/cost aggregation, redaction, and trace detail/timeline/tree/stats query services.

Phase 2 added the deterministic `SemanticFrame` layer, Context Resolver, normalization, canonical hard/soft constraints, parse fallback, and Trace integration.

Phase 3 adds the entity data foundation used by later retrieval phases:

- canonical entities for engineering positions and BOQ items;
- tenant/company/project/industry scope carried with every entity;
- business aliases with NFKC normalization and confidence/source metadata;
- real parent hierarchy traversal with cycle/max-depth guards and no invented missing parents;
- source-system/source-version/index-version metadata;
- OpenSearch embedding metadata only in MySQL-facing contracts; vectors remain outside MySQL;
- ontology items for versioned industry dictionaries;
- source adapters from the reviewed engineering-position and BOQ retrieval views;
- in-memory Entity Repository for application tests before a real MySQL adapter exists.

Phase 3 deliberately does **not** implement Exact/BM25/Dense/RRF/Rerank. Those begin in the engineering-position and BOQ retrieval phases.

## Database rule

The package still does not connect to MySQL. Phase 3 only generates and statically reviews:

- `003_entity_ontology.sql` and rollback;
- `004_retrieval.sql` and rollback;
- `views/engineering_position_source.sql`;
- `views/boq_source.sql`.

The engineering view maps category/type IDs to Chinese dictionary names and orders numeric chainage with `LEAST/GREATEST`. The BOQ view maps `section_id` to `section_name` and emits normalized identity fields. Both views keep delete state visible for incremental OpenSearch synchronization. Quantity/price/amount fields remain authoritative-source facts and must not become embedding facts.

No migration, DDL, DML, or database connection is executed in Phase 3.

## Temporary workspace registration

The package manifest is present, but the root workspace list temporarily excludes this package so the existing checked-in `package-lock.json` remains valid without hand-editing generated lock data. Root build, type-check, and test commands explicitly cover the package. When a lockfile can be regenerated with npm, remove the exclusion and register the package as a normal workspace.
