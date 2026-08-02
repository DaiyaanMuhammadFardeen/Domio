-- Migration 0019: Phase 07 — brand kits, logos, palettes, fonts, imagery
-- rules, sub-brand inheritance, and archive trail.
--
-- Tables: brand_kit, brand_kit_logo, brand_kit_palette, brand_kit_font,
-- brand_kit_imagery_rule, brand_kit_sub_brand, brand_kit_archive.
-- All org-scoped through brand_kit.owner_org_id. Part of the brand-service
-- substrate (P07).

BEGIN;

-- ---------------------------------------------------------------------------
-- brand_kit — top-level brand kit metadata.
-- scope: org, workspace, team.
-- status: draft, published, archived.
-- extraction_attestation_id links to brand_extraction_job when kit was
-- generated from URL extraction.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_kit (
    kit_id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                     text NOT NULL,
    owner_org_id             text NOT NULL,
    scope                    text NOT NULL DEFAULT 'org'
                             CHECK (scope IN ('org', 'workspace', 'team')),
    status                   text NOT NULL DEFAULT 'draft'
                             CHECK (status IN ('draft', 'published', 'archived')),
    published_at             timestamptz,
    archived_at              timestamptz,
    signature                text,
    extraction_attestation_id uuid,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               text NOT NULL
);

