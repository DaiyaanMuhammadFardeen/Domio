-- 0070_phase18_auto_update.down.sql
-- Drop auto_update_binding table.

BEGIN;

DROP TABLE IF EXISTS auto_update_binding CASCADE;

COMMIT;
