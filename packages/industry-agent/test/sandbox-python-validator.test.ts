import { describe, expect, it } from "vitest";
import { validateSandboxPython } from "../src/sandbox/python-validator.ts";
import { sandboxLimits, sandboxProgram } from "./sandbox-helpers.ts";

describe("M12 Python static validation", () => {
	it("accepts main(read) with constant prevalidated query id", () => {
		expect(validateSandboxPython(sandboxProgram(), sandboxLimits()).readQueryIds).toEqual(["q1"]);
	});

	it.each([
		"def main(read):\n    import os\n    return read(\"q1\")",
		"def main(read):\n    f = open(\"/tmp/x\")\n    return read(\"q1\")",
		"def main(read):\n    q = \"q1\"\n    return read(q)",
		"def main(read):\n    return eval(\"1+1\")",
	])("rejects unsafe Python", (python) => {
		expect(() => validateSandboxPython({ ...sandboxProgram(), python }, sandboxLimits())).toThrow();
	});
});
