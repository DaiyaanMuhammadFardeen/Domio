-- 0074_phase18_meeting_integrations.up.sql
-- Phase 18 W4: Meeting integration connections (Zoom, Meet, Teams).
--
-- Tables:
--   meeting_integration — OAuth connection state per vendor per workspace.

BEGIN;

-- ---------------------------------------------------------------------------
-- meeting_integration — per-vendor OAuth connection for a workspace.
-- vendor: 'zoom' | 'meet' | 'teams'
-- auth: encrypted OAuth tokens (jsonb storage, no real encryption at DB layer)
-- status: 'disconnected' | 'connecting' | 'connected' | 'error'
-- UNIQUE(workspace_id, vendor) — one connection per vendor per workspace.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meeting_integration (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    vendor               text NOT NULL
                         CHECK (vendor IN ('zoom','meet','teams')),
    auth                 jsonb NOT NULL,
    status               text NOT NULL DEFAULT 'disconnected'
                         CHECK (status IN ('disconnected','connecting','connected','error')),
    connected_by         uuid NOT NULL,
    connected_at         timestamptz NOT NULL DEFAULT now(),
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    UNIQUE (workspace_id, vendor)
);

CREATE INDEX IF NOT EXISTS meeting_integration_workspace_idx ON meeting_integration (workspace_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'meeting_integration'
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
