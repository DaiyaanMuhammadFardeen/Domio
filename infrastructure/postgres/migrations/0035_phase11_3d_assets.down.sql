-- 0035_phase11_3d_assets.down.sql
-- Phase 11 (M2.1): Drop shader, camera_keyframe, scene, model_asset, license.
-- Reverse dependency order.

BEGIN;

DROP TABLE IF EXISTS shader CASCADE;
DROP TABLE IF EXISTS camera_keyframe CASCADE;
DROP TABLE IF EXISTS scene CASCADE;
DROP TABLE IF EXISTS model_asset CASCADE;
DROP TABLE IF EXISTS license CASCADE;

COMMIT;
