import type { ToolDefinition } from "../contracts/index.ts";
import type { MutationPrepareResult } from "../mutation/types.ts";
import type { ReportGenerationResult } from "../report/types.ts";
import type {
	SandboxBrokerResult,
	SandboxDataAccessBroker,
	SandboxExecutor,
	SandboxExecutorInput,
	SandboxExecutorResult,
	SandboxGoal,
	SandboxMutationPreparer,
	SandboxMutationRecommendation,
	SandboxPermission,
	SandboxPermissionService,
	SandboxPlanner,
	SandboxReadCapability,
	SandboxReportBuilder,
	SandboxReportBuilderInput,
	SandboxRouteDecision,
	SandboxRunResult,
	SandboxSchemaDiscovery,
	SandboxSchemaSnapshot,
	SandboxToolCatalog,
	SandboxTraceEvent,
	SandboxTraceSink,
	SandboxVerificationDecision,
	SandboxVerifier,
} from "./types.ts";

function key(name: string, version: string): string {
	return `${name}@${version}`;
}

export class InMemorySandboxPermissionService implements SandboxPermissionService {
	readonly checks: SandboxPermission[] = [];
	private readonly allowed: ReadonlySet<SandboxPermission>;
	constructor(
		allowed: readonly SandboxPermission[] = ["sandbox.analyze", "sandbox.schema.read", "sandbox.data.read"],
	) {
		this.allowed = new Set(allowed);
	}
	async authorize(input: { permission: SandboxPermission }): Promise<boolean> {
		this.checks.push(input.permission);
		return this.allowed.has(input.permission);
	}
}

export class InMemorySandboxToolCatalog implements SandboxToolCatalog {
	private readonly definitions = new Map<string, ToolDefinition>();
	constructor(definitions: readonly ToolDefinition[]) {
		for (const definition of definitions)
			this.definitions.set(key(definition.name, definition.version), structuredClone(definition));
	}
	list(): readonly ToolDefinition[] {
		return [...this.definitions.values()].map((item) => structuredClone(item));
	}
	get(name: string, version: string): ToolDefinition | undefined {
		const found = this.definitions.get(key(name, version));
		return found ? structuredClone(found) : undefined;
	}
}

export class StaticSandboxSchemaDiscovery implements SandboxSchemaDiscovery {
	readonly calls: string[] = [];
	private readonly snapshot: SandboxSchemaSnapshot;
	constructor(snapshot: SandboxSchemaSnapshot) {
		this.snapshot = snapshot;
	}
	async discover(input: Parameters<SandboxSchemaDiscovery["discover"]>[0]): Promise<SandboxSchemaSnapshot> {
		this.calls.push(input.goal);
		return structuredClone(this.snapshot);
	}
}

export class ScriptedSandboxPlanner implements SandboxPlanner {
	readonly version: string;
	readonly routeInputs: Parameters<SandboxPlanner["route"]>[0][] = [];
	readonly generateInputs: Parameters<SandboxPlanner["generate"]>[0][] = [];
	private readonly routeDecision: SandboxRouteDecision;
	private readonly generated: Awaited<ReturnType<SandboxPlanner["generate"]>>;
	constructor(
		version: string,
		routeDecision: SandboxRouteDecision,
		generated: Awaited<ReturnType<SandboxPlanner["generate"]>>,
	) {
		this.version = version;
		this.routeDecision = routeDecision;
		this.generated = generated;
	}
	async route(input: Parameters<SandboxPlanner["route"]>[0]): Promise<SandboxRouteDecision> {
		this.routeInputs.push(structuredClone(input));
		return structuredClone(this.routeDecision);
	}
	async generate(
		input: Parameters<SandboxPlanner["generate"]>[0],
	): Promise<Awaited<ReturnType<SandboxPlanner["generate"]>>> {
		this.generateInputs.push(structuredClone(input));
		return structuredClone(this.generated);
	}
}

export class StaticReadOnlyBroker implements SandboxDataAccessBroker {
	readonly calls: string[] = [];
	private readonly results: ReadonlyMap<string, SandboxBrokerResult>;
	constructor(results: readonly SandboxBrokerResult[]) {
		this.results = new Map(results.map((result) => [result.queryId, structuredClone(result)] as const));
	}
	async executeReadOnly(
		input: Parameters<SandboxDataAccessBroker["executeReadOnly"]>[0],
	): Promise<SandboxBrokerResult> {
		this.calls.push(input.query.queryId);
		const result = this.results.get(input.query.queryId);
		if (!result) throw new Error(`No broker result for ${input.query.queryId}`);
		return structuredClone(result);
	}
}

export class ScriptedSandboxExecutor implements SandboxExecutor {
	readonly inputs: SandboxExecutorInput[] = [];
	private readonly handler: (
		input: SandboxExecutorInput,
		dataAccess: SandboxReadCapability,
		signal: AbortSignal,
	) => Promise<SandboxExecutorResult> | SandboxExecutorResult;
	constructor(
		handler: (
			input: SandboxExecutorInput,
			dataAccess: SandboxReadCapability,
			signal: AbortSignal,
		) => Promise<SandboxExecutorResult> | SandboxExecutorResult,
	) {
		this.handler = handler;
	}
	async execute(
		input: SandboxExecutorInput,
		dataAccess: SandboxReadCapability,
		signal: AbortSignal,
	): Promise<SandboxExecutorResult> {
		this.inputs.push(structuredClone(input));
		return this.handler(input, dataAccess, signal);
	}
}

export class ScriptedSandboxVerifier implements SandboxVerifier {
	readonly version: string;
	readonly inputs: Parameters<SandboxVerifier["verify"]>[0][] = [];
	private readonly decision: SandboxVerificationDecision;
	constructor(version: string, decision: SandboxVerificationDecision) {
		this.version = version;
		this.decision = decision;
	}
	async verify(input: Parameters<SandboxVerifier["verify"]>[0]): Promise<SandboxVerificationDecision> {
		this.inputs.push(structuredClone(input));
		return structuredClone(this.decision);
	}
}

export class RecordingSandboxMutationPreparer implements SandboxMutationPreparer {
	readonly recommendations: SandboxMutationRecommendation[] = [];
	private readonly result: MutationPrepareResult;
	constructor(result: MutationPrepareResult) {
		this.result = result;
	}
	async prepare(input: Parameters<SandboxMutationPreparer["prepare"]>[0]): Promise<MutationPrepareResult> {
		this.recommendations.push(structuredClone(input.recommendation));
		return structuredClone(this.result);
	}
}

export class RecordingSandboxReportBuilder implements SandboxReportBuilder {
	readonly inputs: SandboxReportBuilderInput[] = [];
	private readonly result: ReportGenerationResult;
	constructor(result: ReportGenerationResult) {
		this.result = result;
	}
	async build(input: SandboxReportBuilderInput): Promise<ReportGenerationResult> {
		this.inputs.push(structuredClone(input));
		return structuredClone(this.result);
	}
}

export class InMemorySandboxTraceSink implements SandboxTraceSink {
	readonly events: SandboxTraceEvent[] = [];
	record(event: SandboxTraceEvent): void {
		this.events.push(structuredClone(event));
	}
}

export function sandboxGoal(input: SandboxGoal): SandboxGoal {
	return structuredClone(input);
}
export function sandboxResult(input: SandboxRunResult): SandboxRunResult {
	return structuredClone(input);
}
