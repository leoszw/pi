import { createHash } from "node:crypto";
import type { BoqSourceRow } from "../../entity/source-adapters.ts";
import type { BoqHierarchyInfo } from "./hierarchy.ts";
import { normalizeBoqUnit, normalizeLedgerCode, normalizeLedgerName } from "./normalizer.ts";
import { extractBoqSpecTokens } from "./spec-extractor.ts";
import type { BoqRetrievalConfig, BoqSearchDocument } from "./types.ts";

export interface BuildBoqDocumentInput {
	row: BoqSourceRow;
	hierarchy: BoqHierarchyInfo;
	aliases: readonly string[];
	config: BoqRetrievalConfig;
}

function specSummary(tokens: readonly string[]): string { return tokens.join(" "); }
function compact(parts: readonly (string | undefined)[]): string { return parts.filter((part): part is string => Boolean(part?.trim())).join("；"); }

export function buildBoqSearchDocument(input: BuildBoqDocumentInput): BoqSearchDocument {
	const { row, hierarchy, aliases, config } = input;
	const code = normalizeLedgerCode(row.ledgerCodeNorm || row.ledgerCodeRaw) ?? row.ledgerCodeNorm;
	const name = normalizeLedgerName(row.ledgerNameNorm || row.ledgerNameRaw);
	const unit = normalizeBoqUnit(row.unitNorm ?? row.unitRaw);
	const specs = extractBoqSpecTokens(name);
	const specTokens = specs.map((token) => token.value);
	const specFamilies = specs.map((token) => token.family);
	const aliasTerms = Array.from(new Set(aliases.map(normalizeLedgerName).filter(Boolean))).sort();
	const pathNames = row.sectionName ? [row.sectionName, ...hierarchy.pathNames] : [...hierarchy.pathNames];
	const pathText = pathNames.join(" > ");
	const searchText = [name, pathText, row.sectionName, ...aliasTerms, ...specTokens].filter(Boolean).join(" ");
	const embeddingItemText = compact([
		`清单项：${name}`,
		specTokens.length ? `规格：${specSummary(specTokens)}` : undefined,
		unit ? `计量单位：${unit}` : undefined,
	]);
	const embeddingContextText = compact([
		row.sectionName ? `章节：${row.sectionName}` : undefined,
		pathText ? `清单路径：${pathText}` : undefined,
		`当前清单项：${name}`,
		specTokens.length ? `规格：${specSummary(specTokens)}` : undefined,
		unit ? `计量单位：${unit}` : undefined,
	]);
	const rerankText = compact([
		row.sectionName ? `章节：${row.sectionName}` : undefined,
		`清单编码：${code}`,
		pathText ? `路径：${pathText}` : undefined,
		`清单项：${name}`,
		specTokens.length ? `规格：${specSummary(specTokens)}` : undefined,
		unit ? `单位：${unit}` : undefined,
	]);
	const embeddingInputHash = createHash("sha256")
		.update([embeddingItemText, embeddingContextText, config.embeddingModel, config.embeddingVersion, config.normalizerVersion, config.aliasVersion, config.specPatternVersion].join("\n"))
		.digest("hex");
	return {
		ledgerId: row.ledgerId,
		projectId: row.proId,
		...(row.sectionId ? { sectionId: row.sectionId } : {}),
		...(row.sectionName ? { sectionName: row.sectionName } : {}),
		ledgerCodeRaw: row.ledgerCodeRaw,
		ledgerCodeNorm: code,
		codeSegments: hierarchy.codeSegments,
		...(hierarchy.parentCode ? { parentCode: hierarchy.parentCode } : {}),
		ancestorCodes: hierarchy.ancestorCodes,
		existingAncestorCodes: hierarchy.existingAncestorCodes,
		missingAncestorCodes: hierarchy.missingAncestorCodes,
		hierarchyGap: hierarchy.hierarchyGap,
		depth: hierarchy.depth,
		hasChildren: hierarchy.hasChildren,
		isLeaf: hierarchy.isLeaf,
		ledgerNameRaw: row.ledgerNameRaw,
		ledgerNameNorm: name,
		...(row.unitRaw ? { unitRaw: row.unitRaw } : {}),
		...(unit ? { unitNorm: unit } : {}),
		pathNames,
		pathText,
		specTokens,
		specFamilies,
		aliasTerms,
		searchText,
		embeddingItemText,
		embeddingContextText,
		rerankText,
		embeddingVersion: config.embeddingVersion,
		normalizerVersion: config.normalizerVersion,
		aliasVersion: config.aliasVersion,
		specPatternVersion: config.specPatternVersion,
		embeddingInputHash,
		indexVersion: config.indexVersion,
		isDeleted: row.isDeleted,
	};
}
