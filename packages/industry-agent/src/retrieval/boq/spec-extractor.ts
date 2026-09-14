import { normalizeBoqText } from "./normalizer.ts";
import type { BoqSpecToken } from "./types.ts";

const ROMAN: Readonly<Record<string, string>> = { Ⅰ: "I", Ⅱ: "II", Ⅲ: "III", Ⅳ: "IV", Ⅴ: "V", Ⅵ: "VI" };

function collect(
	regex: RegExp,
	text: string,
	family: BoqSpecToken["family"],
	map: (match: RegExpMatchArray) => string,
): BoqSpecToken[] {
	return Array.from(text.matchAll(regex)).map((match) => ({
		family,
		value: map(match),
		confidence: 1,
		matchedText: match[0],
	}));
}

export function extractBoqSpecTokens(input: string): BoqSpecToken[] {
	const text = normalizeBoqText(input).replace(/[ΦФфØ]/g, "φ");
	const tokens = [
		...collect(/\bC(?:1[5-9]|[2-9]\d)\b/gi, text, "concrete_grade", (m) => m[0].toUpperCase()),
		...collect(/\b(?:HPB|HRB)\d{3}\b/gi, text, "rebar_grade", (m) => m[0].toUpperCase()),
		...collect(/(?:φ\s*\d+(?:\.\d+)?(?:\s*mm)?|\bD\s*\d+(?:\.\d+)?\s*(?:mm|cm|m)\b)/gi, text, "diameter", (m) =>
			m[0].replace(/\s+/g, "").toUpperCase().replace(/^Φ/, "φ"),
		),
		...collect(/(?:厚(?:度)?\s*)?(?<![φΦФфØDd])(\d+(?:\.\d+)?)\s*mm\b/gi, text, "thickness", (m) => `T${m[1]}MM`),
		...collect(/(\d+(?:\.\d+)?)\s*%/g, text, "percentage", (m) => `PCT${m[1]}`),
		...collect(/([ⅠⅡⅢⅣⅤⅥ])\s*级/g, text, "rock_class", (m) => `CLASS_${ROMAN[m[1] ?? ""] ?? m[1]}`),
	];
	const deduped = new Map<string, BoqSpecToken>();
	for (const token of tokens) deduped.set(`${token.family}\u0000${token.value}`, token);
	return Array.from(deduped.values());
}

export function countCriticalSpecConflicts(
	query: readonly BoqSpecToken[],
	candidateTokens: readonly string[],
	candidateFamilies: readonly string[],
): number {
	const candidateByFamily = new Map<string, Set<string>>();
	candidateFamilies.forEach((family, index) => {
		const value = candidateTokens[index];
		if (!value) return;
		const set = candidateByFamily.get(family) ?? new Set<string>();
		set.add(value);
		candidateByFamily.set(family, set);
	});
	let conflicts = 0;
	for (const token of query) {
		const values = candidateByFamily.get(token.family);
		if (values && values.size > 0 && !values.has(token.value)) conflicts += 1;
	}
	return conflicts;
}
