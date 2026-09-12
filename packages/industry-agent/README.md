# @earendil-works/pi-industry-agent

Industry-specific extension layer built on top of Pi Agent Core.

Phases 0–11 established the first-stage platform. M9 added safe image input and M10 added the bounded `Plan -> Act -> Verify -> Replan` orchestration loop.

## M12 read-only SQL/Python Sandbox

M12 adds the final second-stage analysis boundary:

```text
Goal
 -> Existing Tools sufficient?
 -> NO
 -> read-only Schema Discovery
 -> Generate SQL/Python
 -> Static Validation
 -> isolated Sandbox Execute
 -> read-only Data Access Broker
 -> Verify Outputs
 -> M11 Report Builder
```

The Sandbox is deliberately capability-limited. It never receives production database credentials, a raw database client, arbitrary SQL execution, filesystem, network, process spawning, environment secrets, or business-data write capability.

Key rules:

- existing safe READ/Search/Calculate Tools are preferred before Sandbox work;
- `sandbox.analyze`, `sandbox.schema.read`, and `sandbox.data.read` are checked independently;
- schema discovery is read-only and returns exact tenant/company/project scope plus an explicit sandbox-readable table/column allowlist;
- SQL accepts only bounded `SELECT` or `WITH ... SELECT`, requires exactly one literal `LIMIT`, and rejects INSERT/UPDATE/DELETE/DDL, comments, multiple statements, wildcard selection, system schemas, SQL variables, file functions, and side-effectful/admin constructs;
- generated Python must expose `main(read)`, cannot import modules, open files, access URLs, spawn processes, execute dynamic code, inspect dunder/runtime globals, or use a dynamic query identifier;
- Python can request data only through `read("prevalidated-query-id")`; the Sandbox never sees SQL credentials or a database client;
- the host-side Data Access Broker receives authenticated `RequestContext`, reapplies server scope, revalidates SQL/schema allowlist, and enforces statement timeout and query-cost guard;
- Broker results must attest read-only, server-scope, SQL-policy, schema-allowlist, timeout, cost-guard and credential-isolation enforcement;
- Broker rows/payload, Sandbox CPU/memory/output, model Token/cost, total duration, and operation duration are bounded;
- the runtime must attest network/filesystem/process/import/dynamic-code isolation and the SHA-256 of the executed validated Python;
- Sandbox outputs must cite query IDs actually read; fabricated provenance is rejected;
- accepted analysis is converted through M11 Report, retaining authoritative Broker evidence and derived Python lineage;
- if analysis implies CREATE/UPDATE/DELETE, UPDATE/DELETE targets must come from authoritative Broker entity evidence. M12 can call only existing `prepare_*` tools and returns `MUTATION_CONFIRMATION_REQUIRED`; trusted UI confirmation, Approval Token and `commit_mutation` remain outside the Sandbox.

`config/sandbox/sandbox-v1.json` versions the M12 limits/security contract. `evals/industry-agent/sandbox/m12-cases.json` covers Tool-first routing, schema scope, SQL/Python validation, runtime isolation, Broker revalidation/attestation, output lineage, M11 bridging, Mutation prepare-only behavior, and the no-real-database-execution boundary.

## M11 Report

M11 adds a safe report-generation boundary for:

```text
Excel
PDF
Charts
Narrative Report
```

The Report layer consumes an **already authorized application snapshot**. It has no database query port and no business-data write capability.

The pipeline is:

```text
Authorized Result Snapshot
 -> report.generate permission
 -> exact tenant/company/project scope validation
 -> Dataset / Chart / Narrative schema validation
 -> evidence / citation lineage validation
 -> versioned format Renderer
 -> artifact safety validation
 -> checksum + lineage metadata
 -> report_preview UI action
```

Key rules:

- `report.generate` authorization runs before validation/rendering;
- Dataset and Evidence scope must exactly match the authenticated `RequestContext` tenant/company/project;
- every Dataset, Chart, and Narrative section must cite registered evidence;
- authoritative Tool evidence retains `sourceId/sourceVersion`; RAG evidence must retain `documentId/chunkId/page/section/sourceVersion`;
- derived evidence must name its parents, parent IDs must exist, and lineage cycles are rejected;
- Dataset rows may contain only declared columns. Undeclared fields are rejected so hidden business data cannot silently leak into exports;
- cell values are primitive typed values, and runtime validation enforces STRING/NUMBER/BOOLEAN/DATE/DATETIME column contracts;
- Chart specs reference a declared Dataset; numeric series must use NUMBER columns, and chart evidence must come from that Dataset;
- Narrative sections are evidence-bound and raw HTML is rejected;
- artifact evidence is computed by the server from the validated model. A Renderer must report exactly the expected `embeddedEvidenceIds`; it cannot substitute another lineage set;
- the renderer safety contract forbids formulas, external links, remote resources, executable content, raw HTML, and treating Tool/data text as trusted instructions;
- XLSX must have an OOXML ZIP signature and obvious macro/external-link parts are rejected; PDF must have a PDF signature and common JavaScript/Launch/URI actions are rejected; PNG/SVG signatures are checked and SVG active/external content is rejected;
- custom artifact file names cannot contain path separators/control characters and must match the renderer extension;
- per-artifact size, total artifact size, Dataset/row/column/chart/section counts, cell size, and renderer timeout are bounded;
- render operations receive `AbortSignal` and timeout failures are surfaced as `REPORT_RENDER_FAILED`;
- Trace covers AUTHORIZE, VALIDATE, per-format RENDER, and COMPLETE while never logging raw report bytes;
- `report_preview` contains only artifact metadata/checksums/lineage, not raw file content.

`config/report/report-v1.json` versions the M11 format, limit, and renderer safety contract. `evals/industry-agent/report/m11-cases.json` contains M11 Golden/Hard cases covering all four formats, scope/lineage, RAG citation preservation, hidden-field leakage, active file content, size/timeout, Trace, preview, and phase boundaries.

Excel/PDF/Chart/Narrative encoding is exposed through the versioned `ReportRenderer` port so the application can use its approved renderer engine. M11 tests use deterministic renderer adapters and do not claim real Microsoft Excel/Adobe PDF interoperability testing.

## M10 Agent Loop

The M10 Agent Loop remains available under `src/agent-loop`. It enforces bounded steps/Tools/tokens/cost/time, server-owned scope, untrusted Tool output, complete usage accounting, and exits to trusted UI for confirmation-required operations. It still cannot execute `commit_mutation` autonomously.

## M9 image input

The M9 image pipeline remains available under `src/multimodal/image-input`; it can reach only existing Mutation **prepare** operations, never approval or commit.

## Phase 11 release gate

The first-stage release-gate harness remains under `src/eval`. The committed Golden corpus and thresholds are not evidence that production runtime benchmarks already pass; real offline observations are still required.

## Database rule

M12 adds no MySQL schema and executes no migration, DDL, DML, or query. No production database credential enters the Sandbox. Any future production `SandboxDataAccessBroker` adapter must remain server-side and read-only.

## Phase boundary

M12 completes the planned Image / Agent Loop / Report / read-only SQL-Python Sandbox capability set. Production Broker/Sandbox/Renderer adapters and real-environment qualification remain separate deployment work.

## Temporary workspace registration

The package manifest is present, but the root workspace list temporarily excludes this package so the existing checked-in `package-lock.json` remains valid without hand-editing generated lock data. Root build, type-check, and test commands explicitly cover the package. When a lockfile can be regenerated with npm, remove the exclusion and register the package as a normal workspace.
