/**
 * Industry agent tools for pi.
 *
 * The chat conversation is the agent entry: the model can call curated BOQ data
 * queries and RAG document search to answer questions. The M12 sandbox analysis
 * tool stays hidden until a production-isolated executor is configured.
 * Management-style views live behind the /industry command.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { buildRagCorpus, queryBoqData, searchRagDocuments } from "../../debug/industry-tools.ts";
import { createMysqlPool } from "../../debug/mysql-adapters.ts";

export default function industryAgentExtension(pi: ExtensionAPI) {
	const pool = createMysqlPool();
	const corpusDir = new URL("../../debug/rag-corpus/", import.meta.url).pathname;
	let corpusState: Awaited<ReturnType<typeof buildRagCorpus>> | undefined;
	let corpusError: string | undefined;

	const ensureCorpus = async () => {
		if (corpusState) return corpusState.entries;
		const built = await buildRagCorpus(corpusDir);
		corpusState = built;
		return built.entries;
	};

	function textResult(text: string, details: Record<string, unknown>) {
		return { content: [{ type: "text" as const, text }], details };
	}

	pi.registerTool({
		name: "query_boq_data",
		label: "BOQ 数据查询",
		description:
			"查询滨江产业园一期项目的结构化业务数据（MySQL，只读）。kind 取值：" +
			"section_totals=各分部工程合价汇总；material_prices=材料价格明细；top_items=按合价排序的清单条目；" +
			"search_items=按关键词搜索清单条目（需提供 keyword）。" +
			"分析类（服务端预计算，确定性结果）：cost_summary=造价汇总与帕累托分析（含占比/累计占比/合计行）；" +
			"section_stats=各分部统计（条目数/合价/平均/最高/最低单价）；amount_audit=合价一致性校验（quantity×单价 vs 合价，标记偏差）；" +
			"price_distribution=单价分布分析（均值/标准差/离散系数）。" +
			"适合直接的事实型数据问题。",
		promptSnippet: "Query curated BOQ/material data for the current project (read-only MySQL)",
		promptGuidelines: ["For factual project data questions, prefer query_boq_data."],
		parameters: Type.Object({
			kind: Type.Union([
				Type.Literal("section_totals"),
				Type.Literal("material_prices"),
				Type.Literal("top_items"),
				Type.Literal("search_items"),
				Type.Literal("cost_summary"),
				Type.Literal("section_stats"),
				Type.Literal("amount_audit"),
				Type.Literal("price_distribution"),
			]),
			keyword: Type.Optional(Type.String({ description: "search_items 时的关键词（名称/编码/分部）" })),
			limit: Type.Optional(Type.Number({ description: "返回行数上限，默认 10，最大 50" })),
		}),
		async execute(_toolCallId, params) {
			const rows = await queryBoqData(pool, params);
			return textResult(JSON.stringify({ kind: params.kind, rows }, null, 1), { rowCount: rows.length });
		},
	});

	pi.registerTool({
		name: "search_documents",
		label: "文档检索（RAG）",
		description:
			"在项目知识库中检索相关文档片段（合同条款、施工组织设计、材料价格管理办法等），返回带出处的原文摘录。" +
			"适合回答制度、条款、流程类问题；回答时应引用来源文档名。",
		promptSnippet: "Search project knowledge-base documents (RAG) and return cited excerpts",
		promptGuidelines: ["Cite the source document name when answering from search_documents results."],
		parameters: Type.Object({
			question: Type.String({ description: "检索问题（中文自然语言）" }),
			topK: Type.Optional(Type.Number({ description: "返回片段数，默认 4，最大 10" })),
		}),
		async execute(_toolCallId, params) {
			const results = await searchRagDocuments(await ensureCorpus(), params);
			if (!results.length) return textResult("知识库中没有匹配的文档片段。", { count: 0 });
			return textResult(
				results
					.map((item) => `【${item.document} | ${item.section}】(score ${item.score.toFixed(3)})\n${item.text}`)
					.join("\n\n---\n\n"),
				{ count: results.length },
			);
		},
	});

	pi.registerCommand("industry", {
		description: "行业 agent 状态（数据连接/知识库）",
		handler: async (_args, ctx) => {
			try {
				await ensureCorpus();
			} catch (error) {
				corpusError = error instanceof Error ? error.message : String(error);
			}
			const status = [
				"行业 agent 状态：",
				"- 工具：query_boq_data / search_documents（已注册）",
				"- 沙箱深度分析：未注册（等待满足生产隔离与 attestation 契约的执行器）",
				"- MySQL：pi_query @ 127.0.0.1:3306（只读账号）",
				`- 知识库：${corpusError ? `加载失败：${corpusError}` : `已加载 ${corpusState?.documentCount ?? 0} 篇文档（debug/rag-corpus）`}`,
			].join("\n");
			if (ctx.mode === "tui") await ctx.ui.notify(status, "info");
			else console.log(status);
		},
	});
}
