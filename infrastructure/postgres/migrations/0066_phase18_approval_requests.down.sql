-- 0066_phase18_approval_requests.down.sql
-- Drop approval tables in reverse dependency order.

BEGIN;

DROP TABLE IF EXISTS approval_audit CASCADE;
DROP TABLE IF EXISTS approval_decision CASCADE;
DROP TABLE IF EXISTS approval_request CASCADE;

COMMIT;
