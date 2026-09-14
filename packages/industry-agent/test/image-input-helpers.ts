import type { RequestContext } from "../src/contracts/index.ts";
import {
	type ImageActionProposal,
	type ImageEntityResolution,
	ImageInputService,
	type ImageInputTraceSink,
	type ImageMutationPreparer,
	type ImageObservationBundle,
	InMemoryImageAssetStorage,
	InMemoryImagePermissionService,
	StaticImageActionPolicyRegistry,
	StaticImageActionProposer,
	StaticImageEntityResolver,
	StaticImageUnderstandingProvider,
} from "../src/multimodal/image-input/index.ts";
import type { MutationPrepareResult } from "../src/mutation/types.ts";

export const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function context(overrides: Partial<RequestContext> = {}): RequestContext {
	return {
		traceId: "trace-1",
		requestId: "req-1",
		conversationId: "conv-1",
		userId: "u1",
		tenantId: "t1",
		companyId: "c1",
		projectId: "p1",
		createdAt: "2026-09-12T00:00:00.000Z",
		...overrides,
	};
}

export const observations: ImageObservationBundle = {
	modelVersion: "vision-v1",
	observations: [
		{
			observationId: "o1",
			kind: "FIELD",
			label: "负责人",
			value: "张三",
			confidence: 0.96,
			bbox: { x: 0.1, y: 0.1, width: 0.2, height: 0.1 },
		},
		{ observationId: "o2", kind: "TEXT", label: "部位编码", value: "E1", confidence: 0.99 },
	],
};

export const resolution: ImageEntityResolution = {
	resolverVersion: "resolver-v1",
	matches: [
		{
			entity: { entityId: "E1", entityType: "ENGINEERING_POSITION", canonicalName: "1#墩", confidence: 0.99 },
			scope: { tenantId: "t1", companyId: "c1", projectId: "p1" },
			evidenceObservationIds: ["o2"],
		},
	],
	ambiguities: [],
};

export const updateProposal: ImageActionProposal = {
	proposalId: "action-1",
	operation: "UPDATE",
	entityType: "ENGINEERING_POSITION",
	targetEntityIds: ["E1"],
	values: { owner: "张三" },
	confidence: 0.95,
	evidenceObservationIds: ["o1", "o2"],
};

export function prepareResult(): MutationPrepareResult {
	return {
		proposal: {
			operationId: "op-1",
			traceId: "trace-1",
			requestId: "req-1",
			operation: "UPDATE",
			entityType: "ENGINEERING_POSITION",
			scope: { userId: "u1", tenantId: "t1", companyId: "c1", projectId: "p1" },
			targets: [{ entityId: "E1", recordVersion: "v1", before: { owner: "李四" }, after: { owner: "张三" } }],
			recordVersion: "batch-v1",
			digest: "digest-1",
			affectedCount: 1,
			representativeSamples: [],
			diff: [],
			status: "PREPARED",
			createdAt: "2026-09-12T00:00:00.000Z",
		},
		uiActions: [{ id: "op-1:confirm", type: "mutation_confirmation", payload: { operationId: "op-1" } }],
	};
}

export class RecordingPreparer implements ImageMutationPreparer {
	calls: ImageActionProposal[] = [];
	async prepare(input: Parameters<ImageMutationPreparer["prepare"]>[0]): Promise<MutationPrepareResult> {
		this.calls.push(input.proposal);
		return prepareResult();
	}
}

export function service(
	options: {
		allowed?: boolean;
		bundle?: ImageObservationBundle;
		entityResolution?: ImageEntityResolution;
		proposal?: ImageActionProposal | null;
		preparer?: RecordingPreparer;
		trace?: ImageInputTraceSink;
	} = {},
) {
	const storage = new InMemoryImageAssetStorage();
	const preparer = options.preparer ?? new RecordingPreparer();
	const instance = new ImageInputService({
		permissions: new InMemoryImagePermissionService(options.allowed ?? true),
		storage,
		understanding: new StaticImageUnderstandingProvider("vision-v1", () => options.bundle ?? observations),
		entityResolver: new StaticImageEntityResolver(options.entityResolution ?? resolution),
		actionProposer: new StaticImageActionProposer(
			"action-v1",
			options.proposal === undefined ? updateProposal : (options.proposal ?? undefined),
		),
		policies: new StaticImageActionPolicyRegistry([
			{
				entityType: "ENGINEERING_POSITION",
				allowedOperations: ["CREATE", "UPDATE", "DELETE"],
				minPrepareConfidence: 0.9,
				maxTargets: 10,
				fields: {
					CREATE: { allowedFields: ["name", "owner"], requiredFields: ["name"] },
					UPDATE: { allowedFields: ["owner", "status"], requiredFields: ["owner"] },
				},
			},
		]),
		mutation: preparer,
		...(options.trace ? { trace: options.trace } : {}),
		idFactory: () => "asset-new",
	});
	return { instance, storage, preparer };
}

export function request(overrides: Record<string, unknown> = {}) {
	return {
		context: context(),
		file: { fileName: "site.png", mimeType: "image/png", sizeBytes: PNG_BYTES.byteLength, content: PNG_BYTES },
		...overrides,
	};
}
