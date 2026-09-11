import type { BoqQueryCatalog } from "../../retrieval/boq/types.ts";
import type {
	BoqCatalogProvider,
	BoqItemReadRecord,
	EngineeringPositionReadRecord,
	ProjectDocumentRecord,
	QuantityEntityType,
	QuantityField,
	QuantityReadRecord,
	ReadDataRepository,
	ReadToolScope,
} from "./types.ts";

export interface ScopedReadSeed<T> { scope: ReadToolScope; value: T; }

function sameScope(left: ReadToolScope, right: ReadToolScope): boolean {
	return left.userId === right.userId && left.tenantId === right.tenantId && left.companyId === right.companyId && left.projectId === right.projectId;
}

export class InMemoryReadDataRepository implements ReadDataRepository {
	private readonly engineering: readonly ScopedReadSeed<EngineeringPositionReadRecord>[];
	private readonly boq: readonly ScopedReadSeed<BoqItemReadRecord>[];
	private readonly quantities: readonly ScopedReadSeed<QuantityReadRecord>[];
	private readonly documents: readonly ScopedReadSeed<ProjectDocumentRecord>[];
	constructor(seed: {
		engineering?: readonly ScopedReadSeed<EngineeringPositionReadRecord>[];
		boq?: readonly ScopedReadSeed<BoqItemReadRecord>[];
		quantities?: readonly ScopedReadSeed<QuantityReadRecord>[];
		documents?: readonly ScopedReadSeed<ProjectDocumentRecord>[];
	} = {}) {
		this.engineering = seed.engineering ?? [];
		this.boq = seed.boq ?? [];
		this.quantities = seed.quantities ?? [];
		this.documents = seed.documents ?? [];
	}
	async getEngineeringPosition(engineeringId: string, scope: ReadToolScope): Promise<EngineeringPositionReadRecord | undefined> {
		return this.engineering.find((item) => sameScope(item.scope, scope) && item.value.engineeringId === engineeringId)?.value;
	}
	async getBoqItem(ledgerId: string, scope: ReadToolScope): Promise<BoqItemReadRecord | undefined> {
		return this.boq.find((item) => sameScope(item.scope, scope) && item.value.ledgerId === ledgerId)?.value;
	}
	async queryQuantity(entityType: QuantityEntityType, entityId: string, fields: readonly QuantityField[], scope: ReadToolScope): Promise<QuantityReadRecord | undefined> {
		const row = this.quantities.find((item) => sameScope(item.scope, scope) && item.value.entityType === entityType && item.value.entityId === entityId)?.value;
		if (!row) return undefined;
		const values = Object.fromEntries(fields.filter((field) => field in row.values).map((field) => [field, row.values[field]]));
		return { ...row, values };
	}
	async listProjectDocuments(scope: ReadToolScope, filter: { query?: string; documentType?: string; limit: number }): Promise<readonly ProjectDocumentRecord[]> {
		const query = filter.query?.toLocaleLowerCase();
		return this.documents
			.filter((item) => sameScope(item.scope, scope))
			.map((item) => item.value)
			.filter((item) => !filter.documentType || item.documentType === filter.documentType)
			.filter((item) => !query || item.name.toLocaleLowerCase().includes(query))
			.slice(0, filter.limit);
	}
}

export class StaticBoqCatalogProvider implements BoqCatalogProvider {
	private readonly catalogs: readonly { scope: ReadToolScope; catalog: BoqQueryCatalog }[];
	constructor(catalogs: readonly { scope: ReadToolScope; catalog: BoqQueryCatalog }[]) { this.catalogs = catalogs; }
	async getCatalog(scope: ReadToolScope): Promise<BoqQueryCatalog> {
		return this.catalogs.find((item) => sameScope(item.scope, scope))?.catalog ?? { knownCodes: new Set(), knownAncestorCodes: new Set() };
	}
}
