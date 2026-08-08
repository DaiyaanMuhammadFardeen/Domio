-- 0061_analytics_crm.down.sql
BEGIN;

DROP TABLE IF EXISTS slide_metric CASCADE;
DROP TABLE IF EXISTS deck_metric CASCADE;
DROP TABLE IF EXISTS live_session_summary CASCADE;
DROP TABLE IF EXISTS notification_audit CASCADE;
DROP TABLE IF EXISTS notification_rule CASCADE;
DROP TABLE IF EXISTS crm_sync_field_map CASCADE;
DROP TABLE IF EXISTS crm_sync_record CASCADE;
DROP TABLE IF EXISTS crm_connection CASCADE;

COMMIT;
