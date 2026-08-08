-- 0067_phase18_assignments.down.sql
-- Drop assignment tables in reverse dependency order.

BEGIN;

DROP TABLE IF EXISTS assignment_history CASCADE;
DROP TABLE IF EXISTS assignment CASCADE;

COMMIT;
