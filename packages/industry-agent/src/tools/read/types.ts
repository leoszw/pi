import type { JsonObject, ToolDefinition, ToolInvocation, ToolResult } from "../../contracts/index.ts";
import type { BoqQueryCatalog, BoqSearchRequest, BoqSearchResponse } from "../../retrieval/boq/types.ts";
import type { EngineeringSearchRequest, EngineeringSearchResponse } from "../../retrieval/engineering/types.ts";

export interface ReadToolScope {
	tenantId: string;
	companyId: string;
	projectId: string;
	userId: string;
}

export interface ReadToolPermissionInput extends ReadToolScope {
	permission: string;
	toolName: string;
}

export interface ReadToolPermissionService {
	authorize(input: ReadToolPermissionInput): Promise<boolean>;
}

export interface ReadToolTraceSink {
	recordToolStart(toolCallId: string, toolName: string, input: unknown): void;
	recordToolEnd(toolCallId: string, toolName: string, output: unknown, isError: boolean): void;
}

export interface EngineeringSearchPort {
	search(request: EngineeringSearchRequest): Promise<EngineeringSearchResponse>;
}

export interface BoqSearchPort {
	search(request: BoqSearchRequest): Promise<BoqSearchResponse>;
}

export interface BoqCatalogProvider {
	getCatalog(scope: ReadToolScope): Promise<BoqQueryCatalog>;
}

export interface SourceEvidence {
	sourceId: string;
	sourceVersion: string;
	updatedAt?: string;
	unit?: string;
}

export interface EngineeringPositionReadRecord {
	engineeringId: string;
	projectId: string;
	engineeringName: string;
	engineeringCode?: string;
	unitEngineeringId?: string;
	unitEngineeringName?: string;
	parentEngineeringId?: string;
	engineeringFullName?: string;
	engineeringCategoryName?: string;
	engineeringTypeName?: string;
	alignmentCode?: string;
	chainageStartM?: number;
	chainageEndM?: number;
	isMinUnit: boolean;
	evidence: SourceEvidence;
}

export interface BoqItemReadRecord {
	ledgerId: string;
	projectId: string;
	sectionId?: string;
	sectionName?: string;
	ledgerCode: string;
	ledgerName: string;
	unit?: string;
	evidence: SourceEvidence;
}

export type QuantityEntityType = "ENGINEERING_POSITION" | "BOQ_ITEM";
export type QuantityField = "design_quantity" | "use_quantity" | "contract_num" | "change_after_num";

export interface QuantityReadRecord {
	entityType: QuantityEntityType;
	entityId: string;
	projectId: string;
	values: Readonly<Partial<Record<QuantityField, number | string | null>>>;
	evidence: SourceEvidence;
}

export interface ProjectDocumentRecord {
	documentId: string;
	projectId: string;
	name: string;
	documentType?: string;
	status?: string;
	version?: string;
	updatedAt?: string;
	metadata?: JsonObject;
}

export interface ReadDataRepository {
	getEngineeringPosition(
		engineeringId: string,
		scope: ReadToolScope,
	): Promise<EngineeringPositionReadRecord | undefined>;
	getBoqItem(ledgerId: string, scope: ReadToolScope): Promise<BoqItemReadRecord | undefined>;
	queryQuantity(
		entityType: QuantityEntityType,
		entityId: string,
		fields: readonly QuantityField[],
		scope: ReadToolScope,
	): Promise<QuantityReadRecord | undefined>;
	listProjectDocuments(
		scope: ReadToolScope,
		filter: { query?: string; documentType?: string; limit: number },
	): Promise<readonly ProjectDocumentRecord[]>;
}

export interface ReadToolRuntimeOptions {
	permissionService: ReadToolPermissionService;
	dataRepository: ReadDataRepository;
	engineeringSearch: EngineeringSearchPort;
	boqSearch: BoqSearchPort;
	boqCatalog: BoqCatalogProvider;
	trace?: ReadToolTraceSink;
}

export interface ReadToolHandlerContext {
	invocation: ToolInvocation;
	definition: ToolDefinition;
	scope: ReadToolScope;
	options: ReadToolRuntimeOptions;
}

export type ReadToolHandler = (context: ReadToolHandlerContext) => Promise<unknown>;

export interface ReadToolExecutor {
	execute(invocation: ToolInvocation): Promise<ToolResult>;
}
