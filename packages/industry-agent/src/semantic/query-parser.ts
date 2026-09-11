import { resolveSemanticContext, type SemanticContext } from "../context/semantic-context.ts";
import type { EntityMention, RequestContext, SemanticConstraint, SemanticFrame } from "../contracts/index.ts";
import { extractBoqCode } from "../normalization/boq-code.ts";
import { extractChainage } from "../normalization/chainage.ts";
import { extractDate } from "../normalization/date.ts";
import { normalizeSide } from "../normalization/side.ts";
import { toConstraint, toMention } from "../normalization/types.ts";
import { normalizeUnit } from "../normalization/unit.ts";
import { canonicalizeSemanticFrame } from "./canonical.ts";

export type SemanticIntent = "QUERY_BOQ" | "QUERY_ENGINEERING_POSITION" | "UNKNOWN";

export interface SemanticParseInput {
	text: string;
	requestContext: Pick<RequestContext, "projectId" | "createdAt">;
	semanticContext?: SemanticContext;
}

export interface SemanticParser {
	parse(input: SemanticParseInput): SemanticFrame;
}

function detectIntent(text: string): SemanticIntent {
	if (/(?:清单|BOQ|工程量|单价|合价|金额)/i.test(text)) return "QUERY_BOQ";
	if (/(?:工程部位|部位|桩号|左幅|右幅|构造物|桥梁|隧道)/.test(text)) return "QUERY_ENGINEERING_POSITION";
	return "UNKNOWN";
}

function requestedFields(text: string): string[] {
	const fields: string[] = [];
	if (/(?:工程量|数量)/.test(text)) fields.push("quantity");
	if (/单价/.test(text)) fields.push("unit_price");
	if (/(?:合价|金额)/.test(text)) fields.push("amount");
	if (/单位/.test(text)) fields.push("unit");
	if (/(?:名称|叫什么)/.test(text)) fields.push("name");
	return fields;
}

export function createFallbackSemanticFrame(text: string): SemanticFrame {
	return canonicalizeSemanticFrame({
		originalText: text,
		intent: "UNKNOWN",
		mentions: [],
		constraints: [],
		filters: {},
		contextRefs: [],
		requestedFields: [],
	});
}

export class QueryParser implements SemanticParser {
	parse(input: SemanticParseInput): SemanticFrame {
		const text = input.text;
		const constraints: SemanticConstraint[] = [];
		const mentions: EntityMention[] = [];
		const chainage = extractChainage(text);
		if (chainage.range) {
			constraints.push(toConstraint("chainage_range_m", chainage.range));
			mentions.push(toMention("CHAINAGE_RANGE", chainage.range));
		} else if (chainage.single) {
			constraints.push(toConstraint("chainage_m", chainage.single));
			mentions.push(toMention("CHAINAGE", chainage.single));
		}

		const side = normalizeSide(text);
		if (side) {
			constraints.push(toConstraint("side", side));
			mentions.push(toMention("SIDE", side));
		}

		const unit = normalizeUnit(text);
		if (unit) {
			constraints.push(toConstraint("unit", unit));
			mentions.push(toMention("UNIT", unit));
		}

		const boqCode = extractBoqCode(text);
		if (boqCode) {
			constraints.push(toConstraint("boq_code", boqCode));
			mentions.push(toMention("BOQ_CODE", boqCode));
		}

		const referenceDate = new Date(input.requestContext.createdAt);
		if (Number.isFinite(referenceDate.getTime())) {
			const date = extractDate(text, referenceDate);
			if (date.range) {
				constraints.push(toConstraint("date_range", date.range));
				mentions.push(toMention("DATE_RANGE", date.range));
			} else if (date.single) {
				constraints.push(toConstraint("date", date.single));
				mentions.push(toMention("DATE", date.single));
			}
		}

		const context = resolveSemanticContext(text, input.requestContext, input.semanticContext);
		constraints.push(...context.constraints);
		mentions.push(...context.mentions);

		return canonicalizeSemanticFrame({
			originalText: text,
			intent: detectIntent(text),
			mentions,
			constraints,
			filters: {},
			contextRefs: context.contextRefs,
			requestedFields: requestedFields(text),
		});
	}
}
