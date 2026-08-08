-- 0083_phase19_finance.down.sql
-- Phase 19: Drop finance tables in reverse dependency order.
-- ---------------------------------------------------------------------------

BEGIN;

DROP TABLE IF EXISTS tax_record CASCADE;
DROP TABLE IF EXISTS fx_rate CASCADE;

COMMIT;
