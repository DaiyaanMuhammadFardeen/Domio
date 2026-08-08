-- 0082_phase19_payout.down.sql
-- Phase 19: Drop payout tables in reverse dependency order.
-- ---------------------------------------------------------------------------

BEGIN;

DROP TABLE IF EXISTS payout_ledger_entry CASCADE;
DROP TABLE IF EXISTS payout_run CASCADE;

COMMIT;
