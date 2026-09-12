# @earendil-works/pi-industry-agent

Industry-specific extension layer built on top of Pi Agent Core.

Phases 0–11 established the first-stage platform: request/trace observability, deterministic semantic normalization, entity retrieval, server-scoped READ Tools, confirmation-bound Mutation Runtime, scoped RAG ingestion/QA, bounded Working Memory, and Golden/Hard Eval release gates. M9 added the safe raster-image input boundary.

## M10 complex Agent Loop

M10 adds a bounded orchestration layer for multi-step tasks:

```text
Plan -> Act -> Verify -> Replan
```

The loop is intentionally an orchestrator, not a new authority boundary. It receives the authenticated `RequestContext`, a versioned Tool catalog, a metered Tool executor, a Planner, and a Verifier. It never receives database credentials and it does not own a business-data write path.

Key rules:

- every run has hard limits for steps, Tool calls, total tokens, cost, total duration, and per-operation duration;
- Planner, Verifier, and model-backed Tools must report token/cost usage; incomplete Tool accounting terminates as `USAGE_ACCOUNTING_INCOMPLETE` rather than pretending the budget is still trustworthy;
- model calls are not started when their Token or cost budget has already been exhausted; post-call overshoot terminates before any later action;
- every Planner/Verifier/Tool operation receives an `AbortSignal` and is bounded by the smaller of the remaining run duration, configured operation timeout, and Tool timeout;
- there is no automatic Tool retry. A normal metered `ok=false` ToolResult may be inspected by the Verifier and explicitly replanned, while an executor exception fails closed because usage accounting may be incomplete;
- Tool invocations always receive the server-authenticated `RequestContext`; Planner output cannot replace it;
- for Tools whose `dataScopeRule` declares `SERVER_REQUEST_CONTEXT`, top-level user/tenant/company/project args are rejected if they conflict with the server scope and stripped even when they match;
- Tool outputs are marked `UNTRUSTED_DATA`; result data and replan feedback are bounded before they are fed back into later model context;
- `requiresConfirmation=true` and all `CRITICAL` Tools are blocked inside the autonomous loop;
- CREATE/UPDATE/DELETE Tools are additionally blocked unless they are explicitly dry-run/prepare operations (`supportsDryRun=true`), so a misconfigured direct-write Tool cannot become autonomous merely by lowering its risk flag;
- the existing `prepare_create`, `prepare_update`, and `prepare_delete` path can participate in planning because it only creates a proposal/diff;
- `commit_mutation` cannot execute inside M10. The Loop terminates with `CONFIRMATION_REQUIRED`, and trusted UI confirmation + Approval Token + Mutation Runtime remain the only commit path;
- planner/verifier decisions are runtime-validated and malformed model output fails closed;
- Trace hooks cover loop start, Plan, Act, Verify, Replan, and every termination, without dumping raw Tool output into trace events;
- `ToolRegistryAgentLoopCatalog` adapts the existing versioned `ToolRegistry` directly into the M10 catalog contract.

`config/agent-loop/loop-v1.json` versions the first limits/safety policy. `evals/industry-agent/agent-loop/m10-cases.json` contains 24 M10 Golden/Hard cases covering success, replanning, every budget/timeout boundary, Tool failures, scope injection, confirmation, mutation dry-run boundaries, untrusted Tool output, usage accounting, Trace, and phase boundaries.

## M9 image input

The M9 image pipeline remains available under `src/multimodal/image-input`. It validates image signatures, produces Observation JSON, resolves entities in server scope, and can reach only the existing Mutation **prepare** tools; confirmation and commit remain outside the image pipeline.

## Phase 11 release gate

The first-stage release-gate harness remains available under `src/eval`. It materializes the 1,030-case `phase11-golden-v1` corpus and requires real offline observations before a baseline or component promotion can pass. The committed corpus/thresholds are not evidence that the runtime already meets production release targets.

## Database rule

M10 adds no MySQL schema and executes no existing migration, DDL, or DML. The Agent Loop itself creates no MySQL, object-storage, OpenSearch, embedding, reranker, or LLM network connection; these capabilities remain application-provided ports. Business writes remain isolated to the existing Mutation Runtime after explicit user confirmation.

## Phase boundary

M10 implements only the bounded complex Agent Loop. M11 Report and M12 read-only SQL/Python Sandbox are not implemented here.

## Temporary workspace registration

The package manifest is present, but the root workspace list temporarily excludes this package so the existing checked-in `package-lock.json` remains valid without hand-editing generated lock data. Root build, type-check, and test commands explicitly cover the package. When a lockfile can be regenerated with npm, remove the exclusion and register the package as a normal workspace.
