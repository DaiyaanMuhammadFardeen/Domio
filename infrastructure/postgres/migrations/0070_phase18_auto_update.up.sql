-- 0070_phase18_auto_update.up.sql
-- Phase 18 W3: Auto-update binding for library → consumer slide sync.
--
-- Tables:
--   auto_update_binding — links a consumer slide to a library entry for sync.

BEGIN;

-- ---------------------------------------------------------------------------
-- auto_update_binding — links a consumer slide to a library entry for sync.
-- mode: 'immediate' | 'scheduled' | 'manual' | 'frozen'
-- schedule: JSONB with cron expression or interval when mode='scheduled'
-- is_mandatory: if true, consumer cannot override the binding
-- pinned_version_id: optional FK to a specific library_version (null = latest)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auto_update_binding (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    consumer_deck_id     uuid NOT NULL,
    consumer_slide_id    uuid NOT NULL,
    library_entry_id     uuid NOT NULL,
    pinned_version_id    uuid,
    mode                 text NOT NULL DEFAULT 'manual'
                         CHECK (mode IN ('immediate','scheduled','manual','frozen')),
    schedule             jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_mandatory         boolean NOT NULL DEFAULT false,
    last_synced_at       timestamptz,
    last_sync_status     text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid
);

CREATE INDEX IF NOT EXISTS auto_update_binding_consumer_idx ON auto_update_binding (consumer_deck_id, consumer_slide_id);
CREATE INDEX IF NOT EXISTS auto_update_binding_entry_idx ON auto_update_binding (library_entry_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'auto_update_binding'
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
