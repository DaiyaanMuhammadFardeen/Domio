-- 0071_phase18_expiry.down.sql
-- Drop expiry tables in reverse dependency order.

BEGIN;

DROP TABLE IF EXISTS freshness_flag CASCADE;
DROP TABLE IF EXISTS expiry_policy CASCADE;

COMMIT;
