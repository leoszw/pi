import type { NormalizedValue } from "./types.ts";

function dateOnlyUtc(date: Date): Date {
	return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function shiftDate(date: Date, days: number): Date {
	const shifted = dateOnlyUtc(date);
	shifted.setUTCDate(shifted.getUTCDate() + days);
	return shifted;
}

export function normalizeDateExpression(value: string, referenceDate: Date): string | undefined {
	const trimmed = value.trim();
	if (/^(?:今天|今日)$/.test(trimmed)) return formatDate(dateOnlyUtc(referenceDate));
	if (/^(?:昨天|昨日)$/.test(trimmed)) return formatDate(shiftDate(referenceDate, -1));
	if (/^(?:明天|明日)$/.test(trimmed)) return formatDate(shiftDate(referenceDate, 1));
	let match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(trimmed);
	if (!match) match = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(trimmed);
	if (!match) return undefined;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(Date.UTC(year, month - 1, day));
	if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
		return undefined;
	return formatDate(date);
}

const DATE_TOKEN = /(?:今天|今日|昨天|昨日|明天|明日|\d{4}(?:[-/]\d{1,2}[-/]\d{1,2}|年\d{1,2}月\d{1,2}日))/g;
const RANGE_SEPARATOR = /^\s*(?:~|～|—|–|至|到)\s*$/;

export interface DateExtraction {
	single?: NormalizedValue<string>;
	range?: NormalizedValue<readonly [string, string]>;
}

export function extractDate(text: string, referenceDate: Date): DateExtraction {
	const matches = Array.from(text.matchAll(DATE_TOKEN));
	const first = matches[0];
	if (!first || first.index === undefined) return {};
	const firstValue = normalizeDateExpression(first[0], referenceDate);
	if (!firstValue) return {};
	const second = matches[1];
	if (second?.index !== undefined) {
		const between = text.slice(first.index + first[0].length, second.index);
		const secondValue = normalizeDateExpression(second[0], referenceDate);
		if (secondValue && RANGE_SEPARATOR.test(between)) {
			const ordered: readonly [string, string] =
				firstValue <= secondValue ? [firstValue, secondValue] : [secondValue, firstValue];
			return {
				range: {
					value: ordered,
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
