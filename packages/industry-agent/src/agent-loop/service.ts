import { randomUUID } from "node:crypto";
import type { JsonObject, ToolDefinition, ToolInvocation, ToolResult } from "../contracts/index.ts";
import { IndustryAgentError } from "../errors/industry-agent-error.ts";
import type {
	AgentLoopBudgetView,
	AgentLoopGoal,
	AgentLoopHistoryEntry,
	AgentLoopResult,
	AgentLoopSafetyContract,
	AgentLoopServiceOptions,
	AgentLoopTermination,
	AgentLoopToolAction,
	AgentLoopUsage,
	AgentPlannerDecision,
	AgentVerificationDecision,
} from "./types.ts";
import { addAgentLoopUsage, ZERO_AGENT_LOOP_USAGE } from "./usage.ts";
import {
	validateAgentLoopLimits,
	validateAgentLoopToolExecution,
	validatePlannerDecision,
	validateVerificationDecision,
} from "./validation.ts";

const SAFETY_CONTRACT: AgentLoopSafetyContract = {
	scopeSource: "SERVER_REQUEST_CONTEXT",
	toolOutputs: "UNTRUSTED_DATA",
	confirmationRequiredTools: "BLOCK_IN_LOOP",
	criticalTools: "BLOCK_IN_LOOP",
	scopeArgs: "STRIP_AND_REJECT_MISMATCH",
};

class OperationTimeoutError extends Error {
	constructor() {
		super("Agent loop operation timed out");
		this.name = "OperationTimeoutError";
	}
}

function nonEmpty(value: string, label: string): string {
	const clean = value.trim();
	if (!clean) throw new IndustryAgentError("INVALID_REQUEST", `${label} must not be empty`);
	return clean;
}

function safeNumber(value: number): number {
	return Math.max(0, value);
}

async function withDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			reject(new OperationTimeoutError());
		}, timeoutMs);
	});
	try {
		return await Promise.race([operation(controller.signal), timeout]);
	} finally {
		if (timer !== undefined) clearTimeout(timer);
	}
}

function toolSummary(definition: ToolDefinition): JsonObject {
	return {
		name: definition.name,
		version: definition.version,
		action: definition.action,
		riskLevel: definition.riskLevel,
		requiresConfirmation: definition.requiresConfirmation,
	};
}

export class AgentLoopService {
	private readonly options: AgentLoopServiceOptions;
	private readonly limits;
	private readonly idFactory: () => string;
	private readonly nowMs: () => number;
	constructor(options: AgentLoopServiceOptions) {
		this.options = options;
		this.limits = validateAgentLoopLimits(options.limits);
		this.idFactory = options.idFactory ?? (() => randomUUID());
		this.nowMs = options.nowMs ?? (() => Date.now());
		if (!options.planner.version.trim() || !options.verifier.version.trim())
			throw new IndustryAgentError("INVALID_REQUEST", "Planner and verifier versions must not be empty");
	}

