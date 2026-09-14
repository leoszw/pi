import type { ImageActionPolicy, ImageActionPolicyRegistry } from "./types.ts";

export class StaticImageActionPolicyRegistry implements ImageActionPolicyRegistry {
	private readonly policies: ReadonlyMap<string, ImageActionPolicy>;
	constructor(policies: readonly ImageActionPolicy[]) {
		this.policies = new Map(policies.map((policy) => [policy.entityType, policy]));
	}
	get(entityType: string): ImageActionPolicy | undefined {
		return this.policies.get(entityType);
	}
}
