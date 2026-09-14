import type { JsonObject, UIAction } from "../contracts/index.ts";
import type { MutationProposalRecord } from "./types.ts";

function action(id: string, type: UIAction["type"], payload: JsonObject): UIAction {
	return { id, type, payload };
}
export function entityPickerAction(id: string, payload: JsonObject): UIAction {
	return action(id, "entity_picker", payload);
}
export function formAction(id: string, payload: JsonObject): UIAction {
	return action(id, "form", payload);
}
export function editableFormAction(id: string, payload: JsonObject): UIAction {
	return action(id, "editable_form", payload);
}
export function tableAction(id: string, payload: JsonObject): UIAction {
	return action(id, "table", payload);
}
export function diffAction(id: string, payload: JsonObject): UIAction {
	return action(id, "diff", payload);
}
export function mutationConfirmationAction(id: string, payload: JsonObject): UIAction {
	return action(id, "mutation_confirmation", payload);
}

export function buildMutationUiActions(proposal: MutationProposalRecord): readonly UIAction[] {
	const prefix = proposal.operationId;
	const base = {
		operationId: proposal.operationId,
		operation: proposal.operation,
		entityType: proposal.entityType,
		affectedCount: proposal.affectedCount,
	};
	const editor =
		proposal.operation === "CREATE"
			? formAction(`${prefix}:form`, { ...base, values: proposal.targets[0]?.after ?? {} })
			: proposal.operation === "UPDATE"
				? editableFormAction(`${prefix}:edit`, { ...base, targets: proposal.representativeSamples })
				: entityPickerAction(`${prefix}:entities`, {
						...base,
						entityIds: proposal.targets.map((target) => target.entityId).filter(Boolean),
					});
	const actions: UIAction[] = [editor];
	if (proposal.affectedCount > 1)
		actions.push(tableAction(`${prefix}:table`, { ...base, representativeSamples: proposal.representativeSamples }));
	actions.push(
		diffAction(`${prefix}:diff`, {
			...base,
			changes: proposal.diff,
			representativeSamples: proposal.representativeSamples,
		}),
	);
	actions.push(
		mutationConfirmationAction(`${prefix}:confirm`, {
			...base,
			digest: proposal.digest,
			recordVersion: proposal.recordVersion,
			message: "Confirm this exact mutation. Any scope, digest, or version change invalidates approval.",
		}),
	);
	return actions;
}
