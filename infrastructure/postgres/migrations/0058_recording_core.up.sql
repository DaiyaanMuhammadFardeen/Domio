-- 0058_recording_core.up.sql
-- Phase 21 W1: Recording & studio core tables.
--
-- Source-of-truth for the recording side of a session. One
-- recording_session per presenter_session. Tracks (screen/camera/mic/
-- system_audio/annotations/slide_diff/widget_events) are stored as
-- fragmented chunks in object storage; this table is the durable index
-- that the orchestrator, transcript-service, clip-engine, replay-web,
-- paywall-service, and entitlement-service all read from.
--
-- Design notes:
--   * recording_session is the parent; every other table FKs to it.
--   * recording_chunk is append-only; (track_kind, sequence) is the
--     natural ordering. The orchestrator commits chunks under a lease
--     so two writers can't claim the same sequence.
--   * recording_track is the schema-typed description of every track
--     (codec, sample_rate, etc.) so the finalizer knows how to mux.
--   * recording_caption is written by transcript-service. key is
--     (recording_session_id, language, segment_index).
--   * recording_share_link signs a URL to the replay PWA. token is
--     unique; the signed_token folds in workspace+recording+expiry.
--   * recording_purchase is a bKash payment row. idempotency_key
--     unique per (recording_session_id, viewer_id) so retries don't
--     double-charge.
--   * entitlement is the read-side decision grant. One row per
--     (subject_id, recording_session_id) where revoked_at IS NULL.
--   * workspace.recording_config is the workspace-level config blob
--     (chunk_seconds, default_expiry_days, auto_paywall_enabled, etc.).

BEGIN;

-- ---------------------------------------------------------------------------
-- recording_session
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recording_session (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        uuid NOT NULL,
    session_id          uuid NOT NULL REFERENCES presenter_session (id) ON DELETE CASCADE,
    presenter_user_id   uuid,
    status              text NOT NULL
                        CHECK (status IN ('pending','recording','paused','finalizing','ready','failed','expired','revoked')),
    started_at          timestamptz NOT NULL DEFAULT now(),
    paused_at           timestamptz,
    stopped_at          timestamptz,
    finalized_at        timestamptz,
    expires_at          timestamptz,
    storage_prefix      text NOT NULL,
    title               text,
    description         text,
    language            text NOT NULL DEFAULT 'en',
    error               text,
    version             bigint NOT NULL DEFAULT 1,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,
    updated_by          uuid
);

CREATE INDEX IF NOT EXISTS recording_session_workspace_idx
    ON recording_session (workspace_id);
CREATE INDEX IF NOT EXISTS recording_session_session_idx
    ON recording_session (session_id);
CREATE INDEX IF NOT EXISTS recording_session_active_idx
    ON recording_session (session_id) WHERE status IN ('recording','paused','finalizing','ready');
CREATE INDEX IF NOT EXISTS recording_session_expires_idx
    ON recording_session (expires_at) WHERE status IN ('ready');

-- ---------------------------------------------------------------------------
-- recording_chunk
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recording_chunk (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        uuid NOT NULL,
    recording_session_id uuid NOT NULL REFERENCES recording_session (id) ON DELETE CASCADE,
    track_kind          text NOT NULL
                        CHECK (track_kind IN ('screen','camera','microphone','system_audio','annotations','slide_diff','widget_events')),
    sequence            bigint NOT NULL CHECK (sequence >= 0),
    byte_size           bigint NOT NULL CHECK (byte_size >= 0),
    duration_ms         integer NOT NULL CHECK (duration_ms >= 0),
    sha256              text NOT NULL,
    storage_key         text NOT NULL,
    lease_id            uuid,
    lease_expires_at    timestamptz,
    committed_at        timestamptz NOT NULL DEFAULT now(),
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (recording_session_id, track_kind, sequence)
);

CREATE INDEX IF NOT EXISTS recording_chunk_session_track_seq_idx
    ON recording_chunk (recording_session_id, track_kind, sequence);
CREATE INDEX IF NOT EXISTS recording_chunk_lease_idx
    ON recording_chunk (lease_id) WHERE lease_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- recording_track
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recording_track (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        uuid NOT NULL,
    recording_session_id uuid NOT NULL REFERENCES recording_session (id) ON DELETE CASCADE,
    track_kind          text NOT NULL
                        CHECK (track_kind IN ('screen','camera','microphone','system_audio','annotations','slide_diff','widget_events')),
    mime_type           text NOT NULL,
    codec               text,
    sample_rate_hz      integer,
    channel_layout      text,
    total_duration_ms   integer NOT NULL DEFAULT 0,
    chunk_count         integer NOT NULL DEFAULT 0,
    total_bytes         bigint NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (recording_session_id, track_kind)
);

