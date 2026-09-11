import type { Repository, RepositoryRecord } from "./repository.ts";

export class InMemoryRepository<TRecord extends RepositoryRecord> implements Repository<TRecord> {
	private readonly records = new Map<string, TRecord>();

	constructor(seed: readonly TRecord[] = []) {
		for (const record of seed) {
			this.records.set(record.id, record);
		}
	}

	async getById(id: string): Promise<TRecord | undefined> {
		return this.records.get(id);
	}

	async list(): Promise<readonly TRecord[]> {
		return Array.from(this.records.values());
	}

	async upsert(record: TRecord): Promise<void> {
		this.records.set(record.id, record);
	}
}
