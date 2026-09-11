import { IndustryAgentError } from "../../errors/industry-agent-error.ts";
import type {
	EngineeringArmHit,
	EngineeringExactMatchKind,
	EngineeringRetrievalBackend,
	EngineeringSearchDocument,
	EngineeringSearchFilters,
	ParsedEngineeringQuery,
} from "./types.ts";

export interface OpenSearchTransport {
	search(index: string, body: Readonly<Record<string, unknown>>): Promise<unknown>;
}

export interface OpenSearchEngineeringBackendOptions {
	transport: OpenSearchTransport;
	indexName: string;
}

function filterClauses(filters: EngineeringSearchFilters): readonly Readonly<Record<string, unknown>>[] {
	const clauses: Readonly<Record<string, unknown>>[] = [
		{ term: { is_deleted: false } },
		{ term: { pro_id: filters.projectId } },
	];
	if (filters.unitEngineeringId) clauses.push({ term: { unit_engineering_id: filters.unitEngineeringId } });
	if (filters.alignmentCode) clauses.push({ term: { alignment_code: filters.alignmentCode } });
	if (filters.alignmentSide) clauses.push({ term: { alignment_side: filters.alignmentSide } });
	if (filters.engineeringCategoryName) clauses.push({ term: { engineering_category_name: filters.engineeringCategoryName } });
	if (filters.engineeringTypeName) clauses.push({ term: { engineering_type_name: filters.engineeringTypeName } });
	if (filters.leafOnly !== undefined) clauses.push({ term: { is_min_unit: filters.leafOnly } });
	if (filters.chainageStartM !== undefined && filters.chainageEndM !== undefined) {
		clauses.push({ term: { cross_alignment: false } });
		clauses.push({ range: { chainage_start_m: { lte: filters.chainageEndM } } });
		clauses.push({ range: { chainage_end_m: { gte: filters.chainageStartM } } });
	}
	return clauses;
}

function namedTerm(name: string, field: string, value: string): Readonly<Record<string, unknown>> {
	return { term: { [field]: { value, _name: name } } };
}

export function buildEngineeringExactQuery(
	query: ParsedEngineeringQuery,
	filters: EngineeringSearchFilters,
	topK: number,
): Readonly<Record<string, unknown>> {
	const should: Readonly<Record<string, unknown>>[] = [];
	if (query.engineeringCode) should.push(namedTerm("exact_code", "engineering_code", query.engineeringCode));
	if (query.semanticQuery) {
		should.push(namedTerm("exact_full_name", "engineering_full_name.keyword", query.rawQuery));
		should.push(namedTerm("exact_name", "engineering_name.keyword", query.semanticQuery));
		should.push(namedTerm("exact_alias", "alias_terms", query.semanticQuery));
	}
	for (const token of query.positionTokens) should.push(namedTerm("exact_alias", "alias_terms", token));
	return {
		size: topK,
		query: {
			bool: {
				filter: filterClauses(filters),
				should: should.length > 0 ? should : [{ match_none: {} }],
				minimum_should_match: 1,
			},
		},
	};
}

export function buildEngineeringBm25Query(
	query: ParsedEngineeringQuery,
	filters: EngineeringSearchFilters,
	topK: number,
): Readonly<Record<string, unknown>> {
	return {
		size: topK,
		query: {
			bool: {
				filter: filterClauses(filters),
				must: [{
					multi_match: {
						query: query.semanticQuery || query.rawQuery,
						type: "best_fields",
						fields: ["engineering_name^6", "engineering_full_name^4", "unit_engineering_name^3", "path_text^3", "search_text^1"],
					},
				}],
			},
		},
	};
}

export function buildEngineeringKnnQuery(
	field: "name_vector" | "context_vector",
	queryVector: readonly number[],
	filters: EngineeringSearchFilters,
	topK: number,
): Readonly<Record<string, unknown>> {
	return {
		size: topK,
		query: {
			knn: {
				[field]: {
					vector: queryVector,
					k: topK,
					filter: { bool: { filter: filterClauses(filters) } },
				},
			},
		},
	};
}

