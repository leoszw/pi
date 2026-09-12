import type { RagQaFusedCandidate, RagQaRankedCandidate, RagQaRerankScore } from "./types.ts";

export function applyRerank(candidates: readonly RagQaFusedCandidate[], scores: readonly RagQaRerankScore[]): readonly RagQaRankedCandidate[] {
	const scoreById = new Map(scores.map((item) => [item.chunkId, Math.max(0, Math.min(1, item.score))]));
	return candidates.map((candidate) => {
		const rerankScore = scoreById.get(candidate.chunk.chunkId) ?? 0;
		return { ...candidate, rerankScore, finalScore: 0.75 * rerankScore + 0.25 * candidate.rrfNorm };
	}).sort((left, right) => right.finalScore - left.finalScore || right.rrfNorm - left.rrfNorm || left.chunk.chunkId.localeCompare(right.chunk.chunkId));
}

export function diversify(candidates: readonly RagQaRankedCandidate[], finalK: number, maxPerDocument: number): readonly RagQaRankedCandidate[] {
	const result: RagQaRankedCandidate[] = [];
	const perDocument = new Map<string, number>();
	const seenContent = new Set<string>();
	for (const candidate of candidates) {
		if (seenContent.has(candidate.chunk.contentHash)) continue;
		const count = perDocument.get(candidate.document.documentId) ?? 0;
		if (count >= maxPerDocument) continue;
		seenContent.add(candidate.chunk.contentHash);
		perDocument.set(candidate.document.documentId, count + 1);
		result.push(candidate);
		if (result.length >= finalK) break;
	}
	return result;
}
