-- Migration 0003: deck schema & scene-graph foundation.
-- Implements Phase 02 of docs/development_phases/phase-02-deck-schema-scene-graph.md.
-- Creates: tenants, workspaces, decks, deck_versions, slides, elements,
-- element_overrides, deck_schemas, component_instances, token_sets, themes,
-- brand_kits. Plus indexes (WS-C.2) and RLS policies (WS-C.3).

BEGIN;

-- ---------------------------------------------------------------------------
-- Tenants + workspaces (P02 depends on the Phase 01 tenant/workspace skeleton,
-- but the skeleton is owned by the auth service. We declare them here so the
-- migration is self-contained for fresh databases and for tests).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
    tenant_id    text PRIMARY KEY,
    display_name text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
    workspace_id text PRIMARY KEY,
    tenant_id    text NOT NULL REFERENCES tenants(tenant_id) ON DELETE CASCADE,
    name         text NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspaces_tenant_idx ON workspaces (tenant_id);

-- ---------------------------------------------------------------------------
-- Decks — top-level container.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS decks (
    id                text PRIMARY KEY,
    workspace_id      text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    project_id        text,
    tenant_id         text NOT NULL,
    title             text NOT NULL,
    slug              text,
    schema_version    text NOT NULL,
    current_revision  integer NOT NULL DEFAULT 0,
    branch            text NOT NULL DEFAULT 'main',
    thumbnail_url     text,
    settings          jsonb NOT NULL DEFAULT '{}'::jsonb,
    brand_kit_id      text,
    legal_hold_id     text,
    owner_id          text NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    deleted_at        timestamptz
);

CREATE INDEX IF NOT EXISTS decks_workspace_updated_idx
    ON decks (workspace_id, updated_at DESC) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- deck_versions — immutable append-only history.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deck_versions (
    deck_id          text NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    revision         integer NOT NULL,
    parent_revision  integer,
    schema_version   text NOT NULL,
    change_summary   text,
    author_id        text NOT NULL,
    crdt_log_id      text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (deck_id, revision)
);

-- ---------------------------------------------------------------------------
-- deck_schemas — immutable canonical JSONB per revision.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deck_schemas (
    deck_id      text NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    revision     integer NOT NULL,
    schema       jsonb NOT NULL,
    checksum     text NOT NULL,
    byte_size    integer NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (deck_id, revision)
);

-- ---------------------------------------------------------------------------
-- Slides.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS slides (
    id              text PRIMARY KEY,
    deck_id         text NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    position        integer NOT NULL,
    schema_version  text NOT NULL,
    title           text,
    thumbnail_url   text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (deck_id, position)
);

-- ---------------------------------------------------------------------------
-- Elements — scene-graph nodes per slide.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS elements (
    id                    text PRIMARY KEY,
    slide_id              text NOT NULL REFERENCES slides(id) ON DELETE CASCADE,
    deck_id               text NOT NULL,
    semantic_id           text NOT NULL,
    type                  text NOT NULL,
    parent_id             text REFERENCES elements(id) ON DELETE SET NULL,
    z                     integer NOT NULL DEFAULT 0,
    transform             jsonb NOT NULL DEFAULT '{}'::jsonb,
    props                 jsonb NOT NULL DEFAULT '{}'::jsonb,
    binding               jsonb,
    component_instance_id text,
    locked_by             text,
    locked                boolean NOT NULL DEFAULT false,
    hidden                boolean NOT NULL DEFAULT false,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    UNIQUE (slide_id, semantic_id)
);

CREATE INDEX IF NOT EXISTS elements_deck_idx ON elements (deck_id);
CREATE INDEX IF NOT EXISTS elements_parent_idx ON elements (parent_id);
CREATE INDEX IF NOT EXISTS elements_type_idx ON elements (type);
CREATE INDEX IF NOT EXISTS elements_props_gin
    ON elements USING GIN (props jsonb_path_ops);
CREATE INDEX IF NOT EXISTS elements_transform_gin
    ON elements USING GIN (transform jsonb_path_ops)
    WHERE transform <> '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- element_overrides — per-instance prop overrides for component instances.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS element_overrides (
    element_id  text NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    key         text NOT NULL,
    value       jsonb NOT NULL,
    PRIMARY KEY (element_id, key)
);

