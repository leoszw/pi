import { describe, expect, it } from "vitest";
import type { RequestContext } from "../src/contracts/index.ts";
import { context, service } from "./memory-helpers.ts";

function withoutProject(input: RequestContext): RequestContext {
	const { projectId: _projectId, ...rest } = input;
	return rest;
}

describe("working memory project isolation", () => {
	it("carries server active project when omitted, but blocks explicit project switches", async () => {
		const memory = service();
		const projectOne = context("project-1");
		await memory.captureResultSet(projectOne, [{ rowId: "r1", entityId: "e1" }], "TOOL_RESULT");
		const inherited = await memory.resolve(withoutProject(projectOne), "这些");
		expect(inherited.rowIds).toEqual(["r1"]);
		expect(inherited.activeProjectId).toBe("project-1");
		const switched = await memory.resolve(context("project-2"), "这些");
		expect(switched.rowIds).toEqual([]);
		expect(switched.requiresClarification).toBe(true);
		expect(switched.activeProjectId).toBe("project-2");
	});

	it("does not allow memory to override an explicit server project", async () => {
		const memory = service();
		await expect(memory.setActiveProject(context("project-1"), "project-2", "USER_EXPLICIT")).rejects.toMatchObject({
			code: "MEMORY_SCOPE_MISMATCH",
		});
	});
});
