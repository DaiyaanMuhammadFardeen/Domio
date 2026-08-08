-- 0068_phase18_notifications_guests.up.sql
-- Phase 18 W1: Notification subscriptions + guest access.
--
-- Tables:
--   notification_subscription — per-resource notification channel + event filter.
--   guest_access              — scoped guest invitation with capabilities.

BEGIN;

-- ---------------------------------------------------------------------------
-- notification_subscription — per-resource notification channel + event filter.
-- resource_type/resource_id: the resource this subscription applies to.
-- event_types: array of event types the user wants to be notified about.
-- channels: array from ['in_app','email','slack','teams']
-- quiet_hours: JSONB with start/end times.
-- digest_mode: 'realtime' | 'hourly' | 'daily'
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_subscription (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    user_id              uuid NOT NULL,
    resource_type        text NOT NULL,
    resource_id          uuid NOT NULL,
    event_types          text[] NOT NULL DEFAULT '{}',
    channels             text[] NOT NULL DEFAULT '{in_app}'
                         CHECK (channels <@ ARRAY['in_app','email','slack','teams']::text[]),
    quiet_hours          jsonb,
    digest_mode          text NOT NULL DEFAULT 'realtime'
                         CHECK (digest_mode IN ('realtime','hourly','daily')),
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_subscription_workspace_idx ON notification_subscription (workspace_id);
CREATE INDEX IF NOT EXISTS notification_subscription_user_idx ON notification_subscription (user_id);
CREATE INDEX IF NOT EXISTS notification_subscription_resource_idx ON notification_subscription (resource_type, resource_id);

-- ---------------------------------------------------------------------------
-- guest_access — scoped guest invitation with capabilities.
-- scope_type: 'folder' | 'project' | 'deck'
-- capabilities: array from ['comment','suggest','view']
-- expires_at: required (NOT NULL) — guest access must have a finite window.
-- revoked_at: set when the invitation is revoked.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS guest_access (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    inviter_id           uuid NOT NULL,
    guest_email          text NOT NULL,
    guest_user_id        uuid,
    scope_type           text NOT NULL
                         CHECK (scope_type IN ('folder','project','deck')),
    scope_id             uuid NOT NULL,
    capabilities         text[] NOT NULL DEFAULT '{comment,suggest,view}',
    expires_at           timestamptz NOT NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),
    revoked_at           timestamptz
);

CREATE INDEX IF NOT EXISTS guest_access_workspace_idx ON guest_access (workspace_id);
CREATE INDEX IF NOT EXISTS guest_access_inviter_idx ON guest_access (inviter_id);
CREATE INDEX IF NOT EXISTS guest_access_email_idx ON guest_access (guest_email);
CREATE INDEX IF NOT EXISTS guest_access_scope_idx ON guest_access (scope_type, scope_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'notification_subscription',
        'guest_access'
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
