# @earendil-works/pi-industry-agent

Industry-specific extension layer built on top of Pi Agent Core.

Phases 0–11 established the first-stage platform: request/trace observability, deterministic semantic normalization, entity retrieval, server-scoped READ Tools, confirmation-bound Mutation Runtime, scoped RAG ingestion/QA, bounded Working Memory, and Golden/Hard Eval release gates.

## M9 image input

M9 adds the second-stage raster-image input boundary only. Complex autonomous Agent Loop, report generation, and read-only SQL/Python Sandbox remain later work.

The safe pipeline is:

```text
Image
 -> permission
 -> signature/file validation
 -> tenant-scoped Asset Storage
 -> Multimodal Understanding
 -> validated Observation JSON
 -> scoped Entity Resolution
 -> Action Proposal
 -> Missing Fields / Entity Review UI when required
 -> existing Mutation Prepare
 -> existing Diff / Confirmation / Approval / Commit
```

Key rules:

- `ImageInputService` never owns database write capability and exposes no approval or commit method;
- permission `multimodal.process` is checked before object storage or model processing;
- v1 accepts only signature-verified JPEG/PNG/WebP and rejects MIME spoofing and oversized inputs;
- binary storage keys are tenant-scoped by SHA-256 checksum (`multimodal/{tenant}/{checksum}`);
- the multimodal provider may emit observations only; observation IDs, confidence, page/bounding-box shape, and provider/model version are validated before use;
- entity IDs used for UPDATE/DELETE must come from the server-side `ImageEntityResolver`, must match the exact request tenant/company/project scope, and must have image-observation evidence;
- ambiguous entity matches return `entity_picker` UI and do not invoke mutation prepare;
- the action proposer cannot override request scope, cannot invent UPDATE/DELETE targets, and every proposed mutation must cite at least one validated observation;
- action entity type must match the resolved target entity type;
- server-side `ImageActionPolicy` controls allowed operations, allowed/required fields, confidence threshold, and maximum target count;
- missing required fields return a `form` UI, while low-confidence complete proposals return `editable_form`; neither path invokes mutation prepare;
- DELETE can never be inferred from image content alone; it requires an explicit user-requested DELETE operation and still only reaches `prepare_delete`;
- complete CREATE/UPDATE/explicit-DELETE actions are converted by `MutationToolImagePreparer` to the existing `prepare_create`, `prepare_update`, or `prepare_delete` Tool at version `1.0.0`;
- the existing Mutation Runtime remains the only path to Diff, trusted UI confirmation, Approval Token, `commit_mutation`, verification, audit, and database writes.

`config/multimodal/image-input-v1.json` versions the first M9 MIME/size/pipeline/security policy. `evals/industry-agent/multimodal/m9-cases.json` covers authorization-before-storage, MIME spoofing, scope leakage, ambiguity, invented targets, missing fields, low confidence, explicit delete, evidence integrity, no-action behavior, and the no-direct-commit boundary.

## Phase 11 release gate

The first-stage release-gate harness remains available under `src/eval`. It deterministically materializes the 1,030-case `phase11-golden-v1` corpus and requires real offline observations before a baseline or component promotion can pass. The committed corpus/thresholds are not fabricated evidence that the current runtime already meets production release targets.

## Database rule

M9 adds no MySQL schema and executes no existing migration, DDL, or DML. It creates no real object-storage or multimodal-model connection by itself; those are application-provided ports. Business writes remain isolated to the existing Mutation Runtime after explicit user confirmation.

## Temporary workspace registration

The package manifest is present, but the root workspace list temporarily excludes this package so the existing checked-in `package-lock.json` remains valid without hand-editing generated lock data. Root build, type-check, and test commands explicitly cover the package. When a lockfile can be regenerated with npm, remove the exclusion and register the package as a normal workspace.
