import type { NormalizedValue } from "./types.ts";

const BOQ_CODE_PREFIX = /(?:清单(?:项)?(?:编码|编号|号)|BOQ(?:\s*CODE)?|LEDGER(?:\s*CODE)?)\s*[:：#]?\s*([A-Za-z0-9][A-Za-z0-9._－—–-]*)/i;

export function normalizeBoqCode(value: string): string | undefined {
	const canonical = value
		.trim()
		.replace(/[－—–_]/g, "-")
		.replace(/\s+/g, "")
		.toUpperCase();
	if (!/^[A-Z0-9]+(?:[.-][A-Z0-9]+)*$/.test(canonical)) return undefined;
	return canonical;
}

export function extractBoqCode(text: string): NormalizedValue<string> | undefined {
	const match = BOQ_CODE_PREFIX.exec(text);
	const raw = match?.[1];
	if (!match || match.index === undefined || !raw) return undefined;
	const value = normalizeBoqCode(raw);
	if (!value) return undefined;
	const offset = match[0].lastIndexOf(raw);
	const start = match.index + Math.max(0, offset);
	return {
		value,
		confidence: 0.99,
		mode: "hard",
		source: "rule",
		matchedText: raw,
		start,
		end: start + raw.length,
	};
}
