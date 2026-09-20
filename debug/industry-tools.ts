// Shared industry-agent tool implementations used by the pi extension:
// curated BOQ data queries, RAG document search, and the M12 sandbox pipeline.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { createRequestContext } from "../packages/industry-agent/src/context/request-context.ts";
import {
	InMemoryRagChunkRepository,
	InMemoryRagDocumentRepository,
	InMemoryRagLexicalIndex,
	InMemoryRagObjectStorage,
	InMemoryRagPermissionService,
	InMemoryRagTraceSink,
	InMemoryRagVectorIndex,
	RagIngestionService,
	StaticRagParserRouter,
	StrictRagQualityValidator,
	StructureAwareRagChunker,
	StructuredTextRagParser,
} from "../packages/industry-agent/src/rag/ingestion/index.ts";
import type { RagKnowledgeScope } from "../packages/industry-agent/src/rag/ingestion/types.ts";
import type { RagQaCorpusEntry } from "../packages/industry-agent/src/rag/qa/types.ts";
import { InMemorySandboxPermissionService, InMemorySandboxToolCatalog } from "../packages/industry-agent/src/sandbox/index.ts";
import { SandboxAnalysisService } from "../packages/industry-agent/src/sandbox/service.ts";
import type { SandboxBrokerRow } from "../packages/industry-agent/src/sandbox/index.ts";
import { MysqlReadOnlyBroker, MysqlSchemaDiscovery } from "./mysql-adapters.ts";
import { DevPythonSandboxExecutor, DevReportBuilder } from "./dev-runtime.ts";
import { LlmSandboxPlanner, LlmSandboxVerifier, SANDBOX_LIMITS } from "./llm-sandbox.ts";

export const DEBUG_SCOPE = {
	userId: "u-debug",
	tenantId: "t-1",
	companyId: "c-1",
	projectId: "p-demo-1",
	conversationId: "cv-debug",
} as const;

export const RAG_KNOWLEDGE_SCOPE: RagKnowledgeScope = {
	tenantId: DEBUG_SCOPE.tenantId,
	industryId: "ind-1",
	companyId: DEBUG_SCOPE.companyId,
	projectId: DEBUG_SCOPE.projectId,
	departmentId: "d-1",
	ownerUserId: DEBUG_SCOPE.userId,
	visibility: "PROJECT",
	aclUsers: [DEBUG_SCOPE.userId],
	aclRoles: ["engineer"],
	securityTags: ["internal"],
};

function debugContext() {
	return createRequestContext({ ...DEBUG_SCOPE });
}

// ---------------------------------------------------------------------------
// BOQ data queries (curated, read-only, scope-pinned)
// ---------------------------------------------------------------------------

export type BoqQueryKind =
	| "section_totals"
	| "material_prices"
	| "top_items"
	| "search_items"
	| "cost_summary"
	| "section_stats"
	| "amount_audit"
	| "price_distribution";

const SCOPE_SQL = "tenant_id = ? AND company_id = ? AND project_id = ?";