CREATE INDEX IF NOT EXISTS brand_kit_org_status_idx
    ON brand_kit (owner_org_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- brand_kit_logo — logo variants per brand kit.
-- variant: light, dark, mono.
-- format: svg, png, webp.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_kit_logo (
    logo_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kit_id           uuid NOT NULL REFERENCES brand_kit (kit_id) ON DELETE CASCADE,
    variant          text NOT NULL CHECK (variant IN ('light', 'dark', 'mono')),
    size             text NOT NULL DEFAULT 'full',
    format           text NOT NULL DEFAULT 'svg'
                     CHECK (format IN ('svg', 'png', 'webp')),
    asset_url        text NOT NULL,
    content_hash     text NOT NULL,
    clear_space_px   integer NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_kit_logo_kit_idx
    ON brand_kit_logo (kit_id, variant);

-- ---------------------------------------------------------------------------
-- brand_kit_palette — named color palettes referencing design_token IDs.
-- cv_safe: whether the palette passes CVD simulation.
-- hue_spacing_deg: minimum hue spacing in OKLCH across the palette.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_kit_palette (
    palette_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kit_id           uuid NOT NULL REFERENCES brand_kit (kit_id) ON DELETE CASCADE,
    token_ids        uuid[] NOT NULL DEFAULT '{}',
    cv_safe          boolean NOT NULL DEFAULT true,
    hue_spacing_deg  numeric(5,2),
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_kit_palette_kit_idx
    ON brand_kit_palette (kit_id);

-- ---------------------------------------------------------------------------
-- brand_kit_font — font entries per brand kit, linking to font_asset.
-- glyph_coverage: per-Unicode-block coverage report (jsonb).
-- axes: variable-font axes (jsonb).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_kit_font (
    font_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kit_id           uuid NOT NULL REFERENCES brand_kit (kit_id) ON DELETE CASCADE,
    font_asset_id    uuid,
    license_status   text NOT NULL DEFAULT 'unknown'
                     CHECK (license_status IN ('permissive', 'restricted', 'unknown')),
    glyph_coverage   jsonb NOT NULL DEFAULT '{}'::jsonb,
    axes             jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_kit_font_kit_idx
    ON brand_kit_font (kit_id);

-- ---------------------------------------------------------------------------
-- brand_kit_imagery_rule — do/dont rules, min resolution, safe zone,
-- allowed sources per brand kit.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_kit_imagery_rule (
    rule_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kit_id             uuid NOT NULL REFERENCES brand_kit (kit_id) ON DELETE CASCADE,
    do_rules           jsonb NOT NULL DEFAULT '[]'::jsonb,
    dont_rules         jsonb NOT NULL DEFAULT '[]'::jsonb,
    min_resolution     integer NOT NULL DEFAULT 256,
    subject_safe_zone  jsonb,
    allowed_sources    jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_kit_imagery_rule_kit_idx
    ON brand_kit_imagery_rule (kit_id);

-- ---------------------------------------------------------------------------
-- brand_kit_sub_brand — parent/child inheritance edges.
-- inheritance_type: full (inherit all), partial (inherit subset).
-- Cycles are detected at the application layer.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_kit_sub_brand (
    parent_kit_id    uuid NOT NULL REFERENCES brand_kit (kit_id) ON DELETE CASCADE,
    child_kit_id     uuid NOT NULL REFERENCES brand_kit (kit_id) ON DELETE CASCADE,
    inheritance_type text NOT NULL DEFAULT 'full'
                     CHECK (inheritance_type IN ('full', 'partial')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (parent_kit_id, child_kit_id)
);

CREATE INDEX IF NOT EXISTS brand_kit_sub_brand_child_idx
    ON brand_kit_sub_brand (child_kit_id);

-- ---------------------------------------------------------------------------
-- brand_kit_archive — immutable archive trail when a kit is archived.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_kit_archive (
    kit_id       uuid NOT NULL REFERENCES brand_kit (kit_id) ON DELETE CASCADE,
    archived_at  timestamptz NOT NULL DEFAULT now(),
    reason       text NOT NULL DEFAULT '',
    PRIMARY KEY (kit_id, archived_at)
);

-- ---------------------------------------------------------------------------
-- Row-level security.
-- ---------------------------------------------------------------------------
ALTER TABLE brand_kit               ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_kit_logo          ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_kit_palette       ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_kit_font          ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_kit_imagery_rule  ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_kit_sub_brand     ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_kit_archive       ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- brand_kit: tenant isolation via owner_org_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'brand_kit_tenant_isolation'
    ) THEN
        CREATE POLICY brand_kit_tenant_isolation ON brand_kit
            USING (
                owner_org_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                owner_org_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    -- brand_kit_logo: tenant isolation via brand_kit.owner_org_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'brand_kit_logo_tenant_isolation'
    ) THEN
        CREATE POLICY brand_kit_logo_tenant_isolation ON brand_kit_logo
            USING (
                EXISTS (
                    SELECT 1 FROM brand_kit
                    WHERE brand_kit.kit_id = brand_kit_logo.kit_id
                      AND brand_kit.owner_org_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM brand_kit
                    WHERE brand_kit.kit_id = brand_kit_logo.kit_id
                      AND brand_kit.owner_org_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    -- brand_kit_palette: tenant isolation via brand_kit.owner_org_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'brand_kit_palette_tenant_isolation'
    ) THEN
        CREATE POLICY brand_kit_palette_tenant_isolation ON brand_kit_palette
            USING (
                EXISTS (
                    SELECT 1 FROM brand_kit
                    WHERE brand_kit.kit_id = brand_kit_palette.kit_id
                      AND brand_kit.owner_org_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM brand_kit
                    WHERE brand_kit.kit_id = brand_kit_palette.kit_id
                      AND brand_kit.owner_org_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    -- brand_kit_font: tenant isolation via brand_kit.owner_org_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'brand_kit_font_tenant_isolation'
    ) THEN
        CREATE POLICY brand_kit_font_tenant_isolation ON brand_kit_font
            USING (
                EXISTS (
                    SELECT 1 FROM brand_kit
                    WHERE brand_kit.kit_id = brand_kit_font.kit_id
                      AND brand_kit.owner_org_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM brand_kit
                    WHERE brand_kit.kit_id = brand_kit_font.kit_id
                      AND brand_kit.owner_org_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    -- brand_kit_imagery_rule: tenant isolation via brand_kit.owner_org_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'brand_kit_imagery_rule_tenant_isolation'
    ) THEN
        CREATE POLICY brand_kit_imagery_rule_tenant_isolation ON brand_kit_imagery_rule
            USING (
                EXISTS (
                    SELECT 1 FROM brand_kit
                    WHERE brand_kit.kit_id = brand_kit_imagery_rule.kit_id
                      AND brand_kit.owner_org_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM brand_kit
                    WHERE brand_kit.kit_id = brand_kit_imagery_rule.kit_id
                      AND brand_kit.owner_org_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    -- brand_kit_sub_brand: tenant isolation via parent_kit → brand_kit.owner_org_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'brand_kit_sub_brand_tenant_isolation'
    ) THEN
        CREATE POLICY brand_kit_sub_brand_tenant_isolation ON brand_kit_sub_brand
            USING (
                EXISTS (
                    SELECT 1 FROM brand_kit
                    WHERE brand_kit.kit_id = brand_kit_sub_brand.parent_kit_id
                      AND brand_kit.owner_org_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM brand_kit
                    WHERE brand_kit.kit_id = brand_kit_sub_brand.parent_kit_id
                      AND brand_kit.owner_org_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    -- brand_kit_archive: tenant isolation via brand_kit.owner_org_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'brand_kit_archive_tenant_isolation'
    ) THEN
        CREATE POLICY brand_kit_archive_tenant_isolation ON brand_kit_archive
            USING (
                EXISTS (
                    SELECT 1 FROM brand_kit
                    WHERE brand_kit.kit_id = brand_kit_archive.kit_id
                      AND brand_kit.owner_org_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM brand_kit
                    WHERE brand_kit.kit_id = brand_kit_archive.kit_id
                      AND brand_kit.owner_org_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;
END
$$;

COMMIT;
