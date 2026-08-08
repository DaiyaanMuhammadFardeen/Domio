-- 0059_analytics_core.down.sql
-- Reverse migration for 0059_analytics_core.

BEGIN;

DROP TABLE IF EXISTS viewer_erase_run CASCADE;
DROP TABLE IF EXISTS viewer_export_run CASCADE;
DROP TABLE IF EXISTS session CASCADE;
DROP TABLE IF EXISTS event_index CASCADE;
DROP TABLE IF EXISTS consent_event CASCADE;
DROP TABLE IF EXISTS identity_link CASCADE;
DROP TABLE IF EXISTS viewer CASCADE;

COMMIT;
