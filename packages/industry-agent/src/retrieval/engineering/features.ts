import { normalizeEngineeringSemanticText } from "./text-builder.ts";
import type { EngineeringSearchDocument, ParsedEngineeringQuery } from "./types.ts";

const FEATURE_WEIGHTS = {
	exactName: 0.25,
	aliasMatch: 0.15,
	unitMatch: 0.15,
	typeMatch: 0.1,
	categoryMatch: 0.08,
	positionTokenMatch: 0.15,
	hierarchyMatch: 0.07,
	leafPreference: 0.05,
} as const;

export interface EngineeringBusinessScore {
	score: number;
	features: Readonly<Record<string, number>>;
}

function normalizedEquals(left: string | undefined, right: string | undefined): boolean {
	if (!left || !right) return false;
	return normalizeEngineeringSemanticText(left).toLocaleLowerCase() === normalizeEngineeringSemanticText(right).toLocaleLowerCase();
}

function includesNormalized(haystack: string, needle: string): boolean {
	const normalizedNeedle = normalizeEngineeringSemanticText(needle).toLocaleLowerCase();
	return normalizedNeedle.length > 0 && normalizeEngineeringSemanticText(haystack).toLocaleLowerCase().includes(normalizedNeedle);
}

export function scoreEngineeringBusinessFeatures(
	query: ParsedEngineeringQuery,
	document: EngineeringSearchDocument,
): EngineeringBusinessScore {
	const semantic = query.semanticQuery;
	const exactName = normalizedEquals(semantic, document.engineeringName) || normalizedEquals(semantic, document.semanticName) ? 1 : 0;
	const aliasMatch = document.aliasTerms.some((alias) => normalizedEquals(semantic, alias) || includesNormalized(semantic, alias)) ? 1 : 0;
	const unitMatch = query.unitEngineeringId && document.unitEngineeringId === query.unitEngineeringId
		? 1
		: query.unitEngineeringName && normalizedEquals(query.unitEngineeringName, document.unitEngineeringName) ? 1 : 0;
	const typeMatch = query.engineeringTypeName && normalizedEquals(query.engineeringTypeName, document.engineeringTypeName) ? 1 : 0;
	const categoryMatch = query.engineeringCategoryName && normalizedEquals(query.engineeringCategoryName, document.engineeringCategoryName) ? 1 : 0;
	const positionTokenMatch = query.positionTokens.length > 0 && query.positionTokens.every((token) => document.positionTokens.includes(token)) ? 1 : 0;
	const hierarchyMatch = query.unitEngineeringName && includesNormalized(document.pathText, query.unitEngineeringName) ? 1 : 0;
	const leafPreference = query.queryMode === "ENTITY_SHORT" && document.isMinUnit ? 1 : 0;
	const features = {
		exactName,
		aliasMatch,
		unitMatch,
		typeMatch,
		categoryMatch,
		positionTokenMatch,
		hierarchyMatch,
		leafPreference,
	};
	let score = Object.entries(FEATURE_WEIGHTS).reduce((total, [name, weight]) => total + weight * features[name as keyof typeof features], 0);
	if (query.alignmentSide === "NONE" && query.localSide !== "NONE" && document.localSide === query.localSide) score += 0.08;
	if (!query.hints.engineeringTypeName || query.hints.engineeringTypeName.mode !== "hard") {
		if (query.engineeringTypeName && normalizedEquals(query.engineeringTypeName, document.engineeringTypeName)) score += 0.05;
	}
	if (!query.hints.engineeringCategoryName || query.hints.engineeringCategoryName.mode !== "hard") {
		if (query.engineeringCategoryName && normalizedEquals(query.engineeringCategoryName, document.engineeringCategoryName)) score += 0.04;
	}
	return { score: Math.min(1, score), features };
}
