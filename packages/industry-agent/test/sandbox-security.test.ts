import { describe, expect, it } from "vitest";
import { DevPythonSandboxExecutor } from "../../../debug/dev-runtime.ts";
import { validateBrokerResult, validateRuntimeAttestation } from "../src/sandbox/validation.ts";
import {
	sandboxAttestation,
	sandboxBrokerResult,
	sandboxContext,
	sandboxLimits,
	sandboxProgram,
	sandboxSchema,
} from "./sandbox-helpers.ts";

describe("M12 Broker and runtime attestations", () => {
	it("accepts complete read-only broker attestation", () => {
		expect(
			validateBrokerResult(sandboxBrokerResult(), sandboxContext(), sandboxSchema(), "q1", sandboxLimits())
				.attestation.credentialsExposedToSandbox,
		).toBe(false);
	});

	it("rejects broker results without server scope enforcement", () => {
		const result = sandboxBrokerResult();
		expect(() =>
			validateBrokerResult(
				{ ...result, attestation: { ...result.attestation, serverScopeEnforced: false as true } },
				sandboxContext(),
				sandboxSchema(),
				"q1",
				sandboxLimits(),
			),
		).toThrow();
	});

	it("rejects sandbox runtime when network isolation is not attested", () => {
		const program = sandboxProgram();
		const attestation = sandboxAttestation(program.python);
		expect(() =>
			validateRuntimeAttestation(
				{ ...attestation, networkDisabled: false },
				program.python,
				sandboxLimits(),
			),
		).toThrow();
	});

	it("rejects the debug Python executor before running a production safety contract", async () => {
		const program = sandboxProgram();
		const executor = new DevPythonSandboxExecutor();
		await expect(
			executor.execute(
				{
					runId: "run-unsafe-dev",
					programId: program.programId,
					python: program.python,
					permittedQueryIds: ["q1"],
					maxOutputRows: 100,
					maxOutputChars: 10000,
					safety: {
						networkDisabled: true,
						filesystemDisabled: true,
						processSpawnDisabled: true,
						environmentSecretsExposed: false,
						importsDisabled: true,
						dynamicCodeDisabled: true,
						dataAccessMode: "QUERY_ID_ONLY",
						abortTerminatesExecution: true,
					},
				},
				{ read: async () => Promise.reject(new Error("read should not be called")) },
				new AbortController().signal,
			),
		).rejects.toThrow("does not satisfy the requested production sandbox safety contract");
	});
});
