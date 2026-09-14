import type { EngineeringIndexWriter } from "./indexer.ts";
import type { EngineeringSearchDocument } from "./types.ts";

export interface OpenSearchIndexTransport {
	index(index: string, id: string, document: Readonly<Record<string, unknown>>): Promise<void>;
	update(index: string, id: string, document: Readonly<Record<string, unknown>>): Promise<void>;
	delete(index: string, id: string): Promise<void>;
}

export interface OpenSearchEngineeringIndexWriterOptions {
	transport: OpenSearchIndexTransport;
	indexName: string;
}

function compact(entries: readonly [string, unknown][]): Readonly<Record<string, unknown>> {
	return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}

export function engineeringDocumentToOpenSearchSource(
	document: EngineeringSearchDocument,
): Readonly<Record<string, unknown>> {
	return compact([
		["engineering_id", document.engineeringId],
		["engineering_code", document.engineeringCode],
		["pro_id", document.projectId],
		["unit_engineering_id", document.unitEngineeringId],
		["unit_engineering_name", document.unitEngineeringName],
		["parent_engineering_id", document.parentEngineeringId],
		["ancestor_ids", document.ancestorIds],
		["path_names", document.pathNames],
		["path_text", document.pathText],
		["depth", document.depth],
		["engineering_name", document.engineeringName],
		["engineering_full_name", document.engineeringFullName],
		["engineering_category_name", document.engineeringCategoryName],
		["engineering_type_name", document.engineeringTypeName],
		["alignment_code", document.alignmentCode],
		["alignment_side", document.alignmentSide],
		["local_side", document.localSide],
		["position_tokens", document.positionTokens],
		["alias_terms", document.aliasTerms],
		["chainage_start_m", document.chainageStartM],
		["chainage_end_m", document.chainageEndM],
		["cross_alignment", document.crossAlignment],
		["is_min_unit", document.isMinUnit],
		["is_deleted", document.isDeleted],
		["semantic_name", document.semanticName],
		["semantic_path", document.semanticPath],
		["search_text", document.searchText],
		["embedding_name_text", document.embeddingNameText],
		["embedding_context_text", document.embeddingContextText],
		["rerank_text", document.rerankText],
		["embedding_version", document.embeddingVersion],
		["embedding_input_hash", document.embeddingInputHash],
		["index_version", document.indexVersion],
		["name_vector", document.nameVector],
		["context_vector", document.contextVector],
	]);
}

function withoutVectors(source: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
	return Object.fromEntries(
		Object.entries(source).filter(([key]) => key !== "name_vector" && key !== "context_vector"),
	);
}

export class OpenSearchEngineeringIndexWriter implements EngineeringIndexWriter {
	private readonly transport: OpenSearchIndexTransport;
	private readonly indexName: string;

	constructor(options: OpenSearchEngineeringIndexWriterOptions) {
		this.transport = options.transport;
		this.indexName = options.indexName;
	}

	async upsert(document: EngineeringSearchDocument, options: { preserveExistingVectors: boolean }): Promise<void> {
		const source = engineeringDocumentToOpenSearchSource(document);
		if (options.preserveExistingVectors) {
			await this.transport.update(this.indexName, document.engineeringId, { doc: withoutVectors(source) });
			return;
		}
		await this.transport.index(this.indexName, document.engineeringId, source);
	}

	async delete(engineeringId: string): Promise<void> {
		await this.transport.delete(this.indexName, engineeringId);
	}
}
