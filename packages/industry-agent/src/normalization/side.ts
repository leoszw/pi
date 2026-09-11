import type { NormalizedValue } from "./types.ts";

export type CanonicalSide = "LEFT" | "RIGHT" | "BOTH" | "CENTER";

const RULES: readonly { pattern: RegExp; value: CanonicalSide; confidence: number; mode: "hard" | "soft" }[] = [
	{ pattern: /左幅/, value: "LEFT", confidence: 0.99, mode: "hard" },
	{ pattern: /右幅/, value: "RIGHT", confidence: 0.99, mode: "hard" },
	{ pattern: /(?:双幅|左右幅|两幅)/, value: "BOTH", confidence: 0.98, mode: "hard" },
	{ pattern: /中幅/, value: "CENTER", confidence: 0.95, mode: "hard" },
	{ pattern: /(?:左边|左侧)/, value: "LEFT", confidence: 0.88, mode: "soft" },
	{ pattern: /(?:右边|右侧)/, value: "RIGHT", confidence: 0.88, mode: "soft" },
	{ pattern: /(?:^|[^A-Za-z0-9])L(?:$|[^A-Za-z0-9])/i, value: "LEFT", confidence: 0.98, mode: "hard" },
	{ pattern: /(?:^|[^A-Za-z0-9])R(?:$|[^A-Za-z0-9])/i, value: "RIGHT", confidence: 0.98, mode: "hard" },
];

export function normalizeSide(text: string): NormalizedValue<CanonicalSide> | undefined {
	for (const rule of RULES) {
		const match = rule.pattern.exec(text);
		if (!match || match.index === undefined) continue;
		const raw = match[0];
		const letterMatch = raw.match(/[LR]/i);
		const matchedText = letterMatch?.[0] ?? raw;
		const start = letterMatch?.index === undefined ? match.index : match.index + letterMatch.index;
		return {
			value: rule.value,
			confidence: rule.confidence,
			mode: rule.mode,
			source: "rule",
			matchedText,
			start,
			end: start + matchedText.length,
		};
	}
	return undefined;
}
