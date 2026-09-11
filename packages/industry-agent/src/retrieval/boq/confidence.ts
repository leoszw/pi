import type { BoqRetrievalArm, BoqRetrievalConfig, BoqSearchConfidence, BoqSearchResult, ParsedBoqQuery } from "./types.ts";

function clamp01(value: number): number { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); }

export function exactCodeConfidence(): BoqSearchConfidence {
	return { autoAccept: true, level: "EXACT", raw: 1, reason: "unique_exact_code", recommendedResultCount: 1 };
}

export function descendantsConfidence(count: number): BoqSearchConfidence {
	return { autoAccept: false, level: count > 0 ? "HIGH" : "NONE", raw: count > 0 ? 1 : 0, reason: "hierarchy_listing", recommendedResultCount: count };
}

export function boqConfidencePolicy(
	query: ParsedBoqQuery,
	results: readonly BoqSearchResult[],
	activeArms: readonly BoqRetrievalArm[],
	config: BoqRetrievalConfig,
	degraded: boolean,
): BoqSearchConfidence {
	if (results.length === 0) return { autoAccept: false, level: "NONE", raw: 0, reason: "no_results", recommendedResultCount: 0 };
	const top1 = results[0]!;
	const top2 = results[1];
	const rerank1 = top1.scoreBreakdown.rerank;
	const rerank2 = top2?.scoreBreakdown.rerank ?? 0;
	const marginComponent = clamp01((rerank1 - rerank2) / 0.20);
	const armSupport = activeArms.length > 0 ? clamp01(top1.armSupportCount / activeArms.length) : 0;
	const raw = clamp01(0.30 * rerank1 + 0.25 * marginComponent + 0.20 * armSupport + 0.15 * top1.identityScore + 0.10 * top1.filterCoverage);
	const hasConflict = top1.scoreBreakdown.criticalSpecConflicts > config.confidence.maxCriticalSpecConflicts;
	const sameNameAmbiguity = Boolean(top2 && top2.ledgerName === top1.ledgerName && top2.pathText !== top1.pathText);
	const closeRerank = Boolean(top2 && Math.abs(rerank1 - rerank2) < 0.08);
	const hierarchyGuard = top1.hierarchyGap && query.queryMode === "CONTEXT" && top1.identityScore < 0.8;
	const shortGenericGuard = query.queryMode === "ITEM_SHORT" && query.specTokens.length === 0 && !query.sectionName && Boolean(top2);
	const ambiguity = sameNameAmbiguity || closeRerank || hierarchyGuard || shortGenericGuard;
	const autoAccept = !degraded && raw >= config.confidence.autoAcceptRaw && !hasConflict && !ambiguity;
	if (autoAccept) return { autoAccept: true, level: "HIGH", raw, reason: "calibrated_identity_support", recommendedResultCount: 1 };
	if (hasConflict) return { autoAccept: false, level: "AMBIGUOUS", raw, reason: "critical_spec_conflict", recommendedResultCount: Math.min(3, results.length) };
	if (degraded) return { autoAccept: false, level: "LOW", raw, reason: "degraded_retrieval", recommendedResultCount: Math.min(3, results.length) };
	if (ambiguity) return { autoAccept: false, level: "AMBIGUOUS", raw, reason: "multiple_similar_items", recommendedResultCount: Math.min(3, results.length) };
	return { autoAccept: false, level: raw >= 0.65 ? "AMBIGUOUS" : "LOW", raw, reason: "confidence_below_auto_accept", recommendedResultCount: Math.min(3, results.length) };
}
