import { describe, expect, it } from "vitest";
import { BOQ_RETRIEVAL_CONFIG_V1 } from "../src/retrieval/boq/config.ts";
import { BoqRetrievalService } from "../src/retrieval/boq/service.ts";
import type { BoqSearchDocument } from "../src/retrieval/boq/types.ts";

const baseDoc = {
	ledgerId: "1",
	projectId: "p",
	ledgerCodeRaw: "403-2-a",
	ledgerCodeNorm: "403-2-a",
	codeSegments: ["403", "2", "a"],
	parentCode: "403-2",
	ancestorCodes: ["403", "403-2"],
	existingAncestorCodes: [],
	missingAncestorCodes: [],
	hierarchyGap: false,
	depth: 3,
	hasChildren: false,
	isLeaf: true,
	ledgerNameRaw: "C30 混凝土",
	ledgerNameNorm: "C30 混凝土",
	unitNorm: "m³",
	pathNames: ["桥梁", "C30 混凝土"],
	pathText: "桥梁 > C30 混凝土",
	specTokens: ["C30"],
	specFamilies: ["concrete_grade"],
	aliasTerms: [],
	searchText: "C30 混凝土",
	embeddingItemText: "C30",
	embeddingContextText: "桥梁 C30",
	rerankText: "C30",
	embeddingVersion: "v",
	normalizerVersion: "v",
	aliasVersion: "v",
	specPatternVersion: "v",
	embeddingInputHash: "h",
	indexVersion: "v1",
	isDeleted: false,
} satisfies BoqSearchDocument;
const catalog = { knownCodes: new Set(["403-2-a"]), knownAncestorCodes: new Set(["403-2"]) };

describe("BOQ retrieval service", () => {
	it("directly resolves one project-scoped exact code", async () => {
		const backend = {
			async searchExactCode() {
				return [{ document: baseDoc }];
			},
			async listDescendants() {
				return [];
			},
			async searchExact() {
				return [];
			},
			async searchBm25() {
				return [];
			},
			async searchDense() {
				return [];
			},
		};
		const service = new BoqRetrievalService({
			backend,
			embedding: {
				modelVersion: "e",
				dimension: 1024,
				async embed() {
					return Array(1024).fill(0);
				},
			},
			reranker: {
				modelVersion: "r",
				async score() {
					return [];
				},
			},
			config: BOQ_RETRIEVAL_CONFIG_V1,
		});
		const response = await service.search({ query: "403-2-a 合同金额", projectId: "p", catalog });
		expect(response.confidence.level).toBe("EXACT");
		expect(response.confidence.autoAccept).toBe(true);
		expect(response.parsedQuery.operation).toBe("FACT_LOOKUP");
	});
	it("degrades to lexical retrieval and disables auto accept when embedding is unavailable", async () => {
		const backend = {
			async searchExactCode() {
				return [];
			},
			async listDescendants() {
				return [];
			},
			async searchExact() {
				return [{ document: baseDoc }];
			},
			async searchBm25() {
				return [{ document: baseDoc }];
			},
			async searchDense() {
				return [];
			},
		};
		const service = new BoqRetrievalService({
			backend,
			embedding: {
				modelVersion: "e",
				dimension: 1024,
				async embed() {
					throw new Error("down");
				},
			},
			reranker: {
				modelVersion: "r",
				async score() {
					return [0.95];
				},
			},
			config: BOQ_RETRIEVAL_CONFIG_V1,
		});
		const response = await service.search({
			query: "C30 混凝土",
			projectId: "p",
			catalog: { knownCodes: new Set(), knownAncestorCodes: new Set() },
			debug: true,
		});
		expect(response.results).toHaveLength(1);
		expect(response.confidence.autoAccept).toBe(false);
		expect(response.debug?.degraded).toBe(true);
	});
	it("penalizes explicit critical spec conflicts", async () => {
		const wrong = {
			...baseDoc,
			ledgerId: "2",
			ledgerNameRaw: "C35 混凝土",
			ledgerNameNorm: "C35 混凝土",
			specTokens: ["C35"],
		};
		const backend = {
			async searchExactCode() {
				return [];
			},
			async listDescendants() {
				return [];
			},
			async searchExact() {
				return [{ document: baseDoc }, { document: wrong }];
			},
			async searchBm25() {
				return [{ document: wrong }, { document: baseDoc }];
			},
			async searchDense() {
				return [{ document: wrong }, { document: baseDoc }];
			},
		};
		const service = new BoqRetrievalService({
			backend,
			embedding: {
				modelVersion: "e",
				dimension: 1024,
				async embed() {
					return Array(1024).fill(0);
				},
			},
			reranker: {
				modelVersion: "r",
				async score(_q, docs) {
					return docs.map(() => 0.9);
				},
			},
			config: BOQ_RETRIEVAL_CONFIG_V1,
		});
		const response = await service.search({
			query: "C30 混凝土",
			projectId: "p",
			catalog: { knownCodes: new Set(), knownAncestorCodes: new Set() },
		});
		expect(response.results[0]?.ledgerId).toBe("1");
		expect(response.results.find((r) => r.ledgerId === "2")?.scoreBreakdown.criticalSpecConflicts).toBe(1);
	});
});
