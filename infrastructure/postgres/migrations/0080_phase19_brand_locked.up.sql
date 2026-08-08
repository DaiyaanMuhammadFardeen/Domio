-- 0080_phase19_brand_locked.up.sql
-- Phase 19 WS-MKT-5: Brand-locked marketplace curation.
--
-- Tables:
--   brand_locked_listing — admin-curated mapping of marketplace listings to a
--     brand-kit scope. State allow/deny/override controls visibility for the
--     brand-scope. override_price_cents enables per-brand pricing.
--
-- RLS: workspace-scoped (tenant isolation via workspace_id).
-- ---------------------------------------------------------------------------

BEGIN;

-- ---------------------------------------------------------------------------
-- brand_locked_listing — admin-curated marketplace listing curation per brand.
-- brand_kit_id: the brand-kit this curation applies to (references P07 theme).
-- marketplace_listing_id: FK to P06 marketplace_listing(id).
-- state: allow | deny | override — controls visibility for the brand-scope.
-- override_price_cents: optional per-brand price override (NULL = use listing price).
-- audit_actor_id: who made this curation change.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_locked_listing (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id            uuid NOT NULL,
    brand_kit_id            uuid NOT NULL,
    marketplace_listing_id  uuid NOT NULL REFERENCES marketplace_listing (id) ON DELETE CASCADE,
    state                   text NOT NULL DEFAULT 'allow'
                            CHECK (state IN ('allow', 'deny', 'override')),
    override_price_cents    bigint,
    notes                   text,
    audit_actor_id          uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid,
    updated_by              uuid,
    UNIQUE (workspace_id, brand_kit_id, marketplace_listing_id)
);

CREATE INDEX IF NOT EXISTS brand_locked_listing_workspace_brand_idx
    ON brand_locked_listing (workspace_id, brand_kit_id);
CREATE INDEX IF NOT EXISTS brand_locked_listing_listing_idx
    ON brand_locked_listing (marketplace_listing_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'brand_locked_listing'
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
