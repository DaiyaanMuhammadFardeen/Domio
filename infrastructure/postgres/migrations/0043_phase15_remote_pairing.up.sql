-- 0043_phase15_remote_pairing.up.sql
-- Phase 15 W6: Phone remote pairing — short-lived signed tokens, 60s rotation,
-- WebRTC data channels and WebSocket fallback.
--
-- Tables:
--   remote_pairing — one row per paired phone device. token_hash is the SHA-256
--                    of the active signed token; rotated every 60 s. Revoked
--                    tokens disconnect within 1 s via the realtime gateway.

BEGIN;

CREATE TABLE IF NOT EXISTS remote_pairing (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id          uuid NOT NULL,
    presenter_session_id  uuid NOT NULL REFERENCES presenter_session (id) ON DELETE CASCADE,
    device_id             text NOT NULL,
    device_name           text,
    platform              text
                          CHECK (platform IS NULL OR platform IN ('ios','android','web','desktop')),
    token_hash            bytea NOT NULL,
    token_issued_at       timestamptz NOT NULL DEFAULT now(),
    token_expires_at      timestamptz NOT NULL,
    capabilities          jsonb NOT NULL DEFAULT '["advance","retreat","jump","laser","notes","timer","parking_lot"]'::jsonb,
    status                text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','revoked','expired','disconnected')),
    last_seen_at          timestamptz,
    revoked_at            timestamptz,
    revoked_by            uuid,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid,
    updated_by            uuid,
    ai_run_id             uuid,
    agent_session_id      uuid,
    UNIQUE (presenter_session_id, device_id)
);

CREATE INDEX IF NOT EXISTS remote_pairing_session_status_idx
    ON remote_pairing (presenter_session_id, status);
CREATE INDEX IF NOT EXISTS remote_pairing_token_expiry_idx
    ON remote_pairing (token_expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS remote_pairing_workspace_idx
    ON remote_pairing (workspace_id);

DO $$
DECLARE
    t text := 'remote_pairing';
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