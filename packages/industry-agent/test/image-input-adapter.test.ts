import { describe, expect, it } from "vitest";
import type { ToolInvocation, ToolResult } from "../src/contracts/index.ts";
import { MutationToolImagePreparer } from "../src/multimodal/image-input/index.ts";
import { context, prepareResult, updateProposal } from "./image-input-helpers.ts";

describe("M9 mutation tool adapter", () => {
	it("calls prepare_update only", async () => {
		let invocation: ToolInvocation | undefined;
		const runtime = {
			execute: async (input: ToolInvocation): Promise<ToolResult> => {
				invocation = input;
				return { toolCallId: input.toolCallId, ok: true, data: prepareResult() };
			},
		};
		const adapter = new MutationToolImagePreparer(runtime, () => "tool-call-1");
		const result = await adapter.prepare({ context: context(), proposal: updateProposal });
		expect(invocation?.toolName).toBe("prepare_update");
		expect(invocation?.toolVersion).toBe("1.0.0");
		expect(result.proposal.status).toBe("PREPARED");
	});
});
