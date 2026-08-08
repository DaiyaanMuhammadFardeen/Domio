-- 0062_analytics_exports.down.sql
BEGIN;

DROP TRIGGER IF EXISTS analytics_export_run_audit ON analytics_export_run;
DROP FUNCTION IF EXISTS analytics_export_run_audit_trigger();

DROP TABLE IF EXISTS engagement_score_event CASCADE;
DROP TABLE IF EXISTS analytics_export_audit CASCADE;
DROP TABLE IF EXISTS analytics_export_run CASCADE;

COMMIT;
