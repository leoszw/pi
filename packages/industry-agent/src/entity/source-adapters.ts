import type { JsonObject } from "../contracts/index.ts";
import type { CanonicalEntity, EntityScope, EntitySourceVersions } from "./types.ts";

export interface EngineeringPositionSourceRow {
	engineeringId: string;
	engineeringCode?: string;
	proId: string;
	unitEngineeringId?: string;
	unitEngineeringName?: string;
	parentEngineeringId?: string;
	engineeringName: string;
	engineeringFullName?: string;
	engineeringCategoryName?: string;
	engineeringTypeName?: string;
	alignmentCode?: string;
	chainageStartM?: number;
	chainageEndM?: number;
	crossAlignment?: boolean;
	isMinUnit: boolean;
	isDeleted: boolean;
	updateTime?: string;
}

export interface BoqSourceRow {
	ledgerId: string;
	proId: string;
	sectionId?: string;
	sectionName?: string;
	ledgerCodeRaw: string;
	ledgerCodeNorm: string;
	ledgerNameRaw: string;
	ledgerNameNorm: string;
	unitRaw?: string;
	unitNorm?: string;
	isDeleted: boolean;
	updateTime?: string;
}

function timestamp(versions: EntitySourceVersions): string {
	return (versions.now ?? (() => new Date()))().toISOString();
}

function scopeForProject(baseScope: Omit<EntityScope, "projectId">, projectId: string): EntityScope {
	return { ...baseScope, projectId };
}

function compactAttributes(entries: readonly [string, unknown][]): JsonObject {
	return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}

export function engineeringPositionToEntity(
	row: EngineeringPositionSourceRow,
	baseScope: Omit<EntityScope, "projectId">,
	versions: EntitySourceVersions,
): CanonicalEntity {
	const now = timestamp(versions);
	return {
		entityId: row.engineeringId,
		entityType: "ENGINEERING_POSITION",
		canonicalName: row.engineeringName,
		entityCode: row.engineeringCode,
		parentEntityId: row.parentEngineeringId && row.parentEngineeringId !== "0" ? row.parentEngineeringId : undefined,
		scope: scopeForProject(baseScope, row.proId),
		sourceSystem: versions.sourceSystem,
		sourceRecordId: row.engineeringId,
		sourceVersion: versions.sourceVersion,
		indexVersion: versions.indexVersion,
		status: row.isDeleted ? "DELETED" : "ACTIVE",
		attributes: compactAttributes([
			["engineeringFullName", row.engineeringFullName],
			["unitEngineeringId", row.unitEngineeringId],
			["unitEngineeringName", row.unitEngineeringName],
			["engineeringCategoryName", row.engineeringCategoryName],
			["engineeringTypeName", row.engineeringTypeName],
			["alignmentCode", row.alignmentCode],
			["chainageStartM", row.chainageStartM],
			["chainageEndM", row.chainageEndM],
			["crossAlignment", row.crossAlignment],
			["isMinUnit", row.isMinUnit],
		]),
		sourceUpdatedAt: row.updateTime,
		createdAt: now,
		updatedAt: now,
	};
}

export function boqSourceToEntity(
	row: BoqSourceRow,
	baseScope: Omit<EntityScope, "projectId">,
	versions: EntitySourceVersions,
): CanonicalEntity {
	const now = timestamp(versions);
	return {
		entityId: row.ledgerId,
		entityType: "BOQ_ITEM",
		canonicalName: row.ledgerNameNorm,
		entityCode: row.ledgerCodeNorm,
		scope: scopeForProject(baseScope, row.proId),
		sourceSystem: versions.sourceSystem,
		sourceRecordId: row.ledgerId,
		sourceVersion: versions.sourceVersion,
		indexVersion: versions.indexVersion,
		status: row.isDeleted ? "DELETED" : "ACTIVE",
		attributes: compactAttributes([
			["sectionId", row.sectionId],
			["sectionName", row.sectionName],
			["ledgerCodeRaw", row.ledgerCodeRaw],
			["ledgerNameRaw", row.ledgerNameRaw],
			["unitRaw", row.unitRaw],
			["unitNorm", row.unitNorm],
		]),
		sourceUpdatedAt: row.updateTime,
		createdAt: now,
		updatedAt: now,
	};
}
