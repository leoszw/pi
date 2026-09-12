import { describe, expect, it } from "vitest";
import { sandboxBudget, validateSandboxUsage, ZERO_SANDBOX_USAGE } from "../src/sandbox/usage.ts";
import { sandboxLimits } from "./sandbox-helpers.ts";

describe("M12 usage and budgets", () => {
	it("reports bounded remaining resources", () => {
		const limits = sandboxLimits();
		const budget = sandboxBudget(limits, { ...ZERO_SANDBOX_USAGE, totalTokens: 1000, costUsd: 0.5 }, 0, 1000);
		expect(budget.remainingTokens).toBe(limits.maxTotalTokens - 1000);
		expect(budget.remainingCostUsd).toBe(limits.maxCostUsd - 0.5);
	});

	it("rejects inconsistent token accounting", () => {
		expect(() => validateSandboxUsage({ inputTokens: 10, outputTokens: 10, cachedTokens: 0, reasoningTokens: 0, totalTokens: 5, costUsd: 0 })).toThrow();
	});
});
