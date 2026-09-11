import type { BoqIndexWriter } from "./indexer.ts";
import type { BoqSearchDocument } from "./types.ts";

export interface OpenSearchBoqIndexTransport {
	index(index: string, id: string, document: Readonly<Record<string, unknown>>): Promise<void>;
	update(index: string, id: string, document: Readonly<Record<string, unknown>>): Promise<void>;
	delete(index: string, id: string): Promise<void>;
}

export interface OpenSearchBoqIndexWriterOptions { transport: OpenSearchBoqIndexTransport; indexName: string; }

function compact(entries: readonly [string, unknown][]): Readonly<Record<string, unknown>> {
	return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}

export function boqDocumentToOpenSearchSource(document: BoqSearchDocument): Readonly<Record<string, unknown>> {
	return compact([
		["ledger_id", document.ledgerId], ["pro_id", document.projectId], ["section_id", document.sectionId], ["section_name", document.sectionName],
		["ledger_code_raw", document.ledgerCodeRaw], ["ledger_code_norm", document.ledgerCodeNorm], ["code_segments", document.codeSegments],
		["parent_code", document.parentCode], ["ancestor_codes", document.ancestorCodes], ["existing_ancestor_codes", document.existingAncestorCodes],
		["missing_ancestor_codes", document.missingAncestorCodes], ["hierarchy_gap", document.hierarchyGap], ["depth", document.depth],
		["has_children", document.hasChildren], ["is_leaf", document.isLeaf], ["ledger_name_raw", document.ledgerNameRaw],
		["ledger_name_norm", document.ledgerNameNorm], ["unit_raw", document.unitRaw], ["unit_norm", document.unitNorm], ["path_names", document.pathNames],
		["path_text", document.pathText], ["spec_tokens", document.specTokens], ["spec_families", document.specFamilies], ["alias_terms", document.aliasTerms],
		["search_text", document.searchText], ["embedding_item_text", document.embeddingItemText], ["embedding_context_text", document.embeddingContextText],
		["rerank_text", document.rerankText], ["embedding_version", document.embeddingVersion], ["normalizer_version", document.normalizerVersion],
		["alias_version", document.aliasVersion], ["spec_pattern_version", document.specPatternVersion], ["embedding_input_hash", document.embeddingInputHash],
		["index_version", document.indexVersion], ["is_deleted", document.isDeleted], ["item_vector", document.itemVector], ["context_vector", document.contextVector],
	]);
}

function withoutVectors(source: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
	return Object.fromEntries(Object.entries(source).filter(([key]) => key !== "item_vector" && key !== "context_vector"));
}

export class OpenSearchBoqIndexWriter implements BoqIndexWriter {
	private readonly transport: OpenSearchBoqIndexTransport;
	private readonly indexName: string;
	constructor(options: OpenSearchBoqIndexWriterOptions) { this.transport = options.transport; this.indexName = options.indexName; }
	async upsert(document: BoqSearchDocument, options: { preserveExistingVectors: boolean }): Promise<void> {
		const source = boqDocumentToOpenSearchSource(document);
		if (options.preserveExistingVectors) { await this.transport.update(this.indexName, document.ledgerId, { doc: withoutVectors(source) }); return; }
		await this.transport.index(this.indexName, document.ledgerId, source);
	}
	async delete(ledgerId: string): Promise<void> { await this.transport.delete(this.indexName, ledgerId); }
}
