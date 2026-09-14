import { createHash } from "node:crypto";
import type { RequestContext } from "../../contracts/index.ts";
import { IndustryAgentError } from "../../errors/industry-agent-error.ts";
import type {
	ImageActionPolicy,
	ImageActionProposal,
	ImageAssetInput,
	ImageEntityResolution,
	ImageEntityScope,
	ImageObservation,
	ImageObservationBundle,
	ImageObservationKind,
} from "./types.ts";

const OBSERVATION_KINDS = new Set<ImageObservationKind>([
	"TEXT",
	"FIELD",
	"OBJECT",
	"TABLE",
	"MEASUREMENT",
	"CHECKBOX",
	"DATE",
]);

function nonEmpty(value: string, label: string): string {
	const clean = value.trim();
	if (!clean) throw new IndustryAgentError("IMAGE_INPUT_INVALID", `${label} must not be empty`);
	return clean;
}

function detectImageMime(content: Uint8Array): string | undefined {
	if (
		content.length >= 8 &&
		content[0] === 0x89 &&
		content[1] === 0x50 &&
		content[2] === 0x4e &&
		content[3] === 0x47 &&
		content[4] === 0x0d &&
		content[5] === 0x0a &&
		content[6] === 0x1a &&
		content[7] === 0x0a
	)
		return "image/png";
	if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return "image/jpeg";
	if (
		content.length >= 12 &&
		String.fromCharCode(...content.slice(0, 4)) === "RIFF" &&
		String.fromCharCode(...content.slice(8, 12)) === "WEBP"
	)
		return "image/webp";
	return undefined;
}

export function validateImageFile(
	file: ImageAssetInput,
	allowedMimeTypes: readonly string[],
	maxFileSizeBytes: number,
): ImageAssetInput {
	const fileName = nonEmpty(file.fileName, "fileName");
	const mimeType = nonEmpty(file.mimeType, "mimeType").toLowerCase();
	if (!Number.isInteger(file.sizeBytes) || file.sizeBytes <= 0 || file.sizeBytes > maxFileSizeBytes)
		throw new IndustryAgentError("IMAGE_INPUT_INVALID", `Image size must be between 1 and ${maxFileSizeBytes} bytes`);
	if (file.content.byteLength !== file.sizeBytes)
		throw new IndustryAgentError("IMAGE_INPUT_INVALID", "Declared image size does not match content length");
	if (!allowedMimeTypes.includes(mimeType))
		throw new IndustryAgentError("IMAGE_INPUT_INVALID", `Unsupported image MIME type: ${mimeType}`);
	const detected = detectImageMime(file.content);
	if (!detected || detected !== mimeType)
		throw new IndustryAgentError(
			"IMAGE_INPUT_INVALID",
			`Image signature does not match declared MIME type: ${mimeType}`,
		);
	return { ...file, fileName, mimeType };
}

export function imageChecksum(content: Uint8Array): string {
	return createHash("sha256").update(content).digest("hex");
}

function validateObservation(observation: ImageObservation): void {
	nonEmpty(observation.observationId, "observationId");
	nonEmpty(observation.label, "observation label");
	if (!OBSERVATION_KINDS.has(observation.kind))
		throw new IndustryAgentError("IMAGE_OBSERVATION_INVALID", `Unsupported observation kind: ${observation.kind}`);
	if (!Number.isFinite(observation.confidence) || observation.confidence < 0 || observation.confidence > 1)
		throw new IndustryAgentError(
			"IMAGE_OBSERVATION_INVALID",
			`Observation confidence must be in [0,1]: ${observation.observationId}`,
		);
	if (observation.page !== undefined && (!Number.isInteger(observation.page) || observation.page <= 0))
		throw new IndustryAgentError(
			"IMAGE_OBSERVATION_INVALID",
			`Observation page must be a positive integer: ${observation.observationId}`,
		);
	if (observation.bbox) {
		const { x, y, width, height } = observation.bbox;
		if (
			![x, y, width, height].every(Number.isFinite) ||
			x < 0 ||
			y < 0 ||
			width <= 0 ||
			height <= 0 ||
			x + width > 1 ||
			y + height > 1
		)
			throw new IndustryAgentError(
				"IMAGE_OBSERVATION_INVALID",
				`Observation bbox must be normalized to [0,1]: ${observation.observationId}`,
			);
	}
}

