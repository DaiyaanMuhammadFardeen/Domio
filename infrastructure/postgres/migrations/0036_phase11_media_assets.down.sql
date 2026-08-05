-- 0036_phase11_media_assets.down.sql
-- Phase 11: Drop ar_session, lottie_asset, audio_track, video_asset.
-- Reverse dependency order.

BEGIN;

DROP TABLE IF EXISTS ar_session CASCADE;
DROP TABLE IF EXISTS lottie_asset CASCADE;
DROP TABLE IF EXISTS audio_track CASCADE;
DROP TABLE IF EXISTS video_asset CASCADE;

COMMIT;