	async run(input: AgentLoopGoal): Promise<AgentLoopResult> {
		const goal = nonEmpty(input.goal, "goal");
		const startedAt = this.nowMs();
		const history: AgentLoopHistoryEntry[] = [];
		let usage: AgentLoopUsage = { ...ZERO_AGENT_LOOP_USAGE };
		let usageAccountingComplete = true;
		let toolCalls = 0;
		let stepsUsed = 0;
		this.trace(input, "LOOP_START", undefined, {
			plannerVersion: this.options.planner.version,
			verifierVersion: this.options.verifier.version,
		});

		const terminate = (
			status: AgentLoopTermination,
			extra: Partial<Pick<AgentLoopResult, "answer" | "question" | "reason" | "pendingAction">> = {},
		): AgentLoopResult => {
			const durationMs = safeNumber(this.nowMs() - startedAt);
			this.trace(input, "TERMINATE", stepsUsed || undefined, {
				status,
				steps: stepsUsed,
				toolCalls,
				totalTokens: usage.totalTokens,
				costUsd: usage.costUsd,
				durationMs,
				usageAccountingComplete,
			});
			return {
				status,
				...extra,
				history: [...history],
				usage,
				usageAccountingComplete,
				steps: stepsUsed,
				toolCalls,
				durationMs,
			};
		};

		for (let step = 1; step <= this.limits.maxSteps; step += 1) {
			stepsUsed = step;
			const prePlanStop = this.preModelCallStatus(startedAt, usage);
			if (prePlanStop) return terminate(prePlanStop);
			this.trace(input, "PLAN_START", step);
			let plan: AgentPlannerDecision;
			try {
				const rawPlan = await withDeadline(
					(signal) =>
						this.options.planner.plan(
							{
								goal,
								context: input.context,
								...(input.metadata ? { metadata: input.metadata } : {}),
								history: [...history],
								availableTools: this.options.tools.list(),
								budget: this.budget(startedAt, usage, toolCalls, step),
								safety: SAFETY_CONTRACT,
							},
							signal,
						),
					this.operationTimeout(startedAt),
				);
				plan = validatePlannerDecision(rawPlan);
				usage = addAgentLoopUsage(usage, plan.usage);
			} catch (error) {
				usageAccountingComplete = false;
				if (error instanceof OperationTimeoutError)
					return terminate("TIMEOUT", { reason: "Planner operation timed out" });
				return terminate("FAILED", { reason: error instanceof Error ? error.message : String(error) });
			}
			this.trace(input, "PLAN_END", step, {
				decision: plan.kind,
				totalTokens: usage.totalTokens,
				costUsd: usage.costUsd,
			});
			const postPlanStop = this.limitStatus(startedAt, usage, toolCalls);
			if (postPlanStop) return terminate(postPlanStop);

			if (plan.kind === "FINISH") {
				const answer = nonEmpty(plan.answer, "planner answer");
				history.push({ step, plannerDecision: plan.kind });
				return terminate("SUCCEEDED", { answer });
			}
			if (plan.kind === "ASK_USER") {
				const question = nonEmpty(plan.question, "planner question");
				history.push({ step, plannerDecision: plan.kind });
				return terminate("USER_INPUT_REQUIRED", { question });
			}
			if (plan.kind === "FAIL") {
				const reason = nonEmpty(plan.reason, "planner failure reason");
				history.push({ step, plannerDecision: plan.kind });
				return terminate("FAILED", { reason });
			}

			const plannedAction = plan.action;
			const definition = this.options.tools.get(plannedAction.toolName, plannedAction.toolVersion);
			if (!definition) {
				history.push({ step, plannerDecision: "TOOL", action: plannedAction });
				return terminate("FAILED", {
					reason: `Tool not found: ${plannedAction.toolName}@${plannedAction.toolVersion}`,
				});
			}
			let action: AgentLoopToolAction;
			try {
				action = this.scopeSafeAction(plannedAction, definition, input.context);
			} catch (error) {
				history.push({ step, plannerDecision: "TOOL", action: plannedAction });
				return terminate("FAILED", { reason: error instanceof Error ? error.message : String(error) });
			}
			const mutatingAction =
				definition.action === "CREATE" || definition.action === "UPDATE" || definition.action === "DELETE";
			if (
				definition.requiresConfirmation ||
				definition.riskLevel === "CRITICAL" ||
				(mutatingAction && !definition.supportsDryRun)
			) {
				history.push({ step, plannerDecision: "TOOL", action });
				this.trace(input, "ACT_END", step, {
					blocked: true,
					reason: "confirmation_required",
					tool: toolSummary(definition),
				});
				return terminate("CONFIRMATION_REQUIRED", {
					reason: "Tool requires trusted user confirmation outside the autonomous loop",
					pendingAction: action,
				});
			}
			if (toolCalls >= this.limits.maxToolCalls) {
				history.push({ step, plannerDecision: "TOOL", action });
				return terminate("MAX_TOOL_CALLS");
			}

			const toolCallId = this.idFactory();
			const invocation: ToolInvocation = {
				toolCallId,
				toolName: definition.name,
				toolVersion: definition.version,
				args: action.args,
				context: input.context,
			};
			toolCalls += 1;
			this.trace(input, "ACT_START", step, { toolCallId, tool: toolSummary(definition) });
			let toolResult: ToolResult;
			try {
				const rawExecuted = await withDeadline(
					(signal) =>
						this.options.executor.execute(invocation, this.budget(startedAt, usage, toolCalls, step), signal),
					Math.min(definition.timeoutMs, this.operationTimeout(startedAt)),
				);
				const executed = validateAgentLoopToolExecution(rawExecuted, toolCallId);
				usage = addAgentLoopUsage(usage, executed.usage);
				usageAccountingComplete = usageAccountingComplete && executed.usageAccountingComplete;
				toolResult = executed.result;
			} catch (error) {
				usageAccountingComplete = false;
				if (error instanceof OperationTimeoutError)
					return terminate("TIMEOUT", { reason: `Tool timed out: ${definition.name}` });
				toolResult = {
					toolCallId,
					ok: false,
					error: {
						code: "AGENT_LOOP_TOOL_ERROR",
						message: error instanceof Error ? error.message : String(error),
					},
				};
			}
			this.trace(input, "ACT_END", step, {
				toolCallId,
				ok: toolResult.ok,
				...(toolResult.error ? { errorCode: toolResult.error.code } : {}),
				totalTokens: usage.totalTokens,
				costUsd: usage.costUsd,
				usageAccountingComplete,
			});
			const boundedToolResult = this.historyToolResult(toolResult);
			if (!usageAccountingComplete) {
				history.push({ step, plannerDecision: "TOOL", action, toolCallId, toolResult: boundedToolResult });
				return terminate("USAGE_ACCOUNTING_INCOMPLETE", {
					reason: "Tool execution did not provide complete token/cost accounting",
				});
			}
			const postToolStop = this.limitStatus(startedAt, usage, toolCalls);
			if (postToolStop) {
				history.push({ step, plannerDecision: "TOOL", action, toolCallId, toolResult: boundedToolResult });
				return terminate(postToolStop);
			}

			const preVerifyStop = this.preModelCallStatus(startedAt, usage);
			if (preVerifyStop) {
				history.push({ step, plannerDecision: "TOOL", action, toolCallId, toolResult: boundedToolResult });
				return terminate(preVerifyStop);
			}
			this.trace(input, "VERIFY_START", step, { toolCallId, ok: toolResult.ok });
			let verification: AgentVerificationDecision;
			try {
				const rawVerification = await withDeadline(
					(signal) =>
						this.options.verifier.verify(
							{
								goal,
								context: input.context,
								...(input.metadata ? { metadata: input.metadata } : {}),
								step,
								action,
								toolResult: boundedToolResult,
								history: [...history],
								budget: this.budget(startedAt, usage, toolCalls, step),
								safety: SAFETY_CONTRACT,
							},
							signal,
						),
					this.operationTimeout(startedAt),
				);
				verification = validateVerificationDecision(rawVerification);
				usage = addAgentLoopUsage(usage, verification.usage);
			} catch (error) {
				usageAccountingComplete = false;
				history.push({ step, plannerDecision: "TOOL", action, toolCallId, toolResult: boundedToolResult });
				if (error instanceof OperationTimeoutError)
					return terminate("TIMEOUT", { reason: "Verifier operation timed out" });
				return terminate("FAILED", { reason: error instanceof Error ? error.message : String(error) });
			}
			this.trace(input, "VERIFY_END", step, {
				decision: verification.kind,
				totalTokens: usage.totalTokens,
				costUsd: usage.costUsd,
			});
			const postVerifyStop = this.limitStatus(startedAt, usage, toolCalls);
			const entry: AgentLoopHistoryEntry = {
				step,
				plannerDecision: "TOOL",
				action,
				toolCallId,
				toolResult: boundedToolResult,
				verification: verification.kind,
				...(verification.kind === "REPLAN"
					? { feedback: verification.feedback.slice(0, this.limits.maxHistoryItemChars) }
					: {}),
			};
			history.push(entry);
			if (postVerifyStop) return terminate(postVerifyStop);
			if (verification.kind === "SATISFIED")
				return terminate("SUCCEEDED", { answer: nonEmpty(verification.answer, "verification answer") });
			if (verification.kind === "ASK_USER")
				return terminate("USER_INPUT_REQUIRED", {
					question: nonEmpty(verification.question, "verification question"),
				});
			if (verification.kind === "FAIL")
				return terminate("FAILED", { reason: nonEmpty(verification.reason, "verification failure reason") });
			this.trace(input, "REPLAN", step, {
				feedback: verification.feedback.slice(0, Math.min(500, this.limits.maxHistoryItemChars)),
			});
		}
		return terminate("MAX_STEPS");
	}

