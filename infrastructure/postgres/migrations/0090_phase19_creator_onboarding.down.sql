-- 0090_phase19_creator_onboarding.down.sql
-- Phase 19: Reverse creator_onboarding changes.
-- Drop new tables in reverse dependency order, then drop added columns.
-- ---------------------------------------------------------------------------

BEGIN;

DROP TABLE IF EXISTS statement_record CASCADE;
DROP TABLE IF EXISTS kyc_rescreen_hit CASCADE;

ALTER TABLE creator_profile
    DROP COLUMN IF EXISTS onboarding_state;

COMMIT;
