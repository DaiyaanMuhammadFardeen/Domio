-- Migration 0020: Phase 07 — brand contexts, extraction jobs, font assets,
-- and append-only brand audit trail.
--
-- Tables: brand_context (multi-brand per workspace), brand_extraction_job
-- (URL extraction telemetry), font_asset (uploaded font storage + licensing),
-- audit_brand_event (append-only audit log for brand mutations).
--
-- audit_brand_event uses separate SELECT/INSERT policies (no UPDATE/DELETE
-- policies) to enforce append-only semantics at the RLS level. Non-admin
-- roles can only INSERT and SELECT; UPDATE and DELETE are denied by RLS
-- because no policy covers those operations. The bypass_rls path allows
-- the privileged admin role to read/write, but emergency mutation should
-- go through a dedicated migration with explicit audit entry.

BEGIN;

-- ---------------------------------------------------------------------------
-- brand_context — multi-brand contexts per workspace/workspace.
-- An agency workspace hosts N brand contexts; each deck references one
-- "default" context. Archived contexts are hidden from pickers but
-- still resolvable from existing decks.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_context (
    context_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         text NOT NULL,
    name           text NOT NULL,
    active_kit_id  uuid REFERENCES brand_kit (kit_id) ON DELETE SET NULL,
    archived_at    timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    created_by     text NOT NULL
);

CREATE INDEX IF NOT EXISTS brand_context_org_idx
    ON brand_context (org_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- brand_extraction_job — URL extraction pipeline telemetry.
-- status: pending, fetching, extracting, clustering, packaging,
-- completed, failed.
-- attribution: { sourceUrl, fetchedAt, contentHash, robotsHonored,
-- licenseDetected?, userAgent } — immutable, non-repudiable.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_extraction_job (
    job_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id             text NOT NULL,
    url                text NOT NULL,
    status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN (
                           'pending', 'fetching', 'extracting',
                           'clustering', 'packaging',
                           'completed', 'failed'
                       )),
    stages             jsonb NOT NULL DEFAULT '[]'::jsonb,
    attribution        jsonb NOT NULL DEFAULT '{}'::jsonb,
    confidence_scores  jsonb NOT NULL DEFAULT '{}'::jsonb,
    result             jsonb,
    error_code         text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    completed_at       timestamptz
);

CREATE INDEX IF NOT EXISTS brand_extraction_job_org_status_idx
    ON brand_extraction_job (org_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS brand_extraction_job_url_idx
    ON brand_extraction_job (url, created_at DESC);

-- ---------------------------------------------------------------------------
-- font_asset — uploaded font file metadata, licensing, and coverage.
-- format: woff2, woff, otf, ttf, ttc.
-- license_status: permissive, restricted, unknown.
-- glyph_coverage: per-Unicode-block coverage (jsonb).
-- axes: variable-font axes (jsonb).
-- anti_piracy_score: heuristic score for cracked-font detection.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS font_asset (
    font_id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kit_id            uuid NOT NULL REFERENCES brand_kit (kit_id) ON DELETE CASCADE,
    file_url          text NOT NULL,
    format            text NOT NULL
                      CHECK (format IN ('woff2', 'woff', 'otf', 'ttf', 'ttc')),
    weight            integer NOT NULL DEFAULT 400,
    subsets           jsonb NOT NULL DEFAULT '[]'::jsonb,
    glyph_coverage    jsonb NOT NULL DEFAULT '{}'::jsonb,
    axes              jsonb NOT NULL DEFAULT '{}'::jsonb,
    sha256            text NOT NULL,
    license_status    text NOT NULL DEFAULT 'unknown'
                      CHECK (license_status IN ('permissive', 'restricted', 'unknown')),
    license_url       text,
    license_expires_at timestamptz,
    anti_piracy_score integer NOT NULL DEFAULT 0,
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS font_asset_kit_idx
    ON font_asset (kit_id, created_at DESC);

CREATE INDEX IF NOT EXISTS font_asset_sha256_idx
    ON font_asset (sha256);

-- ---------------------------------------------------------------------------
-- audit_brand_event — append-only audit trail for brand mutations.
-- ENFORCEMENT: only SELECT and INSERT policies are created. No UPDATE or
-- DELETE policies exist, so RLS denies those operations for all non-admin
-- roles. The app.bypass_rls path is for the privileged migrator/admin
-- role only; application code never sets bypass_rls for normal requests.
-- Action examples: 'brand_kit.published', 'brand_kit.archived',
-- 'brand_extraction.completed', 'font.uploaded', 'token.modified'.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_brand_event (
    event_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      text NOT NULL,
    kit_id      uuid,
    actor_id    text NOT NULL,
    action      text NOT NULL,
    payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_brand_event_org_action_idx
    ON audit_brand_event (org_id, action, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_brand_event_kit_idx
    ON audit_brand_event (kit_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_brand_event_actor_idx
    ON audit_brand_event (actor_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Row-level security.
-- ---------------------------------------------------------------------------
ALTER TABLE brand_context           ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_extraction_job    ENABLE ROW LEVEL SECURITY;
ALTER TABLE font_asset              ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_brand_event       ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- brand_context: tenant isolation via org_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'brand_context_tenant_isolation'
    ) THEN
        CREATE POLICY brand_context_tenant_isolation ON brand_context
            USING (
                org_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                org_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    -- brand_extraction_job: tenant isolation via org_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'brand_extraction_job_tenant_isolation'
    ) THEN
        CREATE POLICY brand_extraction_job_tenant_isolation ON brand_extraction_job
            USING (
                org_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                org_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    -- font_asset: tenant isolation via brand_kit.owner_org_id
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'font_asset_tenant_isolation'
    ) THEN
        CREATE POLICY font_asset_tenant_isolation ON font_asset
            USING (
                EXISTS (
                    SELECT 1 FROM brand_kit
                    WHERE brand_kit.kit_id = font_asset.kit_id
                      AND brand_kit.owner_org_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            )
            WITH CHECK (
                EXISTS (
                    SELECT 1 FROM brand_kit
                    WHERE brand_kit.kit_id = font_asset.kit_id
                      AND brand_kit.owner_org_id = current_setting('app.tenant_id', true)
                )
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    -- audit_brand_event: APPEND-ONLY enforcement.
    -- Only SELECT and INSERT policies are created. UPDATE and DELETE have
    -- no policy, so RLS denies those operations for all non-superuser roles.
    -- This enforces append-only semantics at the database level.

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'audit_brand_event_select'
    ) THEN
        CREATE POLICY audit_brand_event_select ON audit_brand_event
            FOR SELECT
            USING (
                org_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'audit_brand_event_insert'
    ) THEN
        CREATE POLICY audit_brand_event_insert ON audit_brand_event
            FOR INSERT
            WITH CHECK (
                org_id = current_setting('app.tenant_id', true)
                OR current_setting('app.bypass_rls', true) = 'on'
            );
    END IF;
    -- NOTE: No FOR UPDATE or FOR DELETE policies are created.
    -- RLS denies UPDATE/DELETE for all non-superuser roles.
    -- This is the append-only enforcement mechanism.
END
$$;

COMMIT;
