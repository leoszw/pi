# @earendil-works/pi-industry-agent

Industry-specific extension layer built on top of Pi Agent Core.

Phases 0–3 established request/trace contracts, deterministic semantic normalization, canonical entity scope/hierarchy, and static MySQL retrieval metadata. Phase 4 added engineering-position Hybrid Retrieval. Phase 5 added BOQ Hybrid Retrieval. Phase 6 added server-scoped READ Tools. Phase 7 added the confirmation-bound Mutation Runtime and UI Action safety boundary. Phase 8 added scoped RAG ingestion with structure-aware chunking and staged indexes.

Phase 9 adds RAG QA only; persistent Working Memory remains Phase 10.

- `RagQaService` implements Context Resolve -> Query Rewrite -> server Access/Scope Resolve -> ACL/visibility/metadata filter -> BM25 + Dense + optional Entity-aware retrieval -> Weighted RRF -> rerank -> diversity/dedup -> parent-context expansion -> Citation Pack -> evidence gate -> answer;
- `RagQaAccessContextProvider` is the only source for roles, security tags, industry/department context, while authenticated user/tenant/company/project are cross-checked against `RequestContext`;
- every retrieval backend method requires a `RagQaAccessFilter`; there is deliberately no unfiltered BM25/Dense/entity method;
- visibility, explicit USER/ROLE ACL, security tags, READY status, and metadata restrictions are therefore applied before retrieval, not hidden by a prompt after retrieval;
- the service defensively re-checks every returned candidate with the same ACL policy and fails closed if a backend violates the pre-filter contract;
- metadata filters permit only document IDs, MIME types, entity IDs, and section prefix; tenant/company/project/ACL override keys are rejected;
- Dense embedding failure does not suppress an available lexical/entity path; individual retrieval arms can degrade independently, while failure of all arms is fatal;
- BM25/Dense/Entity ranks are fused with versioned Weighted RRF instead of directly adding incompatible raw scores;
- reranker failure degrades to RRF ranking and is exposed in debug/trace rather than silently changing semantics;
- diversity removes duplicate content hashes and caps selected evidence per document;
- parent expansion uses the same ACL-filtered source reader as primary retrieval, and parent evidence receives its own citation rather than being smuggled into a child citation;
- Citation Pack preserves document ID, chunk ID, page range, section path, document checksum as source version, and parser/chunker/embedding/lexical/vector versions;
- the answer generator receives only the evidence pack plus an explicit `EVIDENCE_ONLY` grounding contract and allowed citation IDs;
- when the configured evidence gate is not met, the service returns `INSUFFICIENT_EVIDENCE` with the configured explicit message and does not call the answer generator;
- the built-in in-memory corpus applies the same ACL policy and supports deterministic tests without OpenSearch, a vector database, or an LLM.

## Phase 9 authorization policy

The default `rag-acl-v1` behavior is deliberately conservative:

- tenant must always match;
- a non-owner document/chunk with `departmentId` requires the same server-resolved department;
- `PRIVATE` is owner-only;
- `PROJECT`, `COMPANY`, and `INDUSTRY` require the matching server-resolved scope;
- `TENANT` permits the authenticated tenant scope;
- if USER/ROLE ACL entries exist, a non-owner must match at least one allowed user or role;
- every document/chunk security tag must be present in the server-resolved principal security tags;
- documents must be `READY` before they are retrievable.

Production search adapters must translate the complete `RagQaAccessFilter` to native OpenSearch/vector-database filters before executing BM25/KNN/entity queries. Post-retrieval filtering alone is not an acceptable adapter implementation.

## Phase 9 retrieval configuration

`config/rag/qa-v1.json` versions the first baseline for arm TopK, Weighted RRF, rerank/final limits, parent expansion, evidence gate, and required citation fields. These values are a reviewable baseline for Golden Eval calibration rather than hidden constants distributed through application code.

Phase 9 adds no MySQL schema and executes no existing SQL. It consumes only READY Phase 8 document/chunk/index contracts through application ports. No MySQL connection, object-storage request, OpenSearch request, vector-database request, embedding-model request, reranker-model request, or answer-model request is created by repository setup or the Phase 9 tests.

## Temporary workspace registration

The package manifest is present, but the root workspace list temporarily excludes this package so the existing checked-in `package-lock.json` remains valid without hand-editing generated lock data. Root build, type-check, and test commands explicitly cover the package. When a lockfile can be regenerated with npm, remove the exclusion and register the package as a normal workspace.
