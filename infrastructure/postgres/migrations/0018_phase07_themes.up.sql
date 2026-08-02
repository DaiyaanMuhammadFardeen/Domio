-- Migration 0018: Phase 07 — theme model, versions, overrides, application events.
--
-- Tables: theme (metadata), theme_version (immutable snapshots),
-- theme_override (per-scope partial overrides), theme_application_event
-- (apply telemetry). All org-scoped. Part of the theming substrate (P07).

BEGIN;

-- ---------------------------------------------------------------------------
-- theme — theme metadata and configuration.
-- kind: built-in, marketplace, agency, user.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS theme (
    theme_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id            text NOT NULL,
    name              text NOT NULL,
    kind              text NOT NULL DEFAULT 'user'
                      CHECK (kind IN ('built-in', 'marketplace', 'agency', 'user')),
    parent_theme_id   uuid REFERENCES theme (theme_id) ON DELETE SET NULL,
    brand_context_id  uuid,
    created_by        text NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    signature         text
);

CREATE INDEX IF NOT EXISTS theme_org_kind_idx
    ON theme (org_id, kind, created_at DESC);

CREATE INDEX IF NOT EXISTS theme_parent_idx
    ON theme (parent_theme_id);

-- ---------------------------------------------------------------------------
-- theme_version — immutable snapshots of resolved token values.
-- Each publish creates a new version; existing versions are never mutated.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS theme_version (
    theme_id       uuid NOT NULL REFERENCES theme (theme_id) ON DELETE CASCADE,
    version        integer NOT NULL,
    tokens_resolved jsonb NOT NULL,
    signature      text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (theme_id, version)
);

-- ---------------------------------------------------------------------------
-- theme_override — per-scope partial token overrides.
-- scope: slide, slide-range, section, auto-layout-child-set, state-conditional.
-- state-conditional overrides carry a condition_expr (variable/scenario AST).
-- deck_id stores the owning deck for application-layer lookups; org_id
-- enables direct tenant isolation without cross-table RLS joins.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS theme_override (
    override_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         text NOT NULL,
    deck_id        text NOT NULL,
    scope          text NOT NULL
                   CHECK (scope IN (
                       'slide', 'slide-range', 'section',
                       'auto-layout-child-set', 'state-conditional'
                   )),
    scope_id       text NOT NULL,
    tokens_partial jsonb NOT NULL DEFAULT '{}'::jsonb,
    condition_expr jsonb,
    created_by     text NOT NULL,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS theme_override_org_deck_idx
    ON theme_override (org_id, deck_id, scope, scope_id);

-- ---------------------------------------------------------------------------
-- theme_application_event — append-only telemetry for theme apply operations.
-- Records the diff between from/to themes, latency, and actor.
-- org_id enables direct tenant isolation.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS theme_application_event (
    event_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id              text NOT NULL,
    deck_id             text NOT NULL,
    from_theme_id       uuid,
    to_theme_id         uuid,
    tokens_changed_count integer NOT NULL DEFAULT 0,
    latency_ms          integer,
    actor_id            text NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS theme_application_event_org_deck_idx
    ON theme_application_event (org_id, deck_id, created_at DESC);

CREATE INDEX IF NOT EXISTS theme_application_event_actor_idx
    ON theme_application_event (actor_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Row-level security.
-- ---------------------------------------------------------------------------
ALTER TABLE theme                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_version            ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_override           ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_application_event  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- theme: tenant isolation via org_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'theme_tenant_isolation'
    ) THEN
        CREATE POLICY theme_tenant_isolation ON theme
            USING (
                org_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                org_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    -- theme_version: tenant isolation via theme.org_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'theme_version_tenant_isolation'
    ) THEN
        CREATE POLICY theme_version_tenant_isolation ON theme_version
            USING (
                EXISTS (
                    SELECT 1 FROM theme
                    WHERE theme.theme_id = theme_version.theme_id
                      AND theme.org_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM theme
                    WHERE theme.theme_id = theme_version.theme_id
                      AND theme.org_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    -- theme_override: tenant isolation via org_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'theme_override_tenant_isolation'
    ) THEN
        CREATE POLICY theme_override_tenant_isolation ON theme_override
            USING (
                org_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                org_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    -- theme_application_event: tenant isolation via org_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'theme_application_event_tenant_isolation'
    ) THEN
        CREATE POLICY theme_application_event_tenant_isolation ON theme_application_event
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
