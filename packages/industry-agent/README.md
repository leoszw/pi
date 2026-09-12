# @earendil-works/pi-industry-agent

Industry-specific extension layer built on top of Pi Agent Core.

Phases 0–3 established request/trace contracts, deterministic semantic normalization, canonical entity scope/hierarchy, and static MySQL retrieval metadata. Phase 4 added engineering-position Hybrid Retrieval. Phase 5 added BOQ Hybrid Retrieval. Phase 6 added server-scoped READ Tools with permission re-checking and authoritative fact evidence.

Phase 7 adds the Mutation Runtime + UI Action safety boundary:

- Agent-visible tools are limited to `prepare_create`, `prepare_update`, `prepare_delete`, and `commit_mutation`;
- `approve()` is **not** registered as an Agent Tool and is intended only for a trusted UI confirmation event;
- prepare operations load the current record/version when applicable, re-check server-side scope and entity permission, run business validation, compute a canonical SHA-256 proposal digest, generate a human-readable diff, and persist a `PREPARED` proposal without writing business data;
- update/delete support batches with a configurable maximum; the proposal carries `affectedCount`, up to five representative samples, and a batch `recordVersion` digest covering every `entityId@version` pair;
- first-version UI helpers cover `entity_picker`, `form`, `editable_form`, `table`, `diff`, and `mutation_confirmation`;
- trusted UI approval issues a short-lived HMAC-signed one-time token bound to tenant/user/company/project, operation ID, operation digest, record version, nonce, and expiry;
- `commit_mutation` re-checks generic commit permission plus entity-operation permission, recomputes the stored proposal digest, validates token scope/digest/version/expiry, reruns business validation, and then enters the only write gateway;
- approval nonce consumption, optimistic-lock checks, CREATE/UPDATE/soft-DELETE writes, and write-after-read verification occur inside one `MutationWriteGateway.transaction()` boundary;
- a changed version or changed `before` snapshot fails closed; a successful token cannot be replayed; any transactional failure marks the proposal `FAILED` and requires a new prepare/approval cycle;
- Phase 7 DELETE is soft-delete only; the generic write session deliberately exposes no physical-delete method;
- mutation audit events distinguish `PREPARED`, `APPROVED`, `REJECTED`, `COMMIT_STARTED`, `COMMITTED`, and `FAILED`; mutation Trace hooks record the same lifecycle;
- in-memory policy, permission, proposal, approval, audit, trace, and transactional business-record implementations support tests without a database.

## Write-permission boundary

`ReadToolRuntime`, Agent runtime, retrieval code, and sandbox code receive no `MutationWriteGateway`. The write gateway is a dependency of `MutationRuntime` only. Applications should bind the real MySQL write credential only in that runtime/process and keep READ credentials physically separate.

## Approval-token storage

The signed approval token is returned only to the trusted UI flow. The generated SQL stores approval metadata and a hash of the nonce, not the raw HMAC token. A real adapter should hash the presented nonce before lookup/consumption and consume it in the same transaction as the business write.

## Database rule

Phase 7 generates and statically reviews:

- `db/mysql/migrations/005_mutation.sql` and rollback;
- `db/mysql/migrations/007_audit_policy.sql` and rollback.

These files are **static artifacts only**. No migration, DDL, DML, MySQL connection, business-table write, OpenSearch request, embedding call, or reranker call is executed by repository setup or by the Phase 7 tests. The SQL defines mutation proposal/target/approval metadata and immutable audit storage; it intentionally does not guess or modify unknown business tables.

## Temporary workspace registration

The package manifest is present, but the root workspace list temporarily excludes this package so the existing checked-in `package-lock.json` remains valid without hand-editing generated lock data. Root build, type-check, and test commands explicitly cover the package. When a lockfile can be regenerated with npm, remove the exclusion and register the package as a normal workspace.
