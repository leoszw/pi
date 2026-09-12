# @earendil-works/pi-industry-agent

Industry-specific extension layer built on top of Pi Agent Core.

Phases 0–10 established request/trace observability, deterministic semantic normalization, canonical entity retrieval, server-scoped READ Tools, confirmation-bound mutation, scoped RAG ingestion/QA, and bounded Working Memory.

Phase 11 adds the first-stage Golden Eval / Hard Cases / release gate. It does **not** fabricate a passing benchmark result; it provides the corpus, metric harness, offline runner contract, regression diff, and fail-closed promotion policy required to produce and judge a real benchmark.

- `buildPhase11GoldenCorpus()` deterministically materializes 1,030 concrete contract-level Golden/Hard cases: a balanced 54-case base for each of the 19 required categories plus four critical first-stage E2E workflows;
- the committed manifest records corpus version, generator version, case/category counts, and canonical SHA-256; the release gate recomputes it so corpus changes cannot hide under the same version;
- required coverage includes same-name entities, aliases/short names, typos, chainage ranges, left/right semantics, project conflicts, BOQ section/code cases, context references, reserved image cases, RAG scope/ACL, company/project/industry conflicts, insufficient evidence, wrong mutation targets, batch mutation, Tool failure, LLM timeout, zero retrieval, and Hard Negatives;
- `runOfflineBenchmark()` executes every corpus case through an application-provided `OfflineEvalExecutor`, requires the returned observation ID to match the input case ID, preserves corpus order, and supports bounded concurrency;
- `computeBenchmarkReport()` calculates Intent Candidate Recall@K / Macro F1, Mention Span F1, Normalization Exact Match, Entity Recall@20/50 / Hit@1 / MRR, RAG Recall@K / nDCG / MRR / Groundedness / Citation Accuracy, Tool Selection Accuracy, Mutation Wrong-target Rate, Approval Consistency, Trace Span Completeness, Token Accounting Completeness, End-to-End Task Success, Clarification Rate, and Manual Steps Saved;
- retrieval nDCG deduplicates repeated chunk IDs so a faulty backend cannot inflate ranking quality by returning the same relevant chunk multiple times;
- `evaluateReleaseGate()` requires corpus size/category coverage, 100% candidate benchmark case coverage, no unknown/duplicate observation IDs, configured minimum samples for every gated metric, absolute metric thresholds, and regression tolerances;
- the four critical first-stage E2E workflows (query, context mutation, project RAG QA, authoritative quantity lookup) must each have an explicit successful E2E observation; aggregate success rate cannot hide a failure in one of them;
- COMPARE mode additionally requires the baseline and candidate to use the same corpus version and both benchmark reports to cover the gated corpus;
- Prompt, Normalizer, Embedding, Index, RRF, Reranker, and Tool Schema are represented by `{version, fingerprint}`. A fingerprint change without a version bump blocks promotion;
- a correctly bumped component still cannot promote unless its offline benchmark passes absolute thresholds and regression diff;
- Mutation Wrong-target Rate is zero-tolerance and Approval Consistency requires 100% in the v1 release policy;
- Trace/Token/E2E metrics require broad sample coverage rather than being accepted from a handful of cases;
- Clarification Rate is reported with broad sample coverage but v1 deliberately does not treat “lower is always better” as a regression direction, avoiding pressure to skip necessary clarification.

## Phase 11 release workflow

```text
component change
 -> version bump
 -> run exact corpus version offline
 -> produce BenchmarkReport + component manifest
 -> regression diff against accepted baseline
 -> evaluate release gate
 -> PASS before promotion
```

`packages/industry-agent/config/eval/release-gate-v1.json` is the reviewable first baseline for corpus coverage, per-metric minimum samples, absolute thresholds, and allowed regression. Thresholds are centralized and versioned rather than scattered through runtime code.

## Benchmark integrity boundary

The committed corpus contains inputs and expected invariants only. It is **not** evidence that the current runtime already meets the release thresholds. Establishing an accepted baseline requires a real offline executor to run the system under test and emit observations for the exact corpus. Subsequent component changes must run COMPARE mode against an accepted report from the same corpus version.

The Phase 11 harness is infrastructure-neutral. It creates no MySQL, OpenSearch, object-storage, embedding, reranker, or LLM connection itself. An application-provided offline executor may use mocks or a controlled evaluation environment; production credentials and database writes do not belong in the harness.

## Database rule

Phase 11 adds no MySQL schema and executes no existing migration, DDL, or DML. The existing Phase 0–10 database artifacts remain unchanged.

## Phase boundary

Phase 11 completes the first-stage evaluation/release-gate layer. Image understanding, complex autonomous Agent loops, report generation, and read-only SQL/Python Sandbox remain second-stage capabilities and are not implemented here.

## Temporary workspace registration

The package manifest is present, but the root workspace list temporarily excludes this package so the existing checked-in `package-lock.json` remains valid without hand-editing generated lock data. Root build, type-check, and test commands explicitly cover the package. When a lockfile can be regenerated with npm, remove the exclusion and register the package as a normal workspace.
