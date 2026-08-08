-- 0058_recording_core.down.sql
-- Phase 21 W1: Recording core rollback.
-- Drops the recording tables in reverse dependency order and removes
-- the workspace.recording_config column.

BEGIN;

DROP TABLE IF EXISTS entitlement CASCADE;
DROP TABLE IF EXISTS recording_purchase CASCADE;
DROP TABLE IF EXISTS recording_share_link CASCADE;
DROP TABLE IF EXISTS recording_caption CASCADE;
DROP TABLE IF EXISTS recording_track CASCADE;
DROP TABLE IF EXISTS recording_chunk CASCADE;
DROP TABLE IF EXISTS recording_session CASCADE;

ALTER TABLE workspace DROP COLUMN IF EXISTS recording_config;

COMMIT;