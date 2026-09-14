import type { JsonObject, SemanticConstraint, SemanticFrame } from "../contracts/index.ts";

function stableValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stableValue);
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.filter(([, entry]) => entry !== undefined)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, entry]) => [key, stableValue(entry)]),
		);
	}
	return value;
}

function constraintKey(constraint: SemanticConstraint): string {
	return `${constraint.field}\u0000${constraint.mode}\u0000${constraint.source}\u0000${JSON.stringify(stableValue(constraint.value))}`;
}

export function buildHardFilters(constraints: readonly SemanticConstraint[]): JsonObject {
	const grouped = new Map<string, unknown[]>();
	for (const constraint of constraints) {
		if (constraint.mode !== "hard") continue;
		const values = grouped.get(constraint.field) ?? [];
		const canonical = stableValue(constraint.value);
		if (!values.some((value) => JSON.stringify(value) === JSON.stringify(canonical))) values.push(canonical);
		grouped.set(constraint.field, values);
	}
	return Object.fromEntries(
		Array.from(grouped.entries())
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([field, values]) => [field, values.length === 1 ? values[0] : values]),
	);
}

export function canonicalizeSemanticFrame(frame: SemanticFrame): SemanticFrame {
	const constraints = [...frame.constraints].sort((left, right) =>
		constraintKey(left).localeCompare(constraintKey(right)),
	);
	const mentions = [...frame.mentions].sort(
		(left, right) =>
			left.start - right.start ||
			left.end - right.end ||
			(left.entityType ?? "").localeCompare(right.entityType ?? ""),
	);
	return {
		originalText: frame.originalText,
		intent: frame.intent,
		mentions,
		constraints,
		filters: buildHardFilters(constraints),
		contextRefs: Array.from(new Set(frame.contextRefs)).sort(),
		requestedFields: Array.from(new Set(frame.requestedFields)).sort(),
	};
}

export function semanticFrameToCanonicalJson(frame: SemanticFrame): string {
	return JSON.stringify(stableValue(canonicalizeSemanticFrame(frame)));
}
