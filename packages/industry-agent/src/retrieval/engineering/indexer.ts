import type { EngineeringPositionSourceRow } from "../../entity/source-adapters.ts";
import type { EntityHierarchyPath } from "../../entity/types.ts";
import { IndustryAgentError } from "../../errors/industry-agent-error.ts";
import { buildEngineeringSearchDocument } from "./text-builder.ts";
import type { EngineeringEmbeddingProvider, EngineeringRetrievalConfig, EngineeringSearchDocument } from "./types.ts";

export interface EngineeringIndexState {
	embeddingInputHash: string;
	indexVersion: string;
}

export interface EngineeringIndexStateReader {
	getState(engineeringId: string): Promise<EngineeringIndexState | undefined>;
}

export interface EngineeringIndexWriter {
	upsert(document: EngineeringSearchDocument, options: { preserveExistingVectors: boolean }): Promise<void>;
	delete(engineeringId: string): Promise<void>;
}

export interface EngineeringHierarchyProvider {
	getPath(engineeringId: string): Promise<EntityHierarchyPath>;
}

export interface EngineeringAliasProvider {
	getAliases(engineeringId: string): Promise<readonly string[]>;
}

export interface EngineeringIndexBatchResult {
	processed: number;
	upserted: number;
	deleted: number;
	embedded: number;
	structureOnlyUpdated: number;
	lastCursor?: { updateTime: string; engineeringId: string };
}

export interface EngineeringIndexingServiceOptions {
	embedding: EngineeringEmbeddingProvider;
	hierarchy: EngineeringHierarchyProvider;
	aliases: EngineeringAliasProvider;
	state: EngineeringIndexStateReader;
	writer: EngineeringIndexWriter;
	config: EngineeringRetrievalConfig;
}

function compareCursor(
	left: { updateTime: string; engineeringId: string },
	right: { updateTime: string; engineeringId: string },
): number {
	const time = left.updateTime.localeCompare(right.updateTime);
	return time === 0 ? left.engineeringId.localeCompare(right.engineeringId) : time;
}

export class EngineeringIndexingService {
	private readonly embedding: EngineeringEmbeddingProvider;
	private readonly hierarchy: EngineeringHierarchyProvider;
	private readonly aliases: EngineeringAliasProvider;
	private readonly state: EngineeringIndexStateReader;
	private readonly writer: EngineeringIndexWriter;
	private readonly config: EngineeringRetrievalConfig;

	constructor(options: EngineeringIndexingServiceOptions) {
		this.embedding = options.embedding;
		this.hierarchy = options.hierarchy;
		this.aliases = options.aliases;
		this.state = options.state;
		this.writer = options.writer;
		this.config = options.config;
	}

	async indexBatch(rows: readonly EngineeringPositionSourceRow[]): Promise<EngineeringIndexBatchResult> {
		let upserted = 0;
		let deleted = 0;
		let embedded = 0;
		let structureOnlyUpdated = 0;
		let lastCursor: EngineeringIndexBatchResult["lastCursor"];
		for (const row of rows) {
			if (row.updateTime) {
				const cursor = { updateTime: row.updateTime, engineeringId: row.engineeringId };
				if (!lastCursor || compareCursor(lastCursor, cursor) < 0) lastCursor = cursor;
			}
			if (row.isDeleted) {
				await this.writer.delete(row.engineeringId);
				deleted += 1;
				continue;
			}
			const [hierarchy, aliases, state] = await Promise.all([
				this.hierarchy.getPath(row.engineeringId),
				this.aliases.getAliases(row.engineeringId),
				this.state.getState(row.engineeringId),
			]);
			let document = buildEngineeringSearchDocument({
				row,
				hierarchy,
				aliases,
				embeddingVersion: this.embedding.modelVersion,
				indexVersion: this.config.indexVersion,
			});
			const preserveExistingVectors =
				state?.embeddingInputHash === document.embeddingInputHash &&
				state.indexVersion === this.config.indexVersion;
			if (!preserveExistingVectors) {
				const [nameVector, contextVector] = await Promise.all([
					this.embedding.embed(document.embeddingNameText),
					this.embedding.embed(document.embeddingContextText),
				]);
				this.assertVector(nameVector);
				this.assertVector(contextVector);
				document = { ...document, nameVector, contextVector };
				embedded += 1;
			} else {
				structureOnlyUpdated += 1;
			}
			await this.writer.upsert(document, { preserveExistingVectors });
			upserted += 1;
		}
		return {
			processed: rows.length,
			upserted,
			deleted,
			embedded,
			structureOnlyUpdated,
			...(lastCursor ? { lastCursor } : {}),
		};
	}

	private assertVector(vector: readonly number[]): void {
		if (vector.length !== this.config.embeddingDimension || vector.length !== this.embedding.dimension) {
			throw new IndustryAgentError("RETRIEVAL_ERROR", "engineering index vector dimension mismatch", {
				details: {
					expected: this.config.embeddingDimension,
					provider: this.embedding.dimension,
					actual: vector.length,
				},
			});
		}
	}
}
