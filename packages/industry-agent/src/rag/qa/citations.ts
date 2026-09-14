import type { RagChunkRecord, RagDocumentRecord } from "../ingestion/types.ts";
import { isAccessible } from "./access.ts";
import type {
	RagQaAccessFilter,
	RagQaCitation,
	RagQaEvidenceItem,
	RagQaRankedCandidate,
	RagQaSourceReader,
} from "./types.ts";

function clip(text: string, maxChars: number): string {
	const value = text.trim();
	return value.length <= maxChars ? value : `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function citationFor(id: string, document: RagDocumentRecord, chunk: RagChunkRecord): RagQaCitation {
	return {
		citationId: id,
		documentId: document.documentId,
		chunkId: chunk.chunkId,
		page: chunk.pageStart === chunk.pageEnd ? chunk.pageStart : null,
		pageStart: chunk.pageStart,
		pageEnd: chunk.pageEnd,
		section: chunk.sectionPath.join(" > "),
		sectionPath: [...chunk.sectionPath],
		quote: clip(chunk.text, 600),
		sourceVersion: document.checksumSha256,
		...(document.versions.parserVersion ? { parserVersion: document.versions.parserVersion } : {}),
		chunkerVersion: chunk.chunkerVersion,
		embeddingVersion: chunk.embeddingVersion,
		lexicalIndexVersion: chunk.lexicalIndexVersion,
		vectorIndexVersion: chunk.vectorIndexVersion,
	};
}

export async function buildEvidence(
	candidates: readonly RagQaRankedCandidate[],
	sources: RagQaSourceReader,
	filter: RagQaAccessFilter,
	parentExpansionChars: number,
): Promise<readonly RagQaEvidenceItem[]> {
	const output: RagQaEvidenceItem[] = [];
	for (const [index, candidate] of candidates.entries()) {
		const document = await sources.getDocument(candidate.document.documentId, filter);
		if (!document || !isAccessible(document, candidate.chunk, filter)) continue;
		let parentText = "";
		let parentCitation: RagQaCitation | undefined;
		if (candidate.chunk.parentChunkId) {
			const parent = await sources.getChunk(candidate.chunk.parentChunkId, filter);
			if (parent && isAccessible(document, parent, filter)) {
				parentText = clip(parent.text, parentExpansionChars);
				parentCitation = citationFor(`C${index + 1}P`, document, parent);
			}
		}
		const contextText = parentText ? `${parentText}\n\n${candidate.chunk.text}` : candidate.chunk.text;
		const citation = citationFor(`C${index + 1}`, document, candidate.chunk);
		output.push({
			candidate,
			contextText,
			...(candidate.chunk.parentChunkId ? { parentChunkId: candidate.chunk.parentChunkId } : {}),
			citation,
			...(parentCitation ? { parentCitation } : {}),
		});
	}
	return output;
}
