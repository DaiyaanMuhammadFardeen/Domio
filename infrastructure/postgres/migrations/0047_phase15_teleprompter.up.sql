-- 0047_phase15_teleprompter.up.sql
-- Phase 15 W8: Teleprompter state — scrolling notes at adjustable WPM,
-- optional auto-advance synced to slide transitions, mirror mode for
-- prompter glass, and font-size preset.
--
-- Tables:
--   teleprompter_state — one row per presenter_session. Words-per-minute
--                        ranges 60-300; mirror flip is a boolean.

BEGIN;

CREATE TABLE IF NOT EXISTS teleprompter_state (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          uuid NOT NULL,
    presenter_session_id  uuid NOT NULL UNIQUE REFERENCES presenter_session (id) ON DELETE CASCADE,
    words_per_minute      integer NOT NULL DEFAULT 180
                          CHECK (words_per_minute BETWEEN 60 AND 300),
    auto_advance          boolean NOT NULL DEFAULT true,
    mirror                boolean NOT NULL DEFAULT false,
    font_size             text NOT NULL DEFAULT 'room'
                          CHECK (font_size IN ('room','broadcast','compact')),
    scroll_offset_ms      bigint NOT NULL DEFAULT 0,
    reduced_motion        boolean NOT NULL DEFAULT false,
    locale                text NOT NULL DEFAULT 'en',
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    ai_run_id             uuid,
    agent_session_id      uuid
);

CREATE INDEX IF NOT EXISTS teleprompter_state_workspace_idx
    ON teleprompter_state (workspace_id);

DO $$
DECLARE
    t text := 'teleprompter_state';
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