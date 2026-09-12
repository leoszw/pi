import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import { assertSameWorkingMemoryScope } from "./policy.ts";
import type { WorkingMemoryRepository, WorkingMemoryScope, WorkingMemoryState } from "./types.ts";

function key(scope: WorkingMemoryScope): string {
	return JSON.stringify([scope.tenantId, scope.userId, scope.companyId, scope.conversationId]);
}

function clone<T>(value: T): T { return structuredClone(value); }

export class InMemoryWorkingMemoryRepository implements WorkingMemoryRepository {
	private readonly states = new Map<string, WorkingMemoryState>();

	async get(scope: WorkingMemoryScope): Promise<WorkingMemoryState | undefined> {
		const state = this.states.get(key(scope));
		if (!state) return undefined;
		assertSameWorkingMemoryScope(scope, state.scope);
		return clone(state);
	}

	async save(state: WorkingMemoryState, expectedRevision: number | null): Promise<void> {
		const stateKey = key(state.scope);
		const current = this.states.get(stateKey);
		if (expectedRevision === null) {
			if (current) throw new IndustryAgentError("MEMORY_VERSION_CONFLICT", "Working memory was created concurrently");
		} else if (!current || current.revision !== expectedRevision) {
			throw new IndustryAgentError("MEMORY_VERSION_CONFLICT", "Working memory revision changed concurrently");
		}
		this.states.set(stateKey, clone(state));
	}
}
