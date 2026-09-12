import type { EntityCandidate, JsonObject, MutationOperation, RequestContext, ResolvedEntity, UIAction } from "../../contracts/index.ts";
import type { MutationPrepareResult } from "../../mutation/types.ts";

export type ImageObservationKind = "TEXT" | "FIELD" | "OBJECT" | "TABLE" | "MEASUREMENT" | "CHECKBOX" | "DATE";
export type ImageInputStatus = "NO_ACTION" | "NEEDS_ENTITY_REVIEW" | "NEEDS_FIELDS" | "NEEDS_REVIEW" | "PREPARED";
export type ImagePipelineStage = "AUTHORIZE" | "VALIDATE" | "STORE" | "UNDERSTAND" | "ENTITY_RESOLVE" | "ACTION_PROPOSE" | "MUTATION_PREPARE";
export type ImageTraceStatus = "START" | "OK" | "ERROR" | "BLOCKED";
export type ImagePrimitive = string | number | boolean | null;

export interface ImageBoundingBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ImageObservation {
	observationId: string;
	kind: ImageObservationKind;
	label: string;
	value?: ImagePrimitive;
	rawText?: string;
	confidence: number;
	page?: number;
	bbox?: ImageBoundingBox;
	metadata?: JsonObject;
}

export interface ImageObservationBundle {
	modelVersion: string;
	observations: readonly ImageObservation[];
	warnings?: readonly string[];
	metadata?: JsonObject;
}

export interface ImageAssetInput {
	fileName: string;
	mimeType: string;
	sizeBytes: number;
	content: Uint8Array;
}

export interface ImageStoredAsset {
	assetId: string;
	storageKey: string;
	checksumSha256: string;
	mimeType: string;
	sizeBytes: number;
	reused: boolean;
}

export interface ImageInputRequest {
	context: RequestContext;
	file: ImageAssetInput;
	userInstruction?: string;
	requestedOperation?: MutationOperation;
	metadata?: JsonObject;
}

export interface ImagePermissionInput {
	context: RequestContext;
	permission: "multimodal.process";
}

export interface ImagePermissionService {
	authorize(input: ImagePermissionInput): Promise<boolean>;
}

export interface ImageAssetStorage {
	putIfAbsent(input: {
		assetId: string;
		storageKey: string;
		content: Uint8Array;
		metadata: JsonObject;
	}): Promise<{ assetId: string; storageKey: string; reused: boolean }>;
}

export interface ImageUnderstandingInput {
	context: RequestContext;
	asset: ImageStoredAsset;
	file: ImageAssetInput;
	userInstruction?: string;
}

export interface ImageUnderstandingProvider {
	readonly version: string;
	analyze(input: ImageUnderstandingInput): Promise<ImageObservationBundle>;
}

export interface ImageEntityScope {
	tenantId: string;
	companyId: string | null;
	projectId: string | null;
}

export interface ImageResolvedEntityMatch {
	entity: ResolvedEntity;
	scope: ImageEntityScope;
	evidenceObservationIds: readonly string[];
}

export interface ImageScopedEntityCandidate {
	candidate: EntityCandidate;
	scope: ImageEntityScope;
}

export interface ImageEntityAmbiguity {
	ambiguityId: string;
	label: string;
	evidenceObservationIds: readonly string[];
	candidates: readonly ImageScopedEntityCandidate[];
}

export interface ImageEntityResolution {
	resolverVersion: string;
	matches: readonly ImageResolvedEntityMatch[];
	ambiguities: readonly ImageEntityAmbiguity[];
}

export interface ImageEntityResolver {
	resolve(input: {
		context: RequestContext;
		asset: ImageStoredAsset;
		observations: readonly ImageObservation[];
	}): Promise<ImageEntityResolution>;
}

export interface ImageActionProposal {
	proposalId: string;
	operation: MutationOperation;
	entityType: string;
	targetEntityIds: readonly string[];
	values: JsonObject;
	confidence: number;
	evidenceObservationIds: readonly string[];
	reason?: string;
}

export interface ImageActionProposer {
	readonly version: string;
	propose(input: {
		context: RequestContext;
		asset: ImageStoredAsset;
		observations: readonly ImageObservation[];
		entities: readonly ImageResolvedEntityMatch[];
		userInstruction?: string;
		requestedOperation?: MutationOperation;
	}): Promise<ImageActionProposal | undefined>;
}

export interface ImageOperationFieldPolicy {
	allowedFields: readonly string[];
	requiredFields: readonly string[];
}

export interface ImageActionPolicy {
	entityType: string;
	allowedOperations: readonly MutationOperation[];
	fields: Readonly<Partial<Record<"CREATE" | "UPDATE", ImageOperationFieldPolicy>>>;
	minPrepareConfidence: number;
	maxTargets: number;
}

export interface ImageActionPolicyRegistry {
	get(entityType: string): ImageActionPolicy | undefined;
}

export interface ImageMutationPreparer {
	prepare(input: {
		context: RequestContext;
		proposal: ImageActionProposal;
	}): Promise<MutationPrepareResult>;
}

export interface ImageInputTraceEvent {
	traceId: string;
	requestId: string;
	assetId?: string;
	stage: ImagePipelineStage;
	status: ImageTraceStatus;
	details?: JsonObject;
}

export interface ImageInputTraceSink {
	record(event: ImageInputTraceEvent): void;
}

export interface ImageInputLimits {
	maxFileSizeBytes: number;
	allowedMimeTypes: readonly string[];
}

export interface ImageInputServiceOptions {
	permissions: ImagePermissionService;
	storage: ImageAssetStorage;
	understanding: ImageUnderstandingProvider;
	entityResolver: ImageEntityResolver;
	actionProposer: ImageActionProposer;
	policies: ImageActionPolicyRegistry;
	mutation: ImageMutationPreparer;
	limits?: Partial<ImageInputLimits>;
	trace?: ImageInputTraceSink;
	idFactory?: () => string;
}

export interface ImageInputResult {
	status: ImageInputStatus;
	asset: ImageStoredAsset;
	observations: readonly ImageObservation[];
	entityResolution: ImageEntityResolution;
	uiActions: readonly UIAction[];
	actionProposal?: ImageActionProposal;
	missingFields?: readonly string[];
	mutationPrepare?: MutationPrepareResult;
}
