-- 0074_phase18_meeting_integrations.down.sql
-- Drop meeting_integration table.

BEGIN;

DROP TABLE IF EXISTS meeting_integration CASCADE;

COMMIT;
