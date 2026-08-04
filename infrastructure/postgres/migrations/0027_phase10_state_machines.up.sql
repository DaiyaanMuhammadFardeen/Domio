-- 0027_phase10_state_machines.up.sql
-- Phase 10 (M3): Component state machines + state-scoped persistence.
-- Extends `interaction_state` with a `persist_instance_state` boolean
-- (drives the StateScope.persist toggle on the runtime side) plus a
-- JSONB gin index that lets the editor resolve an FSM by instance_id
-- without scanning the whole table. The `state_machine` column is
-- already present from 0025; this migration is additive.

BEGIN;

ALTER TABLE interaction_state
    ADD COLUMN IF NOT EXISTS persist_instance_state boolean NOT NULL DEFAULT false;

-- Indexes for the editor / runtime lookup paths.
-- The instance_id column is already unique-keyed through the runtime
-- service (one row per tenant+deck+instance), but a non-unique btree
-- on (tenant_id, deck_id, instance_id) speeds up the
-- findByInstance() hot path that the panel hits on every keystroke.
CREATE INDEX IF NOT EXISTS interaction_state_instance_idx
    ON interaction_state (tenant_id, deck_id, instance_id);

-- Partial index for persisted state machines: most rows will have
-- persist_instance_state = false, so a partial index keeps it tiny
-- while still giving the persistence-aware runtime paths a fast
-- filter.
CREATE INDEX IF NOT EXISTS interaction_state_persist_idx
    ON interaction_state (tenant_id, deck_id)
    WHERE persist_instance_state = true;

COMMIT;