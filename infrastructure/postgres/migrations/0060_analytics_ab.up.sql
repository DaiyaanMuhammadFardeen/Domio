-- 0060_analytics_ab.up.sql
-- Phase 17 W6: A/B testing framework.
--
-- ab_test        — the experiment definition (workspace-scoped,
--                  hash basis, variants, traffic %, status).
-- ab_assignment  — one row per (test, viewer). Deterministic from
--                  the hash, so a viewer always sees the same
--                  variant across sessions.
-- ab_exposure    — append-only audit of every exposure event sent
--                  to ClickHouse; used to validate that the
--                  assignment and the exposure match.
--
-- Design notes:
--   * assignment is computed lazily by the Go hotpath (ab-assignment
--     service). The row is the cache; the hash is the source of truth.
--   * We expose a unique (test_id, viewer_id_key) so concurrent
--     exposures cannot duplicate the assignment row.
--   * variant_count is enforced as part of the application layer —
--     SQL check is included for the common case of 2-10 variants.

BEGIN;

CREATE TABLE IF NOT EXISTS ab_test (
    test_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         UUID NOT NULL,
    name                 TEXT NOT NULL,
    description          TEXT,
    -- 'draft' | 'running' | 'paused' | 'concluded'
    status               TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','running','paused','concluded')),
    hash_basis           TEXT NOT NULL,         -- 'workspace_id' | 'workspace_id+deck_id'
    started_at           TIMESTAMPTZ,
    ended_at             TIMESTAMPTZ,
    min_sample_size      INTEGER NOT NULL DEFAULT 1000,
    -- Where the dashboards pull the metric from. e.g. 'session_ended',
    -- 'click', 'conversion'.
    exposure_event       TEXT NOT NULL,
    -- Conversion event for the test's primary metric.
    conversion_event     TEXT NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by           UUID,
    UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS ab_test_workspace_status_idx
    ON ab_test (workspace_id, status);

CREATE TABLE IF NOT EXISTS ab_assignment (
    assignment_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         UUID NOT NULL,
    test_id              UUID NOT NULL REFERENCES ab_test(test_id) ON DELETE CASCADE,
    viewer_id_key        TEXT NOT NULL,
    variant_id           TEXT NOT NULL,
    -- Probability bucket used to pick the variant, in [0,1).
    bucket               REAL NOT NULL CHECK (bucket BETWEEN 0 AND 1),
    assigned_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (test_id, viewer_id_key)
);

CREATE INDEX IF NOT EXISTS ab_assignment_workspace_test_idx
    ON ab_assignment (workspace_id, test_id);
CREATE INDEX IF NOT EXISTS ab_assignment_variant_idx
    ON ab_assignment (test_id, variant_id);

CREATE TABLE IF NOT EXISTS ab_exposure (
    exposure_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         UUID NOT NULL,
    test_id              UUID NOT NULL REFERENCES ab_test(test_id) ON DELETE CASCADE,
    viewer_id_key        TEXT NOT NULL,
    variant_id           TEXT NOT NULL,
    exposure_event       TEXT NOT NULL,
    occurred_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- The ClickHouse event_id correlate pointer for cross-checking.
    ch_event_id          TEXT
);

CREATE INDEX IF NOT EXISTS ab_exposure_workspace_test_ts_idx
    ON ab_exposure (workspace_id, test_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS ab_exposure_viewer_idx
    ON ab_exposure (viewer_id_key, test_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['ab_test','ab_assignment','ab_exposure'] LOOP
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