export function validateObservationBundle(
	bundle: ImageObservationBundle,
	providerVersion: string,
): ImageObservationBundle {
	const modelVersion = nonEmpty(bundle.modelVersion, "modelVersion");
	if (modelVersion !== providerVersion)
		throw new IndustryAgentError(
			"IMAGE_OBSERVATION_INVALID",
			`Understanding provider version mismatch: ${modelVersion} != ${providerVersion}`,
		);
	const seen = new Set<string>();
	for (const observation of bundle.observations) {
		validateObservation(observation);
		if (seen.has(observation.observationId))
			throw new IndustryAgentError(
				"IMAGE_OBSERVATION_INVALID",
				`Duplicate observation id: ${observation.observationId}`,
			);
		seen.add(observation.observationId);
	}
	return bundle;
}

function scopeMatchesContext(context: RequestContext, scope: ImageEntityScope): boolean {
	return (
		scope.tenantId === context.tenantId &&
		scope.companyId === (context.companyId ?? null) &&
		scope.projectId === (context.projectId ?? null)
	);
}

export function validateEntityResolution(
	context: RequestContext,
	resolution: ImageEntityResolution,
	observationIds: ReadonlySet<string>,
): ImageEntityResolution {
	nonEmpty(resolution.resolverVersion, "resolverVersion");
	const entityIds = new Set<string>();
	for (const match of resolution.matches) {
		if (!scopeMatchesContext(context, match.scope))
			throw new IndustryAgentError(
				"IMAGE_ENTITY_SCOPE_MISMATCH",
				`Resolved entity escaped request scope: ${match.entity.entityId}`,
			);
		if (!match.evidenceObservationIds.length)
			throw new IndustryAgentError(
				"IMAGE_ACTION_INVALID",
				`Resolved entity has no observation evidence: ${match.entity.entityId}`,
			);
		if (entityIds.has(match.entity.entityId))
			throw new IndustryAgentError("IMAGE_ACTION_INVALID", `Duplicate resolved entity: ${match.entity.entityId}`);
		entityIds.add(match.entity.entityId);
		for (const id of match.evidenceObservationIds)
			if (!observationIds.has(id))
				throw new IndustryAgentError(
					"IMAGE_ACTION_INVALID",
					`Entity evidence references unknown observation: ${id}`,
				);
	}
	for (const ambiguity of resolution.ambiguities) {
		nonEmpty(ambiguity.ambiguityId, "ambiguityId");
		for (const id of ambiguity.evidenceObservationIds)
			if (!observationIds.has(id))
				throw new IndustryAgentError(
					"IMAGE_ACTION_INVALID",
					`Ambiguity evidence references unknown observation: ${id}`,
				);
		for (const candidate of ambiguity.candidates)
			if (!scopeMatchesContext(context, candidate.scope))
				throw new IndustryAgentError(
					"IMAGE_ENTITY_SCOPE_MISMATCH",
					`Ambiguous entity candidate escaped request scope: ${candidate.candidate.entityId}`,
				);
	}
	return resolution;
}

function fieldMissing(value: unknown): boolean {
	if (value === undefined || value === null) return true;
	if (typeof value === "string") return value.trim().length === 0;
	if (Array.isArray(value)) return value.length === 0;
	return false;
}

export interface ValidatedImageAction {
	proposal: ImageActionProposal;
	missingFields: readonly string[];
}

