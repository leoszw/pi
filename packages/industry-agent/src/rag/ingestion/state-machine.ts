import { IndustryAgentError } from "../../errors/industry-agent-error.ts";
import type { RagDocumentStatus } from "./types.ts";

const NEXT: Readonly<Record<RagDocumentStatus, readonly RagDocumentStatus[]>> = {
	RECEIVED: ["VALIDATING", "FAILED"],
	VALIDATING: ["STORED", "DEDUPLICATED", "FAILED"],
	STORED: ["PARSING", "FAILED"],
	PARSING: ["EXTRACTING", "FAILED"],
	EXTRACTING: ["CHUNKING", "FAILED"],
	CHUNKING: ["ENRICHING", "FAILED"],
	ENRICHING: ["EMBEDDING", "FAILED"],
	EMBEDDING: ["INDEXING", "FAILED"],
	INDEXING: ["QUALITY_VALIDATING", "FAILED"],
	QUALITY_VALIDATING: ["READY", "FAILED"],
	READY: [],
	DEDUPLICATED: [],
	FAILED: [],
};

export function assertRagTransition(from: RagDocumentStatus, to: RagDocumentStatus): void {
	if (!NEXT[from].includes(to))
		throw new IndustryAgentError("RAG_STATE_INVALID", `Invalid RAG ingestion transition: ${from} -> ${to}`);
}
