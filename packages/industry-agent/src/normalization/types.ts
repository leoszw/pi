import type { ConstraintMode, ConstraintSource, EntityMention, SemanticConstraint } from "../contracts/index.ts";

export interface NormalizedValue<T> {
	value: T;
	confidence: number;
	mode: ConstraintMode;
	source: ConstraintSource;
	matchedText: string;
	start: number;
	end: number;
}

export function toConstraint<T>(field: string, normalized: NormalizedValue<T>): SemanticConstraint {
	return {
		field,
		value: normalized.value,
		confidence: normalized.confidence,
		source: normalized.source,
		mode: normalized.mode,
	};
}

export function toMention<T>(entityType: string, normalized: NormalizedValue<T>): EntityMention {
	return {
		text: normalized.matchedText,
		start: normalized.start,
		end: normalized.end,
		entityType,
		confidence: normalized.confidence,
		source: normalized.source,
	};
}
