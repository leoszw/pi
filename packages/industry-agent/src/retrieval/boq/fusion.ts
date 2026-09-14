import type { BoqArmHit, BoqFusedCandidate, BoqRetrievalArm, BoqRrfWeights } from "./types.ts";

const WEIGHT_KEY: Readonly<Record<BoqRetrievalArm, keyof BoqRrfWeights>> = {
	exact: "exact",
	bm25: "bm25",
	item: "item",
	context: "context",
};

export function normalizeActiveWeights(weights: BoqRrfWeights, activeArms: readonly BoqRetrievalArm[]): BoqRrfWeights {
	const active = new Set(activeArms);
	const sum = activeArms.reduce((total, arm) => total + Math.max(0, weights[WEIGHT_KEY[arm]]), 0);
	if (sum <= 0) return { exact: 0, bm25: 0, item: 0, context: 0 };
	return {
		exact: active.has("exact") ? Math.max(0, weights.exact) / sum : 0,
		bm25: active.has("bm25") ? Math.max(0, weights.bm25) / sum : 0,
		item: active.has("item") ? Math.max(0, weights.item) / sum : 0,
		context: active.has("context") ? Math.max(0, weights.context) / sum : 0,
	};
}

export function weightedBoqRrf(
	arms: Readonly<Record<BoqRetrievalArm, readonly BoqArmHit[]>>,
	weights: BoqRrfWeights,
	activeArms: readonly BoqRetrievalArm[],
	rrfK: number,
): BoqFusedCandidate[] {
	const normalized = normalizeActiveWeights(weights, activeArms);
	const candidates = new Map<string, Omit<BoqFusedCandidate, "fusionNorm">>();
	for (const arm of activeArms) {
		const seen = new Set<string>();
		arms[arm].forEach((hit, index) => {
			const id = hit.document.ledgerId;
			if (seen.has(id)) return;
			seen.add(id);
			const rank = index + 1;
			const contribution = normalized[WEIGHT_KEY[arm]] / (rrfK + rank);
			const current = candidates.get(id) ?? {
				document: hit.document,
				fusionScore: 0,
				armRanks: {},
				armContributions: {},
			};
			candidates.set(id, {
				...current,
				fusionScore: current.fusionScore + contribution,
				armRanks: { ...current.armRanks, [arm]: rank },
				armContributions: { ...current.armContributions, [arm]: contribution },
			});
		});
	}
	const theoreticalMax = rrfK >= 0 ? 1 / (rrfK + 1) : 1;
	return Array.from(candidates.values())
		.map((candidate) => ({
			...candidate,
			fusionNorm: theoreticalMax > 0 ? Math.min(1, Math.max(0, candidate.fusionScore / theoreticalMax)) : 0,
		}))
		.sort(
			(left, right) =>
				right.fusionScore - left.fusionScore || left.document.ledgerId.localeCompare(right.document.ledgerId),
		);
}
