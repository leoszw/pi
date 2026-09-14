import { normalizeBoqText, normalizeBoqUnit, normalizeLedgerCode, normalizeLedgerName } from "./normalizer.ts";
import { extractBoqSpecTokens } from "./spec-extractor.ts";
import type {
	BoqOperation,
	BoqQueryCatalog,
	BoqQueryMode,
	BoqSearchFilters,
	BoqSearchRequest,
	ParsedBoqQuery,
} from "./types.ts";

const CODE_CANDIDATE = /(?<!\d)\d{3}(?:[-－–—_ ]?[0-9A-Za-z]+){0,5}(?!\d)/g;
const DESCENDANT_PATTERN = /(?:下面|子项|包含哪些|包含什么|下级|明细)/;
const FACT_PATTERNS: readonly [RegExp, string][] = [
	[/变更后单价/, "change_after_price"],
	[/变更后数量/, "change_after_num"],
	[/变更后金额/, "change_after_amount"],
	[/变更次数/, "change_count"],
	[/(?<!变更后)(?:合同)?单价/, "contract_price"],
	[/(?<!变更后)(?:合同)?数量|工程量/, "contract_num"],
	[/(?<!变更后)(?:合同)?金额|合价/, "contract_amount"],
];
const ACTION_WORDS =
	/(?:查询|查找|查一下|搜索|帮我|请问|是多少|多少|哪些|什么|合同金额|合同数量|合同单价|变更后金额|变更后数量|变更后单价|变更次数)/g;
const UNIT_PATTERN = /(?:平方米|立方米|千克|公里|㎡|m²|m2|m³|m3|kg|km|吨|\bt\b|米|\bm\b)/i;

function resolveCode(
	raw: string,
	catalog: BoqQueryCatalog,
	descendantIntent: boolean,
): { ledgerCode?: string; ancestorCode?: string; confidence?: number } {
	const normalized = normalizeBoqText(raw);
	for (const match of normalized.matchAll(CODE_CANDIDATE)) {
		const code = normalizeLedgerCode(match[0]);
		if (!code) continue;
		if (catalog.knownCodes.has(code)) return { ledgerCode: code, confidence: 1 };
		if (descendantIntent && catalog.knownAncestorCodes.has(code)) return { ancestorCode: code, confidence: 1 };
	}
	return {};
}

function resolveSection(
	raw: string,
	catalog: BoqQueryCatalog,
): { sectionId?: string; sectionName?: string; confidence?: number } {
	for (const section of catalog.sections ?? []) {
		for (const name of [section.sectionName, ...(section.aliases ?? [])]) {
			if (name && raw.includes(name))
				return { sectionId: section.sectionId, sectionName: section.sectionName, confidence: 0.99 };
		}
	}
	return {};
}

function detectFactFields(raw: string): string[] {
	const output: string[] = [];
	for (const [pattern, field] of FACT_PATTERNS) if (pattern.test(raw)) output.push(field);
	return Array.from(new Set(output));
}

function inferMode(raw: string, hasCode: boolean, specs: number, sectionName?: string): BoqQueryMode {
	if (hasCode) return "CODE";
	if (specs > 0) return "SPEC";
	const compact = raw.replace(/[\s，。、“”‘’()（）]/g, "");
	if (sectionName || (/(?:章节|章|父项|下部结构|上部结构|基础|桥梁|隧道|路基|路面)/.test(raw) && compact.length > 12))
		return "CONTEXT";
	if (compact.length > 0 && compact.length <= 12) return "ITEM_SHORT";
	return "DEFAULT";
}

function buildSemanticQuery(raw: string, code?: string): string {
	let text = normalizeLedgerName(raw).replace(ACTION_WORDS, " ");
	if (code) {
		const escaped = code.split("-").join("[-－–—_ ]?");
		text = text.replace(new RegExp(escaped, "ig"), " ");
	}
	return text
		.replace(/\s+/g, " ")
		.replace(/^[的\s]+|[的\s]+$/g, "")
		.trim();
}

export function parseBoqQuery(request: BoqSearchRequest): ParsedBoqQuery {
	const raw = request.query.trim();
	const descendantIntent = DESCENDANT_PATTERN.test(raw);
	const code = resolveCode(raw, request.catalog, descendantIntent);
	const section = resolveSection(raw, request.catalog);
	const specs = extractBoqSpecTokens(raw);
	const factFields = detectFactFields(raw);
	const operation: BoqOperation =
		descendantIntent && (code.ancestorCode || code.ledgerCode)
			? "LIST_DESCENDANTS"
			: factFields.length > 0
				? "FACT_LOOKUP"
				: "SEARCH";
	const routedCode = operation === "LIST_DESCENDANTS" ? (code.ancestorCode ?? code.ledgerCode) : code.ledgerCode;
	const unitRaw = UNIT_PATTERN.exec(raw)?.[0];
	const unit = normalizeBoqUnit(unitRaw);
	const queryMode = inferMode(raw, Boolean(routedCode), specs.length, section.sectionName);
	const semanticQuery = buildSemanticQuery(raw, routedCode);
	return {
		rawQuery: raw,
		semanticQuery,
		operation,
		queryMode,
		projectId: request.projectId,
		...(operation === "LIST_DESCENDANTS" && routedCode ? { ancestorCode: routedCode } : {}),
		...(operation !== "LIST_DESCENDANTS" && routedCode ? { ledgerCode: routedCode } : {}),
		...(section.sectionId ? { sectionId: section.sectionId } : {}),
		...(section.sectionName ? { sectionName: section.sectionName } : {}),
		...(semanticQuery ? { ledgerName: semanticQuery, ledgerNameNorm: normalizeLedgerName(semanticQuery) } : {}),
		...(unit ? { unit } : {}),
		specTokens: specs,
		aliases: [],
		factFields,
		confidences: {
			projectId: 1,
			...(routedCode ? { ledgerCode: code.confidence ?? 1 } : {}),
			...(section.confidence ? { section: section.confidence } : {}),
			...(unit ? { unit: 0.99 } : {}),
			...(specs.length > 0 ? { specTokens: 1 } : {}),
		},
	};
}

export function buildBoqFilters(query: ParsedBoqQuery, leafOnly?: boolean | null): BoqSearchFilters {
	return {
		excludeDeleted: true,
		projectId: query.projectId,
		...(query.sectionId && (query.confidences.section ?? 0) >= 0.99 ? { sectionId: query.sectionId } : {}),
		...(leafOnly === true ? { leafOnly: true } : {}),
	};
}
