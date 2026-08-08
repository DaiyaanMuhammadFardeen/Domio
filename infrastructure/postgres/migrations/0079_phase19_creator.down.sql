-- 0079_phase19_creator.down.sql
-- Phase 19: Drop creator tables in reverse dependency order.
-- ---------------------------------------------------------------------------

BEGIN;

DROP TABLE IF EXISTS kyc_session CASCADE;
DROP TABLE IF EXISTS creator_payout_method CASCADE;
DROP TABLE IF EXISTS creator_profile CASCADE;

COMMIT;
