-- 0048_phase15_parking_lot.up.sql
-- Phase 15 W9: Live parking lot + wrap-up slide generator. Items are
-- ingested from P16 audience participation channels via participation.ingest.
--
-- Tables:
--   parking_lot_item — one row per question / suggestion. Status drives
--                       whether it appears on the auto-generated wrap-up slide.
--   wrap_up_slide    — the auto-generated wrap-up slide (deck_id, snapshot).
--                       Regenerated within ≤1 s of any pin/unpin change.

BEGIN;

CREATE TABLE IF NOT EXISTS parking_lot_item (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          uuid NOT NULL,
    presenter_session_id  uuid NOT NULL REFERENCES presenter_session (id) ON DELETE CASCADE,
    audience_participant_id text,
    text                  text NOT NULL,
    status                text NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','answered','deferred','deleted','pinned')),
    pin_order             integer NOT NULL DEFAULT 0,
    promoted_to_agenda    boolean NOT NULL DEFAULT false,
    promoted_to_qa        boolean NOT NULL DEFAULT false,
    answered_at           timestamptz,
    answered_by           uuid,
    answered_answer       text,
    deleted_at            timestamptz,
    deleted_by            uuid,
    source                text NOT NULL DEFAULT 'audience'
                          CHECK (source IN ('audience','presenter','p16_qa','imported')),
    p16_qa_item_id        uuid,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    ai_run_id             uuid,
    agent_session_id      uuid
);

CREATE INDEX IF NOT EXISTS parking_lot_session_pin_idx
    ON parking_lot_item (presenter_session_id, pin_order)
    WHERE status IN ('pinned','open');
CREATE INDEX IF NOT EXISTS parking_lot_session_status_idx
    ON parking_lot_item (presenter_session_id, status);
CREATE INDEX IF NOT EXISTS parking_lot_workspace_idx
    ON parking_lot_item (workspace_id);

CREATE TABLE IF NOT EXISTS wrap_up_slide (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          uuid NOT NULL,
    presenter_session_id  uuid NOT NULL REFERENCES presenter_session (id) ON DELETE CASCADE,
    deck_id               uuid NOT NULL,
    snapshot              jsonb NOT NULL DEFAULT '[]'::jsonb,
    pinned_count          integer NOT NULL DEFAULT 0,
    open_count            integer NOT NULL DEFAULT 0,
    generated_at          timestamptz NOT NULL DEFAULT now(),
    regenerated_at        timestamptz NOT NULL DEFAULT now(),
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    ai_run_id             uuid,
    agent_session_id      uuid,
    UNIQUE (presenter_session_id)
);

CREATE INDEX IF NOT EXISTS wrap_up_slide_workspace_idx
    ON wrap_up_slide (workspace_id);

DO $$
DECLARE
    t text;
    tables text[] := ARRAY['parking_lot_item', 'wrap_up_slide'];
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