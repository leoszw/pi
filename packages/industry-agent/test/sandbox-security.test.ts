import { describe, expect, it } from "vitest";
import { validateBrokerResult, validateRuntimeAttestation } from "../src/sandbox/validation.ts";
import { sandboxAttestation, sandboxBrokerResult, sandboxContext, sandboxLimits, sandboxProgram, sandboxSchema } from "./sandbox-helpers.ts";

describe("M12 Broker and runtime attestations", () => {
	it("accepts complete read-only broker attestation", () => {
		expect(validateBrokerResult(sandboxBrokerResult(), sandboxContext(), sandboxSchema(), "q1", sandboxLimits()).attestation.credentialsExposedToSandbox).toBe(false);
	});

	it("rejects broker results without server scope enforcement", () => {
		const result = sandboxBrokerResult();
		expect(() => validateBrokerResult({ ...result, attestation: { ...result.attestation, serverScopeEnforced: false as true } }, sandboxContext(), sandboxSchema(), "q1", sandboxLimits())).toThrow();
	});

	it("rejects sandbox runtime when network isolation is not attested", () => {
		const program = sandboxProgram();
		const attestation = sandboxAttestation(program.python);
		expect(() => validateRuntimeAttestation({ ...attestation, networkDisabled: false as true }, program.python, sandboxLimits())).toThrow();
	});
});
