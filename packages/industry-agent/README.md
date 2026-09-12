# @earendil-works/pi-industry-agent

Industry-specific extension layer built on top of Pi Agent Core.

Phases 0–3 established request/trace contracts, deterministic semantic normalization, canonical entity scope/hierarchy, and static MySQL retrieval metadata. Phase 4 added engineering-position Hybrid Retrieval. Phase 5 added BOQ Hybrid Retrieval. Phase 6 added server-scoped READ Tools. Phase 7 added the confirmation-bound Mutation Runtime and UI Action safety boundary.

Phase 8 adds RAG Ingestion only; RAG QA/retrieval remains Phase 9.

- every document and chunk carries the full knowledge scope: tenant, industry, company, project, department, owner, visibility, ACL users, ACL roles, and security tags;
- server RequestContext and `knowledge.ingest` permission are checked before object storage or parsing;
- file bytes are SHA-256 checksummed; binary object storage may reuse `tenant + checksum`, while skipping parsing/embedding requires the same checksum **and the exact security-scope fingerprint**;
- ingestion uses an explicit state machine from `RECEIVED` through validation, storage, parsing/extraction, chunking, enrichment, embedding, indexing, quality validation, and `READY`, with terminal `DEDUPLICATED` and `FAILED` states;
- parser selection is routed by a `RagParserRouter`; OCR/vision is invoked only when the selected parser marks the document as requiring it;
- the built-in structured-text parser recognizes heading hierarchy, clauses, Markdown-style tables, and paragraphs; PDF/DOCX/layout-specific parsers remain application adapters behind the same interface;
- chunking is structure-first rather than fixed 500/1000-token slicing: tables remain whole, normal structural blocks remain whole, and token windows are used only for long blocks;
- chunks preserve source block, parent chunk, section path, and page range, and can receive entity/metadata enrichment before embedding;
- parser, vision, chunker, embedding, lexical-index, and vector-index versions are recorded for replay and rebuild decisions;
- lexical/vector writes are staged first, quality checked second, and activated only after successful validation; failed ingestion removes staging so FAILED content is not queryable;
- ingestion failures persist the exact pipeline stage, error code/message, retriable flag, trace ID, and request ID;
- in-memory permission, document/chunk repository, object storage, lexical/vector index, and trace implementations support deterministic tests without external services.

## Phase 8 integration boundaries

`RagIngestionService` owns orchestration, not infrastructure credentials. Object storage, parser/OCR/vision, enrichment, embedding, lexical indexing, and vector indexing are all ports supplied by the application. No OpenSearch/vector database/object-store connection is created by the package itself.

Scope/ACL are first-class indexed metadata, not prompt-only annotations. The generated schema stores high-frequency tenant/company/project/visibility columns directly and normalizes USER/ROLE/SECURITY_TAG ACL subjects into indexed relation tables for future Phase 9 pre-retrieval authorization.

## Database rule

Phase 8 generates and statically reviews:

- `db/mysql/migrations/006_rag.sql`;
- `db/mysql/rollback/006_rag.rollback.sql`.

These are **static review artifacts only**. They define document/chunk scope, ACL, entity links, version/status/failure metadata, and ingestion events. No migration, DDL, DML, MySQL connection, object-storage request, OCR/vision call, embedding call, lexical-index request, or vector-index request is executed by repository setup or the Phase 8 tests.

## Temporary workspace registration

The package manifest is present, but the root workspace list temporarily excludes this package so the existing checked-in `package-lock.json` remains valid without hand-editing generated lock data. Root build, type-check, and test commands explicitly cover the package. When a lockfile can be regenerated with npm, remove the exclusion and register the package as a normal workspace.
