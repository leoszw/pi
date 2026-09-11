import { normalizeLedgerName } from "./normalizer.ts";
import { countCriticalSpecConflicts } from "./spec-extractor.ts";
import type { BoqBusinessScore, BoqSearchDocument, ParsedBoqQuery } from "./types.ts";

interface Feature { key: string; weight: number; applicable: boolean; match: number; }

function tokenCoverage(query: string, candidate: string): number {
	const tokens = normalizeLedgerName(query).split(/[\s>；,，。()（）/]+/).filter((token) => token.length >= 2);
	if (tokens.length === 0) return 0;
	const matched = tokens.filter((token) => candidate.includes(token)).length;
	return matched / tokens.length;
}

export function scoreBoqBusinessFeatures(query: ParsedBoqQuery, document: BoqSearchDocument): BoqBusinessScore {
	const normalizedQueryName = query.ledgerNameNorm ? normalizeLedgerName(query.ledgerNameNorm) : "";
	const exactNameMatch = normalizedQueryName.length > 0 && normalizedQueryName === document.ledgerNameNorm ? 1 : 0;
	const aliasMatch = query.aliases.some((alias) => document.aliasTerms.includes(normalizeLedgerName(alias))) ? 1 : 0;
	const sectionMatch = query.sectionName && document.sectionName === query.sectionName ? 1 : 0;
	const pathCoverage = query.semanticQuery ? tokenCoverage(query.semanticQuery, document.pathText) : 0;
	const querySpecValues = query.specTokens.map((token) => token.value);
	const specMatched = querySpecValues.filter((value) => document.specTokens.includes(value)).length;
	const specCoverage = querySpecValues.length > 0 ? specMatched / querySpecValues.length : 0;
	const unitMatch = query.unit && document.unitNorm === query.unit ? 1 : 0;
	const multiTokenCoverage = querySpecValues.length > 1 ? specCoverage : 0;
	const features: Feature[] = [
		{ key: "exact_name", weight: 0.20, applicable: Boolean(normalizedQueryName), match: exactNameMatch },
		{ key: "alias_match", weight: 0.10, applicable: query.aliases.length > 0, match: aliasMatch },
		{ key: "section_match", weight: 0.10, applicable: Boolean(query.sectionName), match: sectionMatch },
		{ key: "ancestor_path_match", weight: 0.20, applicable: query.queryMode === "CONTEXT", match: pathCoverage },
		{ key: "spec_match", weight: 0.25, applicable: query.specTokens.length > 0, match: specCoverage },
		{ key: "unit_match", weight: 0.05, applicable: Boolean(query.unit), match: unitMatch },
		{ key: "leaf_preference", weight: 0.05, applicable: query.queryMode === "ITEM_SHORT" || query.queryMode === "SPEC", match: document.isLeaf ? 1 : 0 },
		{ key: "multi_token_coverage", weight: 0.05, applicable: query.specTokens.length > 1, match: multiTokenCoverage },
	];
	const applicable = features.filter((feature) => feature.applicable);
	const denominator = applicable.reduce((sum, feature) => sum + feature.weight, 0) || 1;
	const positiveScore = applicable.reduce((sum, feature) => sum + feature.weight * Math.max(0, Math.min(1, feature.match)), 0) / denominator;
	const criticalSpecConflicts = countCriticalSpecConflicts(query.specTokens, document.specTokens, document.specFamilies);
	const conflictPenalty = Math.min(0.45, criticalSpecConflicts * 0.25);
	const score = Math.max(0, positiveScore - conflictPenalty);
	const featureMap = Object.fromEntries(features.map((feature) => [feature.key, feature.applicable ? feature.match : 0]));
	const identityParts = [exactNameMatch, specCoverage, query.queryMode === "CONTEXT" ? pathCoverage : undefined].filter((value): value is number => value !== undefined);
	const identityScore = identityParts.length ? identityParts.reduce((sum, value) => sum + value, 0) / identityParts.length : 0;
	const structural = [query.sectionName ? sectionMatch : undefined, query.unit ? unitMatch : undefined].filter((value): value is number => value !== undefined);
	const filterCoverage = structural.length ? structural.reduce((sum, value) => sum + value, 0) / structural.length : 1;
	return { score, positiveScore, conflictPenalty, criticalSpecConflicts, features: featureMap, identityScore, filterCoverage };
}