export async function queryBoqData(
	pool: Pool,
	args: { kind: BoqQueryKind; keyword?: string; limit?: number },
): Promise<readonly SandboxBrokerRow[]> {
	const scopeParams = [DEBUG_SCOPE.tenantId, DEBUG_SCOPE.companyId, DEBUG_SCOPE.projectId];
	const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);

	// ---------------------------------------------------------------------------
	// Analysis kinds: server-side pre-computed results (deterministic, no LLM math)
	// ---------------------------------------------------------------------------
	if (args.kind === "cost_summary") {
		const [sections] = await pool.query<RowDataPacket[]>({
			sql: `SELECT section AS \`分部工程\`, SUM(amount) AS \`合价\`, COUNT(*) AS \`条目数\` FROM boq_item WHERE ${SCOPE_SQL} GROUP BY section ORDER BY \`合价\` DESC`,
			values: scopeParams,
		});
		const grandTotal = sections.reduce((sum, r) => sum + Number(r["合价"]), 0);
		let cumulative = 0;
		const detailRows = sections.map((r) => {
			const sectionTotal = Number(r["合价"]);
			const pct = grandTotal > 0 ? (sectionTotal / grandTotal) * 100 : 0;
			cumulative += pct;
			return {
				"分部工程": String(r["分部工程"]),
				"合价": sectionTotal,
				"条目数": Number(r["条目数"]),
				"占比(%)": Math.round(pct * 100) / 100,
				"累计占比(%)": Math.round(cumulative * 100) / 100,
			};
		});
		const summaryRow: Record<string, string | number | boolean | null> = {
			"分部工程": "合计",
			"合价": grandTotal,
			"条目数": sections.reduce((s, r) => s + Number(r["条目数"]), 0),
			"占比(%)": 100,
			"累计占比(%)": 100,
		};
		return [summaryRow, ...detailRows];
	}

	if (args.kind === "section_stats") {
		const [stats] = await pool.query<RowDataPacket[]>({
			sql: `SELECT section AS \`分部工程\`, COUNT(*) AS \`条目数\`, SUM(amount) AS \`合价\`, ROUND(AVG(unit_price),2) AS \`平均单价\`, MAX(unit_price) AS \`最高单价\`, MIN(unit_price) AS \`最低单价\` FROM boq_item WHERE ${SCOPE_SQL} GROUP BY section ORDER BY \`合价\` DESC`,
			values: scopeParams,
		});
		return stats.map((r) => ({
			"分部工程": String(r["分部工程"]),
			"条目数": Number(r["条目数"]),
			"合价": Number(r["合价"]),
			"平均单价": Number(r["平均单价"]),
			"最高单价": Number(r["最高单价"]),
			"最低单价": Number(r["最低单价"]),
		}));
	}

	if (args.kind === "amount_audit") {
		const [items] = await pool.query<RowDataPacket[]>({
			sql: `SELECT code AS \`清单编码\`, section AS \`分部工程\`, name AS \`项目名称\`, quantity AS \`工程量\`, unit_price AS \`单价\`, amount AS \`合价\`, ROUND(quantity * unit_price, 2) AS \`计算合价\`, ROUND(quantity * unit_price - amount, 2) AS \`偏差\`, CASE WHEN ABS(quantity * unit_price - amount) > 0.01 THEN 'MISMATCH' ELSE 'OK' END AS \`状态\` FROM boq_item WHERE ${SCOPE_SQL} ORDER BY ABS(quantity * unit_price - amount) DESC LIMIT ${limit}`,
			values: scopeParams,
		});
		return items.map((r) => ({
			"清单编码": String(r["清单编码"]),
			"分部工程": String(r["分部工程"]),
			"项目名称": String(r["项目名称"]),
			"工程量": Number(r["工程量"]),
			"单价": Number(r["单价"]),
			"合价": Number(r["合价"]),
			"计算合价": Number(r["计算合价"]),
			"偏差": Number(r["偏差"]),
			"状态": String(r["状态"]),
		}));
	}

	if (args.kind === "price_distribution") {
		const [dist] = await pool.query<RowDataPacket[]>({
			sql: `SELECT section AS \`分部工程\`, COUNT(*) AS \`条目数\`, MIN(unit_price) AS \`最低单价\`, MAX(unit_price) AS \`最高单价\`, ROUND(AVG(unit_price),2) AS \`平均单价\`, ROUND(STDDEV(unit_price),2) AS \`单价标准差\` FROM boq_item WHERE ${SCOPE_SQL} GROUP BY section ORDER BY \`平均单价\` DESC`,
			values: scopeParams,
		});
		return dist.map((r) => ({
			"分部工程": String(r["分部工程"]),
			"条目数": Number(r["条目数"]),
			"最低单价": Number(r["最低单价"]),
			"最高单价": Number(r["最高单价"]),
			"平均单价": Number(r["平均单价"]),
			"单价标准差": Number(r["单价标准差"]),
			"离散系数": Number(r["平均单价"]) !== 0 ? Math.round((Number(r["单价标准差"]) / Number(r["平均单价"])) * 10000) / 100 : 0,
		}));
	}

	// ---------------------------------------------------------------------------
	// Curated retrieval kinds (original)
	// ---------------------------------------------------------------------------
	let sql: string;
	let values: unknown[];
	if (args.kind === "section_totals") {
		sql = `SELECT section AS \`分部工程\`, SUM(amount) AS \`合价总额\` FROM boq_item WHERE ${SCOPE_SQL} GROUP BY section ORDER BY \`合价总额\` DESC LIMIT ${limit}`;
		values = scopeParams;
	} else if (args.kind === "material_prices") {
		sql = `SELECT name AS \`材料名称\`, spec AS \`规格\`, unit AS \`单位\`, price AS \`单价\` FROM material_price WHERE ${SCOPE_SQL} ORDER BY \`单价\` DESC LIMIT ${limit}`;
		values = scopeParams;
	} else if (args.kind === "top_items") {
		sql = `SELECT code AS \`清单编码\`, section AS \`分部工程\`, name AS \`项目名称\`, unit AS \`单位\`, quantity AS \`工程量\`, unit_price AS \`单价\`, amount AS \`合价\` FROM boq_item WHERE ${SCOPE_SQL} ORDER BY \`合价\` DESC LIMIT ${limit}`;
		values = scopeParams;
	} else {
		const keyword = `%${(args.keyword ?? "").trim()}%`;
		if (!args.keyword?.trim()) throw new Error("search_items 需要 keyword 参数");
		sql = `SELECT code AS \`清单编码\`, section AS \`分部工程\`, name AS \`项目名称\`, unit AS \`单位\`, quantity AS \`工程量\`, amount AS \`合价\` FROM boq_item WHERE ${SCOPE_SQL} AND (name LIKE ? OR code LIKE ? OR section LIKE ?) ORDER BY \`合价\` DESC LIMIT ${limit}`;
		values = [...scopeParams, keyword, keyword, keyword];
	}
	const [rows] = await pool.query<RowDataPacket[]>({ sql, values });
	return rows.map((row) => {
		const cells: Record<string, string | number | boolean | null> = {};
		for (const [key, value] of Object.entries(row as Record<string, unknown>))
			cells[key] = value === null || value === undefined ? null : typeof value === "number" ? value : String(value);
		return cells;
	});
}

