-- 0045_phase15_dynamic_plan.down.sql
BEGIN;
DROP TABLE IF EXISTS session_order CASCADE;
DROP TABLE IF EXISTS dynamic_plan CASCADE;
COMMIT;