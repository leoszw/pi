import { describe, expect, it } from "vitest";
import { DevPythonSandboxExecutor } from "../../../debug/dev-runtime.ts";
import type {
	SandboxExecutorInput,
	SandboxReadCapability,
} from "../src/sandbox/index.ts";

const input = {
	runId: "run-test",
	programId: "program-test",
	python: "def main(read):\n    return read('q1')\n",
	permittedQueryIds: ["q1"],
	maxOutputRows: 10,
	maxOutputChars: 1000,
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
} satisfies SandboxExecutorInput;

const dataAccess: SandboxReadCapability = {
	async read() {
		throw new Error("read must not be reached by the disabled dev runtime");
	},
};

describe("DevPythonSandboxExecutor", () => {
	it("fails closed instead of fabricating a production sandbox attestation", async () => {
		const executor = new DevPythonSandboxExecutor();
		await expect(executor.execute(input, dataAccess, new AbortController().signal)).rejects.toThrow(
			"does not satisfy the production sandbox isolation and attestation contract",
		);
	});
});
