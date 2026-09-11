import type { EngineeringRetrievalConfig, EngineeringSearchConfidence, EngineeringSearchResult } from "./types.ts";

export function directExactConfidence(): EngineeringSearchConfidence {
	return {
		autoAccept: true,
		level: "EXACT",
		top1Score: 1,
		margin: 1,
		recommendedResultCount: 1,
		reason: "unique exact match under hard scope",
	};
}

export function engineeringConfidencePolicy(
	results: readonly EngineeringSearchResult[],
	config: EngineeringRetrievalConfig,
): EngineeringSearchConfidence {
	const first = results[0];
	if (!first) {
		return { autoAccept: false, level: "NONE", recommendedResultCount: 0, reason: "no candidates" };
	}
	const second = results[1];
	const margin = second ? Math.max(0, first.finalScore - second.finalScore) : first.finalScore;
	if (first.finalScore >= config.confidence.autoAcceptScore && margin >= config.confidence.autoAcceptMargin) {
		return {
			autoAccept: true,
			level: "HIGH",
			top1Score: first.finalScore,
			margin,
			recommendedResultCount: 1,
			reason: "top candidate passes score and margin thresholds",
		};
	}
	if (first.finalScore >= config.confidence.ambiguousFloor) {
		return {
			autoAccept: false,
			level: "AMBIGUOUS",
			top1Score: first.finalScore,
			margin,
			recommendedResultCount: Math.min(3, results.length),
			reason: "candidate is plausible but not sufficiently separated",
		};
	}
	return {
		autoAccept: false,
		level: "LOW",
		top1Score: first.finalScore,
		margin,
		recommendedResultCount: Math.min(3, results.length),
		reason: "top score is below ambiguity floor",
	};
}
