import type { RagQaContextResolver, RagQaQueryRewriter, RagQaResolvedContext } from "./types.ts";

export class PassthroughRagContextResolver implements RagQaContextResolver {
	async resolve(input: { question: string }): Promise<RagQaResolvedContext> {
		return { question: input.question.trim(), entityIds: [] };
	}
}

export class DeterministicRagQueryRewriter implements RagQaQueryRewriter {
	readonly version = "rag-query-rewrite-v1";
	async rewrite(input: RagQaResolvedContext): Promise<string> {
		return input.question.normalize("NFKC").replace(/\s+/g, " ").trim();
	}
}
