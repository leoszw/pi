import { IndustryAgentError } from "../../errors/industry-agent-error.ts";
import type { ValidatedReadArgs } from "./validation.ts";
import type { ReadToolHandlerContext } from "./types.ts";

function notFound(entity: string, id: string): never {
	throw new IndustryAgentError("REPOSITORY_ERROR", `${entity} not found in current scope`, { details: { id } });
}

export async function executeReadHandler(context: ReadToolHandlerContext, args: ValidatedReadArgs): Promise<unknown> {
	const { options, scope } = context;
	switch (args.kind) {
		case "search_engineering_positions":
			return options.engineeringSearch.search({ query: args.query, projectId: scope.projectId, ...(args.topK === undefined ? {} : { topK: args.topK }), ...(args.leafOnly === undefined ? {} : { leafOnly: args.leafOnly }), ...(args.debug === undefined ? {} : { debug: args.debug }) });
		case "get_engineering_position": {
			const value = await options.dataRepository.getEngineeringPosition(args.engineeringId, scope);
			return value ?? notFound("engineering position", args.engineeringId);
		}
		case "search_boq": {
			const catalog = await options.boqCatalog.getCatalog(scope);
			return options.boqSearch.search({ query: args.query, projectId: scope.projectId, catalog, ...(args.topK === undefined ? {} : { topK: args.topK }), ...(args.leafOnly === undefined ? {} : { leafOnly: args.leafOnly }), ...(args.debug === undefined ? {} : { debug: args.debug }) });
		}
		case "get_boq_item": {
			const value = await options.dataRepository.getBoqItem(args.ledgerId, scope);
			return value ?? notFound("BOQ item", args.ledgerId);
		}
		case "query_quantity": {
			const defaultFields = args.entityType === "ENGINEERING_POSITION" ? ["design_quantity", "use_quantity"] as const : ["contract_num", "change_after_num"] as const;
			const value = await options.dataRepository.queryQuantity(args.entityType, args.entityId, args.fields.length ? args.fields : defaultFields, scope);
			return value ?? notFound("quantity record", args.entityId);
		}
		case "list_project_documents": {
			const documents = await options.dataRepository.listProjectDocuments(scope, { ...(args.query ? { query: args.query } : {}), ...(args.documentType ? { documentType: args.documentType } : {}), limit: args.limit });
			return { documents };
		}
	}
}
