import type { JsonObject } from "../../contracts/index.ts";
import type {
	ImageActionProposal,
	ImageActionProposer,
	ImageAssetStorage,
	ImageEntityResolution,
	ImageEntityResolver,
	ImageInputTraceEvent,
	ImageInputTraceSink,
	ImageObservationBundle,
	ImagePermissionInput,
	ImagePermissionService,
	ImageStoredAsset,
	ImageUnderstandingInput,
	ImageUnderstandingProvider,
} from "./types.ts";

export class InMemoryImagePermissionService implements ImagePermissionService {
	private readonly allowed: boolean;
	constructor(allowed = true) {
		this.allowed = allowed;
	}
	async authorize(_input: ImagePermissionInput): Promise<boolean> {
		return this.allowed;
	}
}

export class InMemoryImageAssetStorage implements ImageAssetStorage {
	readonly writes: { key: string; metadata: JsonObject }[] = [];
	private readonly byKey = new Map<string, { assetId: string; storageKey: string }>();
	async putIfAbsent(input: Parameters<ImageAssetStorage["putIfAbsent"]>[0]) {
		const found = this.byKey.get(input.storageKey);
		if (found) return { ...found, reused: true };
		const stored = { assetId: input.assetId, storageKey: input.storageKey };
		this.byKey.set(input.storageKey, stored);
		this.writes.push({ key: input.storageKey, metadata: structuredClone(input.metadata) });
		return { ...stored, reused: false };
	}
}

export class StaticImageUnderstandingProvider implements ImageUnderstandingProvider {
	readonly version: string;
	private readonly handler: (
		input: ImageUnderstandingInput,
	) => Promise<ImageObservationBundle> | ImageObservationBundle;
	constructor(
		version: string,
		handler: (input: ImageUnderstandingInput) => Promise<ImageObservationBundle> | ImageObservationBundle,
	) {
		this.version = version;
		this.handler = handler;
	}
	async analyze(input: ImageUnderstandingInput): Promise<ImageObservationBundle> {
		return this.handler(input);
	}
}

export class StaticImageEntityResolver implements ImageEntityResolver {
	private readonly resolution: ImageEntityResolution;
	constructor(resolution: ImageEntityResolution) {
		this.resolution = resolution;
	}
	async resolve(_input: Parameters<ImageEntityResolver["resolve"]>[0]): Promise<ImageEntityResolution> {
		return structuredClone(this.resolution);
	}
}

export class StaticImageActionProposer implements ImageActionProposer {
	readonly version: string;
	private readonly proposal: ImageActionProposal | undefined;
	constructor(version: string, proposal?: ImageActionProposal) {
		this.version = version;
		this.proposal = proposal;
	}
	async propose(_input: Parameters<ImageActionProposer["propose"]>[0]): Promise<ImageActionProposal | undefined> {
		return this.proposal ? structuredClone(this.proposal) : undefined;
	}
}

export class InMemoryImageTraceSink implements ImageInputTraceSink {
	readonly events: ImageInputTraceEvent[] = [];
	record(event: ImageInputTraceEvent): void {
		this.events.push(structuredClone(event));
	}
}

export function storedAsset(input: Partial<ImageStoredAsset> = {}): ImageStoredAsset {
	return {
		assetId: "asset-1",
		storageKey: "multimodal/t1/checksum",
		checksumSha256: "checksum",
		mimeType: "image/png",
		sizeBytes: 8,
		reused: false,
		...input,
	};
}
