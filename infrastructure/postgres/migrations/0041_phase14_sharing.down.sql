-- 0041_phase14_sharing.down.sql
-- Phase 14 W1: drop all share-link tables in reverse dependency order.
--
-- FK order (children → parents):
--   link_visibility_rule → share_link
--   embed_config         → share_link
--   seo_metadata         → share_link
--   link_policy          → share_link
--   share_link           → watermark_profile  (FK added later)
--   watermark_profile    → (nothing)

BEGIN;

ALTER TABLE share_link DROP COLUMN IF EXISTS watermark_profile_id;

DROP TABLE IF EXISTS seo_metadata CASCADE;
DROP TABLE IF EXISTS embed_config CASCADE;
DROP TABLE IF EXISTS link_visibility_rule CASCADE;
DROP TABLE IF EXISTS link_policy CASCADE;
DROP TABLE IF EXISTS watermark_profile CASCADE;
DROP TABLE IF EXISTS share_link CASCADE;

COMMIT;
