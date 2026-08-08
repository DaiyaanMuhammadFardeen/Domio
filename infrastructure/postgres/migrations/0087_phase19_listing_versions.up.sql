-- 0087_phase19_listing_versions.up.sql
-- Phase 19 WS-MKT-2: Listing versioning + changelog.
--
-- Tables:
--   listing_version — immutable snapshot of a listing version. Each publish
--     bumps version_num; the listing's changelog is rendered in the storefront
--     "What's new" zoom.
--
-- FK: listing_id → marketplace_listing(id) from P06 (0013).
-- RLS: workspace-scoped (tenant isolation via workspace_id).
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- listing_version — immutable version snapshot for a marketplace listing.
-- listing_id: FK to P06 marketplace_listing(id).
-- version_num: monotonically increasing integer version per listing.
-- changelog: human-readable release notes for this version.
-- manifest: structured content manifest (JSONB for flexibility).
-- UNIQUE(listing_id, version_num): prevents duplicate version numbers.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS listing_version (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    uuid NOT NULL,
    listing_id      uuid NOT NULL REFERENCES marketplace_listing (id) ON DELETE CASCADE,
    version_num     int NOT NULL,
    changelog       text NOT NULL DEFAULT '',
    manifest        jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by      uuid,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (listing_id, version_num)
);

CREATE INDEX IF NOT EXISTS listing_version_listing_idx
    ON listing_version (listing_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'listing_version'
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
