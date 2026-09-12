import { createHash } from "node:crypto";
import { EVAL_CATEGORIES, type EvalCategory, type GoldenCorpus, type GoldenCorpusManifest } from "./types.ts";

export interface CorpusValidationIssue {
	code: "TOO_SMALL" | "DUPLICATE_ID" | "MISSING_CATEGORY" | "CATEGORY_TOO_SMALL" | "INVALID_CASE";
	message: string;
	caseId?: string;
	category?: EvalCategory;
}

export interface CorpusValidationResult {
	valid: boolean;
	caseCount: number;
	categoryCounts: Readonly<Record<EvalCategory, number>>;
	issues: readonly CorpusValidationIssue[];
}

function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value && typeof value === "object") {
		const object = value as Readonly<Record<string, unknown>>;
		return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
	}
	return JSON.stringify(value);
}

export function fingerprintGoldenCorpus(corpus: GoldenCorpus): string {
	return createHash("sha256").update(canonical(corpus)).digest("hex");
}

export function buildGoldenCorpusManifest(corpus: GoldenCorpus): GoldenCorpusManifest {
	const categories = Object.fromEntries(EVAL_CATEGORIES.map((category) => [category, corpus.cases.filter((item) => item.category === category).length])) as Record<EvalCategory, number>;
	return { version: corpus.version, generatorVersion: corpus.generatorVersion, caseCount: corpus.cases.length, canonicalSha256: fingerprintGoldenCorpus(corpus), categories };
}

export function validateGoldenCorpusManifest(corpus: GoldenCorpus, manifest: GoldenCorpusManifest): readonly string[] {
	const expected = buildGoldenCorpusManifest(corpus); const issues: string[] = [];
	if (manifest.version !== expected.version) issues.push(`Manifest version ${manifest.version} does not match corpus ${expected.version}`);
	if (manifest.generatorVersion !== expected.generatorVersion) issues.push("Manifest generatorVersion does not match corpus generatorVersion");
	if (manifest.caseCount !== expected.caseCount) issues.push(`Manifest caseCount ${manifest.caseCount} does not match ${expected.caseCount}`);
	if (manifest.canonicalSha256 !== expected.canonicalSha256) issues.push("Manifest canonical SHA-256 does not match corpus contents");
	for (const category of EVAL_CATEGORIES) if (manifest.categories[category] !== expected.categories[category]) issues.push(`Manifest category count mismatch for ${category}`);
	return issues;
}

export function validateGoldenCorpus(corpus: GoldenCorpus, minCases: number, minCasesPerCategory: number): CorpusValidationResult {
	const issues: CorpusValidationIssue[] = [];
	const counts = Object.fromEntries(EVAL_CATEGORIES.map((category) => [category, 0])) as Record<EvalCategory, number>;
	const ids = new Set<string>(); const knownCategories = new Set<string>(EVAL_CATEGORIES);
	if (corpus.cases.length < minCases) issues.push({ code: "TOO_SMALL", message: `Corpus has ${corpus.cases.length} cases; at least ${minCases} are required` });
	for (const testCase of corpus.cases) {
		if (!testCase.id.trim() || !testCase.tags.length || !Object.keys(testCase.input).length || !Object.keys(testCase.expected).length) issues.push({ code: "INVALID_CASE", message: "Case requires id, tags, input, and expected payload", caseId: testCase.id });
		if (ids.has(testCase.id)) issues.push({ code: "DUPLICATE_ID", message: `Duplicate case id: ${testCase.id}`, caseId: testCase.id });
		ids.add(testCase.id);
		if (!knownCategories.has(testCase.category)) { issues.push({ code: "INVALID_CASE", message: `Unknown eval category: ${String(testCase.category)}`, caseId: testCase.id }); continue; }
		counts[testCase.category] += 1;
	}
	for (const category of EVAL_CATEGORIES) {
		if (counts[category] === 0) issues.push({ code: "MISSING_CATEGORY", message: `Missing required category: ${category}`, category });
		else if (counts[category] < minCasesPerCategory) issues.push({ code: "CATEGORY_TOO_SMALL", message: `${category} has ${counts[category]} cases; at least ${minCasesPerCategory} are required`, category });
	}
	return { valid: issues.length === 0, caseCount: corpus.cases.length, categoryCounts: counts, issues };
}
