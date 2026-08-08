-- 0061_analytics_crm.up.sql
-- Phase 17 W7/W8: CRM sync + notifications.
--
-- crm_connection       — per-workspace OAuth connection to a CRM
--                        provider (HubSpot/Salesforce/etc.).
-- crm_sync_record      — one row per (viewer, event) that we tried
--                        to push to a CRM. Idempotency key is the
--                        (crm_connection_id, viewer_id, event_name,
--                        event_id) tuple, so retries don't double-
--                        insert.
-- crm_sync_field_map   — declarative mapping from AnalyticsEvent
--                        fields to CRM contact fields.
-- notification_rule    — workspace-scoped rule for the dispatcher
--                        (e.g. "MQL → notify Slack").
-- notification_audit   — append-only audit of every notification sent
--                        (used for daily-cap accounting + GDPR).
-- live_session_summary — per-session snapshot of attendance, last
--                        slide, dwell, and final engagement score.
--                        The /live dashboard tile reads this row.
-- deck_metric          — per-deck rollup mirror of ClickHouse
--                        deck_metric_5m; used by the dashboard for
--                        fast page loads without hitting CH.
-- slide_metric         — per-deck-slide rollup mirror of
--                        slide_metric_5m.

BEGIN;

CREATE TABLE IF NOT EXISTS crm_connection (
    connection_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         UUID NOT NULL,
    provider             TEXT NOT NULL
        CHECK (provider IN ('hubspot','salesforce','intercom','outreach','dynamics','pipedrive')),
    label                TEXT,
    -- OAuth refresh token (encrypted at rest by the application layer).
    access_token_cipher  TEXT NOT NULL,
    refresh_token_cipher TEXT,
    expires_at           TIMESTAMPTZ,
    rate_limit_per_sec   INTEGER NOT NULL DEFAULT 100,
    enabled              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, provider, label)
);

CREATE INDEX IF NOT EXISTS crm_connection_workspace_idx
    ON crm_connection (workspace_id) WHERE enabled = TRUE;

CREATE TABLE IF NOT EXISTS crm_sync_record (
    sync_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         UUID NOT NULL,
    connection_id        UUID NOT NULL REFERENCES crm_connection(connection_id) ON DELETE CASCADE,
    viewer_id_key        TEXT NOT NULL,
    event_id             TEXT NOT NULL,
    event_name           TEXT NOT NULL,
    -- 'success' | 'failed' | 'pending' | 'dead'
    state                TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN ('success','failed','pending','dead')),
    attempts             INTEGER NOT NULL DEFAULT 0,
    last_error           TEXT,
    synced_at            TIMESTAMPTZ,
    next_retry_at        TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Idempotency key = sha256(workspace_id | viewer_id_key | event_name | event_id)
    idempotency_key      TEXT NOT NULL,
    UNIQUE (connection_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS crm_sync_record_workspace_state_idx
    ON crm_sync_record (workspace_id, state);
CREATE INDEX IF NOT EXISTS crm_sync_record_next_retry_idx
    ON crm_sync_record (next_retry_at) WHERE state = 'pending';

CREATE TABLE IF NOT EXISTS crm_sync_field_map (
    map_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         UUID NOT NULL,
    connection_id        UUID NOT NULL REFERENCES crm_connection(connection_id) ON DELETE CASCADE,
    source_field         TEXT NOT NULL,        -- 'event_name' | 'viewer_id_key' | property name
    target_field         TEXT NOT NULL,        -- CRM contact field
    transform            TEXT,                 -- 'identity' | 'lower' | 'upper' | 'sha256' | ...
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (connection_id, source_field, target_field)
);

CREATE TABLE IF NOT EXISTS notification_rule (
    rule_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         UUID NOT NULL,
    name                 TEXT NOT NULL,
    -- The trigger condition, encoded as a JSON expression the
    -- dispatcher evaluates. e.g.:
    --   {"kind":"lead_score","gte":80,"source":"engagement_score"}
    condition_json       JSONB NOT NULL,
    -- 'slack' | 'teams' | 'email' | 'webhook' | 'mobile'
    channel              TEXT NOT NULL,
    -- Channel-specific receivers (channel_user_id, email, webhook_url).
    target_json          JSONB NOT NULL,
    daily_cap            INTEGER NOT NULL DEFAULT 5,
    enabled              BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notification_rule_workspace_idx
    ON notification_rule (workspace_id) WHERE enabled = TRUE;

CREATE TABLE IF NOT EXISTS notification_audit (
    audit_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         UUID NOT NULL,
    rule_id              UUID NOT NULL REFERENCES notification_rule(rule_id) ON DELETE CASCADE,
    viewer_id_key        TEXT,
    channel              TEXT NOT NULL,
    recipient            TEXT NOT NULL,
    payload_hash         TEXT NOT NULL,
    -- 'sent' | 'suppressed' | 'failed'
    state                TEXT NOT NULL
        CHECK (state IN ('sent','suppressed','failed')),
    sent_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    error_message        TEXT
);

CREATE INDEX IF NOT EXISTS notification_audit_workspace_ts_idx
    ON notification_audit (workspace_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS notification_audit_rule_idx
    ON notification_audit (rule_id, sent_at DESC);

CREATE TABLE IF NOT EXISTS live_session_summary (
    session_id           UUID PRIMARY KEY,
    workspace_id         UUID NOT NULL,
    live_session_id      TEXT NOT NULL,
    presenter_id         UUID,
    deck_id              UUID,
    started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at             TIMESTAMPTZ,
    attendee_count       INTEGER NOT NULL DEFAULT 0,
    peak_attendee_count  INTEGER NOT NULL DEFAULT 0,
    engagement_score     REAL,
    UNIQUE (workspace_id, live_session_id)
);

CREATE INDEX IF NOT EXISTS live_session_summary_workspace_idx
    ON live_session_summary (workspace_id, started_at DESC);

CREATE TABLE IF NOT EXISTS deck_metric (
    deck_id              UUID NOT NULL,
    workspace_id         UUID NOT NULL,
    bucket_ts_ms         BIGINT NOT NULL,      -- epoch ms
    session_count        INTEGER NOT NULL DEFAULT 0,
    viewer_count         INTEGER NOT NULL DEFAULT 0,
    total_events         INTEGER NOT NULL DEFAULT 0,
    avg_session_ms       REAL NOT NULL DEFAULT 0,
    completion_rate      REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (workspace_id, deck_id, bucket_ts_ms)
);

CREATE INDEX IF NOT EXISTS deck_metric_workspace_bucket_idx
    ON deck_metric (workspace_id, bucket_ts_ms DESC);

CREATE TABLE IF NOT EXISTS slide_metric (
    deck_id              UUID NOT NULL,
    workspace_id         UUID NOT NULL,
    slide_id             UUID NOT NULL,
    bucket_ts_ms         BIGINT NOT NULL,
    views                INTEGER NOT NULL DEFAULT 0,
    unique_viewers       INTEGER NOT NULL DEFAULT 0,
    avg_dwell_ms         REAL NOT NULL DEFAULT 0,
    bounce_rate          REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (workspace_id, deck_id, slide_id, bucket_ts_ms)
);

CREATE INDEX IF NOT EXISTS slide_metric_workspace_bucket_idx
    ON slide_metric (workspace_id, bucket_ts_ms DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'crm_connection',
        'crm_sync_record',
        'crm_sync_field_map',
        'notification_rule',
        'notification_audit',
        'live_session_summary',
        'deck_metric',
        'slide_metric'
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
