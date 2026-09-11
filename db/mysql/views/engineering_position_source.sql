-- PI Industry Agent - Phase 3
-- Engineering position retrieval source view for MySQL 8.x.
-- REVIEW STATUS: GENERATED FOR STATIC REVIEW ONLY. NOT EXECUTED.
-- Dictionary table names follow the reviewed design and may be adapted to the deployed schema.
-- Deliberately keeps deleted rows visible so incremental ETL can issue OpenSearch DELETE operations.

CREATE OR REPLACE VIEW vw_engineering_retrieval_source_all AS
SELECT
	CAST(e.engineering_id AS CHAR(128)) AS engineering_id,
	e.engineering_code,
	e.bim_code,
	CAST(e.pro_id AS CHAR(128)) AS pro_id,
	CAST(e.unit_engineering_id AS CHAR(128)) AS unit_engineering_id,
	ue.engineering_name AS unit_engineering_name,
	CAST(e.parent_engineering_id AS CHAR(128)) AS parent_engineering_id,
	e.engineering_name,
	e.engineering_full_name,
	ec.category_name AS engineering_category_name,
	et.type_name AS engineering_type_name,
	UPPER(COALESCE(
		NULLIF(TRIM(e.prefix), ''),
		NULLIF(REGEXP_SUBSTR(UPPER(TRIM(e.begin_stump)), '^[A-Z]+'), '')
	)) AS alignment_code,
	CASE
		WHEN e.begin_stump_num IS NULL OR e.end_stump_num IS NULL THEN NULL
		ELSE LEAST(e.begin_stump_num, e.end_stump_num)
	END AS chainage_start_m,
	CASE
		WHEN e.begin_stump_num IS NULL OR e.end_stump_num IS NULL THEN NULL
		ELSE GREATEST(e.begin_stump_num, e.end_stump_num)
	END AS chainage_end_m,
	CASE
		WHEN REGEXP_SUBSTR(UPPER(TRIM(e.begin_stump)), '^[A-Z]+') IS NULL
			OR REGEXP_SUBSTR(UPPER(TRIM(e.end_stump)), '^[A-Z]+') IS NULL THEN 0
		WHEN REGEXP_SUBSTR(UPPER(TRIM(e.begin_stump)), '^[A-Z]+')
			<> REGEXP_SUBSTR(UPPER(TRIM(e.end_stump)), '^[A-Z]+') THEN 1
		ELSE 0
	END AS cross_alignment,
	CAST(e.is_min_unit AS UNSIGNED) AS is_min_unit,
	CAST(e.is_deleted AS UNSIGNED) AS is_deleted,
	e.update_time,
	-- Authoritative fact fields are exposed only for source/debug access.
	-- They must not be copied into embedding text or treated as vector-answer facts.
	e.design_quantity,
	e.use_quantity,
	e.exec_state,
	e.construct_state
FROM engineering e
LEFT JOIN engineering ue
	ON ue.engineering_id = e.unit_engineering_id
LEFT JOIN engineering_category_dict ec
	ON ec.category_id = e.engineering_category
LEFT JOIN engineering_type_dict et
	ON et.type_id = e.engineering_type;
