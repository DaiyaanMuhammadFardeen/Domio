-- 0042_phase15_presenter_session.up.sql
-- Phase 15 W1: Presenter session manager — source-of-truth row for a live
-- presenter session.
--
-- Tables:
--   presenter_session           — session row; state/agenda_timers/parking_lot
--                                  /display_profile/pip_config JSONB; mode
--                                  enum; version BIGINT for optimistic CC.
--   second_screen               — display_index, role, resolution, color,
--                                  hdr. One row per physical display the
--                                  presenter runtime discovers.
--
-- Workspace isolation: workspace_id UUID NOT NULL with RLS policies,
-- matching the 0039/0040/0041 pattern.
--
-- All tables follow the P12 universal audit quartet:
--   created_at, updated_at, created_by, updated_by, ai_run_id, agent_session_id.

BEGIN;

-- ---------------------------------------------------------------------------
-- presenter_session — one row per live presenting session.
-- state            : JSONB describing the canonical stage state (slide index,
--                    animation frame, prototype variables, hide ordering,
--                    etc.). Optimistic concurrency reads/writes this row.
-- agenda_timers    : JSONB array of timer rows (label, duration, status).
-- parking_lot      : JSONB wrapped map of pin states (mirror of parking_lot_item
--                    for fast reads). Authoritative list is parking_lot_item.
-- display_profile  : JSONB describing the active display profile (W14).
-- pip_config       : JSONB of PiP bubble config (W10).
-- mode             : 'live' | 'rehearsal' | 'offline' | 'multi_presenter'
--                    | 'failover'. Rehearsal mode is excluded from analytics.
-- version          : monotonically-increasing BIGINT; bumped on every state
--                    mutation. Acts as the etag for If-Match.
-- started_at       : session start wall-clock time.
-- ended_at         : session end (NULL while running).
-- last_heartbeat_at: last presenter-runtime heartbeat (used by W12 failover).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS presenter_session (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        uuid NOT NULL,
    deck_id             uuid NOT NULL,
    presenter_id        uuid NOT NULL,
    state               jsonb NOT NULL DEFAULT '{}'::jsonb,
    agenda_timers       jsonb NOT NULL DEFAULT '[]'::jsonb,
    parking_lot         jsonb NOT NULL DEFAULT '{}'::jsonb,
    display_profile     jsonb NOT NULL DEFAULT '{}'::jsonb,
    pip_config          jsonb NOT NULL DEFAULT '{}'::jsonb,
    mode                text NOT NULL DEFAULT 'live'
                        CHECK (mode IN ('live','rehearsal','offline','multi_presenter','failover')),
    version             bigint NOT NULL DEFAULT 1,
    started_at          timestamptz NOT NULL DEFAULT now(),
    ended_at            timestamptz,
    last_heartbeat_at   timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    ai_run_id           uuid,
    agent_session_id    uuid
);

CREATE INDEX IF NOT EXISTS presenter_session_workspace_idx
    ON presenter_session (workspace_id);
CREATE INDEX IF NOT EXISTS presenter_session_deck_idx
    ON presenter_session (deck_id);
CREATE INDEX IF NOT EXISTS presenter_session_presenter_idx
    ON presenter_session (workspace_id, presenter_id);
CREATE INDEX IF NOT EXISTS presenter_session_mode_idx
    ON presenter_session (workspace_id, mode) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS presenter_session_heartbeat_idx
    ON presenter_session (last_heartbeat_at) WHERE ended_at IS NULL;

-- ---------------------------------------------------------------------------
-- second_screen — one row per physical display the presenter discovers.
-- display_index  : 0..N where 0 is primary.
-- role           : 'stage' | 'presenter' | 'clone' | 'extend' | 'audience_only'.
-- resolution     : {"width": 3840, "height": 2160, "refresh_hz": 60}.
-- color_profile  : 'srgb' | 'display_p3' | 'rec2020'.
-- hdr            : boolean; opt-in only.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS second_screen (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id      uuid NOT NULL,
    presenter_session_id uuid NOT NULL REFERENCES presenter_session (id) ON DELETE CASCADE,
    display_index     integer NOT NULL,
    role              text NOT NULL DEFAULT 'stage'
                      CHECK (role IN ('stage','presenter','clone','extend','audience_only')),
    resolution        jsonb NOT NULL DEFAULT '{}'::jsonb,
    color_profile     text NOT NULL DEFAULT 'srgb'
                      CHECK (color_profile IN ('srgb','display_p3','rec2020')),
    hdr               boolean NOT NULL DEFAULT false,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    created_by        uuid,
    updated_by        uuid,
    ai_run_id         uuid,
    agent_session_id  uuid,
    UNIQUE (presenter_session_id, display_index)
);

CREATE INDEX IF NOT EXISTS second_screen_session_idx
    ON second_screen (presenter_session_id);
CREATE INDEX IF NOT EXISTS second_screen_workspace_idx
    ON second_screen (workspace_id);

-- ---------------------------------------------------------------------------
-- Row-level security.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
    tables text[] := ARRAY['presenter_session', 'second_screen'];
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
