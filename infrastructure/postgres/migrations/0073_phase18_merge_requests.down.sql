-- 0073_phase18_merge_requests.down.sql
-- Drop merge request tables in reverse dependency order.

BEGIN;

DROP TABLE IF EXISTS merge_request CASCADE;
DROP TABLE IF EXISTS slide_diff CASCADE;

COMMIT;