function record(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

function stringArray(value: unknown): readonly string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function sourceToDocument(source: Record<string, unknown>): EngineeringSearchDocument {
	const engineeringId = stringValue(source.engineering_id);
	const projectId = stringValue(source.pro_id);
	const engineeringName = stringValue(source.engineering_name);
	if (!engineeringId || !projectId || !engineeringName) {
		throw new IndustryAgentError("RETRIEVAL_ERROR", "OpenSearch engineering hit is missing required string identity fields");
	}
	return {
		engineeringId,
		engineeringCode: stringValue(source.engineering_code),
		projectId,
		unitEngineeringId: stringValue(source.unit_engineering_id),
		unitEngineeringName: stringValue(source.unit_engineering_name),
		parentEngineeringId: stringValue(source.parent_engineering_id),
		ancestorIds: stringArray(source.ancestor_ids),
		pathNames: stringArray(source.path_names),
		pathText: stringValue(source.path_text) ?? "",
		depth: numberValue(source.depth) ?? 0,
		engineeringName,
		engineeringFullName: stringValue(source.engineering_full_name),
		engineeringCategoryName: stringValue(source.engineering_category_name),
		engineeringTypeName: stringValue(source.engineering_type_name),
		alignmentCode: stringValue(source.alignment_code),
		alignmentSide: (stringValue(source.alignment_side) as EngineeringSearchDocument["alignmentSide"]) ?? "NONE",
		localSide: (stringValue(source.local_side) as EngineeringSearchDocument["localSide"]) ?? "NONE",
		positionTokens: stringArray(source.position_tokens),
		aliasTerms: stringArray(source.alias_terms),
		chainageStartM: numberValue(source.chainage_start_m),
		chainageEndM: numberValue(source.chainage_end_m),
		crossAlignment: booleanValue(source.cross_alignment) ?? false,
		isMinUnit: booleanValue(source.is_min_unit) ?? false,
		isDeleted: booleanValue(source.is_deleted) ?? false,
		semanticName: stringValue(source.semantic_name) ?? engineeringName,
		semanticPath: stringValue(source.semantic_path) ?? "",
		searchText: stringValue(source.search_text) ?? "",
		embeddingNameText: stringValue(source.embedding_name_text) ?? "",
		embeddingContextText: stringValue(source.embedding_context_text) ?? "",
		rerankText: stringValue(source.rerank_text) ?? "",
		embeddingVersion: stringValue(source.embedding_version) ?? "unknown",
		embeddingInputHash: stringValue(source.embedding_input_hash) ?? "",
		indexVersion: stringValue(source.index_version) ?? "unknown",
	};
}

function exactKinds(matchedQueries: readonly string[]): readonly EngineeringExactMatchKind[] {
	const kinds = new Set<EngineeringExactMatchKind>();
	for (const name of matchedQueries) {
		if (name === "exact_code") kinds.add("ENGINEERING_CODE");
		if (name === "exact_full_name") kinds.add("FULL_NAME");
		if (name === "exact_name") kinds.add("NAME");
		if (name === "exact_alias") kinds.add("ALIAS");
	}
	return Array.from(kinds);
}

function parseHits(response: unknown, includeExactKinds: boolean): readonly EngineeringArmHit[] {
	const root = record(response);
	const hitsObject = record(root?.hits);
	const rawHits = Array.isArray(hitsObject?.hits) ? hitsObject.hits : [];
	return rawHits.map((raw): EngineeringArmHit => {
		const hit = record(raw);
		const source = record(hit?._source);
		if (!source) throw new IndustryAgentError("RETRIEVAL_ERROR", "OpenSearch engineering hit has no _source");
		const matchedQueries = stringArray(hit?.matched_queries);
		return {
			document: sourceToDocument(source),
			rawScore: numberValue(hit?._score),
			matchedQueries,
			...(includeExactKinds ? { exactKinds: exactKinds(matchedQueries) } : {}),
		};
	});
}

export class OpenSearchEngineeringRetrievalBackend implements EngineeringRetrievalBackend {
	private readonly transport: OpenSearchTransport;
	private readonly indexName: string;

	constructor(options: OpenSearchEngineeringBackendOptions) {
		this.transport = options.transport;
		this.indexName = options.indexName;
	}

	async searchExact(query: ParsedEngineeringQuery, filters: EngineeringSearchFilters, topK: number): Promise<readonly EngineeringArmHit[]> {
		return parseHits(await this.transport.search(this.indexName, buildEngineeringExactQuery(query, filters, topK)), true);
	}

	async searchBm25(query: ParsedEngineeringQuery, filters: EngineeringSearchFilters, topK: number): Promise<readonly EngineeringArmHit[]> {
		return parseHits(await this.transport.search(this.indexName, buildEngineeringBm25Query(query, filters, topK)), false);
	}

	async searchDense(
		field: "name_vector" | "context_vector",
		queryVector: readonly number[],
		filters: EngineeringSearchFilters,
		topK: number,
	): Promise<readonly EngineeringArmHit[]> {
		return parseHits(await this.transport.search(this.indexName, buildEngineeringKnnQuery(field, queryVector, filters, topK)), false);
	}
}
