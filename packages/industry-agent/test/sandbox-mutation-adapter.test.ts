import { describe, expect, it } from "vitest";
import type { ToolInvocation } from "../src/contracts/index.ts";
import { MutationToolSandboxPreparer } from "../src/sandbox/mutation-adapter.ts";
import { sandboxContext, sandboxMutationResult } from "./sandbox-helpers.ts";

describe("M12 mutation boundary", () => {
	it("maps an analysis recommendation only to prepare_update", async () => {
		let invocation: ToolInvocation | undefined;
		const expected = sandboxMutationResult();
		const preparer = new MutationToolSandboxPreparer({ execute: async (input) => { invocation = input; return { toolCallId: input.toolCallId, ok: true, data: expected }; } }, () => "tool-call-1");
		const result = await preparer.prepare({ context: sandboxContext(), recommendation: { operation: "UPDATE", entityType: "BOQ_ITEM", targetEntityIds: ["90071992547409931234"], values: { owner: "张三" }, evidenceQueryIds: ["q1"] } });
		expect(invocation?.toolName).toBe("prepare_update");
		expect(result.proposal.status).toBe("PREPARED");
	});
});
