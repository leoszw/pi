import type { RagQaFusedCandidate, RagQaRetrievalArm, RagQaSearchCandidate } from "./types.ts";

export function weightedRrf(
	arms: Readonly<Partial<Record<RagQaRetrievalArm, readonly RagQaSearchCandidate[]>>>,
	weights: Readonly<Record<RagQaRetrievalArm, number>>,
	k: number,
	keepK: number,
): readonly RagQaFusedCandidate[] {
	const active = (Object.keys(arms) as RagQaRetrievalArm[]).filter((arm) => arms[arm] !== undefined);
	const sum = active.reduce((value, arm) => value + weights[arm], 0);
	if (sum <= 0 || active.length === 0) return [];
	const byChunk = new Map<string, { candidate: RagQaSearchCandidate; score: number; arms: RagQaRetrievalArm[]; ranks: Partial<Record<RagQaRetrievalArm, number>> }>();
	for (const arm of active) {
		const normalizedWeight = weights[arm] / sum;
		for (const [index, candidate] of (arms[arm] ?? []).entries()) {
			const rank = index + 1;
			const current = byChunk.get(candidate.chunk.chunkId) ?? { candidate, score: 0, arms: [], ranks: {} };
			current.score += normalizedWeight / (k + rank);
			current.arms.push(arm);
			current.ranks[arm] = rank;
			byChunk.set(candidate.chunk.chunkId, current);
		}
	}
	const theoreticalMax = 1 / (k + 1);
	return Array.from(byChunk.values())
		.map(({ candidate, score, arms: candidateArms, ranks }) => ({
			chunk: candidate.chunk,
			document: candidate.document,
			rrfScore: score,
			rrfNorm: Math.max(0, Math.min(1, score / theoreticalMax)),
			arms: Array.from(new Set(candidateArms)),
			armRanks: ranks,
		}))
		.sort((left, right) => right.rrfScore - left.rrfScore || left.chunk.chunkId.localeCompare(right.chunk.chunkId))
		.slice(0, keepK);
}
