-- 0051_phase15_failover.down.sql
BEGIN;
DROP TABLE IF EXISTS failover_state CASCADE;
COMMIT;