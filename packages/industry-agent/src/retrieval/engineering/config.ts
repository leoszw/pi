import type { EngineeringRetrievalConfig } from "./types.ts";

export const ENGINEERING_RETRIEVAL_CONFIG_V1: EngineeringRetrievalConfig = {
	version: "engineering-retrieval-v1",
	indexName: "engineering_position_v1",
	indexVersion: "v1",
	embeddingModel: "BAAI/bge-m3",
	embeddingDimension: 1024,
	exactTopK: 20,
	bm25TopK: 80,
	nameVectorTopK: 80,
	contextVectorTopK: 80,
	fusionKeepK: 80,
	rrfK: 60,
	rerankK: 50,
	finalTopK: 10,
	defaultNearbyRadiusM: 50,
	weights: {
		CHAINAGE: { exact: 0.25, bm25: 0.3, name: 0.3, context: 0.15 },
		ENTITY_SHORT: { exact: 0.35, bm25: 0.25, name: 0.3, context: 0.1 },
		CONTEXT: { exact: 0.15, bm25: 0.25, name: 0.2, context: 0.4 },
		DEFAULT: { exact: 0.2, bm25: 0.3, name: 0.3, context: 0.2 },
	},
	finalScoreWeights: { rerank: 0.6, fusion: 0.2, business: 0.2 },
	confidence: { autoAcceptScore: 0.82, autoAcceptMargin: 0.08, ambiguousFloor: 0.72 },
};
