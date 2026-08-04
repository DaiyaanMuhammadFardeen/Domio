-- 0034_phase10_deep_links.down.sql
-- Roll back Phase 10 M7 deep_links table.
BEGIN;
DROP TABLE IF EXISTS deep_links;
COMMIT;