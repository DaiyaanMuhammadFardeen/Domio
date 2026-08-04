-- 0023_phase09_animation.down.sql
BEGIN;

DROP TABLE IF EXISTS animation_export_job;
DROP TABLE IF EXISTS magic_move_config;
DROP TABLE IF EXISTS reduced_motion_settings;
DROP TABLE IF EXISTS transition;
DROP TABLE IF EXISTS animation_preset;
DROP TABLE IF EXISTS easing_curve;
DROP TABLE IF EXISTS timeline_trigger;
DROP TABLE IF EXISTS timeline_keyframe;
DROP TABLE IF EXISTS timeline_track;
DROP TABLE IF EXISTS timeline;

COMMIT;