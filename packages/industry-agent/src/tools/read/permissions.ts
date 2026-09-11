import type { ReadToolPermissionInput, ReadToolPermissionService } from "./types.ts";

export interface ReadPermissionGrant {
	userId: string;
	tenantId: string;
	companyId: string;
	projectId: string;
	permissions: readonly string[];
}

export class InMemoryReadToolPermissionService implements ReadToolPermissionService {
	private readonly grants: readonly ReadPermissionGrant[];
	constructor(grants: readonly ReadPermissionGrant[]) { this.grants = grants.map((grant) => ({ ...grant, permissions: [...grant.permissions] })); }
	async authorize(input: ReadToolPermissionInput): Promise<boolean> {
		return this.grants.some((grant) => grant.userId === input.userId && grant.tenantId === input.tenantId && grant.companyId === input.companyId && grant.projectId === input.projectId && grant.permissions.includes(input.permission));
	}
}
