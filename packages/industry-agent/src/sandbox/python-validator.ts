import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import type { SandboxLimits, SandboxProgram } from "./types.ts";

const FORBIDDEN_WORDS = [
	"import",
	"from",
	"class",
	"while",
	"with",
	"async",
	"await",
	"yield",
	"global",
	"nonlocal",
] as const;

const FORBIDDEN_CALLS = [
	"open",
	"exec",
	"eval",
	"compile",
	"__import__",
	"globals",
	"locals",
	"vars",
	"dir",
	"getattr",
	"setattr",
	"delattr",
	"breakpoint",
	"help",
	"input",
	"exit",
	"quit",
] as const;

function fail(message: string): never {
	throw new IndustryAgentError("SANDBOX_STATIC_VALIDATION_FAILED", `Python: ${message}`);
}

export interface PythonValidationResult {
	readQueryIds: readonly string[];
}

export function validateSandboxPython(program: SandboxProgram, limits: SandboxLimits): PythonValidationResult {
	const source = program.python.replace(/\r\n?/g, "\n");
	if (!source.trim() || source.length > limits.maxPythonChars)
		fail(`source length must be between 1 and ${limits.maxPythonChars}`);
	if (source.includes("\0")) fail("NUL bytes are not allowed");
	if (!/^\s*def\s+main\s*\(\s*read\s*\)\s*:/m.test(source)) fail("program must define main(read)");
	if ((source.match(/^\s*def\s+main\s*\(/gm) ?? []).length !== 1) fail("program must define exactly one main(read)");
	for (const word of FORBIDDEN_WORDS) {
		const re = new RegExp(`\\b${word}\\b`);
		if (re.test(source)) fail(`forbidden Python keyword: ${word}`);
	}
	for (const name of FORBIDDEN_CALLS) {
		const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const re = new RegExp(`\\b${escaped}\\s*\\(`);
		if (re.test(source)) fail(`forbidden Python call: ${name}`);
	}
	if (/^\s*@/m.test(source)) fail("decorators are not allowed");
	if (/__\w+__/.test(source)) fail("dunder access is not allowed");
	if (/\b(?:os|sys|subprocess|socket|pathlib|shutil|tempfile|pickle|marshal|ctypes|importlib|builtins)\b/.test(source))
		fail("system/runtime modules are not allowed");
	if (/(?:https?|file):\/\//i.test(source)) fail("URL/file resource access is not allowed");

	const queryIds = new Set(program.queries.map((query) => query.queryId));
	const readRefs: string[] = [];
	const exactRead = /\bread\s*\(\s*(["'])([^"']+)\1\s*\)/g;
	for (const match of source.matchAll(exactRead)) readRefs.push(match[2]!.trim());
	const allReadCalls = source.match(/\bread\s*\(/g)?.length ?? 0;
	if (allReadCalls !== readRefs.length) fail("read() must use a constant string queryId");
	if (!readRefs.length) fail("program must read at least one prevalidated query");
	for (const queryId of readRefs) {
		if (!queryId || !queryIds.has(queryId)) fail(`read() references unknown queryId: ${queryId}`);
	}
	for (const queryId of queryIds) {
		if (!readRefs.includes(queryId)) fail(`generated query is never referenced by Python: ${queryId}`);
	}
	return { readQueryIds: [...new Set(readRefs)] };
}
