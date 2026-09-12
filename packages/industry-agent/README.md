# @earendil-works/pi-industry-agent

Industry-specific extension layer built on top of Pi Agent Core.

Phases 0–3 established request/trace contracts, deterministic semantic normalization, canonical entity scope/hierarchy, and static MySQL retrieval metadata. Phase 4 added engineering-position Hybrid Retrieval. Phase 5 added BOQ Hybrid Retrieval. Phase 6 added server-scoped READ Tools. Phase 7 added the confirmation-bound Mutation Runtime and UI Action safety boundary. Phase 8 added scoped RAG ingestion. Phase 9 added ACL-prefiltered RAG QA with evidence-only citations.

Phase 10 adds bounded Working Memory for task continuity. It is deliberately **not** open-ended long-term personality memory.

- `WorkingMemoryService` persists only structured task state: resolved entity IDs, last result set, active filters, active project, selected rows, and recent Tool results;
- every persisted slot records its source (`USER_EXPLICIT`, `TOOL_RESULT`, `SERVER_CONTEXT`, or deterministic `SYSTEM_DERIVED`), source trace/request, project scope, and capture time;
- `LLM_INFERENCE` is rejected at the persistence boundary with `MEMORY_SOURCE_NOT_PERSISTABLE`; an unconfirmed model guess cannot become remembered fact;
- state is scoped by tenant + authenticated user + company + conversation; project-bound slots additionally carry their capture project;
- an explicit `RequestContext.projectId` is authoritative and memory cannot override it; project switches hide and then clear old project-bound result/filter/selection/Tool state;
- server-bound project context is automatically remembered as the active project, so a later request in the same conversation can omit project and still resolve task-local references safely;
- the deterministic reference resolver supports `刚才那些`, `这些`, `第二个`, `只看未完成的`, `继续`, and `把这些导出来`;
- `这些` prefers explicitly selected rows, while `刚才那些` refers to the previous result set; ordinal references are one-based over the previous result set;
- `只看未完成的` returns an explicit semantic `UNFINISHED` filter but does not silently persist it; downstream business tooling remains responsible for mapping that semantic status to authoritative domain statuses;
- `继续` resumes from the newest project-matching Tool result/continuation token, without pretending generic result refs are entity IDs;
- selected rows must belong to the current result set, large result sets are bounded, duplicate row/entity IDs are collapsed, recent Tool results are bounded, and the whole snapshot has a configured size limit;
- snapshots have a default 24-hour TTL. Expired state is treated as empty task context while preserving repository revision semantics for a safe next write;
- optimistic repository revisions prevent concurrent writers from silently overwriting each other;
- `mergeWorkingMemorySemanticContext()` bridges resolved task-local entities/project into the existing `SemanticContext` without modifying Pi Agent Core or changing the Agent Gateway runtime contract;
- Trace hooks cover load/save/resolve/expiry/scope filtering so memory behavior remains inspectable by request and conversation.

## Phase 10 persistence boundary

Phase 10 reuses the Phase 0 `conversation`, `memory_item`, and `memory_link` schema from `db/mysql/migrations/002_conversation_memory.sql`; it adds no new migration. `toWorkingMemorySnapshotRecord()` maps a state snapshot to `memory_type = WORKING_MEMORY_V1`, `content_json`, `source_trace_id`, and `valid_until`.

A production MySQL adapter should store/retrieve these snapshots through the `WorkingMemoryRepository` port. This phase does not create a MySQL connection and does not execute `002_conversation_memory.sql`, DDL, or DML. Tests use only the in-memory repository.

## Phase boundary

Working Memory is conversation/task continuity only. Phase 10 does not persist open-ended user personality, preferences, inferred biography, or other autonomous long-term facts. It also does not implement Phase 11 release gates beyond adding Phase 10 eval cases alongside the implementation.

## Temporary workspace registration

The package manifest is present, but the root workspace list temporarily excludes this package so the existing checked-in `package-lock.json` remains valid without hand-editing generated lock data. Root build, type-check, and test commands explicitly cover the package. When a lockfile can be regenerated with npm, remove the exclusion and register the package as a normal workspace.
