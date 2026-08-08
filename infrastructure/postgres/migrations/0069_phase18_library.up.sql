-- 0069_phase18_library.up.sql
-- Phase 18 W3: Slide library entry + version tables.
--
-- Tables:
--   slide_library_entry — reusable slide templates with scope, approval, status lifecycle.
--   library_version     — immutable snapshots of a library entry.

BEGIN;

-- ---------------------------------------------------------------------------
-- slide_library_entry — reusable slide templates with scope, approval, status lifecycle.
-- scope: 'workspace' | 'org' | 'team'
-- status: 'draft' | 'pending' | 'approved' | 'retired'
-- version_id: FK to the current version
-- superseded_by: FK to the entry that replaced this one (set on retire)
-- approval_chain: JSONB defining approval lanes/roles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS slide_library_entry (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    scope                text NOT NULL
                         CHECK (scope IN ('workspace','org','team')),
    team_id              uuid,
    title                text NOT NULL,
    description          text,
    tags                 text[] NOT NULL DEFAULT '{}',
    owner_id             uuid NOT NULL,
    approval_chain       jsonb NOT NULL DEFAULT '{}'::jsonb,
    status               text NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft','pending','approved','retired')),
    version_id           uuid NOT NULL,
    superseded_by        uuid,
    last_reviewed_at     timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid
);

CREATE INDEX IF NOT EXISTS library_entry_workspace_idx ON slide_library_entry (workspace_id);
CREATE INDEX IF NOT EXISTS library_entry_status_idx ON slide_library_entry (status);
CREATE INDEX IF NOT EXISTS library_entry_superseded_idx ON slide_library_entry (superseded_by);

-- ---------------------------------------------------------------------------
-- library_version — immutable snapshots of a library entry.
-- UNIQUE(entry_id, version_num)
-- slide_snapshot: JSONB containing the full slide structure.
-- data_bindings: JSONB array of data-binding descriptors.
-- brand_locked: whether brand tokens are locked for this version.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS library_version (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    entry_id             uuid NOT NULL,
    version_num          int NOT NULL,
    slide_snapshot       jsonb NOT NULL,
    data_bindings        jsonb NOT NULL DEFAULT '[]'::jsonb,
    brand_locked         boolean NOT NULL DEFAULT false,
    created_by           uuid NOT NULL,
    created_at           timestamptz NOT NULL DEFAULT now(),

    UNIQUE (entry_id, version_num)
);

CREATE INDEX IF NOT EXISTS library_version_entry_idx ON library_version (entry_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'slide_library_entry',
        'library_version'
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