-- ---------------------------------------------------------------------------
-- recording_caption
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recording_caption (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        uuid NOT NULL,
    recording_session_id uuid NOT NULL REFERENCES recording_session (id) ON DELETE CASCADE,
    language            text NOT NULL,
    source              text NOT NULL CHECK (source IN ('auto','manual','imported')),
    segment_index       integer NOT NULL CHECK (segment_index >= 0),
    start_ms            integer NOT NULL CHECK (start_ms >= 0),
    end_ms              integer NOT NULL CHECK (end_ms >= start_ms),
    text                text NOT NULL,
    confidence          real,
    speaker_label       text,
    slide_id            text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (recording_session_id, language, segment_index)
);

CREATE INDEX IF NOT EXISTS recording_caption_lookup_idx
    ON recording_caption (recording_session_id, language, start_ms);

-- ---------------------------------------------------------------------------
-- recording_share_link
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recording_share_link (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        uuid NOT NULL,
    recording_session_id uuid NOT NULL REFERENCES recording_session (id) ON DELETE CASCADE,
    token               text NOT NULL,
    signed_token        text NOT NULL,
    scope               text NOT NULL CHECK (scope IN ('public','signed','workspace')),
    expires_at          timestamptz,
    revoked_at          timestamptz,
    last_accessed_at     timestamptz,
    access_count        bigint NOT NULL DEFAULT 0,
    created_by          uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, token)
);

CREATE INDEX IF NOT EXISTS recording_share_link_recording_idx
    ON recording_share_link (recording_session_id);
CREATE INDEX IF NOT EXISTS recording_share_link_revoked_idx
    ON recording_share_link (revoked_at) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- recording_purchase
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recording_purchase (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        uuid NOT NULL,
    recording_session_id uuid NOT NULL REFERENCES recording_session (id) ON DELETE CASCADE,
    viewer_id           uuid NOT NULL,
    bkash_payment_id    text,
    bkash_trx_id        text,
    amount_minor_units  bigint NOT NULL CHECK (amount_minor_units >= 0),
    currency            text NOT NULL,
    status              text NOT NULL CHECK (status IN ('initiated','authorized','captured','refunded','failed','expired')),
    idempotency_key     text NOT NULL,
    captured_at         timestamptz,
    refunded_at         timestamptz,
    expires_at          timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (recording_session_id, viewer_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS recording_purchase_viewer_idx
    ON recording_purchase (viewer_id, recording_session_id);
CREATE INDEX IF NOT EXISTS recording_purchase_status_idx
    ON recording_purchase (status) WHERE status IN ('initiated','authorized');

-- ---------------------------------------------------------------------------
-- entitlement
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entitlement (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        uuid NOT NULL,
    subject_kind        text NOT NULL CHECK (subject_kind IN ('user','participant','anonymous','workspace')),
    subject_id          text NOT NULL,
    recording_session_id uuid NOT NULL REFERENCES recording_session (id) ON DELETE CASCADE,
    grant_source        text NOT NULL CHECK (grant_source IN ('owner','share_link','purchase','manual','workspace_default','comp')),
    granted_at          timestamptz NOT NULL DEFAULT now(),
    expires_at          timestamptz,
    revoked_at          timestamptz,
    revoked_reason      text,
    idempotency_key     text NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (subject_id, recording_session_id, idempotency_key)
);

-- Partial unique: only one *active* entitlement per (subject, recording).
CREATE UNIQUE INDEX IF NOT EXISTS entitlement_active_unique
    ON entitlement (subject_id, recording_session_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS entitlement_subject_recording_idx
    ON entitlement (subject_id, recording_session_id);
CREATE INDEX IF NOT EXISTS entitlement_recording_idx
    ON entitlement (recording_session_id);

-- ---------------------------------------------------------------------------
-- workspace.recording_config (workspace-level config)
-- ---------------------------------------------------------------------------
ALTER TABLE workspace
    ADD COLUMN IF NOT EXISTS recording_config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Row-level security: _tenant_isolation on every new table.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT unnest(ARRAY[
            'recording_session',
            'recording_chunk',
            'recording_track',
            'recording_caption',
            'recording_share_link',
            'recording_purchase',
            'entitlement'
        ])
    LOOP
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