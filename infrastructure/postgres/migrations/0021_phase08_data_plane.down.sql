BEGIN;

DROP TABLE IF EXISTS freshness_record;
DROP TABLE IF EXISTS embed_config;
DROP TABLE IF EXISTS threshold_rule;
DROP TABLE IF EXISTS annotation;
DROP TABLE IF EXISTS chart_binding;
DROP TABLE IF EXISTS chart_widget;
DROP TABLE IF EXISTS formula_field;
DROP TABLE IF EXISTS dataset_snapshot;
DROP TABLE IF EXISTS scenario;
DROP TABLE IF EXISTS query;
DROP TABLE IF EXISTS data_source;
DROP TABLE IF EXISTS data_connection;

COMMIT;