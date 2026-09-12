import { randomUUID } from "node:crypto";
import type { JsonObject } from "../../contracts/index.ts";
import { IndustryAgentError } from "../../errors/industry-agent-error.ts";
import { buildEntityReviewActions, buildLowConfidenceReviewAction, buildMissingFieldsAction } from "./ui.ts";
import {
	imageChecksum, validateEntityResolution, validateImageAction, validateImageFile, validateObservationBundle,
} from "./validation.ts";
import type {
	ImageInputRequest, ImageInputResult, ImageInputServiceOptions, ImagePipelineStage, ImageStoredAsset, ImageTraceStatus,
} from "./types.ts";

const DEFAULT_ALLOWED = ["image/jpeg", "image/png", "image/webp"] as const;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;

export class ImageInputService {
	private readonly options: ImageInputServiceOptions;
	private readonly idFactory: () => string;
	private readonly allowedMimeTypes: readonly string[];
	private readonly maxFileSizeBytes: number;
	constructor(options: ImageInputServiceOptions) {
		this.options = options;
		this.idFactory = options.idFactory ?? (() => randomUUID());
		this.allowedMimeTypes = options.limits?.allowedMimeTypes ?? DEFAULT_ALLOWED;
		this.maxFileSizeBytes = options.limits?.maxFileSizeBytes ?? DEFAULT_MAX_BYTES;
		if (!Number.isInteger(this.maxFileSizeBytes) || this.maxFileSizeBytes <= 0) throw new IndustryAgentError("IMAGE_INPUT_INVALID", "maxFileSizeBytes must be a positive integer");
	}

