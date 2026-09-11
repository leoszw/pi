export interface RepositoryRecord {
	id: string;
}

export interface Repository<TRecord extends RepositoryRecord> {
	getById(id: string): Promise<TRecord | undefined>;
	list(): Promise<readonly TRecord[]>;
	upsert(record: TRecord): Promise<void>;
}
