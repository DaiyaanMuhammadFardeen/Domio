-- 0064_phase18_workspace_permissions.up.sql
-- Phase 18 W1: Workspace membership + RBAC permission grants.
--
-- Tables:
--   workspace            — top-level tenant container. workspace_id IS the row's own id.
--   workspace_member     — many-to-many user ↔ workspace with role + temporal membership.
--   group_member         — join table for group ↔ user (no tenant column).
--   permission_grant     — fine-grained RBAC grant with deny-first + temporal.

BEGIN;

-- ---------------------------------------------------------------------------
-- workspace — top-level tenant container.
-- For the workspace table itself, the workspace_id column IS the row's own id.
-- Both columns are kept per universal convention.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    name                 text NOT NULL,
    slug                 text NOT NULL UNIQUE,
    owner_id             uuid NOT NULL,
    settings             jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid
);

-- workspace_id = id for workspace rows (self-referential).
-- The application layer sets workspace_id = id on insert.

CREATE INDEX IF NOT EXISTS workspace_slug_idx ON workspace (slug);
CREATE INDEX IF NOT EXISTS workspace_owner_idx ON workspace (owner_id);

-- ---------------------------------------------------------------------------
-- workspace_member — many-to-many user ↔ workspace.
-- role: 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer'
-- capabilities: array of granular overrides (e.g. 'export', 'share').
-- effective_from/effective_to: temporal membership window.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workspace_member (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    user_id              uuid NOT NULL,
    role                 text NOT NULL
                         CHECK (role IN ('owner','admin','editor','commenter','viewer')),
    capabilities         text[] NOT NULL DEFAULT '{}',
    effective_from       timestamptz NOT NULL DEFAULT now(),
    effective_to         timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid,
    UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS workspace_member_workspace_idx ON workspace_member (workspace_id);
CREATE INDEX IF NOT EXISTS workspace_member_user_idx ON workspace_member (user_id);

-- ---------------------------------------------------------------------------
-- group_member — join table for group ↔ user.
-- This is a pure join table with no tenant column; enforcement via workspace tables.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_member (
    group_id             uuid NOT NULL,
    user_id              uuid NOT NULL,
    PRIMARY KEY (group_id, user_id)
);

-- ---------------------------------------------------------------------------
-- permission_grant — fine-grained RBAC grant with deny-first + temporal.
-- resource_type: 'workspace' | 'folder' | 'project' | 'deck' | 'slide'
-- principal_type: 'user' | 'group'
-- capabilities: array of granular capabilities.
-- is_deny: when true, this is a deny grant (deny-first evaluation).
-- effective_from/effective_to: temporal grant window.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS permission_grant (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         uuid NOT NULL,
    resource_type        text NOT NULL
                         CHECK (resource_type IN ('workspace','folder','project','deck','slide')),
    resource_id          uuid NOT NULL,
    principal_id         uuid NOT NULL,
    principal_type       text NOT NULL
                         CHECK (principal_type IN ('user','group')),
    capabilities         text[] NOT NULL,
    is_deny              boolean NOT NULL DEFAULT false,
    effective_from       timestamptz NOT NULL DEFAULT now(),
    effective_to         timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid,
    updated_by           uuid
);

CREATE INDEX IF NOT EXISTS permission_grant_workspace_idx ON permission_grant (workspace_id);
CREATE INDEX IF NOT EXISTS permission_grant_resource_idx ON permission_grant (resource_type, resource_id);
CREATE INDEX IF NOT EXISTS permission_grant_principal_idx ON permission_grant (principal_type, principal_id);

-- ---------------------------------------------------------------------------
-- RLS (group_member excluded — no workspace_id column).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'workspace',
        'workspace_member',
        'permission_grant'
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
