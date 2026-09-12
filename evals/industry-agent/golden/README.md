# Phase 11 Golden / Hard Eval corpus

The first-stage corpus is materialized deterministically by `packages/industry-agent/src/eval/phase11-corpus.ts`. It produces exactly 1,030 concrete cases: a balanced 54-case base for each of the 19 required categories plus four first-stage critical E2E workflows (query, mutation, RAG QA, authoritative fact lookup).

`phase11-manifest-v1.json` locks the corpus version, generator version, case/category counts, and canonical SHA-256. The Phase 11 release gate recomputes that manifest from the materialized corpus; changing case content without updating the manifest/version blocks promotion.

The corpus supplies inputs and expected invariants only. It is not a fabricated benchmark result. A real offline executor must run the exact corpus and produce one observation per case before an initial baseline can be accepted or a later component version can be promoted.
