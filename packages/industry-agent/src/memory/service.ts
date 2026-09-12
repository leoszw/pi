import type { JsonObject, RequestContext, ResolvedEntity } from "../contracts/index.ts";
import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import { captureProjectId, assertPersistableSource, workingMemoryScope } from "./policy.ts";
import { resolveWorkingMemoryReference } from "./resolver.ts";
import type {
	CaptureToolResultInput, WorkingMemoryCaptureSource, WorkingMemoryContextView, WorkingMemoryLimits, WorkingMemoryRow,
	WorkingMemoryRuntimeOptions, WorkingMemoryState, WorkingMemoryToolResult, WorkingMemoryValue,
} from "./types.ts";

const DEFAULT_LIMITS: WorkingMemoryLimits = { ttlMs: 24 * 60 * 60 * 1000, maxResolvedEntities: 100, maxResultRows: 200, maxSelectedRows: 200, maxRecentToolResults: 10, maxSnapshotChars: 250_000 };

function nonEmpty(value: string, name: string): string {
	const trimmed = value.trim();
	if (!trimmed) throw new IndustryAgentError("MEMORY_INVALID_UPDATE", `${name} must not be empty`);
	return trimmed;
}

function rowIds(rows: readonly WorkingMemoryRow[]): Set<string> { return new Set(rows.map((row) => row.rowId)); }

function uniqueRows(rows: readonly WorkingMemoryRow[], max: number): readonly WorkingMemoryRow[] {
	const seen = new Set<string>(); const output: WorkingMemoryRow[] = [];
	for (const row of rows) {
		const id = nonEmpty(row.rowId, "rowId");
		if (seen.has(id)) continue;
		seen.add(id); output.push({ ...row, rowId: id });
		if (output.length >= max) break;
	}
	return output;
}

function uniqueEntities(entities: readonly ResolvedEntity[], max: number): readonly ResolvedEntity[] {
	const seen = new Set<string>(); const output: ResolvedEntity[] = [];
	for (const entity of entities) {
		const entityId = nonEmpty(entity.entityId, "entityId"); const entityType = nonEmpty(entity.entityType, "entityType");
		const key = `${entityType}\u0000${entityId}`; if (seen.has(key)) continue;
		seen.add(key); output.push({ ...entity, entityId, entityType });
		if (output.length >= max) break;
	}
	return output;
}

function withoutSelectedRows(state: WorkingMemoryState): WorkingMemoryState {
	const { selectedRows: _selectedRows, ...rest } = state;
	return rest;
}

function withoutProjectBoundSlots(state: WorkingMemoryState): WorkingMemoryState {
	const { resolvedEntities: _resolvedEntities, lastResultSet: _lastResultSet, activeFilters: _activeFilters, selectedRows: _selectedRows, ...rest } = state;
	return { ...rest, recentToolResults: [] };
}

export class WorkingMemoryService {
	private readonly options: WorkingMemoryRuntimeOptions;
	private readonly limits: WorkingMemoryLimits;
	private readonly now: () => Date;
	constructor(options: WorkingMemoryRuntimeOptions) {
		this.options = options;
		this.limits = { ...DEFAULT_LIMITS, ...(options.limits ?? {}) };
		if (Object.values(this.limits).some((value) => !Number.isInteger(value) || value <= 0)) throw new IndustryAgentError("MEMORY_INVALID_UPDATE", "Working memory limits must be positive integers");
		this.now = options.now ?? (() => new Date());
	}

	async view(context: RequestContext): Promise<WorkingMemoryContextView> {
		const state = await this.load(context);
		const rememberedProjectId = state.activeProject?.value ?? state.lastResultSet?.projectId ?? state.selectedRows?.projectId ?? state.resolvedEntities?.projectId ?? null;
		const effectiveProjectId = context.projectId ?? rememberedProjectId;
		const resolvedEntities = this.visibleValue(state.resolvedEntities, effectiveProjectId) ?? [];
		const lastResultSet = this.visibleValue(state.lastResultSet, effectiveProjectId) ?? [];
		const activeFilters = this.visibleValue(state.activeFilters, effectiveProjectId) ?? {};
		const selectedRows = this.visibleValue(state.selectedRows, effectiveProjectId) ?? [];
		const recentToolResults = state.recentToolResults.filter((item) => item.projectId === effectiveProjectId);
		const filtered = state.lastResultSet !== undefined && lastResultSet.length === 0 && state.lastResultSet.value.length > 0;
		if (filtered) this.trace(context, "SCOPE_FILTERED", { effectiveProjectId });
		return { state, effectiveProjectId, resolvedEntities, lastResultSet, activeFilters, selectedRows, recentToolResults };
	}

	async resolve(context: RequestContext, text: string) {
		const resolution = resolveWorkingMemoryReference(text, await this.view(context));
		this.trace(context, "RESOLVE", { kind: resolution.kind, requiresClarification: resolution.requiresClarification });
		return resolution;
	}

	async captureResolvedEntities(context: RequestContext, entities: readonly ResolvedEntity[], source: WorkingMemoryCaptureSource): Promise<WorkingMemoryState> {
		const persistentSource = assertPersistableSource(source);
		const clean = uniqueEntities(entities, this.limits.maxResolvedEntities);
		return this.update(context, (state, projectId, capturedAt) => ({ ...state, resolvedEntities: this.value(clean, persistentSource, context, projectId, capturedAt) }));
	}

	async captureResultSet(context: RequestContext, rows: readonly WorkingMemoryRow[], source: "TOOL_RESULT"): Promise<WorkingMemoryState> {
		const clean = uniqueRows(rows, this.limits.maxResultRows);
		return this.update(context, (state, projectId, capturedAt) => ({
			...withoutSelectedRows(state),
			lastResultSet: this.value(clean, source, context, projectId, capturedAt),
		}));
	}

