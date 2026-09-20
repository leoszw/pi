// End-to-end debug entry for the industry-agent M12 sandbox pipeline:
// LLM route/generate/verify (GLM-5.2 via local proxy) + MySQL schema/broker + dev python runtime + M11 report.
// Run: node_modules/.bin/tsx debug/run.mts
import { createRequestContext } from "../packages/industry-agent/src/context/request-context.ts";
import { InMemorySandboxPermissionService, InMemorySandboxToolCatalog } from "../packages/industry-agent/src/sandbox/index.ts";
import { SandboxAnalysisService } from "../packages/industry-agent/src/sandbox/service.ts";
import { createMysqlPool, MysqlReadOnlyBroker, MysqlSchemaDiscovery } from "./mysql-adapters.ts";
import { DevPythonSandboxExecutor, DevReportBuilder } from "./dev-runtime.ts";
import { LlmSandboxPlanner, LlmSandboxVerifier, SANDBOX_LIMITS } from "./llm-sandbox.ts";

async function main(): Promise<void> {
	const pool = createMysqlPool();
	const context = createRequestContext({
		userId: "u-debug",
		tenantId: "t-1",
		companyId: "c-1",
		projectId: "p-demo-1",
		conversationId: "cv-debug",
	});
	const traceEvents: { stage: string; status: string }[] = [];
	const trace = {
		record(event: { stage: string; status: string }) {
			traceEvents.push(event);
			console.error(`[trace] ${event.stage} ${event.status}`);
		},
	};
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
		trace,
	});
	const result = await service.run({
		goal: "统计滨江产业园一期各分部工程的合价总额，找出金额最高的分部工程，并用一段话总结主要材料价格情况。",
		context,
		requestedReportFormats: ["NARRATIVE"],
		reportTitle: "滨江产业园一期分部工程合价分析",
	});
	const printable = JSON.stringify(
		result,
		(_key, value: unknown) => (value instanceof Uint8Array ? `<${value.byteLength} bytes>` : value),
		2,
	);
	console.log(printable);
	const artifacts = result.status === "REPORT_READY" ? result.report.artifacts : [];
	for (const artifact of artifacts)
		console.log(`\n===== ${artifact.fileName ?? artifact.artifactId} (${artifact.mimeType}) =====\n${new TextDecoder().decode(artifact.content)}`);
	await pool.end();
}

main().catch((error: unknown) => {
	console.error("[debug] failed:", error);
	process.exitCode = 1;
});
