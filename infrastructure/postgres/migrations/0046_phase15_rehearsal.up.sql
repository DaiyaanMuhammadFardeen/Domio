-- 0046_phase15_rehearsal.up.sql
-- Phase 15 W7: Rehearsal mode — per-slide dwell tracking with ±250 ms
-- accuracy. Tagged mode='rehearsal' on the presenter_session row so the
-- analytics plane can exclude these from human engagement metrics.
--
-- Tables:
--   rehearsal_run — one row per rehearsal run. per_slide_ms is a JSON map of
--                   slide_id → dwell_ms. pacing_targets is the same shape
--                   but with target ms. total_ms is the sum of active
--                   intervals (paused rehearsal does not tick).

BEGIN;

CREATE TABLE IF NOT EXISTS rehearsal_run (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          uuid NOT NULL,
    deck_id               uuid NOT NULL,
    presenter_session_id  uuid REFERENCES presenter_session (id) ON DELETE SET NULL,
    presenter_id          uuid NOT NULL,
    started_at            timestamptz NOT NULL DEFAULT now(),
    ended_at              timestamptz,
    per_slide_ms          jsonb NOT NULL DEFAULT '{}'::jsonb,
    pacing_targets        jsonb NOT NULL DEFAULT '{}'::jsonb,
    total_ms              bigint NOT NULL DEFAULT 0,
    paused_ms             bigint NOT NULL DEFAULT 0,
    completed             boolean NOT NULL DEFAULT false,
    notes                 text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    ai_run_id             uuid,
    agent_session_id      uuid
);

CREATE INDEX IF NOT EXISTS rehearsal_run_deck_idx
    ON rehearsal_run (deck_id, started_at DESC);
CREATE INDEX IF NOT EXISTS rehearsal_run_presenter_idx
    ON rehearsal_run (workspace_id, presenter_id);
CREATE INDEX IF NOT EXISTS rehearsal_run_session_idx
    ON rehearsal_run (presenter_session_id);

DO $$
DECLARE
    t text := 'rehearsal_run';
BEGIN
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t
          AND policyname = t || '_tenant_isolation'
    ) THEN
        EXECUTE format(
            'CREATE POLICY %I ON %I USING (
                workspace_id::text = current_setting(''app.tenant_id'', true)
                OR current_setting(''app.bypass_rls'', true) = ''on''
            ) WITH CHECK (
                workspace_id::text = current_setting(''app.tenant_id'', true)
                OR current_setting(''app.bypass_rls'', true) = ''on''
            )',
            t || '_tenant_isolation', t
        );
    END IF;
END $$;

COMMIT;