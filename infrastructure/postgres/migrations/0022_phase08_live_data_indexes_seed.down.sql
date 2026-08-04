BEGIN;

DROP TABLE IF EXISTS threshold_rule_template;
DROP TABLE IF EXISTS freshness_policy;

DROP INDEX IF EXISTS threshold_rule_widget_measure_idx;
DROP INDEX IF EXISTS scenario_parent_idx;
DROP INDEX IF EXISTS freshness_record_tenant_status_idx;
DROP INDEX IF EXISTS dataset_snapshot_scenario_idx;

COMMIT;