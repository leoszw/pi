import type { NormalizedValue } from "./types.ts";

export type CanonicalUnit = "m" | "m2" | "m3" | "kg" | "t";

const RULES: readonly { pattern: RegExp; value: CanonicalUnit; confidence: number; mode: "hard" | "soft" }[] = [
	{ pattern: /(?:平方米|平米|㎡|m²|m2)/i, value: "m2", confidence: 0.99, mode: "hard" },
	{ pattern: /(?:立方米|m³|m3)/i, value: "m3", confidence: 0.99, mode: "hard" },
	{ pattern: /(?:千克|公斤|kg)/i, value: "kg", confidence: 0.99, mode: "hard" },
	{ pattern: /(?:吨|(?<![A-Za-z])t(?![A-Za-z]))/i, value: "t", confidence: 0.99, mode: "hard" },
	{ pattern: /(?:米|(?<![A-Za-z])m(?![A-Za-z0-9]))/i, value: "m", confidence: 0.98, mode: "hard" },
];

export function normalizeUnit(text: string): NormalizedValue<CanonicalUnit> | undefined {
	for (const rule of RULES) {
		const match = rule.pattern.exec(text);
		if (!match || match.index === undefined) continue;
		return {
			value: rule.value,
			confidence: rule.confidence,
			mode: rule.mode,
			source: "rule",
			matchedText: match[0],
			start: match.index,
			end: match.index + match[0].length,
		};
	}
	return undefined;
}