	async setActiveFilters(context: RequestContext, filters: JsonObject, source: WorkingMemoryCaptureSource): Promise<WorkingMemoryState> {
		const persistentSource = assertPersistableSource(source);
		return this.update(context, (state, projectId, capturedAt) => ({ ...state, activeFilters: this.value(structuredClone(filters), persistentSource, context, projectId, capturedAt) }));
	}

	async setActiveProject(context: RequestContext, projectId: string, source: "USER_EXPLICIT" | "SERVER_CONTEXT"): Promise<WorkingMemoryState> {
		const value = nonEmpty(projectId, "projectId");
		if (context.projectId && context.projectId !== value) throw new IndustryAgentError("MEMORY_SCOPE_MISMATCH", "Active project cannot override the server-bound RequestContext project");
		return this.update(context, (state, _projectId, capturedAt) => {
			const base = state.activeProject?.value && state.activeProject.value !== value ? withoutProjectBoundSlots(state) : state;
			return { ...base, activeProject: this.value(value, source, context, value, capturedAt) };
		});
	}

	async setSelectedRows(context: RequestContext, rows: readonly WorkingMemoryRow[], source: "USER_EXPLICIT" | "SYSTEM_DERIVED"): Promise<WorkingMemoryState> {
		return this.update(context, (state, projectId, capturedAt) => {
			const current = this.visibleValue(state.lastResultSet, projectId) ?? [];
			const allowed = rowIds(current);
			const selected = uniqueRows(rows, this.limits.maxSelectedRows).map((row) => {
				if (!allowed.has(row.rowId)) throw new IndustryAgentError("MEMORY_INVALID_UPDATE", `Selected row is not in the current result set: ${row.rowId}`);
				return row;
			});
			return { ...state, selectedRows: this.value(selected, source, context, projectId, capturedAt) };
		});
	}

	async recordToolResult(context: RequestContext, input: CaptureToolResultInput): Promise<WorkingMemoryState> {
		return this.update(context, (state, projectId, capturedAt) => {
			const item: WorkingMemoryToolResult = {
				toolCallId: nonEmpty(input.toolCallId, "toolCallId"), toolName: nonEmpty(input.toolName, "toolName"), resultRefs: [...new Set(input.resultRefs)].slice(0, this.limits.maxResultRows),
				...(input.summary ? { summary: input.summary } : {}), ...(input.continuationToken ? { continuationToken: input.continuationToken } : {}),
				projectId, sourceTraceId: context.traceId, sourceRequestId: context.requestId, capturedAt, source: "TOOL_RESULT",
			};
			return { ...state, recentToolResults: [item, ...state.recentToolResults].slice(0, this.limits.maxRecentToolResults) };
		});
	}

	private async update(context: RequestContext, mutate: (state: WorkingMemoryState, projectId: string | null, capturedAt: string) => WorkingMemoryState): Promise<WorkingMemoryState> {
		const current = await this.load(context);
		const expectedRevision = current.revision === 0 ? null : current.revision;
		const now = this.now(); const capturedAt = now.toISOString();
		let base = current;
		if (context.projectId && current.activeProject?.value !== context.projectId) {
			base = current.activeProject?.value ? withoutProjectBoundSlots(current) : current;
			base = { ...base, activeProject: this.value(context.projectId, "SERVER_CONTEXT", context, context.projectId, capturedAt) };
		}
		const projectId = captureProjectId(context, base.activeProject?.value ?? null);
		const mutated = mutate(base, projectId, capturedAt);
		const next: WorkingMemoryState = {
			...mutated,
			revision: current.revision + 1,
			lastUpdatedTraceId: context.traceId,
			updatedAt: capturedAt,
			expiresAt: new Date(now.getTime() + this.limits.ttlMs).toISOString(),
		};
		if (JSON.stringify(next).length > this.limits.maxSnapshotChars) throw new IndustryAgentError("MEMORY_INVALID_UPDATE", "Working memory snapshot exceeds configured size limit");
		await this.options.repository.save(next, expectedRevision);
		this.trace(context, "SAVE", { revision: next.revision, projectId });
		return next;
	}

	private async load(context: RequestContext): Promise<WorkingMemoryState> {
		const scope = workingMemoryScope(context);
		const found = await this.options.repository.get(scope);
		if (found && Date.parse(found.expiresAt) > this.now().getTime()) { this.trace(context, "LOAD", { revision: found.revision }); return found; }
		if (found) this.trace(context, "EXPIRED", { revision: found.revision });
		const now = this.now().toISOString();
		return { scope, revision: found?.revision ?? 0, recentToolResults: [], lastUpdatedTraceId: context.traceId, createdAt: found?.createdAt ?? now, updatedAt: now, expiresAt: new Date(this.now().getTime() + this.limits.ttlMs).toISOString() };
	}

	private visibleValue<T>(slot: WorkingMemoryValue<T> | undefined, projectId: string | null): T | undefined {
		return slot?.projectId === projectId ? slot.value : undefined;
	}

	private value<T>(value: T, source: WorkingMemoryValue<T>["source"], context: RequestContext, projectId: string | null, capturedAt: string): WorkingMemoryValue<T> {
		return { value: structuredClone(value), source, projectId, sourceTraceId: context.traceId, sourceRequestId: context.requestId, capturedAt };
	}

	private trace(context: RequestContext, event: Parameters<NonNullable<WorkingMemoryRuntimeOptions["trace"]>["record"]>[0]["event"], details?: JsonObject): void {
		this.options.trace?.record({ traceId: context.traceId, requestId: context.requestId, conversationId: context.conversationId, event, ...(details ? { details } : {}) });
	}
}
