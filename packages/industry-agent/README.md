# @earendil-works/pi-industry-agent

Industry-specific extension layer built on top of Pi Agent Core.

Phase 0 established request context creation, shared contracts, the Pi Agent gateway, Tool Registry, uniform errors, and repository abstractions.

Phase 1 added request-scoped observability with Pi Telemetry integration, structured LLM/Tool/Retrieval/Error records, token/cost aggregation, redaction, and trace detail/timeline/tree/stats query services.

Phase 2 added deterministic `SemanticFrame` parsing, context resolution, canonical normalization, hard/soft constraints, and trace integration.

Phase 3 added the canonical entity foundation: entity/alias/ontology contracts, hierarchy and scope handling, source/index versions, engineering/BOQ source adapters, mock repositories, MySQL entity/retrieval metadata DDL, and reviewed retrieval-source views.

Phase 4 added engineering-position Hybrid Retrieval with Exact/BM25/two Dense arms, Weighted RRF, rerank, business features, confidence/debug output, OpenSearch transport boundaries, indexing orchestration, and benchmark metric utilities.

Phase 5 adds BOQ Hybrid Retrieval:

- `operation` (`SEARCH` / `LIST_DESCENDANTS` / `FACT_LOOKUP`) is independent from `queryMode` (`CODE` / `SPEC` / `ITEM_SHORT` / `CONTEXT` / `DEFAULT`);
- ledger codes are normalized with the same deterministic rules on query and document sides and accepted only after current catalog validation;
- structural `ancestor_codes` preserve missing code prefixes while `path_names` contain only real existing ancestors, so missing parents are never invented;
- `is_leaf` is derived from descendants, never from whether a unit exists;
- shared specification extraction covers concrete/rebar grades, diameter, thickness, percentage and rock class identity tokens;
- query specifications are not global hard filters: they participate in Exact/Token retrieval, business features and explicit same-family conflict penalties;
- BOQ Dense text contains name/spec/unit/path/section semantics but excludes ledger code and all price/quantity/amount/change facts;
- two Dense vectors only: `item_vector[1024]` and `context_vector[1024]` using BGE-M3;
- versioned BOQ OpenSearch strict mapping and retrieval configuration are checked in under `config/boq`;
- complete code exact and hierarchy descendant routes are deterministic and can skip Dense retrieval;
- Hybrid search uses Exact/Token Top30, BM25 Top80, Item Dense Top80, Context Dense Top80;
- Weighted RRF uses active-arm weight normalization with `k=60`; fusion normalization uses the theoretical upper bound `1/(k+1)` instead of dividing by the current query's Top1;
- Top50 reranking is followed by applicable-feature-normalized business scoring and critical specification conflict penalties;
- ranking score uses the reviewed baseline `0.55 rerank + 0.20 fusion + 0.25 business`;
- confidence is deliberately separate from ranking score and combines rerank margin, arm support, identity match and explicit structural coverage;
- generic short-name ambiguity, hierarchy gaps, critical spec conflicts and degraded retrieval prevent automatic binding;
- Embedding or vector-arm failures fall back to available lexical arms; reranker failure falls back to RRF + business features; degraded results never auto-accept;
- `FACT_LOOKUP` resolves `ledger_id` only. Price, quantity, amount, change values and `-1` sentinel semantics remain the responsibility of the authoritative fact layer / later READ tools;
- full/incremental indexing supports `(update_time, ledger_id)` cursors, source tombstone deletes and `embedding_input_hash` vector reuse;
- incremental new/delete/code changes recommend a hierarchy-aware full rebuild because they can change ancestor `has_children/is_leaf`; for the current ~772-item scale full rebuild is the preferred safe path;
- benchmark utilities report Code Exact Accuracy, Hierarchy Accuracy, Recall@10, Hit@1, MRR, Spec Conflict Top1 Rate, Ambiguity Precision, Zero Result Rate and P50/P95 latency.

The runtime does **not** directly add BM25, cosine, or reranker raw scores. Large business IDs remain strings end-to-end.

## Phase 5 integration boundaries

`BoqRetrievalService` depends on three ports:

- `BoqRetrievalBackend` for exact-code, descendants, Exact/Token, BM25 and two KNN arms;
- `BoqEmbeddingProvider` for the query/document Dense vector;
- `BoqReranker` for normalized cross-encoder scores.

`OpenSearchBoqRetrievalBackend` and `OpenSearchBoqIndexWriter` accept transport interfaces, so the package owns no OpenSearch credentials or connection lifecycle. The checked-in BOQ mapping uses Faiss/HNSW + `cosinesimil` and declares OpenSearch `>=2.19` as the reviewed production baseline.

The BOQ parser requires a versioned `BoqQueryCatalog` containing current `knownCodes` and `knownAncestorCodes`. This is intentional: a three-digit number is not treated as a BOQ code merely because it matches a regex; catalog validation prevents specification values such as `200mm` from being misrouted as codes.

## Database and fact rule

Phase 5 adds no new MySQL tables and executes no existing SQL. It consumes the Phase 3 `vw_boq_retrieval_source_all` contract only through application-side types/ports.

Contract price, contract quantity, contract amount, changed price/quantity/amount, change counts/times, and other authoritative facts are not copied into BOQ embedding or rerank text. Retrieval resolves `ledger_id`; later fact/READ tooling must read authoritative values from the business source and must not reinterpret sentinel values such as `-1` without business rules.

No migration, DDL, DML, MySQL connection, OpenSearch network request, embedding-model call, or reranker-model call is executed by repository setup itself.

## Temporary workspace registration

The package manifest is present, but the root workspace list temporarily excludes this package so the existing checked-in `package-lock.json` remains valid without hand-editing generated lock data. Root build, type-check, and test commands explicitly cover the package. When a lockfile can be regenerated with npm, remove the exclusion and register the package as a normal workspace.
