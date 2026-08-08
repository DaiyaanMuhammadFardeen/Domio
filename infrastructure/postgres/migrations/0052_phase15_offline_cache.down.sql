-- 0052_phase15_offline_cache.down.sql
BEGIN;
DROP TABLE IF EXISTS offline_cache_entry CASCADE;
COMMIT;