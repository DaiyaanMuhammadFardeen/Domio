-- 0072_phase18_suggestions.up.sql
-- Phase 18 W2: Suggestions — CRDT-operation suggestions on deck elements.
--
-- Tables:
--   suggestion — structured CRDT operations proposed by session participants.

BEGIN;

-- ---------------------------------------------------------------------------
-- suggestion — structured CRDT operation suggestions on deck content.
-- target_type: 'element' | 'slide' | 'data_binding'
-- status: 'open' | 'accepted' | 'rejected' | 'obsolete'
-- operation: JSONB holding structured CRDT ops
--   {type: move|resize|restyle|content|data_binding|theme, params, before_state, after_state}
-- thread_id: optional FK to a comment thread for discussion.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suggestion (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    deck_id              uuid NOT NULL,
    session_id           uuid NOT NULL,
    author_id            uuid NOT NULL,
    target_type          text NOT NULL
                         CHECK (target_type IN ('element','slide','data_binding')),
    target_id            uuid NOT NULL,
    operation            jsonb NOT NULL,
    status               text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open','accepted','rejected','obsolete')),
    thread_id            uuid,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    resolved_at          timestamptz,
    resolved_by          uuid
);

CREATE INDEX IF NOT EXISTS suggestion_deck_idx ON suggestion (deck_id);
CREATE INDEX IF NOT EXISTS suggestion_status_idx ON suggestion (status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'suggestion'
    ] LOOP
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
