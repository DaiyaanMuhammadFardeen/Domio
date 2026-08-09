-- 0091_phase19_partner_webhooks.up.sql
-- Phase 19 WS-MKT-5/8/9: Partner API clients + outbound webhook deliveries.
--
-- Tables:
--   partner_client     — OAuth 2.1 partner API consumers with scoped access.
--   webhook_delivery   — outbound webhook delivery log (idempotent, retryable).
--
-- RLS: Both tables workspace-scoped (tenant isolation via workspace_id).
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- partner_client — OAuth 2.1 partner API consumer credentials.
-- client_id:     opaque public identifier, unique across all workspaces.
-- client_secret_hash: SHA-256 hex of the secret; plaintext never stored.
-- scopes:        allowed API scopes (marketplace:read, marketplace:install,
--                marketplace:purchase).
-- tier:          rate-limit tier — pro (600 req/min), enterprise (6000 req/min).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partner_client (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id        uuid NOT NULL,
    name                text NOT NULL,
    client_id           text NOT NULL UNIQUE,
    client_secret_hash  text NOT NULL,
    scopes              text[] NOT NULL DEFAULT '{}',
    tier                text NOT NULL DEFAULT 'pro'
                        CHECK (tier IN ('pro', 'enterprise')),
    created_by          uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_client_workspace_idx
    ON partner_client (workspace_id);

-- ---------------------------------------------------------------------------
-- webhook_delivery — outbound webhook delivery log (seller/partner-facing).
-- event_type:    the event category (listing.published, order.created, etc.)
-- event_id:      source event unique id — used for idempotent dedup.
-- target_url:    the subscribed webhook endpoint.
-- signature:     HMAC-SHA256 hex over payload (P20 §3.10 co-signing).
-- status:        pending → sent | failed; drives retry polling.
-- attempts:      monotonic counter; max retries enforced at app layer.
-- next_retry_at: NULL when terminal (sent); set by retry scheduler on fail.
-- UNIQUE(event_id, target_url): at-least-once delivery with idempotent dedup.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_delivery (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    uuid NOT NULL,
    event_type      text NOT NULL,
    event_id        text NOT NULL,
    payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
    signature       text NOT NULL,
    target_url      text NOT NULL,
    status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'failed')),
    attempts        int NOT NULL DEFAULT 0,
    last_error      text,
    next_retry_at   timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    delivered_at    timestamptz,
    UNIQUE (event_id, target_url)
);

CREATE INDEX IF NOT EXISTS webhook_delivery_status_idx
    ON webhook_delivery (status, next_retry_at);
CREATE INDEX IF NOT EXISTS webhook_delivery_event_idx
    ON webhook_delivery (event_id);

-- ---------------------------------------------------------------------------
-- RLS — workspace-scoped tenant isolation
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'partner_client',
        'webhook_delivery'
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
