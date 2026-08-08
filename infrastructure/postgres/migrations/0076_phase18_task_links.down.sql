-- 0076_phase18_task_links.down.sql
-- Drop task_link table.

BEGIN;

DROP TABLE IF EXISTS task_link CASCADE;

COMMIT;
