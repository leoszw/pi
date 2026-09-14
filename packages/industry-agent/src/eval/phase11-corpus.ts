import type { EvalCategory, GoldenCorpus, GoldenEvalCase } from "./types.ts";

const PER_CATEGORY = 54;

function caseId(category: EvalCategory, index: number): string {
	return `p11-${category.toLowerCase().replaceAll("_", "-")}-${String(index + 1).padStart(3, "0")}`;
}

function base(category: EvalCategory, index: number): Pick<GoldenEvalCase, "id" | "category" | "kind" | "tags"> {
	return {
		id: caseId(category, index),
		category,
		kind: category === "HARD_NEGATIVE" ? "HARD_NEGATIVE" : index % 3 === 0 ? "GOLDEN" : "HARD",
		tags: ["phase11", index % 3 === 0 ? "golden" : "hard", category.toLowerCase()],
	};
}

function buildCase(category: EvalCategory, index: number): GoldenEvalCase {
	const common = base(category, index);
	const n = index + 1;
	const project = `P${(index % 9) + 1}`;
	const alternateProject = `P${((index + 3) % 9) + 1}`;
	switch (category) {
		case "SAME_NAME_ENTITY": {
			const name = ["承台", "墩柱", "系梁", "盖梁", "桥台", "桩基"][index % 6]!;
			return {
				...common,
				input: {
					text: `查${project}项目的${name}`,
					requestProjectId: project,
					candidates: [`${project}-${name}-A`, `${alternateProject}-${name}-A`],
				},
				expected: {
					resolvedEntityId: `${project}-${name}-A`,
					mustNotResolve: [`${alternateProject}-${name}-A`],
					projectHardFilter: project,
				},
			};
		}
		case "ALIAS_SHORT_NAME": {
			const [alias, canonicalName] = [
				["主桥", "主线桥梁工程"],
				["隧道", "隧道工程"],
				["路基", "路基工程"],
				["交安", "交通安全设施"],
				["排水", "排水工程"],
				["绿化", "绿化工程"],
			][index % 6]!;
			return {
				...common,
				input: { text: `帮我查${alias}${n}`, alias, projectId: project },
				expected: { canonicalName, aliasMatched: true, crossProject: false },
			};
		}
		case "TYPO": {
			const [raw, normalizedHint] = [
				["K12+3O0", "K12+300"],
				["左副", "左幅"],
				["右付", "右幅"],
				["混泥土", "混凝土"],
				["钢筋笼字", "钢筋笼子"],
				["清淡编码", "清单编码"],
			][index % 6]!;
			return {
				...common,
				input: { text: `${raw} 查询 ${n}`, raw },
				expected: { normalizedHint, mustNotInventId: true },
			};
		}
		case "CHAINAGE_RANGE": {
			const km = 10 + (index % 20);
			const start = (index * 37) % 850;
			const end = start + 50 + (index % 40);
			return {
				...common,
				input: {
					text: `K${km}+${String(start).padStart(3, "0")} 至 K${km}+${String(end).padStart(3, "0")} 的工程部位`,
					projectId: project,
				},
				expected: {
					chainageStart: km * 1000 + start,
					chainageEnd: km * 1000 + end,
					sorted: true,
					hardFilter: true,
				},
			};
		}
		case "SIDE": {
			const [raw, normalizedSide] = [
				["左幅", "LEFT_CARRIAGEWAY"],
				["右幅", "RIGHT_CARRIAGEWAY"],
				["左线", "LEFT_ALIGNMENT"],
				["右线", "RIGHT_ALIGNMENT"],
				["左侧", "LOCAL_LEFT"],
				["右侧", "LOCAL_RIGHT"],
			][index % 6]!;
			return {
				...common,
				input: { text: `${raw}第${n}个部位`, raw },
				expected: { normalizedSide, doNotConflateLocalAndAlignment: true },
			};
		}
		case "PROJECT_CONFLICT":
			return {
				...common,
				input: {
					text: `查${alternateProject}项目的工程量`,
					requestProjectId: project,
					mentionedProjectId: alternateProject,
				},
				expected: { hardProjectId: project, conflictingProjectSoft: alternateProject, crossProjectLeak: false },
			};
		case "SECTION_NAME": {
			const sectionName = ["路基工程", "路面工程", "桥梁涵洞", "隧道工程", "安全设施", "绿化环保"][index % 6]!;
			return {
				...common,
				input: { text: `清单章节“${sectionName}”第${n}项`, sectionName },
				expected: { sectionName, preferSectionFilter: true },
			};
		}
		case "BOQ_CODE": {
			const ledgerCode = `${100 + (index % 8)}.${(index % 5) + 1}.${(index % 9) + 1}`;
			return {
				...common,
				input: { text: `查清单编码 ${ledgerCode}`, ledgerCode, projectId: project },
				expected: { exactFirst: true, normalizedCode: ledgerCode, densePrimary: false },
			};
		}
		case "CONTEXT_REFERENCE": {
			const phrases = ["这些", "刚才那些", "第二个", "只看未完成的", "继续", "把这些导出来"] as const;
			const phrase = phrases[index % phrases.length]!;
			const rows = [`R${n}-1`, `R${n}-2`, `R${n}-3`];
			return {
				...common,
				input: {
					text: phrase,
					previousRows: rows,
					selectedRows: index % 2 ? [rows[1]] : [],
					activeProjectId: project,
				},
				expected: {
					referenceType: ["CURRENT_SET", "CURRENT_SET", "ORDINAL", "APPLY_FILTER", "CONTINUE", "EXPORT_CURRENT"][
						index % 6
					],
					mustStayInProject: project,
					...(phrase === "第二个" ? { rowId: rows[1] } : {}),
				},
			};
		}
		case "IMAGE_RESERVED":
			return {
				...common,
				input: {
					assetId: `asset-${n}`,
					mimeType: index % 2 ? "image/jpeg" : "image/png",
					question: "识别图片中的工程对象",
				},
				expected: { capability: "RESERVED_NOT_EXECUTED", mustNotMutate: true, requiresFutureImageStage: true },
			};
		case "RAG_SCOPE_ACL": {
			const role = ["engineer", "manager", "auditor"][index % 3]!;
			const accessible = index % 2 === 0;
			return {
				...common,
				input: {
					principal: { tenantId: "T1", projectId: project, roles: [role], securityTags: ["S1"] },
					document: {
						tenantId: "T1",
						projectId: accessible ? project : alternateProject,
						visibility: "PROJECT",
						aclRoles: [role],
						securityTags: ["S1"],
					},
				},
				expected: { accessible, aclBeforeRetrieval: true, postFilterOnly: false },
			};
		}
		case "KNOWLEDGE_SCOPE_CONFLICT": {
			const dimension = ["tenant", "company", "project", "industry"][index % 4]!;
			return {
				...common,
				input: {
					question: `冲突知识样例${n}`,
					requestScope: { tenant: "T1", company: "C1", project, industry: "I1" },
					candidateScope: {
						tenant: dimension === "tenant" ? "T2" : "T1",
						company: dimension === "company" ? "C2" : "C1",
						project: dimension === "project" ? alternateProject : project,
						industry: dimension === "industry" ? "I2" : "I1",
					},
				},
				expected: { retrievable: false, conflictDimension: dimension, mustNotReachAnswerGenerator: true },
			};
		}
		case "INSUFFICIENT_EVIDENCE":
			return {
				...common,
				input: { question: `知识库没有依据的问题${n}`, retrievedEvidence: [] },
				expected: { status: "INSUFFICIENT_EVIDENCE", answerGeneratorCalled: false, mustNotFabricate: true },
			};
		case "WRONG_MUTATION_TARGET":
			return {
				...common,
				input: {
					requestedTargetId: `ENTITY-${n}`,
					proposalTargetId: `ENTITY-${n + 1}`,
					operation: index % 2 ? "DELETE" : "UPDATE",
				},
				expected: { commitAllowed: false, wrongTargetRateContribution: 1, requiresNewPrepare: true },
			};
		case "BATCH_MUTATION": {
			const affectedCount = 2 + (index % 12);
			const targetIds = Array.from({ length: affectedCount }, (_, row) => `E${n}-${row}`);
			return {
				...common,
				input: { operation: "UPDATE", targetIds, confirmed: index % 2 === 0 },
				expected: {
					affectedCount,
					representativeSamplesMax: 5,
					commitAllowed: index % 2 === 0,
					batchVersionDigest: true,
				},
			};
		}
		case "TOOL_FAILURE": {
			const tool = ["search_boq", "search_engineering_positions", "query_quantity", "list_project_documents"][
				index % 4
			]!;
			return {
				...common,
				input: { tool, fault: ["timeout", "backend_error", "invalid_output"][index % 3], traceId: `trace-${n}` },
				expected: { businessResultInvented: false, errorTraced: true, toolFailureVisible: true },
			};
		}
		case "LLM_TIMEOUT":
			return {
				...common,
				input: {
					stage: ["semantic_parse", "rerank", "answer"][index % 3],
					timeoutMs: 1000 + (index % 5) * 500,
					traceId: `trace-${n}`,
				},
				expected: { timeoutRecorded: true, unboundedRetry: false, businessWrite: false },
			};
		case "ZERO_RETRIEVAL":
			return {
				...common,
				input: { query: `不存在的实体ZZ${n}`, candidateCount: 0, projectId: project },
				expected: { zeroResult: true, fabricatedEntity: false, clarifyOrNoEvidence: true },
			};
		case "HARD_NEGATIVE": {
			const text = ["请解释施工规范", "你好", "导出模板说明", "给我一个例子", "总结上一段文字", "什么是RRF"][
				index % 6
			]!;
			return {
				...common,
				input: { text: `${text} #${n}`, projectId: project },
				expected: { mustNotSelectMutationTool: true, mustNotInventEntity: true, mustNotCrossScope: true },
			};
		}
	}
}

