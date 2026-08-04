-- 0027_phase10_state_machines.down.sql
-- Phase 10 (M3): revert the persist_instance_state column and the
-- state-machine lookup indexes.

BEGIN;

DROP INDEX IF EXISTS interaction_state_persist_idx;
DROP INDEX IF EXISTS interaction_state_instance_idx;

ALTER TABLE interaction_state
    DROP COLUMN IF EXISTS persist_instance_state;

COMMIT;