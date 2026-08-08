-- 0059_analytics_core.up.sql
-- Phase 17 W2/W3: Analytics core tables.
--
-- Postgres is the *system of record* for everything that is not the
-- event stream itself. ClickHouse holds the raw events; Postgres
-- holds:
--   * viewer            — one row per identified / pseudonymous viewer
--   * identity_link     — cross-device stitching graph
--   * consent_event     — append-only audit of consent grants/revokes
--   * event_index       — pointer from event_id to clickhouse offset
--   * session           — session lifecycle (started/ended/active)
--   * viewer_export_run — GDPR right-to-access audit trail
--   * viewer_erase_run  — GDPR right-to-erasure audit trail
--
-- Design notes:
--   * viewer_id_key is the salted hash used by the SDK/ingest; the
--     cleartext identifier never lands here.
--   * identity_link is symmetric (a <-> b == b <-> a) but stored
--     directed (canonical_id, link_id) so the resolver always starts
--     from the lower-numbered row.
--   * consent_event is append-only; the current consent state is the
--     most recent row per (viewer_id, mode).
--   * event_index is sparse: only "interesting" events that need
--     re-resolution (e.g. GDPR-backfill targets) are written here.
--   * Every table gets RLS via the standard DO/EXECUTE block in
--     0055_participation_session.up.sql:83-104.

BEGIN;

-- ---------------------------------------------------------------------------
-- viewer
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS viewer (
    viewer_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id       UUID NOT NULL,
    viewer_id_key      TEXT NOT NULL,            -- salted hash from SDK
    privacy_mode       TEXT NOT NULL
        CHECK (privacy_mode IN ('identified','pseudonymous','anon_consent','anon_no_track')),
    region_pinned      TEXT
        CHECK (region_pinned IS NULL OR region_pinned IN ('us','eu','bd','sg','au')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Latest known cross-device link pair (canonical ↔ alternate).
    canonical_id       UUID,
    metadata_json      JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (workspace_id, viewer_id_key)
);

CREATE INDEX IF NOT EXISTS viewer_workspace_idx
    ON viewer (workspace_id);
CREATE INDEX IF NOT EXISTS viewer_region_idx
    ON viewer (region_pinned) WHERE region_pinned IS NOT NULL;
CREATE INDEX IF NOT EXISTS viewer_last_seen_idx
    ON viewer (workspace_id, last_seen_at DESC);

-- ---------------------------------------------------------------------------
-- identity_link
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS identity_link (
    link_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id       UUID NOT NULL,
    canonical_id       UUID NOT NULL REFERENCES viewer(viewer_id) ON DELETE CASCADE,
    alternate_id       UUID NOT NULL REFERENCES viewer(viewer_id) ON DELETE CASCADE,
    confidence         REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    method             TEXT NOT NULL
        CHECK (method IN ('last_seen_ip','last_seen_ua','email_hash','manual')),
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (canonical_id, alternate_id)
);

CREATE INDEX IF NOT EXISTS identity_link_workspace_idx
    ON identity_link (workspace_id);
CREATE INDEX IF NOT EXISTS identity_link_alternate_idx
    ON identity_link (alternate_id);

-- ---------------------------------------------------------------------------
-- consent_event
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS consent_event (
    event_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id       UUID NOT NULL,
    viewer_id          UUID NOT NULL REFERENCES viewer(viewer_id) ON DELETE CASCADE,
    -- The privacy mode the viewer is consenting to or revoking.
    privacy_mode       TEXT NOT NULL
        CHECK (privacy_mode IN ('identified','pseudonymous','anon_consent','anon_no_track')),
    -- 'grant' or 'revoke'.
    action             TEXT NOT NULL CHECK (action IN ('grant','revoke')),
    source             TEXT NOT NULL,            -- 'banner','settings','api'
    policy_version     TEXT NOT NULL,
    user_agent         TEXT,
    ip_class           TEXT,                     -- 'eu','us','bd','sg','au','unknown'
    occurred_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS consent_event_workspace_ts_idx
    ON consent_event (workspace_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS consent_event_viewer_idx
    ON consent_event (viewer_id, occurred_at DESC);

-- ---------------------------------------------------------------------------
-- event_index (sparse pointer from event_id to ClickHouse)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_index (
    event_id           TEXT PRIMARY KEY,
    workspace_id       UUID NOT NULL,
    clickhouse_partition TEXT NOT NULL,          -- 'YYYYMM'
    clickhouse_offset  BIGINT NOT NULL,
    ingested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS event_index_workspace_partition_idx
    ON event_index (workspace_id, clickhouse_partition);

-- ---------------------------------------------------------------------------
-- session
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS session (
    session_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id       UUID NOT NULL,
    session_id_key     TEXT NOT NULL,
    viewer_id          UUID REFERENCES viewer(viewer_id) ON DELETE SET NULL,
    deck_id            UUID,
    started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_heartbeat_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at           TIMESTAMPTZ,
    -- 'active' | 'idle' | 'ended'
    state              TEXT NOT NULL DEFAULT 'active'
        CHECK (state IN ('active','idle','ended')),
    region_pinned      TEXT
        CHECK (region_pinned IS NULL OR region_pinned IN ('us','eu','bd','sg','au')),
    UNIQUE (workspace_id, session_id_key)
);

CREATE INDEX IF NOT EXISTS session_workspace_idx
    ON session (workspace_id);
CREATE INDEX IF NOT EXISTS session_state_idx
    ON session (state) WHERE state IN ('active','idle');
CREATE INDEX IF NOT EXISTS session_viewer_idx
    ON session (viewer_id);
CREATE INDEX IF NOT EXISTS session_started_idx
    ON session (workspace_id, started_at DESC);

-- ---------------------------------------------------------------------------
-- viewer_export_run / viewer_erase_run (GDPR audit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS viewer_export_run (
    run_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id       UUID NOT NULL,
    viewer_id          UUID NOT NULL REFERENCES viewer(viewer_id) ON DELETE CASCADE,
    requested_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at       TIMESTAMPTZ,
    -- 'queued' | 'running' | 'done' | 'failed'
    state              TEXT NOT NULL DEFAULT 'queued'
        CHECK (state IN ('queued','running','done','failed')),
    object_key         TEXT,
    error_message      TEXT
);

CREATE INDEX IF NOT EXISTS viewer_export_run_workspace_idx
    ON viewer_export_run (workspace_id);
CREATE INDEX IF NOT EXISTS viewer_export_run_state_idx
    ON viewer_export_run (state) WHERE state IN ('queued','running');

CREATE TABLE IF NOT EXISTS viewer_erase_run (
    run_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id       UUID NOT NULL,
    viewer_id          UUID NOT NULL REFERENCES viewer(viewer_id) ON DELETE CASCADE,
    requested_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at       TIMESTAMPTZ,
    state              TEXT NOT NULL DEFAULT 'queued'
        CHECK (state IN ('queued','running','done','failed')),
    clickhouse_job_id  TEXT,
    error_message      TEXT
);

CREATE INDEX IF NOT EXISTS viewer_erase_run_workspace_idx
    ON viewer_erase_run (workspace_id);
CREATE INDEX IF NOT EXISTS viewer_erase_run_state_idx
    ON viewer_erase_run (state) WHERE state IN ('queued','running');

-- ---------------------------------------------------------------------------
-- RLS for every table created above.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'viewer',
        'identity_link',
        'consent_event',
        'event_index',
        'session',
        'viewer_export_run',
        'viewer_erase_run'
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