// ---------------------------------------------------------------------------
// RAG document corpus (in-memory ingestion over debug/rag-corpus markdown)
// ---------------------------------------------------------------------------

export async function buildRagCorpus(
	corpusDir: string,
): Promise<{ entries: RagQaCorpusEntry[]; documentCount: number }> {
	const permissions = new InMemoryRagPermissionService();
	permissions.allow({ userId: DEBUG_SCOPE.userId, scope: RAG_KNOWLEDGE_SCOPE, permission: "knowledge.ingest" });
	const service = new RagIngestionService({
		permissions,
		documents: new InMemoryRagDocumentRepository(),
		chunks: new InMemoryRagChunkRepository(),
		storage: new InMemoryRagObjectStorage(),
		parsers: new StaticRagParserRouter([new StructuredTextRagParser("parser-v1")]),
		chunker: new StructureAwareRagChunker("chunk-v1", { maxSectionTokens: 256, overlapTokens: 32 }),
		enricher: {
			async enrich(_document, chunks) {
				return chunks.map((chunk) => ({ entityIds: [chunk.chunkId], metadata: {} }));
			},
		},
		embedding: {
			version: "debug-embed-v1",
			dimension: 8,
			async embed(texts: readonly string[]) {
				return texts.map((text) => [text.length % 7, text.length % 5, 1, 0, 0, 0, 0, 0] as const);
			},
		},
		lexicalIndex: new InMemoryRagLexicalIndex("lex-v1"),
		vectorIndex: new InMemoryRagVectorIndex("vec-v1"),
		quality: new StrictRagQualityValidator(),
		trace: new InMemoryRagTraceSink(),
		idFactory: (() => {
			let id = 0;
			return () => `doc-${++id}`;
		})(),
		now: () => new Date(),
	});
	const documentFiles = readdirSync(corpusDir).filter((name) => name.endsWith(".md"));
	const entries: RagQaCorpusEntry[] = [];
	for (const fileName of documentFiles) {
		const content = readFileSync(join(corpusDir, fileName));
		const result = await service.ingest({
			context: debugContext(),
			file: { fileName, mimeType: "text/markdown", sizeBytes: content.byteLength, content },
			scope: RAG_KNOWLEDGE_SCOPE,
		});
		for (const chunk of result.chunks) entries.push({ document: result.document, chunk });
	}
	return { entries, documentCount: documentFiles.length };
}

