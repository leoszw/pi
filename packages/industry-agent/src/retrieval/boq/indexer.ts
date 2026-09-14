import type { BoqSourceRow } from "../../entity/source-adapters.ts";
import { IndustryAgentError } from "../../errors/industry-agent-error.ts";
import type { BoqHierarchyInfo } from "./hierarchy.ts";
import { buildBoqSearchDocument } from "./text-builder.ts";
import type { BoqEmbeddingProvider, BoqRetrievalConfig, BoqSearchDocument } from "./types.ts";

export interface BoqIndexState {
	embeddingInputHash: string;
	indexVersion: string;
	ledgerCodeNorm: string;
}
export interface BoqIndexStateReader {
	getState(ledgerId: string): Promise<BoqIndexState | undefined>;
}
export interface BoqIndexWriter {
	upsert(document: BoqSearchDocument, options: { preserveExistingVectors: boolean }): Promise<void>;
	delete(ledgerId: string): Promise<void>;
}
export interface BoqHierarchyProvider {
	getHierarchy(ledgerCode: string): Promise<BoqHierarchyInfo>;
}
export interface BoqAliasProvider {
	getAliases(ledgerId: string): Promise<readonly string[]>;
}
export interface BoqIndexBatchOptions {
	mode?: "full" | "incremental";
}
export interface BoqIndexBatchResult {
	processed: number;
	upserted: number;
	deleted: number;
	embedded: number;
	structureOnlyUpdated: number;
	fullRebuildRecommended: boolean;
	lastCursor?: { updateTime: string; ledgerId: string };
}

export interface BoqIndexingServiceOptions {
	embedding: BoqEmbeddingProvider;
	hierarchy: BoqHierarchyProvider;
	aliases: BoqAliasProvider;
	state: BoqIndexStateReader;
	writer: BoqIndexWriter;
	config: BoqRetrievalConfig;
}

function compareCursor(
	left: { updateTime: string; ledgerId: string },
	right: { updateTime: string; ledgerId: string },
): number {
	const time = left.updateTime.localeCompare(right.updateTime);
	return time === 0 ? left.ledgerId.localeCompare(right.ledgerId) : time;
}

export class BoqIndexingService {
	private readonly options: BoqIndexingServiceOptions;
	constructor(options: BoqIndexingServiceOptions) {
		this.options = options;
	}
	async indexBatch(
		rows: readonly BoqSourceRow[],
		batchOptions: BoqIndexBatchOptions = {},
	): Promise<BoqIndexBatchResult> {
		const mode = batchOptions.mode ?? "incremental";
		let upserted = 0,
			deleted = 0,
			embedded = 0,
			structureOnlyUpdated = 0;
		let fullRebuildRecommended = false;
		let lastCursor: BoqIndexBatchResult["lastCursor"];
		for (const row of rows) {
			if (row.updateTime) {
				const cursor = { updateTime: row.updateTime, ledgerId: row.ledgerId };
				if (!lastCursor || compareCursor(lastCursor, cursor) < 0) lastCursor = cursor;
			}
			const previous = await this.options.state.getState(row.ledgerId);
			if (row.isDeleted) {
				await this.options.writer.delete(row.ledgerId);
				deleted += 1;
				if (mode === "incremental") fullRebuildRecommended = true;
				continue;
			}
			if (mode === "incremental" && (!previous || previous.ledgerCodeNorm !== row.ledgerCodeNorm))
				fullRebuildRecommended = true;
			const [hierarchy, aliases] = await Promise.all([
				this.options.hierarchy.getHierarchy(row.ledgerCodeNorm),
				this.options.aliases.getAliases(row.ledgerId),
			]);
			let document = buildBoqSearchDocument({ row, hierarchy, aliases, config: this.options.config });
			const preserve =
				previous?.embeddingInputHash === document.embeddingInputHash &&
				previous.indexVersion === this.options.config.indexVersion;
			if (!preserve) {
				const [itemVector, contextVector] = await Promise.all([
					this.options.embedding.embed(document.embeddingItemText),
					this.options.embedding.embed(document.embeddingContextText),
				]);
				this.assertVector(itemVector);
				this.assertVector(contextVector);
				document = { ...document, itemVector, contextVector };
				embedded += 1;
			} else structureOnlyUpdated += 1;
			await this.options.writer.upsert(document, { preserveExistingVectors: preserve });
			upserted += 1;
		}
		return {
			processed: rows.length,
			upserted,
			deleted,
			embedded,
			structureOnlyUpdated,
			fullRebuildRecommended,
			...(lastCursor ? { lastCursor } : {}),
		};
	}
	private assertVector(vector: readonly number[]): void {
		if (
			vector.length !== this.options.config.embeddingDimension ||
			vector.length !== this.options.embedding.dimension
		) {
			throw new IndustryAgentError("RETRIEVAL_ERROR", "BOQ index vector dimension mismatch", {
				details: {
					expected: this.options.config.embeddingDimension,
					provider: this.options.embedding.dimension,
					actual: vector.length,
				},
			});
		}
	}
}
