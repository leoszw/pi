-- PI Industry Agent - Phase 3
-- BOQ retrieval source view for MySQL 8.x.
-- REVIEW STATUS: GENERATED FOR STATIC REVIEW ONLY. NOT EXECUTED.
-- Keeps deleted rows visible so incremental ETL can delete the corresponding OpenSearch document.

CREATE OR REPLACE VIEW vw_boq_retrieval_source_all AS
SELECT
	CAST(l.id AS CHAR(128)) AS ledger_id,
	CAST(l.pro_id AS CHAR(128)) AS pro_id,
	CAST(l.section_id AS CHAR(128)) AS section_id,
	s.section_name AS section_name,
	l.ledger_code AS ledger_code_raw,
	UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(l.ledger_code), '－', '-'), '—', '-'), '–', '-'), '_', '-'), ' ', '')) AS ledger_code_norm,
	l.ledger_name AS ledger_name_raw,
	TRIM(REPLACE(REPLACE(l.ledger_name, '（', '('), '）', ')')) AS ledger_name_norm,
	l.unit AS unit_raw,
	CASE LOWER(TRIM(COALESCE(l.unit, '')))
		WHEN '㎡' THEN 'm2'
		WHEN 'm²' THEN 'm2'
		WHEN 'm2' THEN 'm2'
		WHEN 'm³' THEN 'm3'
		WHEN 'm3' THEN 'm3'
		WHEN '米' THEN 'm'
		WHEN '吨' THEN 't'
		ELSE NULLIF(LOWER(TRIM(l.unit)), '')
	END AS unit_norm,
	CAST(l.is_deleted AS UNSIGNED) AS is_deleted,
	l.update_time,
	-- Authoritative commercial facts remain available only for source lookup/debug.
	-- Never put these values into embedding text; final answers must read them from the business source.
	l.contract_price,
	l.contract_num,
	l.contract_amount,
	l.ledger_price,
	l.change_count,
	l.change_time,
	l.change_after_price,
	l.change_after_num,
	l.change_after_amount
FROM boq_ledger l
LEFT JOIN section_dict s
	ON s.section_id = l.section_id;
