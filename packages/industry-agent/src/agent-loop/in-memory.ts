import type { ToolDefinition, ToolInvocation } from "../contracts/index.ts";
import type {
	AgentLoopBudgetView,
	AgentLoopPlanner,
	AgentLoopToolCatalog,
	AgentLoopToolExecutionResult,
	AgentLoopToolExecutor,
	AgentLoopTraceEvent,
	AgentLoopTraceSink,
	AgentLoopVerifier,
	AgentPlannerDecision,
	AgentPlannerInput,
	AgentVerificationDecision,
	AgentVerifierInput,
} from "./types.ts";

function key(name: string, version: string): string { return `${name}@${version}`; }

export class InMemoryAgentLoopToolCatalog implements AgentLoopToolCatalog {
	private readonly definitions = new Map<string, ToolDefinition>();
	constructor(definitions: readonly ToolDefinition[]) {
		for (const definition of definitions) this.definitions.set(key(definition.name, definition.version), structuredClone(definition));
	}
	list(): readonly ToolDefinition[] { return [...this.definitions.values()].map((item) => structuredClone(item)); }
	get(name: string, version: string): ToolDefinition | undefined {
		const found = this.definitions.get(key(name, version));
		return found ? structuredClone(found) : undefined;
	}
}

export class ScriptedAgentLoopPlanner implements AgentLoopPlanner {
	readonly version: string;
	readonly inputs: AgentPlannerInput[] = [];
	private readonly decisions: AgentPlannerDecision[];
	constructor(version: string, decisions: readonly AgentPlannerDecision[]) { this.version = version; this.decisions = [...decisions]; }
	async plan(input: AgentPlannerInput, _signal: AbortSignal): Promise<AgentPlannerDecision> {
		this.inputs.push(structuredClone(input));
		const decision = this.decisions.shift();
		if (!decision) throw new Error("No scripted planner decision remains");
		return structuredClone(decision);
	}
}

export class ScriptedAgentLoopVerifier implements AgentLoopVerifier {
	readonly version: string;
	readonly inputs: AgentVerifierInput[] = [];
	private readonly decisions: AgentVerificationDecision[];
	constructor(version: string, decisions: readonly AgentVerificationDecision[]) { this.version = version; this.decisions = [...decisions]; }
	async verify(input: AgentVerifierInput, _signal: AbortSignal): Promise<AgentVerificationDecision> {
		this.inputs.push(structuredClone(input));
		const decision = this.decisions.shift();
		if (!decision) throw new Error("No scripted verifier decision remains");
		return structuredClone(decision);
	}
}

export class RecordingAgentLoopToolExecutor implements AgentLoopToolExecutor {
	readonly invocations: ToolInvocation[] = [];
	readonly budgets: AgentLoopBudgetView[] = [];
	private readonly handler: (invocation: ToolInvocation, budget: AgentLoopBudgetView, signal: AbortSignal) => Promise<AgentLoopToolExecutionResult> | AgentLoopToolExecutionResult;
	constructor(handler: (invocation: ToolInvocation, budget: AgentLoopBudgetView, signal: AbortSignal) => Promise<AgentLoopToolExecutionResult> | AgentLoopToolExecutionResult) { this.handler = handler; }
	async execute(invocation: ToolInvocation, budget: AgentLoopBudgetView, signal: AbortSignal): Promise<AgentLoopToolExecutionResult> {
		this.invocations.push(structuredClone(invocation));
		this.budgets.push(structuredClone(budget));
		return this.handler(invocation, budget, signal);
	}
}

export class InMemoryAgentLoopTraceSink implements AgentLoopTraceSink {
	readonly events: AgentLoopTraceEvent[] = [];
	record(event: AgentLoopTraceEvent): void { this.events.push(structuredClone(event)); }
}
