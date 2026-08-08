-- 0078_phase18_reassignment_history.down.sql
-- Phase 18 W5: Drop reassignment_history.
-- ---------------------------------------------------------------------------

BEGIN;

DROP TABLE IF EXISTS reassignment_history CASCADE;

COMMIT;
