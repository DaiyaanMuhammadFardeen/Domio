-- 0086_phase19_seed_payout_policy.down.sql
-- Phase 19: Drop payout_policy.
-- ---------------------------------------------------------------------------

BEGIN;

DROP TABLE IF EXISTS payout_policy CASCADE;

COMMIT;
