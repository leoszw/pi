import { sha256Text } from "./checksum.ts";
import type { RagChunkDraft, RagChunker, RagChunkerConfig, RagExtractedBlock, RagTokenWindow } from "./types.ts";

export class ApproximateUnicodeTokenWindow implements RagTokenWindow {
	count(text: string): number { return Math.ceil(Array.from(text).length / 2); }
	split(text: string, maxTokens: number, overlapTokens: number): readonly string[] {
		const chars = Array.from(text);
		const maxChars = Math.max(2, maxTokens * 2);
		const overlapChars = Math.min(maxChars - 1, Math.max(0, overlapTokens * 2));
		const step = Math.max(1, maxChars - overlapChars);
		const output: string[] = [];
		for (let start = 0; start < chars.length; start += step) {
			const part = chars.slice(start, start + maxChars).join("").trim();
			if (part) output.push(part);
			if (start + maxChars >= chars.length) break;
		}
		return output;
	}
}

function cleanText(text: string): string {
	return text.normalize("NFKC").replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export class StructureAwareRagChunker implements RagChunker {
	readonly version: string;
	private readonly tokens: RagTokenWindow;
	private readonly config: RagChunkerConfig;
	constructor(version: string, config: RagChunkerConfig, tokens: RagTokenWindow = new ApproximateUnicodeTokenWindow()) {
		this.version = version; this.config = config; this.tokens = tokens;
	}
	chunk(documentId: string, blocks: readonly RagExtractedBlock[]): readonly RagChunkDraft[] {
		const chunks: RagChunkDraft[] = [];
		const blockToFirstChunk = new Map<string, string>();
		let ordinal = 0;
		for (const block of blocks) {
			const text = cleanText(block.text);
			if (!text) continue;
			const parentChunkId = block.parentBlockId ? blockToFirstChunk.get(block.parentBlockId) : undefined;
			const parts = block.type === "TABLE" || this.tokens.count(text) <= this.config.maxSectionTokens
				? [text]
				: this.tokens.split(text, this.config.maxSectionTokens, this.config.overlapTokens);
			parts.forEach((part, segmentIndex) => {
				const chunkId = `${documentId}:c:${String(ordinal + 1).padStart(6, "0")}:${sha256Text(`${block.blockId}:${segmentIndex}:${part}`).slice(0, 12)}`;
				if (segmentIndex === 0) blockToFirstChunk.set(block.blockId, chunkId);
				chunks.push({
					chunkId, documentId, ...(parentChunkId ? { parentChunkId } : {}), sourceBlockId: block.blockId,
					ordinal: ordinal++, type: parts.length > 1 ? "WINDOW" : block.type, text: part,
					sectionPath: [...block.sectionPath], pageStart: block.pageStart, pageEnd: block.pageEnd,
					metadata: { ...(block.metadata ?? {}), sourceBlockType: block.type, segmentIndex, segmentCount: parts.length },
				});
			});
		}
		return chunks;
	}
}
