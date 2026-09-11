import { describe, expect, it } from "vitest";
import { EngineeringRetrievalService } from "../src/retrieval/engineering/service.ts";
import type {
	EngineeringArmHit,
	EngineeringRetrievalBackend,
	EngineeringRetrievalTraceSink,
	EngineeringSearchDocument,
	EngineeringSearchFilters,
	ParsedEngineeringQuery,
} from "../src/retrieval/engineering/types.ts";
import type { TraceRetrievalInput } from "../src/trace/types.ts";

function document(id: string, overrides: Partial<EngineeringSearchDocument> = {}): EngineeringSearchDocument {
	return {
		engineeringId: id,
		projectId: "p1",
		ancestorIds: [],
		pathNames: ["涵洞", "涵台基础"],
		pathText: "涵洞 > 涵台基础",
		depth: 2,
		engineeringName: "涵台基础",
		engineeringCategoryName: "涵洞工程",
		engineeringTypeName: "涵台基础",
		alignmentSide: "NONE",
		localSide: "NONE",
		positionTokens: [],
		aliasTerms: [],
		crossAlignment: false,
		isMinUnit: true,
		isDeleted: false,
		semanticName: "涵台基础",
		semanticPath: "涵洞 > 涵台基础",
		searchText: "涵洞 涵台基础",
		embeddingNameText: "工程部位：涵台基础",
		embeddingContextText: "工程路径：涵洞 > 涵台基础",
		rerankText: "路径：涵洞 > 涵台基础；工程部位：涵台基础",
		embeddingVersion: "bge-m3-v1",
		embeddingInputHash: id,
		indexVersion: "v1",
		...overrides,
	};
}

class TraceSink implements EngineeringRetrievalTraceSink {
	readonly events: TraceRetrievalInput[] = [];
	recordRetrieval(input: TraceRetrievalInput): void {
		this.events.push(input);
	}
}

const embedding = {
	modelVersion: "bge-m3-v1",
	dimension: 1024,
	async embed(): Promise<readonly number[]> {
		return Array.from({ length: 1024 }, () => 0);
	},
};

describe("EngineeringRetrievalService", () => {
	it("returns a unique strong exact hit without dense or rerank calls", async () => {
		let denseCalls = 0;
		let rerankCalls = 0;
		const backend: EngineeringRetrievalBackend = {
			async searchExact(): Promise<readonly EngineeringArmHit[]> {
				return [{ document: document("e1", { engineeringCode: "ENG-001" }), exactKinds: ["ENGINEERING_CODE"] }];
			},
			async searchBm25() { return []; },
			async searchDense() { denseCalls += 1; return []; },
		};
		const service = new EngineeringRetrievalService({
			backend,
			embedding,
			reranker: { modelVersion: "reranker-v1", async score() { rerankCalls += 1; return []; } },
		});
		const result = await service.search({ query: "工程编码 ENG-001", projectId: "p1" });
		expect(result.confidence.level).toBe("EXACT");
		expect(result.results[0]?.engineeringId).toBe("e1");
		expect(denseCalls).toBe(0);
		expect(rerankCalls).toBe(0);
	});

	it("keeps an ambiguous short entity as multiple candidates instead of auto accepting", async () => {
		const docs = [document("e1"), document("e2")];
		const backend: EngineeringRetrievalBackend = {
			async searchExact() { return []; },
			async searchBm25() { return docs.map((item) => ({ document: item })); },
			async searchDense() { return docs.map((item) => ({ document: item })); },
		};
		const service = new EngineeringRetrievalService({
			backend,
			embedding,
			reranker: { modelVersion: "reranker-v1", async score(_query, candidates) { return candidates.map(() => 0.75); } },
		});
		const result = await service.search({ query: "涵台基础", projectId: "p1" });
		expect(result.results).toHaveLength(2);
		expect(result.confidence.autoAccept).toBe(false);
	});

	it("relaxes only permitted low-confidence filters, preserves project scope, and traces the retrieval", async () => {
		const trace = new TraceSink();
		const seenFilters: EngineeringSearchFilters[] = [];
		const hit = document("e1", { engineeringName: "盖梁", engineeringTypeName: "盖梁" });
		const backend: EngineeringRetrievalBackend = {
			async searchExact(_query: ParsedEngineeringQuery, filters: EngineeringSearchFilters) {
				seenFilters.push({ ...filters });
				return [];
			},
			async searchBm25(_query: ParsedEngineeringQuery, filters: EngineeringSearchFilters) {
				seenFilters.push({ ...filters });
				return filters.engineeringTypeName ? [] : [{ document: hit }];
			},
			async searchDense(_field, _vector, filters) {
				seenFilters.push({ ...filters });
				return filters.engineeringTypeName ? [] : [{ document: hit }];
			},
		};
		const service = new EngineeringRetrievalService({
			backend,
			embedding,
			reranker: { modelVersion: "reranker-v1", async score(_query, candidates) { return candidates.map(() => 0.9); } },
			trace,
		});
		const result = await service.search({
			query: "盖梁",
			projectId: "p1",
			debug: true,
			hints: { engineeringTypeName: { value: "盖梁", confidence: 0.8, mode: "hard", source: "resolver" } },
		});
		expect(result.results[0]?.engineeringId).toBe("e1");
		expect(result.debug?.relaxedFilters).toEqual(["engineeringTypeName"]);
		expect(seenFilters.every((filters) => filters.projectId === "p1")).toBe(true);
		expect(trace.events).toHaveLength(1);
		expect(trace.events[0]?.retrievalType).toBe("ENGINEERING_POSITION_HYBRID");
	});
});
