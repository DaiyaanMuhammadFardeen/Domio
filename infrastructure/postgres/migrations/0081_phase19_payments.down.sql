-- 0081_phase19_payments.down.sql
-- Phase 19: Drop payment tables in reverse dependency order.
-- ---------------------------------------------------------------------------

BEGIN;

DROP TABLE IF EXISTS subscription CASCADE;
DROP TABLE IF EXISTS payment_intent CASCADE;

COMMIT;
