import { IndustryAgentError } from "../../errors/industry-agent-error.ts";
import type { RagQualityInput, RagQualityValidator } from "./types.ts";

function sameIds(expected: readonly string[], actual: readonly string[]): boolean {
	const left = [...expected].sort(); const right = [...actual].sort();
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

export class StrictRagQualityValidator implements RagQualityValidator {
	validate(input: RagQualityInput): void {
		if (input.chunks.length === 0) throw new IndustryAgentError("RAG_QUALITY_FAILED", "Ingestion produced no chunks");
		if (input.vectors.length !== input.chunks.length) throw new IndustryAgentError("RAG_QUALITY_FAILED", "Embedding count does not match chunk count");
		for (const [index, chunk] of input.chunks.entries()) {
			if (!chunk.text.trim()) throw new IndustryAgentError("RAG_QUALITY_FAILED", `Chunk ${chunk.chunkId} is empty`);
			if (chunk.pageStart < 1 || chunk.pageEnd < chunk.pageStart) throw new IndustryAgentError("RAG_QUALITY_FAILED", `Chunk ${chunk.chunkId} has invalid page range`);
			if (input.vectors[index]?.length !== input.expectedEmbeddingDimension) throw new IndustryAgentError("RAG_QUALITY_FAILED", `Chunk ${chunk.chunkId} has invalid embedding dimension`);
			if (chunk.scope.tenantId !== input.document.scope.tenantId) throw new IndustryAgentError("RAG_QUALITY_FAILED", `Chunk ${chunk.chunkId} scope is inconsistent with document`);
		}
		const ids = input.chunks.map((chunk) => chunk.chunkId);
		if (!sameIds(ids, input.lexicalIndexedIds)) throw new IndustryAgentError("RAG_QUALITY_FAILED", "Lexical index receipt does not cover all chunks");
		if (!sameIds(ids, input.vectorIndexedIds)) throw new IndustryAgentError("RAG_QUALITY_FAILED", "Vector index receipt does not cover all chunks");
	}
}
