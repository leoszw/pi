// Shared GLM-5.2-backed sandbox planner/verifier for debug entry and the pi extension.
import { completeSimple } from "../packages/ai/src/compat.ts";
import type { Context, Model, Usage } from "../packages/ai/src/types.ts";
import type {
	SandboxBudgetView,
	SandboxLimits,
	SandboxPlanner,
	SandboxRouteDecision,
	SandboxSchemaSnapshot,
	SandboxUsage,
	SandboxVerificationDecision,
} from "../packages/industry-agent/src/sandbox/index.ts";

export const GLM_MODEL: Model<"openai-completions"> = {
	id: "GLM-5.2",
	name: "GLM-5.2",
	api: "openai-completions",
	provider: "huawei-inferhub",
	baseUrl: "http://127.0.0.1:8766/v1",
	reasoning: false,
	input: ["text"],
	cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
	contextWindow: 128000,
	maxTokens: 16384,
	compat: { supportsDeveloperRole: false, supportsReasoningEffort: true },
};

export const SANDBOX_LIMITS: SandboxLimits = {
	maxToolHandoffActions: 4,
	maxQueries: 8,
	maxSqlChars: 10000,
	maxPythonChars: 20000,
	maxBrokerCalls: 8,
	maxRowsPerQuery: 5000,
	maxTotalBrokerRows: 20000,
	maxCellChars: 10000,
	maxBrokerResultChars: 5000000,
	maxTotalBrokerChars: 10000000,
	maxBrokerExecutionMs: 10000,
	maxOutputTables: 10,
	maxOutputRows: 10000,
	maxOutputChars: 5000000,
	maxTotalTokens: 50000,
	maxCostUsd: 2.0,
	maxDurationMs: 600000,
	maxOperationMs: 180000,
	maxSandboxCpuMs: 10000,
	maxSandboxMemoryBytes: 268435456,
};

function usageOf(message: Usage): SandboxUsage {
	return {
		inputTokens: message.input,
		outputTokens: message.output,
		cachedTokens: message.cacheRead,
		reasoningTokens: message.reasoning ?? 0,
		totalTokens: message.totalTokens,
		costUsd: message.cost.total,
	};
}

