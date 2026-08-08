-- 0087_phase19_listing_versions.down.sql
-- Phase 19: Drop listing_version table.
-- ---------------------------------------------------------------------------

BEGIN;

DROP TABLE IF EXISTS listing_version CASCADE;

COMMIT;