	private scopeSafeAction(
		action: AgentLoopToolAction,
		definition: ToolDefinition,
		context: AgentLoopGoal["context"],
	): AgentLoopToolAction {
		if (!definition.dataScopeRule?.includes("SERVER_REQUEST_CONTEXT")) return action;
		const expected: Readonly<Record<string, string | undefined>> = {
			userId: context.userId,
			user_id: context.userId,
			tenantId: context.tenantId,
			tenant_id: context.tenantId,
			companyId: context.companyId,
			company_id: context.companyId,
			projectId: context.projectId,
			project_id: context.projectId,
		};
		const args: Record<string, unknown> = { ...action.args };
		for (const [key, expectedValue] of Object.entries(expected)) {
			if (!(key in args)) continue;
			const supplied = args[key];
			if (supplied !== expectedValue)
				throw new IndustryAgentError(
					"AGENT_EXECUTION_ERROR",
					`Planner attempted to override server scope field ${key}`,
				);
			delete args[key];
		}
		return { ...action, args };
	}

	private historyToolResult(result: ToolResult): ToolResult {
		const error = result.error
			? { code: result.error.code, message: result.error.message.slice(0, this.limits.maxHistoryItemChars) }
			: undefined;
		if (result.data === undefined)
			return { toolCallId: result.toolCallId, ok: result.ok, ...(error ? { error } : {}) };
		let serialized: string | undefined;
		try {
			serialized = JSON.stringify(result.data);
		} catch {
			return {
				toolCallId: result.toolCallId,
				ok: result.ok,
				data: { truncated: true, reason: "non_json_serializable" },
				...(error ? { error } : {}),
			};
		}
		if (serialized === undefined)
			return {
				toolCallId: result.toolCallId,
				ok: result.ok,
				data: { truncated: true, reason: "non_json_serializable" },
				...(error ? { error } : {}),
			};
		if (serialized.length > this.limits.maxHistoryItemChars) {
			return {
				toolCallId: result.toolCallId,
				ok: result.ok,
				data: { truncated: true, charCount: serialized.length },
				...(error ? { error } : {}),
			};
		}
		return {
			toolCallId: result.toolCallId,
			ok: result.ok,
			data: JSON.parse(serialized) as unknown,
			...(error ? { error } : {}),
		};
	}

