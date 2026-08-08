-- 0054_phase15_agenda_whisper_recap.up.sql
-- Phase 15 W15: Agenda timers, backstage whisper, post-presentation recap.
--
-- Tables:
--   agenda_timer     — concurrent timers (agenda / hard stop / soft stop).
--                       ±1 s accuracy over a 60-minute interval. Persists
--                       across handoff and failover (event_log is the
--                       authoritative trail).
--   whisper_message  — E2E encrypted via Curve25519 + XSalsa20-Poly1305.
--                       Control plane stores ciphertext only; sender +
--                       presenter derive keys per session.
--   recap_summary    — generated within ≤5 s of session end with per-slide
--                       dwell, slides shown/skipped, saved annotations,
--                       parking lot open, audience summary. Editable and
--                       shareable via P14 share-link API.

BEGIN;

CREATE TABLE IF NOT EXISTS agenda_timer (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          uuid NOT NULL,
    presenter_session_id  uuid NOT NULL REFERENCES presenter_session (id) ON DELETE CASCADE,
    label                 text NOT NULL,
    timer_kind            text NOT NULL DEFAULT 'agenda'
                          CHECK (timer_kind IN ('agenda','hard_stop','soft_stop')),
    starts_at             timestamptz NOT NULL DEFAULT now(),
    duration_ms           bigint NOT NULL CHECK (duration_ms > 0),
    remaining_ms          bigint NOT NULL,
    paused_ms             bigint NOT NULL DEFAULT 0,
    visible_to            text NOT NULL DEFAULT 'presenter'
                          CHECK (visible_to IN ('presenter','audience','both')),
    status                text NOT NULL DEFAULT 'idle'
                          CHECK (status IN ('idle','running','paused','done','cancelled')),
    brand_var_overrides   jsonb NOT NULL DEFAULT '{}'::jsonb,
    event_log             jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    ai_run_id             uuid,
    agent_session_id      uuid
);

CREATE INDEX IF NOT EXISTS agenda_timer_session_status_idx
    ON agenda_timer (presenter_session_id, status);
CREATE INDEX IF NOT EXISTS agenda_timer_workspace_idx
    ON agenda_timer (workspace_id);

CREATE TABLE IF NOT EXISTS whisper_message (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          uuid NOT NULL,
    presenter_session_id  uuid NOT NULL REFERENCES presenter_session (id) ON DELETE CASCADE,
    from_user_id          uuid NOT NULL,
    from_display_name     text,
    ciphertext            bytea NOT NULL,
    nonce                 bytea NOT NULL,
    ephemeral_pubkey      bytea NOT NULL,
    algo                  text NOT NULL DEFAULT 'curve25519_xsalsa20poly1305',
    macro                 text
                          CHECK (macro IS NULL OR macro IN ('advance','retreat','hide_slide','reveal_slide')),
    macro_args            jsonb,
    delivered_at          timestamptz,
    read_at               timestamptz,
    expires_at            timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    ai_run_id             uuid,
    agent_session_id      uuid
);

CREATE INDEX IF NOT EXISTS whisper_session_created_idx
    ON whisper_message (presenter_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS whisper_workspace_idx
    ON whisper_message (workspace_id);
CREATE INDEX IF NOT EXISTS whisper_unread_idx
    ON whisper_message (presenter_session_id, read_at)
    WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS recap_summary (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          uuid NOT NULL,
    presenter_session_id  uuid NOT NULL REFERENCES presenter_session (id) ON DELETE CASCADE,
    deck_id               uuid NOT NULL,
    per_slide_ms          jsonb NOT NULL DEFAULT '{}'::jsonb,
    slides_shown          jsonb NOT NULL DEFAULT '[]'::jsonb,
    slides_skipped        jsonb NOT NULL DEFAULT '[]'::jsonb,
    saved_annotations     jsonb NOT NULL DEFAULT '[]'::jsonb,
    parking_lot_open      jsonb NOT NULL DEFAULT '[]'::jsonb,
    parking_lot_pinned    jsonb NOT NULL DEFAULT '[]'::jsonb,
    audience_summary      jsonb NOT NULL DEFAULT '{}'::jsonb,
    presenter_notes       text,
    session_started_at    timestamptz NOT NULL,
    session_ended_at      timestamptz NOT NULL,
    total_ms              bigint NOT NULL DEFAULT 0,
    generation_status     text NOT NULL DEFAULT 'pending'
                          CHECK (generation_status IN ('pending','generating','complete','failed')),
    generated_at          timestamptz,
    pii_redacted          boolean NOT NULL DEFAULT false,
    residency_zone        text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    ai_run_id             uuid,
    agent_session_id      uuid,
    UNIQUE (presenter_session_id)
);

CREATE INDEX IF NOT EXISTS recap_summary_session_idx
    ON recap_summary (presenter_session_id);
CREATE INDEX IF NOT EXISTS recap_summary_workspace_idx
    ON recap_summary (workspace_id);
CREATE INDEX IF NOT EXISTS recap_summary_deck_idx
    ON recap_summary (deck_id);

DO $$
DECLARE
    t text;
    tables text[] := ARRAY['agenda_timer', 'whisper_message', 'recap_summary'];
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