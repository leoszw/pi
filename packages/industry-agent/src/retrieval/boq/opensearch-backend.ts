import type { BoqArmHit, BoqRetrievalBackend, BoqSearchDocument, BoqSearchFilters, ParsedBoqQuery } from "./types.ts";

export interface OpenSearchBoqTransport {
	search(index: string, body: Readonly<Record<string, unknown>>): Promise<{ hits: { hits: readonly { _score?: number; _source?: Readonly<Record<string, unknown>>; matched_queries?: readonly string[] }[] } }>;
}

export interface OpenSearchBoqBackendOptions { transport: OpenSearchBoqTransport; indexName: string; efSearch?: number; }

function filtersToDsl(filters: BoqSearchFilters): readonly Readonly<Record<string, unknown>>[] {
	const result: Readonly<Record<string, unknown>>[] = [
		{ term: { is_deleted: false } },
		{ term: { pro_id: filters.projectId } },
	];
	if (filters.sectionId) result.push({ term: { section_id: filters.sectionId } });
	else if (filters.sectionName) result.push({ term: { "section_name.keyword": filters.sectionName } });
	if (filters.leafOnly) result.push({ term: { is_leaf: true } });
	return result;
}

function sourceToDocument(source: Readonly<Record<string, unknown>>): BoqSearchDocument {
	const array = (key: string): readonly string[] => Array.isArray(source[key]) ? (source[key] as unknown[]).map(String) : [];
	const string = (key: string): string | undefined => source[key] === undefined || source[key] === null ? undefined : String(source[key]);
	const bool = (key: string): boolean => Boolean(source[key]);
	const number = (key: string): number => Number(source[key] ?? 0);
	const sectionId = string("section_id");
	const sectionName = string("section_name");
	const parentCode = string("parent_code");
	const unitRaw = string("unit_raw");
	const unitNorm = string("unit_norm");
	return {
		ledgerId: string("ledger_id") ?? "",
		projectId: string("pro_id") ?? "",
		...(sectionId ? { sectionId } : {}),
		...(sectionName ? { sectionName } : {}),
		ledgerCodeRaw: string("ledger_code_raw") ?? "",
		ledgerCodeNorm: string("ledger_code_norm") ?? "",
		codeSegments: array("code_segments"),
		...(parentCode ? { parentCode } : {}),
		ancestorCodes: array("ancestor_codes"),
		existingAncestorCodes: array("existing_ancestor_codes"),
		missingAncestorCodes: array("missing_ancestor_codes"),
		hierarchyGap: bool("hierarchy_gap"),
		depth: number("depth"),
		hasChildren: bool("has_children"),
		isLeaf: bool("is_leaf"),
		ledgerNameRaw: string("ledger_name_raw") ?? "",
		ledgerNameNorm: string("ledger_name_norm") ?? "",
		...(unitRaw ? { unitRaw } : {}),
		...(unitNorm ? { unitNorm } : {}),
		pathNames: array("path_names"),
		pathText: string("path_text") ?? "",
		specTokens: array("spec_tokens"),
		specFamilies: array("spec_families"),
		aliasTerms: array("alias_terms"),
		searchText: string("search_text") ?? "",
		embeddingItemText: string("embedding_item_text") ?? "",
		embeddingContextText: string("embedding_context_text") ?? "",
		rerankText: string("rerank_text") ?? "",
		embeddingVersion: string("embedding_version") ?? "",
		normalizerVersion: string("normalizer_version") ?? "",
		aliasVersion: string("alias_version") ?? "",
		specPatternVersion: string("spec_pattern_version") ?? "",
		embeddingInputHash: string("embedding_input_hash") ?? "",
		indexVersion: string("index_version") ?? "",
		isDeleted: bool("is_deleted"),
	};
}

function hits(response: Awaited<ReturnType<OpenSearchBoqTransport["search"]>>): readonly BoqArmHit[] {
	return response.hits.hits.flatMap((hit) => hit._source ? [{ document: sourceToDocument(hit._source), ...(hit._score !== undefined ? { rawScore: hit._score } : {}), ...(hit.matched_queries ? { matchedQueries: hit.matched_queries } : {}) }] : []);
}

export class OpenSearchBoqRetrievalBackend implements BoqRetrievalBackend {
	private readonly transport: OpenSearchBoqTransport;
	private readonly indexName: string;
	private readonly efSearch: number;
	constructor(options: OpenSearchBoqBackendOptions) { this.transport = options.transport; this.indexName = options.indexName; this.efSearch = options.efSearch ?? 160; }

	async searchExactCode(query: ParsedBoqQuery, filters: BoqSearchFilters): Promise<readonly BoqArmHit[]> {
		if (!query.ledgerCode) return [];
		const response = await this.transport.search(this.indexName, { size: 2, query: { bool: { filter: [...filtersToDsl(filters), { term: { ledger_code_norm: query.ledgerCode } }] } } });
		return hits(response).map((hit) => ({ ...hit, exactKinds: ["LEDGER_CODE"] }));
	}

	async listDescendants(query: ParsedBoqQuery, filters: BoqSearchFilters, topK: number): Promise<readonly BoqArmHit[]> {
		if (!query.ancestorCode) return [];
		const response = await this.transport.search(this.indexName, {
			size: topK,
			query: { bool: { filter: [...filtersToDsl(filters), { term: { ancestor_codes: query.ancestorCode } }] } },
			sort: [{ depth: "asc" }, { ledger_code_norm: "asc" }],
		});
		return hits(response);
	}

	async searchExact(query: ParsedBoqQuery, filters: BoqSearchFilters, topK: number): Promise<readonly BoqArmHit[]> {
		const should: Readonly<Record<string, unknown>>[] = [];
		if (query.ledgerNameNorm) should.push({ term: { "ledger_name_norm.keyword": { value: query.ledgerNameNorm, boost: 8, _name: "name" } } });
		for (const alias of query.aliases) should.push({ term: { alias_terms: { value: alias, boost: 6, _name: "alias" } } });
		for (const token of query.specTokens) should.push({ term: { spec_tokens: { value: token.value, boost: 4, _name: `spec:${token.value}` } } });
		if (should.length === 0) return [];
		const response = await this.transport.search(this.indexName, { size: topK, query: { bool: { filter: filtersToDsl(filters), should, minimum_should_match: 1 } } });
		return hits(response);
	}

	async searchBm25(query: ParsedBoqQuery, filters: BoqSearchFilters, topK: number): Promise<readonly BoqArmHit[]> {
		if (!query.semanticQuery) return [];
		const response = await this.transport.search(this.indexName, {
			size: topK,
			query: { bool: { filter: filtersToDsl(filters), must: [{ multi_match: { query: query.semanticQuery, type: "best_fields", fields: ["ledger_name_norm^6", "path_text^4", "section_name^2", "search_text^1"] } }] } },
		});
		return hits(response);
	}

	async searchDense(field: "item_vector" | "context_vector", queryVector: readonly number[], filters: BoqSearchFilters, topK: number): Promise<readonly BoqArmHit[]> {
		const response = await this.transport.search(this.indexName, {
			size: topK,
			query: { knn: { [field]: { vector: queryVector, k: topK, filter: { bool: { filter: filtersToDsl(filters) } }, method_parameters: { ef_search: this.efSearch } } } },
		});
		return hits(response);
	}
}
