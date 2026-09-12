import { createHash } from "node:crypto";
import type { MutationProposalRecord, MutationTargetProposal } from "./types.ts";

function canonicalize(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value !== null && typeof value === "object") {
		const entries = Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, item]) => [key, canonicalize(item)] as const);
		return Object.fromEntries(entries);
	}
	return value;
}

export function stableJson(value: unknown): string {
	return JSON.stringify(canonicalize(value));
}

export function sha256Hex(value: unknown): string {
	return createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
}

export function computeBatchRecordVersion(targets: readonly MutationTargetProposal[]): string {
	if (targets.length === 1) return targets[0]!.recordVersion;
	const parts = targets.map((target) => `${target.entityId ?? "NEW"}@${target.recordVersion}`).sort();
	return `batch:${sha256Hex(parts)}`;
}

export function computeMutationDigest(input: Omit<MutationProposalRecord, "digest" | "status" | "createdAt" | "approvedAt" | "committedAt" | "resultEntityIds">): string {
	return sha256Hex({
		operationId: input.operationId,
		traceId: input.traceId,
		requestId: input.requestId,
		operation: input.operation,
		entityType: input.entityType,
		scope: input.scope,
		targets: input.targets,
		recordVersion: input.recordVersion,
		affectedCount: input.affectedCount,
		representativeSamples: input.representativeSamples,
		diff: input.diff,
	});
}
