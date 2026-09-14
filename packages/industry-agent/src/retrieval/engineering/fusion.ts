import type {
	EngineeringArmHit,
	EngineeringFusedCandidate,
	EngineeringRetrievalArm,
	EngineeringRrfWeights,
} from "./types.ts";

const ARM_WEIGHT_KEYS: Readonly<Record<EngineeringRetrievalArm, keyof EngineeringRrfWeights>> = {
	exact: "exact",
	bm25: "bm25",
	name: "name",
	context: "context",
};

export function weightedRrf(
	arms: Readonly<Record<EngineeringRetrievalArm, readonly EngineeringArmHit[]>>,
	weights: EngineeringRrfWeights,
	rrfK: number,
): EngineeringFusedCandidate[] {
	const candidates = new Map<string, EngineeringFusedCandidate>();
	for (const arm of Object.keys(arms) as EngineeringRetrievalArm[]) {
		const weight = weights[ARM_WEIGHT_KEYS[arm]];
		const seen = new Set<string>();
		arms[arm].forEach((hit, index) => {
			const id = hit.document.engineeringId;
			if (seen.has(id)) return;
			seen.add(id);
			const rank = index + 1;
			const contribution = weight / (rrfK + rank);
			const current = candidates.get(id) ?? {
				document: hit.document,
				fusionScore: 0,
				armRanks: {},
				armContributions: {},
			};
			candidates.set(id, {
				...current,
				document: current.document,
				fusionScore: current.fusionScore + contribution,
				armRanks: { ...current.armRanks, [arm]: rank },
				armContributions: { ...current.armContributions, [arm]: contribution },
			});
		});
	}
	return Array.from(candidates.values()).sort((left, right) => {
		if (right.fusionScore !== left.fusionScore) return right.fusionScore - left.fusionScore;
		return left.document.engineeringId.localeCompare(right.document.engineeringId);
	});
}

export function normalizeFusionScores(candidates: readonly EngineeringFusedCandidate[]): Map<string, number> {
	const max = Math.max(0, ...candidates.map((candidate) => candidate.fusionScore));
	return new Map(
		candidates.map((candidate) => [candidate.document.engineeringId, max > 0 ? candidate.fusionScore / max : 0]),
	);
}
