-- 0045_phase15_dynamic_plan.up.sql
-- Phase 15 W5: Dynamic plan manager — on-the-fly slide reorder and hide
-- that does NOT mutate the canonical deck order. Stored as an overlay
-- attached to the session. CRDT-merged between co-presenters.
--
-- Tables:
--   dynamic_plan     — one row per session. The authoritative ordering.
--   session_order    — versioned "saved running order" overlay. Created when
--                       the presenter saves the running order; tagged to a
--                       deck + version so the canonical deck is unchanged.

BEGIN;

CREATE TABLE IF NOT EXISTS dynamic_plan (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          uuid NOT NULL,
    presenter_session_id  uuid NOT NULL UNIQUE REFERENCES presenter_session (id) ON DELETE CASCADE,
    order_json            jsonb NOT NULL DEFAULT '[]'::jsonb,
    hidden                text[] NOT NULL DEFAULT ARRAY[]::text[],
    updated_by            uuid,
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    ai_run_id             uuid,
    agent_session_id      uuid
);

CREATE INDEX IF NOT EXISTS dynamic_plan_workspace_idx
    ON dynamic_plan (workspace_id);

CREATE TABLE IF NOT EXISTS session_order (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id      uuid NOT NULL,
    deck_id           uuid NOT NULL,
    saved_by          uuid NOT NULL,
    session_id        uuid REFERENCES presenter_session (id) ON DELETE SET NULL,
    order_json        jsonb NOT NULL,
    hidden            text[] NOT NULL DEFAULT ARRAY[]::text[],
    label             text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    ai_run_id         uuid,
    agent_session_id  uuid
);

CREATE INDEX IF NOT EXISTS session_order_deck_idx
    ON session_order (deck_id, created_at DESC);
CREATE INDEX IF NOT EXISTS session_order_workspace_idx
    ON session_order (workspace_id);

DO $$
DECLARE
    t text;
    tables text[] := ARRAY['dynamic_plan', 'session_order'];
BEGIN
    FOREACH t IN ARRAY tables LOOP
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
    END LOOP;
END $$;

COMMIT;