-- 0076_phase18_task_links.up.sql
-- Phase 18 W4: Task links — external task tracker sync (Asana, Jira, Linear).
--
-- Tables:
--   task_link — bidirectional sync link between an assignment and an external task.

BEGIN;

-- ---------------------------------------------------------------------------
-- task_link — bidirectional sync between a Domio assignment and an external task.
-- vendor: 'asana' | 'jira' | 'linear'
-- external_task_id / external_project_id: vendor-side identifiers.
-- field_map: declarative field mapping {status, priority, ...} as JSONB.
-- sync_mode: 'domio_wins' | 'task_wins' | 'last_write_wins'
-- last_synced_at: null means never synced.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS task_link (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    assignment_id        uuid NOT NULL,
    vendor               text NOT NULL
                         CHECK (vendor IN ('asana','jira','linear')),
    external_task_id     text NOT NULL,
    external_project_id  text NOT NULL,
    field_map            jsonb NOT NULL DEFAULT '{}'::jsonb,
    sync_mode            text NOT NULL DEFAULT 'last_write_wins'
                         CHECK (sync_mode IN ('domio_wins','task_wins','last_write_wins')),
    last_synced_at       timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid
);

CREATE INDEX IF NOT EXISTS task_link_assignment_idx ON task_link (assignment_id);
CREATE INDEX IF NOT EXISTS task_link_vendor_idx ON task_link (vendor);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'task_link'
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
