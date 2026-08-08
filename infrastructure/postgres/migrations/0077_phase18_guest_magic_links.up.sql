-- 0077_phase18_guest_magic_links.up.sql
-- Phase 18 W5: Guest magic links — single-use, expiring access tokens for guests.
--
-- Tables:
--   guest_magic_link — one row per magic link minted for a guest_access.
--                      Single-use (consumed_at), resend invalidates prior
--                      open links (invalidated_at), server-enforced expiry
--                      (expires_at). token_hash = sha256 hex of the link token
--                      sent to the guest (never store the raw token).
-- ---------------------------------------------------------------------------

BEGIN;

CREATE TABLE IF NOT EXISTS guest_magic_link (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     uuid NOT NULL,
    guest_access_id  uuid NOT NULL REFERENCES guest_access(id) ON DELETE CASCADE,
    token_hash       text NOT NULL,
    expires_at       timestamptz NOT NULL,
    consumed_at      timestamptz,
    invalidated_at   timestamptz,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS guest_magic_link_access_idx ON guest_magic_link (guest_access_id);
CREATE INDEX IF NOT EXISTS guest_magic_link_token_idx ON guest_magic_link (token_hash);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'guest_magic_link'
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
