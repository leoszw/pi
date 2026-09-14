import { createHash } from "node:crypto";
import type { EngineeringPositionSourceRow } from "../../entity/source-adapters.ts";
import type { EntityHierarchyPath } from "../../entity/types.ts";
import type { EngineeringAlignmentSide, EngineeringLocalSide, EngineeringSearchDocument } from "./types.ts";

const SYNONYMS: Readonly<Record<string, string>> = {
	砼: "混凝土",
};

function normalizeUnicode(value: string): string {
	return value.normalize("NFKC").replace(/[＃]/g, "#").replace(/[＋]/g, "+").replace(/[～]/g, "~");
}

function replaceSynonyms(value: string): string {
	let output = value;
	for (const [from, to] of Object.entries(SYNONYMS)) output = output.replaceAll(from, to);
	return output.replace(/桩基(?!础)/g, "桩基础");
}

export function stripEngineeringChainage(value: string): string {
	return value
		.replace(/(?:[A-Za-z]{0,4}K)?\s*\d+\s*\+\s*\d+(?:\.\d+)?/gi, " ")
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^[-~至到\s]+|[-~至到\s]+$/g, "");
}

export function normalizeEngineeringSemanticText(value: string): string {
	return replaceSynonyms(stripEngineeringChainage(normalizeUnicode(value)))
		.replace(/([0-9]+)\s*(?:号|#)\s*台/g, "$1#桥台")
		.replace(/([0-9]+)\s*号\s*墩/g, "$1#墩")
		.replace(/\s+/g, " ")
		.trim();
}

export function deriveEngineeringAlignmentSide(value: string): EngineeringAlignmentSide {
	if (/左幅/.test(value)) return "LEFT_WIDTH";
	if (/右幅/.test(value)) return "RIGHT_WIDTH";
	if (/左线/.test(value)) return "LEFT_LINE";
	if (/右线/.test(value)) return "RIGHT_LINE";
	return "NONE";
}

export function deriveEngineeringLocalSide(value: string): EngineeringLocalSide {
	if (/(?:左右侧|两侧|双侧)/.test(value)) return "BOTH";
	if (/左侧/.test(value)) return "LEFT";
	if (/右侧/.test(value)) return "RIGHT";
	return "NONE";
}

export function extractEngineeringPositionTokens(value: string): string[] {
	const normalized = normalizeUnicode(value)
		.replace(/([0-9]+)\s*(?:号|#)\s*台/g, "$1#桥台")
		.replace(/([0-9]+)\s*号\s*墩/g, "$1#墩");
	const patterns = [
		/\d+(?:-\d+)?#(?:桥台|墩|盖梁|承台|墩柱|钻孔灌注桩)/g,
		/第\s*\d+\s*(?:联|跨|节)/g,
		/\d+(?:-\d+)?#桩/g,
	];
	const values = new Set<string>();
	for (const pattern of patterns) {
		for (const match of normalized.matchAll(pattern)) values.add(match[0].replace(/\s+/g, ""));
	}
	return Array.from(values).sort();
}

function sideLabel(side: EngineeringAlignmentSide): string {
	return { LEFT_WIDTH: "左幅", RIGHT_WIDTH: "右幅", LEFT_LINE: "左线", RIGHT_LINE: "右线", NONE: "" }[side];
}

function compact(parts: readonly (string | undefined)[]): string {
	return parts.filter((value): value is string => Boolean(value?.trim())).join("；");
}

export interface BuildEngineeringSearchDocumentInput {
	row: EngineeringPositionSourceRow;
	hierarchy: EntityHierarchyPath;
	aliases?: readonly string[];
	embeddingVersion: string;
	indexVersion: string;
}

export function buildEngineeringSearchDocument(input: BuildEngineeringSearchDocumentInput): EngineeringSearchDocument {
	const { row, hierarchy } = input;
	const pathNames = hierarchy.names;
	const alignmentSide = deriveEngineeringAlignmentSide(
		`${row.unitEngineeringName ?? ""} ${row.engineeringFullName ?? ""} ${row.engineeringName}`,
	);
	const localSide = deriveEngineeringLocalSide(row.engineeringName);
	const positionTokens = extractEngineeringPositionTokens(`${row.engineeringName} ${row.engineeringFullName ?? ""}`);
	const semanticName = normalizeEngineeringSemanticText(row.engineeringName);
	const semanticPath = pathNames.map(normalizeEngineeringSemanticText).filter(Boolean).join(" > ");
	const aliasTerms = Array.from(
		new Set((input.aliases ?? []).map(normalizeEngineeringSemanticText).filter(Boolean)),
	).sort();
	const pathText = pathNames.join(" > ");
	const searchText = compact([
		row.engineeringFullName,
		row.engineeringName,
		pathText,
		row.unitEngineeringName,
		row.engineeringCategoryName,
		row.engineeringTypeName,
		aliasTerms.join(" "),
	]);
	const alignmentLabel = sideLabel(alignmentSide);
	const embeddingNameText = compact([
		`工程部位：${semanticName}`,
		row.engineeringCategoryName ? `工程类别：${row.engineeringCategoryName}` : undefined,
		row.engineeringTypeName ? `工程类型：${row.engineeringTypeName}` : undefined,
		alignmentLabel ? `方向：${alignmentLabel}` : undefined,
	]);
	const embeddingContextText = compact([
		row.unitEngineeringName ? `单位工程：${normalizeEngineeringSemanticText(row.unitEngineeringName)}` : undefined,
		semanticPath ? `工程路径：${semanticPath}` : undefined,
		`工程部位：${semanticName}`,
		row.engineeringCategoryName ? `工程类别：${row.engineeringCategoryName}` : undefined,
		row.engineeringTypeName ? `工程类型：${row.engineeringTypeName}` : undefined,
		alignmentLabel ? `方向：${alignmentLabel}` : undefined,
		row.alignmentCode ? `线路：${row.alignmentCode}` : undefined,
	]);
	const chainageLabel =
		row.chainageStartM === undefined || row.chainageEndM === undefined
			? undefined
			: `桩号区间：${row.chainageStartM}-${row.chainageEndM}米`;
	const rerankText = compact([
		row.unitEngineeringName ? `单位工程：${row.unitEngineeringName}` : undefined,
		pathText ? `路径：${pathText}` : undefined,
		`工程部位：${row.engineeringName}`,
		row.engineeringCategoryName ? `工程类别：${row.engineeringCategoryName}` : undefined,
		row.engineeringTypeName ? `工程类型：${row.engineeringTypeName}` : undefined,
		alignmentLabel ? `方向：${alignmentLabel}` : undefined,
		row.alignmentCode ? `线路：${row.alignmentCode}` : undefined,
		chainageLabel,
	]);
	const embeddingInputHash = createHash("sha256")
		.update(`${embeddingNameText}\n${embeddingContextText}\n${input.embeddingVersion}`, "utf8")
		.digest("hex");

	return {
		engineeringId: row.engineeringId,
		engineeringCode: row.engineeringCode,
		projectId: row.proId,
		unitEngineeringId: row.unitEngineeringId,
		unitEngineeringName: row.unitEngineeringName,
		parentEngineeringId: row.parentEngineeringId,
		ancestorIds: hierarchy.entityIds.slice(0, -1),
		pathNames,
		pathText,
		depth: hierarchy.depth,
		engineeringName: row.engineeringName,
		engineeringFullName: row.engineeringFullName,
		engineeringCategoryName: row.engineeringCategoryName,
		engineeringTypeName: row.engineeringTypeName,
		alignmentCode: row.alignmentCode,
		alignmentSide,
		localSide,
		positionTokens,
		aliasTerms,
		chainageStartM: row.chainageStartM,
		chainageEndM: row.chainageEndM,
		crossAlignment: row.crossAlignment ?? false,
		isMinUnit: row.isMinUnit,
		isDeleted: row.isDeleted,
		semanticName,
		semanticPath,
		searchText,
		embeddingNameText,
		embeddingContextText,
		rerankText,
		embeddingVersion: input.embeddingVersion,
		embeddingInputHash,
		indexVersion: input.indexVersion,
	};
}
