import type { WorkingMemoryContextView, WorkingMemoryResolution, WorkingMemoryRow } from "./types.ts";

const CHINESE_DIGITS: Readonly<Record<string, number>> = {
	一: 1,
	二: 2,
	三: 3,
	四: 4,
	五: 5,
	六: 6,
	七: 7,
	八: 8,
	九: 9,
	十: 10,
};

function currentRows(view: WorkingMemoryContextView): readonly WorkingMemoryRow[] {
	return view.selectedRows.length ? view.selectedRows : view.lastResultSet;
}

function entityIds(rows: readonly WorkingMemoryRow[]): readonly string[] {
	return rows.flatMap((row) => (row.entityId ? [row.entityId] : []));
}

function ordinalNumber(text: string): number | undefined {
	const match = text.match(/第\s*([一二三四五六七八九十]|\d+)\s*个/);
	if (!match?.[1]) return undefined;
	const numeric = Number(match[1]);
	if (Number.isInteger(numeric) && numeric > 0) return numeric;
	return CHINESE_DIGITS[match[1]];
}

function baseResolution(view: WorkingMemoryContextView): Omit<WorkingMemoryResolution, "kind"> {
	return {
		activeProjectId: view.effectiveProjectId,
		rowIds: [],
		entityIds: [],
		derivedFilters: [],
		requiresClarification: false,
	};
}

export function resolveWorkingMemoryReference(text: string, view: WorkingMemoryContextView): WorkingMemoryResolution {
	const normalized = text.trim();
	const base = baseResolution(view);
	const rows = currentRows(view);

	if (/把\s*(这些|刚才那些|那些)\s*导出(来)?|导出\s*(这些|刚才那些|那些)/.test(normalized)) {
		const exportRows = /刚才那些/.test(normalized) ? view.lastResultSet : rows;
		if (!exportRows.length)
			return {
				...base,
				kind: "EXPORT_CURRENT",
				requiresClarification: true,
				reason: "No current result set is available to export",
			};
		return {
			...base,
			kind: "EXPORT_CURRENT",
			matchedText: normalized,
			rowIds: exportRows.map((row) => row.rowId),
			entityIds: entityIds(exportRows),
		};
	}

	if (/只看未完成的/.test(normalized)) {
		if (!view.lastResultSet.length)
			return {
				...base,
				kind: "APPLY_FILTER",
				requiresClarification: true,
				reason: "No previous result set is available to filter",
			};
		return {
			...base,
			kind: "APPLY_FILTER",
			matchedText: "只看未完成的",
			rowIds: view.lastResultSet.map((row) => row.rowId),
			entityIds: entityIds(view.lastResultSet),
			derivedFilters: [{ field: "status", operator: "SEMANTIC", value: "UNFINISHED", source: "USER_EXPLICIT" }],
		};
	}

	const ordinal = ordinalNumber(normalized);
	if (ordinal !== undefined) {
		const ordinalRows = view.lastResultSet.length ? view.lastResultSet : rows;
		const selected = ordinalRows[ordinal - 1];
		if (!selected)
			return {
				...base,
				kind: "ORDINAL",
				matchedText: normalized,
				requiresClarification: true,
				reason: `Result set does not contain item ${ordinal}`,
			};
		return {
			...base,
			kind: "ORDINAL",
			matchedText: normalized,
			rowIds: [selected.rowId],
			entityIds: selected.entityId ? [selected.entityId] : [],
			selectedRow: selected,
		};
	}

	if (/^(继续|接着来|继续处理)[。！!\s]*$/.test(normalized)) {
		const latest = view.recentToolResults[0];
		if (!latest)
			return {
				...base,
				kind: "CONTINUE",
				matchedText: normalized,
				requiresClarification: true,
				reason: "No recent tool result is available to continue",
			};
		return { ...base, kind: "CONTINUE", matchedText: normalized, rowIds: [], entityIds: [], continueFrom: latest };
	}

	if (/(刚才那些|这些|那些)/.test(normalized)) {
		const referencedRows = /刚才那些/.test(normalized) ? view.lastResultSet : rows;
		if (!referencedRows.length)
			return {
				...base,
				kind: "CURRENT_SET",
				matchedText: normalized,
				requiresClarification: true,
				reason: "No current result set is available",
			};
		return {
			...base,
			kind: "CURRENT_SET",
			matchedText: normalized,
			rowIds: referencedRows.map((row) => row.rowId),
			entityIds: entityIds(referencedRows),
		};
	}

	return { ...base, kind: "NONE" };
}
