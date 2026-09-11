import type {
	EngineeringAlignmentSide,
	EngineeringFilterPlan,
	EngineeringLocalSide,
	EngineeringQueryMode,
	EngineeringRetrievalConfig,
	EngineeringSearchRequest,
	ParsedEngineeringQuery,
} from "./types.ts";

const CHAINAGE_PATTERN = /(?:(?<prefix>[A-Za-z]{0,4}K)\s*)?(?<km>\d+)\s*\+\s*(?<m>\d+(?:\.\d+)?)/gi;
const ENGINEERING_CODE_PATTERN = /(?:工程(?:编码|代码)|部位编码|编码)\s*[:：#]?\s*([A-Za-z0-9][A-Za-z0-9._/-]*)/i;
const POSITION_PATTERNS = [
	/\d+(?:-\d+)?#(?:桥台|墩|盖梁|承台|墩柱|钻孔灌注桩)/g,
	/第\s*\d+\s*(?:联|跨|节)/g,
	/\d+(?:-\d+)?#桩/g,
] as const;

function parseChainageToken(match: RegExpMatchArray): number | undefined {
	const km = Number(match.groups?.km);
	const m = Number(match.groups?.m);
	if (!Number.isFinite(km) || !Number.isFinite(m) || km < 0 || m < 0 || m >= 1000) return undefined;
	return km * 1000 + m;
}

function parseAlignmentSide(text: string): { alignmentSide: EngineeringAlignmentSide; confidence?: number } {
	if (/左幅/.test(text)) return { alignmentSide: "LEFT_WIDTH", confidence: 1 };
	if (/右幅/.test(text)) return { alignmentSide: "RIGHT_WIDTH", confidence: 1 };
	if (/左线/.test(text)) return { alignmentSide: "LEFT_LINE", confidence: 1 };
	if (/右线/.test(text)) return { alignmentSide: "RIGHT_LINE", confidence: 1 };
	return { alignmentSide: "NONE" };
}

function parseLocalSide(text: string): EngineeringLocalSide {
	if (/(?:左右侧|两侧|双侧)/.test(text)) return "BOTH";
	if (/左侧/.test(text)) return "LEFT";
	if (/右侧/.test(text)) return "RIGHT";
	return "NONE";
}

function normalizePositionToken(value: string): string {
	return value.replace(/\s+/g, "").replace(/号/g, "#");
}

function extractPositionTokens(text: string): string[] {
	const tokens = new Set<string>();
	const normalized = text.replace(/([0-9]+)\s*(?:号|#)\s*台/g, "$1#桥台")
		.replace(/([0-9]+)\s*号\s*墩/g, "$1#墩");
	for (const pattern of POSITION_PATTERNS) {
		for (const match of normalized.matchAll(pattern)) tokens.add(normalizePositionToken(match[0]));
	}
	return Array.from(tokens).sort();
}

function stripStructuredTokens(text: string): string {
	return text
		.replace(CHAINAGE_PATTERN, " ")
		.replace(/(?:附近|前后|左右)\s*\d*\s*(?:米|m)?/gi, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^[\-~～—–至到\s]+|[\-~～—–至到\s]+$/g, "");
}

function effectiveCjkLength(value: string): number {
	return Array.from(value).filter((char) => /[\p{Script=Han}A-Za-z0-9#]/u.test(char)).length;
}

function queryModeFor(query: Omit<ParsedEngineeringQuery, "queryMode">): EngineeringQueryMode {
	if (query.engineeringCode) return "CODE";
	if (query.chainageMode) return "CHAINAGE";
	if (query.unitEngineeringName || query.hints.engineeringCategoryName || query.hints.engineeringTypeName) return "CONTEXT";
	if (effectiveCjkLength(query.semanticQuery) > 0 && effectiveCjkLength(query.semanticQuery) <= 12) return "ENTITY_SHORT";
	return query.semanticQuery.length > 0 ? "CONTEXT" : "DEFAULT";
}

export function parseEngineeringQuery(
	request: EngineeringSearchRequest,
	config: EngineeringRetrievalConfig,
): ParsedEngineeringQuery {
	const rawQuery = request.query.trim();
	const chainageMatches = Array.from(rawQuery.matchAll(CHAINAGE_PATTERN));
	const first = chainageMatches[0];
	const second = chainageMatches[1];
	const firstValue = first ? parseChainageToken(first) : undefined;
	const secondValue = second ? parseChainageToken(second) : undefined;
	const nearby = /(?:附近|前后|左右)/.test(rawQuery);
	const firstPrefix = first?.groups?.prefix?.toUpperCase();
	const secondPrefix = second?.groups?.prefix?.toUpperCase();
	const crossAlignment = Boolean(firstValue !== undefined && secondValue !== undefined && firstPrefix && secondPrefix && firstPrefix !== secondPrefix);
	let chainageMode: ParsedEngineeringQuery["chainageMode"];
	let chainageStartM: number | undefined;
	let chainageEndM: number | undefined;
	let nearbyRadiusM: number | undefined;
	if (firstValue !== undefined && secondValue !== undefined) {
		chainageMode = "range";
		chainageStartM = Math.min(firstValue, secondValue);
		chainageEndM = Math.max(firstValue, secondValue);
	} else if (firstValue !== undefined && nearby) {
		chainageMode = "nearby";
		nearbyRadiusM = config.defaultNearbyRadiusM;
		chainageStartM = Math.max(0, firstValue - nearbyRadiusM);
		chainageEndM = firstValue + nearbyRadiusM;
	} else if (firstValue !== undefined) {
		chainageMode = "point";
		chainageStartM = firstValue;
		chainageEndM = firstValue;
	}

	const explicitPrefix = crossAlignment ? undefined : firstPrefix;
	const side = parseAlignmentSide(rawQuery);
	const engineeringCode = ENGINEERING_CODE_PATTERN.exec(rawQuery)?.[1]?.toUpperCase();
	const semanticQuery = stripStructuredTokens(rawQuery);
	const hints = request.hints ?? {};
	const draft: Omit<ParsedEngineeringQuery, "queryMode"> = {
		rawQuery,
		semanticQuery,
		projectId: request.projectId,
		...(engineeringCode ? { engineeringCode } : {}),
		...(hints.unitEngineeringId ? { unitEngineeringId: hints.unitEngineeringId.value } : {}),
		...(hints.unitEngineeringName ? { unitEngineeringName: hints.unitEngineeringName.value } : {}),
		...(hints.engineeringCategoryName ? { engineeringCategoryName: hints.engineeringCategoryName.value } : {}),
		...(hints.engineeringTypeName ? { engineeringTypeName: hints.engineeringTypeName.value } : {}),
		...(explicitPrefix ? { alignmentCode: explicitPrefix } : {}),
		alignmentSide: side.alignmentSide,
		localSide: parseLocalSide(rawQuery),
		...(chainageMode ? { chainageMode } : {}),
		...(chainageStartM === undefined ? {} : { chainageStartM }),
		...(chainageEndM === undefined ? {} : { chainageEndM }),
		...(nearbyRadiusM === undefined ? {} : { nearbyRadiusM }),
		crossAlignment,
		positionTokens: extractPositionTokens(rawQuery),
		aliases: [],
		confidences: {
			...(firstValue === undefined ? {} : { chainage: 1 }),
			...(explicitPrefix ? { alignmentCode: 1 } : {}),
			...(side.confidence === undefined ? {} : { alignmentSide: side.confidence }),
			...(hints.unitEngineeringId ? { unitEngineeringId: hints.unitEngineeringId.confidence } : {}),
			...(hints.unitEngineeringName ? { unitEngineeringName: hints.unitEngineeringName.confidence } : {}),
			...(hints.engineeringCategoryName ? { engineeringCategoryName: hints.engineeringCategoryName.confidence } : {}),
			...(hints.engineeringTypeName ? { engineeringTypeName: hints.engineeringTypeName.confidence } : {}),
		},
		hints,
	};
	return { ...draft, queryMode: queryModeFor(draft) };
}

export function buildEngineeringFilterPlan(
	query: ParsedEngineeringQuery,
	leafOnly?: boolean | null,
): EngineeringFilterPlan {
	const filters: EngineeringFilterPlan["filters"] = { excludeDeleted: true, projectId: query.projectId ?? "" };
	const relaxable: Array<EngineeringFilterPlan["relaxable"][number]> = [];
	if (query.unitEngineeringId && query.hints.unitEngineeringId?.mode === "hard") {
		filters.unitEngineeringId = query.unitEngineeringId;
		if (query.hints.unitEngineeringId.confidence < 0.95) {
			relaxable.push({ field: "unitEngineeringId", value: query.unitEngineeringId, confidence: query.hints.unitEngineeringId.confidence, reason: "low-confidence unit engineering" });
		}
	}
	if (query.alignmentCode) filters.alignmentCode = query.alignmentCode;
	if (query.alignmentSide !== "NONE") filters.alignmentSide = query.alignmentSide;
	if (query.hints.engineeringCategoryName?.mode === "hard" && query.engineeringCategoryName) {
		filters.engineeringCategoryName = query.engineeringCategoryName;
		if (query.hints.engineeringCategoryName.confidence < 0.98) {
			relaxable.push({ field: "engineeringCategoryName", value: query.engineeringCategoryName, confidence: query.hints.engineeringCategoryName.confidence, reason: "low-confidence category" });
		}
	}
	if (query.hints.engineeringTypeName?.mode === "hard" && query.engineeringTypeName) {
		filters.engineeringTypeName = query.engineeringTypeName;
		if (query.hints.engineeringTypeName.confidence < 0.98) {
			relaxable.push({ field: "engineeringTypeName", value: query.engineeringTypeName, confidence: query.hints.engineeringTypeName.confidence, reason: "low-confidence type" });
		}
	}
	if (!query.crossAlignment && query.chainageStartM !== undefined && query.chainageEndM !== undefined) {
		filters.chainageStartM = query.chainageStartM;
		filters.chainageEndM = query.chainageEndM;
		filters.crossAlignment = false;
	}
	if (leafOnly !== undefined && leafOnly !== null) filters.leafOnly = leafOnly;
	return { filters, relaxable };
}

export function relaxEngineeringFilters(plan: EngineeringFilterPlan): { filters: EngineeringFilterPlan["filters"]; relaxed: readonly string[] } {
	const filters = { ...plan.filters };
	const relaxed: string[] = [];
	for (const entry of [...plan.relaxable].sort((left, right) => left.confidence - right.confidence)) {
		delete filters[entry.field];
		relaxed.push(String(entry.field));
	}
	return { filters, relaxed };
}
