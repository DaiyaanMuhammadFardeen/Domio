-- 0055_participation_session.up.sql
-- Phase 16 W1: Audience participation session.
--
-- Source-of-truth for the audience side of a live session. Mirrors
-- presenter_session but is per-participant: every phone that joins
-- a session gets its own row keyed on (session_id, participant_id).
-- Engagement (poll/qa/quiz/reaction/...) rows from later workstreams
-- (W4-W8) hang off the participant_session_id.
--
-- Design notes:
--   * session_code is the Crockford base32 code scanned from the QR.
--     Unique so two devices cannot squat the same code in the same
--     workspace.
--   * shard_index is derived deterministically from the session code
--     (via @domio/session-code) so the WS gateway can route a join
--     to the right shard without a Redis hop.
--   * version is a BIGINT used for optimistic concurrency. Every
--     transition (join/heartbeat/leave/kick/reap) bumps it; clients
--     pass the version they read via If-Match.
--   * rate_bucket is persisted as a JSONB blob (tokens, refill_per_s,
--     capacity, last_refill_ms) so we don't have to migrate every
--     time the bucket policy changes.
--   * fingerprint_hash is sha256("domio/audience/v1:" + raw_fp). The
--     raw value never leaves the device; hashing happens client-side
--     and again on the server with a workspace-scoped pepper.
--
-- Tables:
--   participant_session    — one row per participant per presenter session
--   session_membership     — materialised (session_id, participant_id, status)
--                            view written by trigger so cross-shard joins
--                            don't need to scan the main table.

BEGIN;

CREATE TABLE IF NOT EXISTS participant_session (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        uuid NOT NULL,
    session_id          uuid NOT NULL REFERENCES presenter_session (id) ON DELETE CASCADE,
    session_code        text NOT NULL,
    participant_id      text NOT NULL,
    display_name        text NOT NULL,
    locale              text NOT NULL,
    fingerprint_hash    text,
    shard_index         integer NOT NULL CHECK (shard_index >= 0 AND shard_index < 1024),
    state               text NOT NULL
                        CHECK (state IN ('joined','active','idle','left','reaped','kicked')),
    version             bigint NOT NULL DEFAULT 1,
    joined_at           timestamptz NOT NULL DEFAULT now(),
    last_seen_at        timestamptz NOT NULL DEFAULT now(),
    left_at             timestamptz,
    kick_count          integer NOT NULL DEFAULT 0,
    rate_bucket         jsonb NOT NULL
                        DEFAULT jsonb_build_object(
                            'tokens', 20,
                            'refill_per_s', 4,
                            'capacity', 20,
                            'last_refill_ms', (EXTRACT(epoch FROM now()) * 1000)::bigint
                        ),
    reconnect_token     text NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid,
    ai_run_id           uuid,
    agent_session_id    uuid,
    UNIQUE (session_id, participant_id),
    UNIQUE (workspace_id, session_code, participant_id)
);

CREATE INDEX IF NOT EXISTS participant_session_workspace_idx
    ON participant_session (workspace_id);
CREATE INDEX IF NOT EXISTS participant_session_session_idx
    ON participant_session (session_id);
CREATE INDEX IF NOT EXISTS participant_session_code_idx
    ON participant_session (workspace_id, session_code);
CREATE INDEX IF NOT EXISTS participant_session_active_idx
    ON participant_session (session_id) WHERE state IN ('active','idle');
CREATE INDEX IF NOT EXISTS participant_session_reconnect_idx
    ON participant_session (reconnect_token);
CREATE INDEX IF NOT EXISTS participant_session_last_seen_idx
    ON participant_session (last_seen_at) WHERE state IN ('active','idle');

DO $$
DECLARE
    t text := 'participant_session';
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

-- Materialised membership view: one row per active participant.
-- Written by a row-level trigger so any cross-shard engine can
-- SELECT from session_membership cheaply without scanning
-- participant_session.
CREATE TABLE IF NOT EXISTS session_membership (
    workspace_id        uuid NOT NULL,
    session_id          uuid NOT NULL,
    participant_id      text NOT NULL,
    participant_session_id uuid NOT NULL REFERENCES participant_session (id) ON DELETE CASCADE,
    shard_index         integer NOT NULL,
    state               text NOT NULL,
    joined_at           timestamptz NOT NULL,
    last_seen_at        timestamptz NOT NULL,
    PRIMARY KEY (session_id, participant_id)
);

CREATE INDEX IF NOT EXISTS session_membership_workspace_idx
    ON session_membership (workspace_id);
CREATE INDEX IF NOT EXISTS session_membership_shard_idx
    ON session_membership (session_id, shard_index);

DO $$
DECLARE
    t text := 'session_membership';
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

CREATE OR REPLACE FUNCTION session_membership_upsert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.state IN ('left','reaped','kicked') THEN
        DELETE FROM session_membership
            WHERE participant_session_id = NEW.id;
    ELSE
        INSERT INTO session_membership (
            workspace_id, session_id, participant_id, participant_session_id,
            shard_index, state, joined_at, last_seen_at
        ) VALUES (
            NEW.workspace_id, NEW.session_id, NEW.participant_id, NEW.id,
            NEW.shard_index, NEW.state, NEW.joined_at, NEW.last_seen_at
        )
        ON CONFLICT (session_id, participant_id) DO UPDATE SET
            shard_index   = EXCLUDED.shard_index,
            state         = EXCLUDED.state,
            last_seen_at  = EXCLUDED.last_seen_at;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS participant_session_membership_trg ON participant_session;
CREATE TRIGGER participant_session_membership_trg
    AFTER INSERT OR UPDATE OF state, last_seen_at, shard_index
    ON participant_session
    FOR EACH ROW EXECUTE FUNCTION session_membership_upsert();

-- Idempotency store for join. Mirrors the in-memory store but lives in
-- Postgres so two replicas can't both mint the same row.
CREATE TABLE IF NOT EXISTS audience_idempotency (
    workspace_id    uuid NOT NULL,
    key             text NOT NULL,
    session_code    text NOT NULL,
    response        jsonb,
    recorded_at_ms  bigint NOT NULL,
    expires_at      timestamptz NOT NULL,
    PRIMARY KEY (workspace_id, key)
);

CREATE INDEX IF NOT EXISTS audience_idempotency_expiry_idx
    ON audience_idempotency (expires_at);

-- Audience audit chain — one row per participant-lifecycle event. The
-- chain is hash-chained per workspace via the prev_hash column.
CREATE TABLE IF NOT EXISTS audience_audit_event (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    uuid NOT NULL,
    actor_id        text NOT NULL,
    session_id      uuid NOT NULL,
    participant_session_id uuid REFERENCES participant_session (id) ON DELETE SET NULL,
    action          text NOT NULL
                    CHECK (action IN (
                        'participant.join',
                        'participant.heartbeat',
                        'participant.leave',
                        'participant.kick',
                        'participant.reap'
                    )),
    ts_ms           bigint NOT NULL,
    prev_hash       text NOT NULL,
    hash            text NOT NULL,
    payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, hash)
);

CREATE INDEX IF NOT EXISTS audience_audit_workspace_ts_idx
    ON audience_audit_event (workspace_id, ts_ms);
CREATE INDEX IF NOT EXISTS audience_audit_session_idx
    ON audience_audit_event (session_id, ts_ms);

DO $$
DECLARE
    t text := 'audience_audit_event';
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