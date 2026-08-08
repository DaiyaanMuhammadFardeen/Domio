-- 0065_phase18_comments.down.sql
-- Drop comment + mention tables in reverse dependency order.

BEGIN;

DROP TABLE IF EXISTS mention CASCADE;
DROP TABLE IF EXISTS comment CASCADE;

COMMIT;