export function buildPhase11GoldenCorpus(): GoldenCorpus {
	const categories: readonly EvalCategory[] = [
		"SAME_NAME_ENTITY",
		"ALIAS_SHORT_NAME",
		"TYPO",
		"CHAINAGE_RANGE",
		"SIDE",
		"PROJECT_CONFLICT",
		"SECTION_NAME",
		"BOQ_CODE",
		"CONTEXT_REFERENCE",
		"IMAGE_RESERVED",
		"RAG_SCOPE_ACL",
		"KNOWLEDGE_SCOPE_CONFLICT",
		"INSUFFICIENT_EVIDENCE",
		"WRONG_MUTATION_TARGET",
		"BATCH_MUTATION",
		"TOOL_FAILURE",
		"LLM_TIMEOUT",
		"ZERO_RETRIEVAL",
		"HARD_NEGATIVE",
	];
	const generated = categories.flatMap((category) =>
		Array.from({ length: PER_CATEGORY }, (_, index) => buildCase(category, index)),
	);
	const critical: readonly GoldenEvalCase[] = [
		{
			id: "p11-e2e-query-a",
			category: "CHAINAGE_RANGE",
			kind: "GOLDEN",
			tags: ["phase11", "golden", "critical-e2e", "scenario-a"],
			input: { text: "查一下 K12+300 到 K12+800 左幅路基的清单", projectId: "P2" },
			expected: {
				requiredStages: [
					"SEMANTIC_PARSE",
					"CHAINAGE_NORMALIZE",
					"ENGINEERING_RETRIEVAL",
					"BOQ_RETRIEVAL",
					"READ_TOOL",
					"AUTHORITATIVE_FACT_READ",
					"TABLE_UI",
					"TRACE",
				],
				chainageStart: 12300,
				chainageEnd: 12800,
				side: "LEFT_CARRIAGEWAY",
				crossProjectLeak: false,
			},
		},
		{
			id: "p11-e2e-mutation-b",
			category: "BATCH_MUTATION",
			kind: "GOLDEN",
			tags: ["phase11", "golden", "critical-e2e", "scenario-b"],
			input: { text: "把刚才那些未完成项负责人改成张三", previousResultIds: ["E1", "E2", "E3"], confirmed: false },
			expected: {
				requiredStages: [
					"WORKING_MEMORY",
					"LOAD_LATEST",
					"PREPARE_UPDATE",
					"DIFF",
					"CONFIRMATION",
					"APPROVAL_TOKEN",
					"COMMIT",
					"VERIFY",
					"AUDIT",
					"TRACE",
				],
				writeBeforeConfirmation: false,
				softScopeFromMemoryOnly: false,
			},
		},
		{
			id: "p11-e2e-rag-c",
			category: "RAG_SCOPE_ACL",
			kind: "GOLDEN",
			tags: ["phase11", "golden", "critical-e2e", "scenario-c"],
			input: { text: "这份规范对混凝土养护时间怎么规定？", projectId: "P2", principalRoles: ["engineer"] },
			expected: {
				requiredStages: [
					"PROJECT_CONTEXT",
					"ACL_PREFILTER",
					"HYBRID_RAG",
					"RRF",
					"RERANK",
					"PARENT_EXPANSION",
					"CITATION",
					"ANSWER",
				],
				evidenceOnly: true,
				unauthorizedChunkVisible: false,
			},
		},
		{
			id: "p11-e2e-fact-d",
			category: "BOQ_CODE",
			kind: "GOLDEN",
			tags: ["phase11", "golden", "critical-e2e", "scenario-d"],
			input: { text: "二标 K23+400 左幅 0#台桩基混凝土工程量是多少？", projectId: "P2" },
			expected: {
				requiredStages: ["ENTITY_RETRIEVAL", "RESOLVE_POSITION_BOQ", "AUTHORITATIVE_FACT_READ", "ANSWER_EVIDENCE"],
				factFields: ["quantity", "unit", "version", "updated_at"],
				vectorTextFinalFactAllowed: false,
			},
		},
	];
	return {
		version: "phase11-golden-v1",
		generatorVersion: "phase11-contract-generator-v1",
		cases: [...generated, ...critical],
	};
}
