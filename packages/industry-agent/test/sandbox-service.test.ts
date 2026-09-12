import { describe, expect, it } from "vitest";
import {
	InMemorySandboxPermissionService,
	InMemorySandboxToolCatalog,
	InMemorySandboxTraceSink,
	RecordingSandboxMutationPreparer,
	RecordingSandboxReportBuilder,
	SandboxAnalysisService,
	ScriptedSandboxExecutor,
	ScriptedSandboxPlanner,
	ScriptedSandboxVerifier,
	StaticReadOnlyBroker,
	StaticSandboxSchemaDiscovery,
} from "../src/sandbox/index.ts";
import {
	sandboxAttestation,
	sandboxBrokerResult,
	sandboxContext,
	sandboxLimits,
	sandboxMutationResult,
	sandboxOutput,
	sandboxProgram,
	sandboxReportResult,
	sandboxSchema,
	sandboxUsage,
} from "./sandbox-helpers.ts";

describe("M12 sandbox service", () => {
	it("produces a report through the read-only broker path", async () => {
		const program = sandboxProgram();
		const permissions = new InMemorySandboxPermissionService();
		const broker = new StaticReadOnlyBroker([sandboxBrokerResult()]);
		const mutation = new RecordingSandboxMutationPreparer(sandboxMutationResult());
		const report = new RecordingSandboxReportBuilder(sandboxReportResult());
		const trace = new InMemorySandboxTraceSink();
		const service = new SandboxAnalysisService({
			permissions,
			tools: new InMemorySandboxToolCatalog([]),
			planner: new ScriptedSandboxPlanner("planner-v1", { kind: "SANDBOX_REQUIRED", reason: "Need aggregation", usage: sandboxUsage() }, { program, usage: sandboxUsage() }),
			schemaDiscovery: new StaticSandboxSchemaDiscovery(sandboxSchema()),
			broker,
			executor: new ScriptedSandboxExecutor(async (_input, dataAccess) => { await dataAccess.read("q1"); return { output: sandboxOutput(), attestation: sandboxAttestation(program.python) }; }),
			verifier: new ScriptedSandboxVerifier("verifier-v1", { kind: "ACCEPT", summary: "Verified", usage: sandboxUsage() }),
			mutation,
			reportBuilder: report,
			limits: sandboxLimits(),
			trace,
			idFactory: () => "run-1",
		});
		const result = await service.run({ goal: "Analyze BOQ quantity", context: sandboxContext(), requestedReportFormats: ["NARRATIVE"] });
		expect(result.status).toBe("REPORT_READY");
		expect(broker.calls).toEqual(["q1"]);
		expect(permissions.checks).toEqual(["sandbox.analyze", "sandbox.schema.read", "sandbox.data.read", "sandbox.data.read"]);
		expect(trace.events.some((event) => event.stage === "BROKER_READ" && event.status === "OK")).toBe(true);
	});

	it("stops at mutation prepare and never commits", async () => {
		const program = sandboxProgram();
		const mutation = new RecordingSandboxMutationPreparer(sandboxMutationResult());
		const report = new RecordingSandboxReportBuilder(sandboxReportResult());
		const service = new SandboxAnalysisService({
			permissions: new InMemorySandboxPermissionService(),
			tools: new InMemorySandboxToolCatalog([]),
			planner: new ScriptedSandboxPlanner("planner-v1", { kind: "SANDBOX_REQUIRED", reason: "Need analysis", usage: sandboxUsage() }, { program, usage: sandboxUsage() }),
			schemaDiscovery: new StaticSandboxSchemaDiscovery(sandboxSchema()),
			broker: new StaticReadOnlyBroker([sandboxBrokerResult()]),
			executor: new ScriptedSandboxExecutor(async (_input, dataAccess) => { await dataAccess.read("q1"); return { output: sandboxOutput(), attestation: sandboxAttestation(program.python) }; }),
			verifier: new ScriptedSandboxVerifier("verifier-v1", { kind: "MUTATION_REQUIRED", summary: "Owner should change", recommendation: { operation: "UPDATE", entityType: "BOQ_ITEM", targetEntityIds: ["90071992547409931234"], values: { owner: "张三" }, evidenceQueryIds: ["q1"] }, usage: sandboxUsage() }),
			mutation,
			reportBuilder: report,
			limits: sandboxLimits(),
			idFactory: () => "run-2",
		});
		const result = await service.run({ goal: "Analyze and suggest owner change", context: sandboxContext(), requestedReportFormats: ["NARRATIVE"] });
		expect(result.status).toBe("MUTATION_CONFIRMATION_REQUIRED");
		expect(mutation.recommendations).toHaveLength(1);
		expect(report.inputs).toHaveLength(0);
	});
});
