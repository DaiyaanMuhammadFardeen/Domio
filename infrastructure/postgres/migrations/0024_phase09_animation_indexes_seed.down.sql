-- 0024_phase09_animation_indexes_seed.down.sql
BEGIN;

DELETE FROM animation_preset WHERE tenant_id = 'system';
DELETE FROM easing_curve WHERE tenant_id = 'system';

DROP INDEX IF EXISTS export_job_tenant_deck_idx;
DROP INDEX IF EXISTS magic_move_tenant_deck_idx;
DROP INDEX IF EXISTS transition_tenant_deck_idx;
DROP INDEX IF EXISTS timeline_trigger_timeline_idx;
DROP INDEX IF EXISTS timeline_keyframe_track_idx;
DROP INDEX IF EXISTS timeline_track_timeline_idx;
DROP INDEX IF EXISTS timeline_tenant_deck_idx;

COMMIT;