-- Migration 0011: Phase 06 — component catalog.
--
-- Tables: component_packages (content-addressed, versioned), component_variants
-- (denormalized for marketplace filtering), smart_component_prop (per-prop
-- JSON Schema fragment + control hint). The catalog is globally readable;
-- writes go through the privileged/registry path (bypass_rls).

BEGIN;

CREATE TABLE IF NOT EXISTS component_packages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    catalog_id      text NOT NULL,
    version         text NOT NULL,
    kind            text NOT NULL DEFAULT 'component'
                    CHECK (kind IN ('component', 'icon', 'sticker', 'animation')),
    name            text NOT NULL,
    description     text NOT NULL DEFAULT '',
    category        text,
    author          text,
    license_id      text,
    props_schema    jsonb NOT NULL DEFAULT '{}'::jsonb,
    variants        jsonb NOT NULL DEFAULT '[]'::jsonb,
    files           jsonb NOT NULL DEFAULT '{}'::jsonb,
    package_hash    text NOT NULL,
    signing_key_id  text,
    signature       text,
    deprecation     jsonb,
    search_tsv      tsvector,
    size_budget_bytes bigint NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (catalog_id, version)
);

CREATE INDEX IF NOT EXISTS component_packages_catalog_id_idx
    ON component_packages (catalog_id, created_at DESC);

CREATE INDEX IF NOT EXISTS component_packages_kind_idx
    ON component_packages (kind);

CREATE INDEX IF NOT EXISTS component_packages_search_tsv_idx
    ON component_packages USING gin (search_tsv);

CREATE TABLE IF NOT EXISTS component_variants (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    component_id    uuid NOT NULL REFERENCES component_packages (id) ON DELETE CASCADE,
    variant_id      text NOT NULL,
    label           text NOT NULL,
    tokens          jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (component_id, variant_id)
);

CREATE TABLE IF NOT EXISTS smart_component_prop (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    component_id    uuid NOT NULL REFERENCES component_packages (id) ON DELETE CASCADE,
    prop_key        text NOT NULL,
    prop_schema     jsonb NOT NULL,
    control_hint    text,
    required        boolean NOT NULL DEFAULT false,
    default_value   jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (component_id, prop_key)
);

ALTER TABLE component_packages  ENABLE ROW LEVEL SECURITY;
ALTER TABLE component_variants  ENABLE ROW LEVEL SECURITY;
ALTER TABLE smart_component_prop ENABLE ROW LEVEL SECURITY;

COMMIT;