export function validateImageAction(
	proposal: ImageActionProposal,
	policy: ImageActionPolicy,
	resolvedEntities: ReadonlyMap<string, string>,
	observationIds: ReadonlySet<string>,
	requestedOperation: ImageActionProposal["operation"] | undefined,
): ValidatedImageAction {
	nonEmpty(proposal.proposalId, "proposalId");
	const entityType = nonEmpty(proposal.entityType, "entityType");
	if (entityType !== policy.entityType)
		throw new IndustryAgentError("IMAGE_ACTION_INVALID", `Image action policy mismatch for ${entityType}`);
	if (!policy.allowedOperations.includes(proposal.operation))
		throw new IndustryAgentError(
			"IMAGE_ACTION_INVALID",
			`Operation ${proposal.operation} is not allowed for ${entityType}`,
		);
	if (requestedOperation && requestedOperation !== proposal.operation)
		throw new IndustryAgentError(
			"IMAGE_ACTION_INVALID",
			`Proposed operation ${proposal.operation} conflicts with explicit requested operation ${requestedOperation}`,
		);
	if (!Number.isFinite(proposal.confidence) || proposal.confidence < 0 || proposal.confidence > 1)
		throw new IndustryAgentError("IMAGE_ACTION_INVALID", "Action confidence must be in [0,1]");
	if (!Number.isInteger(policy.maxTargets) || policy.maxTargets <= 0)
		throw new IndustryAgentError("IMAGE_ACTION_INVALID", `Invalid maxTargets policy for ${entityType}`);
	if (
		!Number.isFinite(policy.minPrepareConfidence) ||
		policy.minPrepareConfidence < 0 ||
		policy.minPrepareConfidence > 1
	)
		throw new IndustryAgentError("IMAGE_ACTION_INVALID", `Invalid minPrepareConfidence policy for ${entityType}`);
	const uniqueTargets = new Set(proposal.targetEntityIds);
	if (uniqueTargets.size !== proposal.targetEntityIds.length)
		throw new IndustryAgentError("IMAGE_ACTION_INVALID", "Image action targetEntityIds must be unique");
	if (proposal.targetEntityIds.length > policy.maxTargets)
		throw new IndustryAgentError(
			"IMAGE_ACTION_INVALID",
			`Image action exceeds max target count ${policy.maxTargets}`,
		);
	if (proposal.operation === "CREATE") {
		if (proposal.targetEntityIds.length)
			throw new IndustryAgentError("IMAGE_ACTION_INVALID", "CREATE action must not contain target entity ids");
	} else {
		if (!proposal.targetEntityIds.length)
			throw new IndustryAgentError(
				"IMAGE_ACTION_INVALID",
				`${proposal.operation} action requires resolved target entity ids`,
			);
		for (const id of proposal.targetEntityIds) {
			const resolvedType = resolvedEntities.get(id);
			if (!resolvedType)
				throw new IndustryAgentError(
					"IMAGE_ACTION_INVALID",
					`Image action target was not produced by scoped entity resolution: ${id}`,
				);
			if (resolvedType !== entityType)
				throw new IndustryAgentError(
					"IMAGE_ACTION_INVALID",
					`Image action target type mismatch: ${id} is ${resolvedType}, not ${entityType}`,
				);
		}
	}
	if (proposal.operation === "DELETE" && requestedOperation !== "DELETE")
		throw new IndustryAgentError(
			"IMAGE_ACTION_INVALID",
			"DELETE cannot be inferred from an image; the user must explicitly request DELETE",
		);
	if (!proposal.evidenceObservationIds.length)
		throw new IndustryAgentError("IMAGE_ACTION_INVALID", "Image action must cite at least one observation");
	for (const id of proposal.evidenceObservationIds)
		if (!observationIds.has(id))
			throw new IndustryAgentError("IMAGE_ACTION_INVALID", `Action evidence references unknown observation: ${id}`);
	if (proposal.operation === "DELETE") {
		if (Object.keys(proposal.values).length)
			throw new IndustryAgentError(
				"IMAGE_ACTION_INVALID",
				"DELETE image action must not carry mutation field values",
			);
		return { proposal, missingFields: [] };
	}
	const fieldPolicy = policy.fields[proposal.operation];
	if (!fieldPolicy)
		throw new IndustryAgentError(
			"IMAGE_ACTION_INVALID",
			`Missing field policy for ${proposal.operation}/${entityType}`,
		);
	const allowed = new Set(fieldPolicy.allowedFields);
	for (const field of Object.keys(proposal.values))
		if (!allowed.has(field))
			throw new IndustryAgentError("IMAGE_ACTION_INVALID", `Image action field is not allowed: ${field}`);
	const missingFields = fieldPolicy.requiredFields.filter((field) => fieldMissing(proposal.values[field]));
	return { proposal, missingFields };
}
