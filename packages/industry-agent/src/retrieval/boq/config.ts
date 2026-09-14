import type { BoqRetrievalConfig } from "./types.ts";

export const BOQ_RETRIEVAL_CONFIG_V1: BoqRetrievalConfig = {
	version: "boq-retrieval-v1",
	indexName: "boq_ledger_v1",
	indexVersion: "v1",
	embeddingModel: "BAAI/bge-m3",
	embeddingVersion: "bge-m3-boq-v1",
	embeddingDimension: 1024,
	normalizerVersion: "norm-v1",
	aliasVersion: "alias-v1",
	specPatternVersion: "spec-v1",
	exactTopK: 30,
	bm25TopK: 80,
	itemVectorTopK: 80,
	contextVectorTopK: 80,
	fusionKeepK: 80,
	rrfK: 60,
	rerankK: 50,
	finalTopK: 10,
	weights: {
		SPEC: { exact: 0.3, bm25: 0.25, item: 0.3, context: 0.15 },
		ITEM_SHORT: { exact: 0.3, bm25: 0.25, item: 0.35, context: 0.1 },
		CONTEXT: { exact: 0.15, bm25: 0.25, item: 0.2, context: 0.4 },
		DEFAULT: { exact: 0.2, bm25: 0.3, item: 0.3, context: 0.2 },
	},
	rankingWeights: { rerank: 0.55, fusion: 0.2, business: 0.25 },
	confidence: { autoAcceptRaw: 0.82, maxCriticalSpecConflicts: 0 },
};
