-- 0084_phase19_takedown.down.sql
-- Phase 19: Drop takedown tables in reverse dependency order.
-- ---------------------------------------------------------------------------

BEGIN;

DROP TABLE IF EXISTS trust_score CASCADE;
DROP TABLE IF EXISTS takedown_request CASCADE;

COMMIT;
