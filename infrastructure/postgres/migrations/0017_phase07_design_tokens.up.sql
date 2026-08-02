-- Migration 0017: Phase 07 — design-token registry + alias edges.
--
-- Tables: design_token (typed token registry across 8 groups),
-- token_alias (alias resolution edges with cycle detection).
-- Tokens are org-scoped; alias edges share the same org scope.
-- Part of the theming / brand / design-token substrate (P07).

BEGIN;

-- ---------------------------------------------------------------------------
-- design_token — typed token registry.
-- Groups: color, dimension, typography, shadow, motion, content, border.
-- Values are stored as jsonb to accommodate per-type shapes (hex, OKLCH,
-- font stacks, shadow definitions, etc.).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS design_token (
    token_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      text NOT NULL,
    group_name  text NOT NULL
                CHECK (group_name IN (
                    'color', 'dimension', 'typography',
                    'shadow', 'motion', 'content', 'border'
                )),
    name        text NOT NULL,
    type        text NOT NULL,
    value       jsonb NOT NULL,
    aliases     text[] NOT NULL DEFAULT '{}',
    description text NOT NULL DEFAULT '',
    tags        text[] NOT NULL DEFAULT '{}',
    deprecated  boolean NOT NULL DEFAULT false,
    roles       text[] NOT NULL DEFAULT '{}',
    created_by  text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, group_name, name)
);

CREATE INDEX IF NOT EXISTS design_token_org_group_idx
    ON design_token (org_id, group_name, created_at DESC);

CREATE INDEX IF NOT EXISTS design_token_tags_idx
    ON design_token USING gin (tags);

CREATE INDEX IF NOT EXISTS design_token_roles_idx
    ON design_token USING gin (roles);

-- ---------------------------------------------------------------------------
-- token_alias — directed alias edges (alias_token_id → target_token_id).
-- Cycle detection is enforced at the application layer; the table stores
-- the graph edges.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS token_alias (
    alias_token_id   uuid NOT NULL REFERENCES design_token (token_id) ON DELETE CASCADE,
    target_token_id  uuid NOT NULL REFERENCES design_token (token_id) ON DELETE CASCADE,
    org_id           text NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (alias_token_id, target_token_id)
);

CREATE INDEX IF NOT EXISTS token_alias_target_idx
    ON token_alias (target_token_id);

-- ---------------------------------------------------------------------------
-- Row-level security.
-- ---------------------------------------------------------------------------
ALTER TABLE design_token ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_alias  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- design_token: tenant isolation via org_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'design_token_tenant_isolation'
    ) THEN
        CREATE POLICY design_token_tenant_isolation ON design_token
            USING (
                org_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                org_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    -- token_alias: tenant isolation via org_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'token_alias_tenant_isolation'
    ) THEN
        CREATE POLICY token_alias_tenant_isolation ON token_alias
            USING (
                org_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                org_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;
END
$$;

COMMIT;
