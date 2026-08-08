-- 0075_phase18_calendar.down.sql
-- Drop calendar_link table.

BEGIN;

DROP TABLE IF EXISTS calendar_link CASCADE;

COMMIT;