-- ---------------------------------------------------------------------------
-- component_instances — links an element to its master component.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS component_instances (
    id            text PRIMARY KEY,
    component_id  text NOT NULL,
    deck_id       text NOT NULL,
    element_id    text NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    overrides     jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS component_instances_deck_idx
    ON component_instances (deck_id);

-- ---------------------------------------------------------------------------
-- token_sets / themes / brand_kits — schemas seeded by P07, tables defined here.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS token_sets (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    name         text NOT NULL,
    tokens       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS themes (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    name         text NOT NULL,
    token_set_id text REFERENCES token_sets(id) ON DELETE SET NULL,
    styles       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brand_kits (
    id           text PRIMARY KEY,
    workspace_id text NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
    name         text NOT NULL,
    theme_id     text REFERENCES themes(id) ON DELETE SET NULL,
    logo_url     text,
    palette      jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Row-level security (RLS) policies. The application sets
-- `app.tenant_id` per request via `SET LOCAL app.tenant_id = '...';`.
-- Privileged roles (e.g. `domio_migrator`, used by this file) bypass RLS.
-- ---------------------------------------------------------------------------
ALTER TABLE decks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE deck_versions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE deck_schemas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE slides              ENABLE ROW LEVEL SECURITY;
ALTER TABLE elements            ENABLE ROW LEVEL SECURITY;
ALTER TABLE element_overrides   ENABLE ROW LEVEL SECURITY;
ALTER TABLE component_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_sets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE themes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_kits          ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE polname = 'decks_tenant_isolation'
    ) THEN
        CREATE POLICY decks_tenant_isolation ON decks
            USING (
                tenant_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                tenant_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE polname = 'slides_tenant_isolation'
    ) THEN
        CREATE POLICY slides_tenant_isolation ON slides
            USING (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = slides.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = slides.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE polname = 'elements_tenant_isolation'
    ) THEN
        CREATE POLICY elements_tenant_isolation ON elements
            USING (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = elements.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = elements.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE polname = 'element_overrides_tenant_isolation'
    ) THEN
        CREATE POLICY element_overrides_tenant_isolation ON element_overrides
            USING (
                EXISTS (
                    SELECT 1 FROM elements e
                    JOIN decks d ON d.id = e.deck_id
                    WHERE e.id = element_overrides.element_id
                      AND d.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM elements e
                    JOIN decks d ON d.id = e.deck_id
                    WHERE e.id = element_overrides.element_id
                      AND d.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE polname = 'deck_schemas_tenant_isolation'
    ) THEN
        CREATE POLICY deck_schemas_tenant_isolation ON deck_schemas
            USING (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = deck_schemas.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = deck_schemas.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE polname = 'component_instances_tenant_isolation'
    ) THEN
        CREATE POLICY component_instances_tenant_isolation ON component_instances
            USING (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = component_instances.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = component_instances.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE polname = 'token_sets_tenant_isolation'
    ) THEN
        CREATE POLICY token_sets_tenant_isolation ON token_sets
            USING (
                EXISTS (
                    SELECT 1 FROM workspaces
                    WHERE workspaces.workspace_id = token_sets.workspace_id
                      AND workspaces.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM workspaces
                    WHERE workspaces.workspace_id = token_sets.workspace_id
                      AND workspaces.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE polname = 'themes_tenant_isolation'
    ) THEN
        CREATE POLICY themes_tenant_isolation ON themes
            USING (
                EXISTS (
                    SELECT 1 FROM workspaces
                    WHERE workspaces.workspace_id = themes.workspace_id
                      AND workspaces.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM workspaces
                    WHERE workspaces.workspace_id = themes.workspace_id
                      AND workspaces.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE polname = 'brand_kits_tenant_isolation'
    ) THEN
        CREATE POLICY brand_kits_tenant_isolation ON brand_kits
            USING (
                EXISTS (
                    SELECT 1 FROM workspaces
                    WHERE workspaces.workspace_id = brand_kits.workspace_id
                      AND workspaces.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM workspaces
                    WHERE workspaces.workspace_id = brand_kits.workspace_id
                      AND workspaces.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE polname = 'deck_versions_tenant_isolation'
    ) THEN
        CREATE POLICY deck_versions_tenant_isolation ON deck_versions
            USING (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = deck_versions.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM decks
                    WHERE decks.id = deck_versions.deck_id
                      AND decks.tenant_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;
END
$$;

-- Bootstrap a demo tenant + workspace so the example fixture can be loaded
-- without needing the auth service.
INSERT INTO tenants (tenant_id, display_name)
VALUES ('tenant-demo', 'Demo tenant')
ON CONFLICT (tenant_id) DO NOTHING;

INSERT INTO workspaces (workspace_id, tenant_id, name)
VALUES ('01H0EXAMPLE0WORKSPACEDEM01', 'tenant-demo', 'Demo workspace')
ON CONFLICT (workspace_id) DO NOTHING;

COMMIT;