-- 0060_analytics_ab.down.sql
BEGIN;

DROP TRIGGER IF EXISTS ab_variant_check_total_trg ON ab_variant;
DROP FUNCTION IF EXISTS ab_variant_check_total();

DROP TABLE IF EXISTS ab_exposure CASCADE;
DROP TABLE IF EXISTS ab_assignment CASCADE;
DROP TABLE IF EXISTS ab_variant CASCADE;
DROP TABLE IF EXISTS ab_test CASCADE;

COMMIT;