export async function searchRagDocuments(
	entries: readonly RagQaCorpusEntry[],
	args: { question: string; topK?: number },
): Promise<readonly { document: string; section: string; text: string; score: number }[]> {
	// CJK-aware lexical scoring: the built-in bm25 tokenizer treats a whole Chinese
	// phrase as one token, so character/bigram overlap is used instead.
	const normalized = args.question.toLowerCase();
	const queryChars = [...new Set(normalized.match(/\p{L}|\p{N}/gu) ?? [])];
	const queryBigrams = new Set<string>();
	for (let index = 0; index < normalized.length - 1; index += 1)
		if (/[\p{L}\p{N}]/u.test(normalized[index]!) && /[\p{L}\p{N}]/u.test(normalized[index + 1]!))
			queryBigrams.add(normalized.slice(index, index + 2));
	if (!queryChars.length) return [];
	const scored = entries.map((entry) => {
		const text = entry.chunk.text.toLowerCase();
		let chars = 0;
		for (const character of queryChars) if (text.includes(character)) chars += 1;
		let bigrams = 0;
		for (const bigram of queryBigrams) if (text.includes(bigram)) bigrams += 1;
		const score = chars / queryChars.length + (queryBigrams.size ? bigrams / queryBigrams.size / 2 : 0);
		return {
			document: entry.document.fileName,
			section: entry.chunk.sectionPath.join(" / "),
			text: entry.chunk.text,
			score,
		};
	});
	return scored
		.filter((item) => item.score > 0.15)
		.sort((left, right) => right.score - left.score)
		.slice(0, Math.min(Math.max(args.topK ?? 4, 1), 10));
}

// ---------------------------------------------------------------------------
// M12 sandbox pipeline (LLM planner/verifier + MySQL broker + dev python runtime)
// ---------------------------------------------------------------------------

export async function sandboxAnalyze(
	pool: Pool,
	args: { goal: string; reportTitle?: string },
	onStage?: (stage: string, status: string) => void,
): Promise<{ status: string; summary: string; reportText: string }> {
	const service = new SandboxAnalysisService({
		permissions: new InMemorySandboxPermissionService(),
		tools: new InMemorySandboxToolCatalog([]),
		planner: new LlmSandboxPlanner(),
		schemaDiscovery: new MysqlSchemaDiscovery(pool),
		broker: new MysqlReadOnlyBroker(pool),
		executor: new DevPythonSandboxExecutor(),
		verifier: new LlmSandboxVerifier(),
		mutation: {
			async prepare() {
				throw new Error("mutation is not available in debug runtime");
			},
		},
		reportBuilder: new DevReportBuilder(),
		limits: SANDBOX_LIMITS,
		trace: onStage ? { record: (event) => onStage(event.stage, event.status) } : undefined,
	});
	const result = await service.run({
		goal: args.goal,
		context: debugContext(),
		requestedReportFormats: ["NARRATIVE"],
		reportTitle: args.reportTitle ?? "行业数据分析报告",
	});
	if (result.status !== "REPORT_READY") {
		const reason = "reason" in result ? result.reason : ("summary" in result ? result.summary : result.status);
		return { status: result.status, summary: String(reason ?? result.status), reportText: "" };
	}
	const reportText = result.report.artifacts
		.map((artifact) => new TextDecoder().decode(artifact.content))
		.join("\n\n");
	return { status: result.status, summary: result.summary, reportText };
}