	async process(request: ImageInputRequest): Promise<ImageInputResult> {
		this.trace(request, "AUTHORIZE", "START");
		if (!(await this.options.permissions.authorize({ context: request.context, permission: "multimodal.process" }))) {
			this.trace(request, "AUTHORIZE", "BLOCKED");
			throw new IndustryAgentError("IMAGE_ACCESS_DENIED", "Permission denied: multimodal.process");
		}
		this.trace(request, "AUTHORIZE", "OK");

		this.trace(request, "VALIDATE", "START");
		const file = validateImageFile(request.file, this.allowedMimeTypes, this.maxFileSizeBytes);
		this.trace(request, "VALIDATE", "OK", { mimeType: file.mimeType, sizeBytes: file.sizeBytes });

		const checksum = imageChecksum(file.content);
		const provisionalAssetId = this.idFactory();
		const storageKey = `multimodal/${request.context.tenantId}/${checksum}`;
		this.trace(request, "STORE", "START", { checksumSha256: checksum });
		const stored = await this.options.storage.putIfAbsent({
			assetId: provisionalAssetId,
			storageKey,
			content: file.content,
			metadata: {
				traceId: request.context.traceId,
				requestId: request.context.requestId,
				conversationId: request.context.conversationId,
				tenantId: request.context.tenantId,
				companyId: request.context.companyId ?? null,
				projectId: request.context.projectId ?? null,
				fileName: file.fileName,
				mimeType: file.mimeType,
				checksumSha256: checksum,
				...(request.metadata ? { requestMetadata: request.metadata } : {}),
			},
		});
		if (!stored.assetId.trim() || stored.storageKey !== storageKey) throw new IndustryAgentError("IMAGE_INPUT_INVALID", "Asset storage returned an invalid asset binding");
		const asset: ImageStoredAsset = { assetId: stored.assetId, storageKey: stored.storageKey, checksumSha256: checksum, mimeType: file.mimeType, sizeBytes: file.sizeBytes, reused: stored.reused };
		this.trace(request, "STORE", "OK", { assetId: asset.assetId, reused: asset.reused });

		this.trace(request, "UNDERSTAND", "START", undefined, asset.assetId);
		let bundle;
		try {
			bundle = validateObservationBundle(await this.options.understanding.analyze({ context: request.context, asset, file, ...(request.userInstruction ? { userInstruction: request.userInstruction } : {}) }), this.options.understanding.version);
		} catch (error) {
			this.trace(request, "UNDERSTAND", "ERROR", { message: error instanceof Error ? error.message : String(error) }, asset.assetId);
			if (error instanceof IndustryAgentError) throw error;
			throw new IndustryAgentError("IMAGE_UNDERSTANDING_FAILED", "Multimodal understanding failed", { cause: error });
		}
		this.trace(request, "UNDERSTAND", "OK", { modelVersion: bundle.modelVersion, observationCount: bundle.observations.length }, asset.assetId);
		const observationIds = new Set(bundle.observations.map((item) => item.observationId));

		this.trace(request, "ENTITY_RESOLVE", "START", undefined, asset.assetId);
		const entityResolution = validateEntityResolution(request.context, await this.options.entityResolver.resolve({ context: request.context, asset, observations: bundle.observations }), observationIds);
		this.trace(request, "ENTITY_RESOLVE", "OK", { resolvedCount: entityResolution.matches.length, ambiguityCount: entityResolution.ambiguities.length, resolverVersion: entityResolution.resolverVersion }, asset.assetId);
		if (entityResolution.ambiguities.length) {
			return { status: "NEEDS_ENTITY_REVIEW", asset, observations: bundle.observations, entityResolution, uiActions: buildEntityReviewActions(asset.assetId, entityResolution) };
		}

		this.trace(request, "ACTION_PROPOSE", "START", undefined, asset.assetId);
		const actionProposal = await this.options.actionProposer.propose({
			context: request.context,
			asset,
			observations: bundle.observations,
			entities: entityResolution.matches,
			...(request.userInstruction ? { userInstruction: request.userInstruction } : {}),
			...(request.requestedOperation ? { requestedOperation: request.requestedOperation } : {}),
		});
		if (!actionProposal) {
			this.trace(request, "ACTION_PROPOSE", "OK", { proposed: false }, asset.assetId);
			return { status: "NO_ACTION", asset, observations: bundle.observations, entityResolution, uiActions: [] };
		}
		const policy = this.options.policies.get(actionProposal.entityType);
		if (!policy) throw new IndustryAgentError("IMAGE_ACTION_INVALID", `No image action policy for entity type: ${actionProposal.entityType}`);
		const resolvedEntities = new Map(entityResolution.matches.map((item) => [item.entity.entityId, item.entity.entityType] as const));
		const validated = validateImageAction(actionProposal, policy, resolvedEntities, observationIds, request.requestedOperation);
		this.trace(request, "ACTION_PROPOSE", "OK", { proposed: true, proposerVersion: this.options.actionProposer.version, operation: actionProposal.operation, entityType: actionProposal.entityType, confidence: actionProposal.confidence }, asset.assetId);
		if (validated.missingFields.length) {
			return { status: "NEEDS_FIELDS", asset, observations: bundle.observations, entityResolution, actionProposal, missingFields: validated.missingFields, uiActions: [buildMissingFieldsAction(asset.assetId, actionProposal, validated.missingFields)] };
		}
		if (actionProposal.confidence < policy.minPrepareConfidence) {
			return { status: "NEEDS_REVIEW", asset, observations: bundle.observations, entityResolution, actionProposal, uiActions: [buildLowConfidenceReviewAction(asset.assetId, actionProposal, policy.minPrepareConfidence)] };
		}

		this.trace(request, "MUTATION_PREPARE", "START", { operation: actionProposal.operation, entityType: actionProposal.entityType }, asset.assetId);
		try {
			const mutationPrepare = await this.options.mutation.prepare({ context: request.context, proposal: actionProposal });
			this.trace(request, "MUTATION_PREPARE", "OK", { operationId: mutationPrepare.proposal.operationId, digest: mutationPrepare.proposal.digest }, asset.assetId);
			return { status: "PREPARED", asset, observations: bundle.observations, entityResolution, actionProposal, uiActions: mutationPrepare.uiActions, mutationPrepare };
		} catch (error) {
			this.trace(request, "MUTATION_PREPARE", "ERROR", { message: error instanceof Error ? error.message : String(error) }, asset.assetId);
			throw error;
		}
	}

	private trace(request: ImageInputRequest, stage: ImagePipelineStage, status: ImageTraceStatus, details?: JsonObject, assetId?: string): void {
		this.options.trace?.record({ traceId: request.context.traceId, requestId: request.context.requestId, ...(assetId ? { assetId } : {}), stage, status, ...(details ? { details } : {}) });
	}
}