export async function llmJson(
	system: string,
	user: string,
	signal: AbortSignal,
	attempts = 3,
): Promise<{ data: Record<string, unknown>; usage: Usage }> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		try {
			const assistant = await completeSimple(
				GLM_MODEL,
				{
					systemPrompt: system,
					messages: [{ role: "user", content: user, timestamp: Date.now() }],
				} satisfies Context,
				{ apiKey: "debug", signal, reasoning: "off", maxTokens: 16384 },
			);
			const text = assistant.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
			const start = text.indexOf("{");
			const end = text.lastIndexOf("}");
			if (start < 0 || end <= start) throw new Error(`LLM response is not JSON: ${text.slice(0, 300)}`);
			return { data: JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>, usage: assistant.usage };
		} catch (error) {
			lastError = error;
			console.error(`[llm] attempt ${attempt}/${attempts} failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	throw lastError;
}

const ROUTE_SYSTEM = `你是只读数据分析平台的调度器。根据目标和可用工具列表，决定处理方式。
可用工具列表为空时，必须返回 {"kind": "SANDBOX_REQUIRED", "reason": "<需要沙箱分析的原因，中文，不超过500字>"}。
不要输出 JSON 以外的任何内容。`;

const SQL_RULES = `SQL 规则（违反任何一条都会被静态校验拒绝）：
1. 只允许单条 SELECT 语句（或 WITH ... AS (...) SELECT），以一个 LIMIT 数字结尾，如 LIMIT 50；
2. 只能出现白名单表，SELECT 列必须显式列出，禁止 *；
3. 禁止注释、分号多语句、@变量、系统表、逗号连接（多表用 JOIN ... ON）；
4. 必须带租户范围过滤：tenant_id = '<tenantId>' AND company_id = '<companyId>'（project 表无 project_id，其余表还要 AND project_id = '<projectId>'）；
5. 聚合列用 SUM(...) 等并在 SELECT 中起别名。`;

const PYTHON_RULES = `Python 规则（违反任何一条都会被静态校验拒绝）：
1. 必须定义 def main(read): 作为唯一入口，返回 dict：{"tables": [...], "narrative": [...], "answer": "一句话结论"}；
2. 禁止 import/from/class/while/with/async/await/yield/global/nonlocal 关键字（注释和字符串里也不要出现这些英文单词，注释用中文）；
3. 禁止 open/exec/eval/getattr 等内置危险调用、双下划线名称、os/sys 等系统模块、URL；
4. 只能通过 read("<queryId>") 获取数据，queryId 必须是 queries 里声明的字面量，且每个声明的 queryId 都必须恰好 read 一次；read() 返回 dict：{"columns": [...], "rows": [ {列名: 值}, ... ]}，遍历数据要写 for row in read("q1")["rows"]:；
5. tables 元素格式：{"tableId": "t1", "name": "中文名", "columns": [{"key": "列名", "label": "中文标签", "type": "STRING|NUMBER"}], "rows": [{...}], "sourceQueryIds": ["q1"]}；columns 的 type 必须与 rows 值一致（数字聚合列用 NUMBER，文本用 STRING），rows 的键必须都在 columns 里声明；
6. narrative 元素格式：{"sectionId": "s1", "heading": "标题", "body": "纯文本，不含HTML", "sourceQueryIds": ["q1"]}。`;

export class LlmSandboxPlanner implements SandboxPlanner {
	readonly version = "glm-5.2-planner-v1";

	async route(
		input: { goal: string; availableTools: readonly { name: string; version: string }[]; budget: SandboxBudgetView },
		signal: AbortSignal,
	): Promise<SandboxRouteDecision> {
		const { data, usage } = await llmJson(
			ROUTE_SYSTEM,
			`目标：${input.goal}\n可用工具：${JSON.stringify(input.availableTools)}\n预算：${JSON.stringify(input.budget)}`,
			signal,
		);
		const kind = String(data["kind"] ?? "");
		if (kind === "SANDBOX_REQUIRED") return { kind, reason: String(data["reason"] ?? ""), usage: usageOf(usage) };
		if (kind === "ASK_USER") return { kind, question: String(data["question"] ?? ""), usage: usageOf(usage) };
		if (kind === "FAIL") return { kind, reason: String(data["reason"] ?? ""), usage: usageOf(usage) };
		throw new Error(`planner returned unsupported route kind: ${kind}`);
	}

	async generate(
		input: { goal: string; schema: SandboxSchemaSnapshot; context: { tenantId: string; companyId: string | null; projectId: string | null } },
		signal: AbortSignal,
	): Promise<{ program: { programId: string; queries: { queryId: string; sql: string; referencedTables: string[] }[]; python: string; explanation: string }; usage: SandboxUsage }> {
		const { data, usage } = await llmJson(
			`你是只读 SQL/Python 分析程序生成器。根据目标与数据库 schema 生成查询与分析程序。\n${SQL_RULES}\n${PYTHON_RULES}\n只输出 JSON：{"queries": [{"queryId": "q1", "sql": "...", "referencedTables": ["表名"]}], "python": "def main(read): ... 的完整源码", "explanation": "中文说明"}`,
			`目标：${input.goal}\n当前范围：tenantId=${input.context.tenantId}, companyId=${input.context.companyId ?? ""}, projectId=${input.context.projectId ?? ""}\n数据库 schema：${JSON.stringify({
				tables: input.schema.tables.map((table) => ({
					tableName: table.tableName,
					description: table.description,
					columns: table.columns.map((column) => ({ name: column.name, type: column.dataType })),
				})),
			})}`,
			signal,
		);
		const program = data["program"] as Record<string, unknown> | undefined;
		const source = (program ?? data) as Record<string, unknown>;
		const queries = Array.isArray(source["queries"]) ? (source["queries"] as Record<string, unknown>[]) : [];
		return {
			program: {
				programId: `prog-${Date.now()}`,
				queries: queries.map((item) => ({
					queryId: String(item["queryId"] ?? ""),
					sql: String(item["sql"] ?? ""),
					referencedTables: Array.isArray(item["referencedTables"]) ? item["referencedTables"].map(String) : [],
				})),
				python: String(source["python"] ?? ""),
				explanation: String(source["explanation"] ?? ""),
			},
			usage: usageOf(usage),
		};
	}
}

export class LlmSandboxVerifier {
	readonly version = "glm-5.2-verifier-v1";

	async verify(
		input: { goal: string; output: unknown },
		signal: AbortSignal,
	): Promise<SandboxVerificationDecision> {
		const { data, usage } = await llmJson(
			`你是分析结果审核员。判断输出是否回答了目标且数据自洽。
只输出 JSON：{"kind": "ACCEPT", "summary": "<中文摘要>"} 或 {"kind": "FAIL", "reason": "<中文原因>"}`,
			`目标：${input.goal}\n输出：${JSON.stringify(input.output).slice(0, 20000)}`,
			signal,
		);
		const kind = String(data["kind"] ?? "");
		if (kind === "ACCEPT") return { kind, summary: String(data["summary"] ?? ""), usage: usageOf(usage) };
		return { kind: "FAIL", reason: String(data["reason"] ?? data["summary"] ?? "verification failed"), usage: usageOf(usage) };
	}
}