	private budget(startedAt: number, usage: AgentLoopUsage, toolCalls: number, step: number): AgentLoopBudgetView {
		return {
			remainingSteps: safeNumber(this.limits.maxSteps - step + 1),
			remainingToolCalls: safeNumber(this.limits.maxToolCalls - toolCalls),
			remainingTokens: safeNumber(this.limits.maxTotalTokens - usage.totalTokens),
			remainingCostUsd: safeNumber(this.limits.maxCostUsd - usage.costUsd),
			remainingDurationMs: safeNumber(this.limits.maxDurationMs - (this.nowMs() - startedAt)),
		};
	}

	private operationTimeout(startedAt: number): number {
		const remaining = this.limits.maxDurationMs - (this.nowMs() - startedAt);
		if (remaining <= 0) return 1;
		return Math.max(1, Math.min(this.limits.maxOperationMs, remaining));
	}

	private preModelCallStatus(startedAt: number, usage: AgentLoopUsage): AgentLoopTermination | undefined {
		if (this.nowMs() - startedAt >= this.limits.maxDurationMs) return "TIMEOUT";
		if (usage.totalTokens >= this.limits.maxTotalTokens) return "TOKEN_BUDGET_EXCEEDED";
		if (usage.costUsd >= this.limits.maxCostUsd) return "COST_BUDGET_EXCEEDED";
		return undefined;
	}

	private limitStatus(startedAt: number, usage: AgentLoopUsage, toolCalls: number): AgentLoopTermination | undefined {
		if (this.nowMs() - startedAt >= this.limits.maxDurationMs) return "TIMEOUT";
		if (usage.totalTokens > this.limits.maxTotalTokens) return "TOKEN_BUDGET_EXCEEDED";
		if (usage.costUsd > this.limits.maxCostUsd) return "COST_BUDGET_EXCEEDED";
		if (toolCalls > this.limits.maxToolCalls) return "MAX_TOOL_CALLS";
		return undefined;
	}

	private trace(
		input: AgentLoopGoal,
		event: Parameters<NonNullable<AgentLoopServiceOptions["trace"]>["record"]>[0]["event"],
		step?: number,
		details?: JsonObject,
	): void {
		this.options.trace?.record({
			traceId: input.context.traceId,
			requestId: input.context.requestId,
			event,
			...(step !== undefined ? { step } : {}),
			...(details ? { details } : {}),
		});
	}
}
