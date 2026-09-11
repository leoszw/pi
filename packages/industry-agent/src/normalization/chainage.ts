import type { NormalizedValue } from "./types.ts";

const CHAINAGE_TOKEN = /(?:K\s*)?(\d+)\s*\+\s*(\d+(?:\.\d+)?)/gi;
const RANGE_SEPARATOR = /^\s*(?:~|～|—|–|-|至|到)\s*$/;

export function normalizeChainage(value: string): number | undefined {
	const match = /^(?:K\s*)?(\d+)\s*\+\s*(\d+(?:\.\d+)?)$/i.exec(value.trim());
	if (!match) return undefined;
	const kilometer = Number(match[1]);
	const offset = Number(match[2]);
	if (!Number.isFinite(kilometer) || !Number.isFinite(offset) || kilometer < 0 || offset < 0 || offset >= 1000) {
		return undefined;
	}
	return kilometer * 1000 + offset;
}

export interface ChainageExtraction {
	single?: NormalizedValue<number>;
	range?: NormalizedValue<readonly [number, number]>;
}

export function extractChainage(text: string): ChainageExtraction {
	const matches = Array.from(text.matchAll(CHAINAGE_TOKEN));
	if (matches.length === 0) return {};
	const first = matches[0];
	if (!first || first.index === undefined) return {};
	const firstValue = normalizeChainage(first[0]);
	if (firstValue === undefined) return {};
	const second = matches[1];
	if (second?.index !== undefined) {
		const between = text.slice(first.index + first[0].length, second.index);
		const secondValue = normalizeChainage(second[0]);
		if (secondValue !== undefined && RANGE_SEPARATOR.test(between)) {
			const lower = Math.min(firstValue, secondValue);
			const upper = Math.max(firstValue, secondValue);
			return {
				range: {
					value: [lower, upper],
					confidence: 0.99,
					mode: "hard",
					source: "rule",
					matchedText: text.slice(first.index, second.index + second[0].length),
					start: first.index,
					end: second.index + second[0].length,
				},
			};
		}
	}
	return {
		single: {
			value: firstValue,
			confidence: 0.99,
			mode: "hard",
			source: "rule",
			matchedText: first[0],
			start: first.index,
			end: first.index + first[0].length,
		},
	};
}
