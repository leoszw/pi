# @earendil-works/pi-industry-agent

Industry-specific extension layer built on top of Pi Agent Core.

Phase 0 established request context creation, shared contracts, the Pi Agent gateway, Tool Registry, uniform errors, and repository abstractions.

Phase 1 added request-scoped observability with Pi Telemetry integration, structured LLM/Tool/Retrieval/Error records, token/cost aggregation, redaction, and trace detail/timeline/tree/stats query services.

Phase 2 added deterministic `SemanticFrame` parsing, context resolution, canonical normalization, hard/soft constraints, and trace integration.

Phase 3 added the canonical entity foundation: entity/alias/ontology contracts, hierarchy and scope handling, source/index versions, engineering/BOQ source adapters, mock repositories, MySQL entity/retrieval metadata DDL, and reviewed retrieval-source views.

Phase 4 adds engineering-position Hybrid Retrieval:

- deterministic `ParsedEngineeringQuery` with project, alignment, chainage, local-side, structural-token, and context hints;
- hard-filter planning that never relaxes project scope or explicit alignment/chainage constraints;
- cross-alignment guard so `GK... -> FK...` is not treated as a normal numeric interval;
- document text builder for `search_text`, `embedding_name_text`, `embedding_context_text`, and `rerank_text`;
- chainage values are excluded from Dense embedding text but may appear in rerank summaries;
- two dense vectors only: `name_vector[1024]` and `context_vector[1024]`;
- versioned retrieval configuration and OpenSearch mapping;
- Exact Top20, BM25 Top80, Name Dense Top80, Context Dense Top80;
- query-mode-specific Weighted RRF with `k=60` and Top80 fusion retention;
- normalized reranker scores plus deterministic business features;
- final score composition `0.60 rerank + 0.20 fusion + 0.20 business`;
- confidence policy for exact/high/ambiguous/low results;
- retrieval debug output and Phase 1 Trace integration;
- OpenSearch query/index adapters behind transport interfaces, with no network connection created by this package;
- full/incremental indexing orchestration with `(update_time, engineering_id)` cursor semantics;
- `embedding_input_hash` reuse so structure-only changes can preserve existing vectors;
- source tombstones delete the corresponding OpenSearch document;
- benchmark metric utilities for Recall@20, Recall@50, Hit@1, MRR, zero-result rate, constraint-conflict rate, and P50/P95 latency.

The runtime does **not** directly add BM25, cosine, or reranker raw scores. Fusion uses ranks through Weighted RRF. Large business IDs remain strings end-to-end.

## Phase 4 integration boundaries

`EngineeringRetrievalService` depends on three ports:

- `EngineeringRetrievalBackend` for Exact/BM25/KNN search;
- `EngineeringEmbeddingProvider` for the query/document Dense vector;
- `EngineeringReranker` for normalized cross-encoder scores.

`OpenSearchEngineeringRetrievalBackend` and `OpenSearchEngineeringIndexWriter` accept transport interfaces, so an application can bind an existing OpenSearch client without making this package own connection credentials or network lifecycle.

The checked-in mapping uses Faiss/HNSW with `cosinesimil` and follows the reviewed Phase 4 baseline. Production must pin a compatible OpenSearch version and benchmark any analyzer/model/mapping change before activating a new index version.

## Database rule

Phase 4 adds no new MySQL tables. Existing MySQL DDL and Views remain generated/static-review artifacts only. No migration, DDL, DML, MySQL connection, OpenSearch request, embedding-model call, or reranker-model call is executed by repository setup itself.

## Temporary workspace registration

The package manifest is present, but the root workspace list temporarily excludes this package so the existing checked-in `package-lock.json` remains valid without hand-editing generated lock data. Root build, type-check, and test commands explicitly cover the package. When a lockfile can be regenerated with npm, remove the exclusion and register the package as a normal workspace.
