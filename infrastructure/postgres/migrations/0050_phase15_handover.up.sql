-- 0050_phase15_handover.up.sql
-- Phase 15 W11: Multi-presenter handoff — transfers full stage state
-- (slide index, animation frame, prototype variables, agenda timers, parking
-- lot, PiP config) in ≤500 ms p95. Audience-visible freeze ≤250 ms p95.
-- Either party can reclaim control at any time.
--
-- Tables:
--   handover_state — one row per handoff attempt. result enum captured for
--                    audit.

BEGIN;

CREATE TABLE IF NOT EXISTS handover_state (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          uuid NOT NULL,
    presenter_session_id  uuid NOT NULL REFERENCES presenter_session (id) ON DELETE CASCADE,
    from_presenter_id     uuid NOT NULL,
    to_presenter_id       uuid NOT NULL,
    transfer_token_hash   bytea NOT NULL,
    state_snapshot        jsonb NOT NULL,
    audience_freeze_ms    integer NOT NULL DEFAULT 0,
    result                text NOT NULL DEFAULT 'pending'
                          CHECK (result IN ('pending','success','failure','reverted')),
    failure_reason        text,
    attempted_at          timestamptz NOT NULL DEFAULT now(),
    completed_at          timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    ai_run_id             uuid,
    agent_session_id      uuid
);

CREATE INDEX IF NOT EXISTS handover_state_session_result_idx
    ON handover_state (presenter_session_id, result);
CREATE INDEX IF NOT EXISTS handover_state_workspace_idx
    ON handover_state (workspace_id);

DO $$
DECLARE
    t text := 'handover_state';
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