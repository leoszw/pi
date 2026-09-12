import type { UIAction } from "../../contracts/index.ts";
import { editableFormAction, entityPickerAction, formAction } from "../../mutation/ui-actions.ts";
import type { ImageActionProposal, ImageEntityResolution } from "./types.ts";

export function buildEntityReviewActions(assetId: string, resolution: ImageEntityResolution): readonly UIAction[] {
	return resolution.ambiguities.map((ambiguity) => entityPickerAction(`image:${assetId}:entity:${ambiguity.ambiguityId}`, {
		mode: "multimodal_entity_review",
		assetId,
		ambiguityId: ambiguity.ambiguityId,
		label: ambiguity.label,
		evidenceObservationIds: [...ambiguity.evidenceObservationIds],
		candidates: ambiguity.candidates.map((item) => ({
			entityId: item.candidate.entityId,
			entityType: item.candidate.entityType,
			canonicalName: item.candidate.canonicalName,
			score: item.candidate.score,
		})),
	}));
}

export function buildMissingFieldsAction(assetId: string, proposal: ImageActionProposal, missingFields: readonly string[]): UIAction {
	return formAction(`image:${assetId}:missing-fields`, {
		mode: "multimodal_missing_fields",
		assetId,
		proposalId: proposal.proposalId,
		operation: proposal.operation,
		entityType: proposal.entityType,
		targetEntityIds: [...proposal.targetEntityIds],
		values: proposal.values,
		missingFields: [...missingFields],
		evidenceObservationIds: [...proposal.evidenceObservationIds],
	});
}

export function buildLowConfidenceReviewAction(assetId: string, proposal: ImageActionProposal, threshold: number): UIAction {
	return editableFormAction(`image:${assetId}:review`, {
		mode: "multimodal_action_review",
		assetId,
		proposalId: proposal.proposalId,
		operation: proposal.operation,
		entityType: proposal.entityType,
		targetEntityIds: [...proposal.targetEntityIds],
		values: proposal.values,
		confidence: proposal.confidence,
		requiredConfidence: threshold,
		reason: proposal.reason ?? null,
	});
}
