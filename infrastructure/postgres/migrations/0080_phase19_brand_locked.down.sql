-- 0080_phase19_brand_locked.down.sql
-- Phase 19: Drop brand_locked_listing.
-- ---------------------------------------------------------------------------

BEGIN;

DROP TABLE IF EXISTS brand_locked_listing CASCADE;

COMMIT;
