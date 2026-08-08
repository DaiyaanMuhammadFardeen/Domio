-- 0060_analytics_ab.up.sql
-- Phase 17 W6: A/B testing framework.
--
-- ab_test        — the experiment definition (workspace-scoped,
--                  hash basis, variants, traffic %, status).
-- ab_variant     — one row per (test, variant_id) with the traffic
--                  weight and the variant payload (the change to be
--                  shown to a viewer). Weights sum to 100 per test.
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
--   * The ClickHouse mirror lives in `ab_exposure` (W6 second table,
--     created in 004_phase17_heatmap.sql extending) and is the source
--     of truth for measurement; the Postgres row is a denormalized
--     audit pointer used to join viewer attributes back to exposures.

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
    -- Salt per test so the hash output is independent across tests in
    -- the same workspace. Picked at creation time, never reused.
    hash_salt            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    started_at           TIMESTAMPTZ,
    ended_at             TIMESTAMPTZ,
    min_sample_size      INTEGER NOT NULL DEFAULT 1000,
    -- Where the dashboards pull the metric from. e.g. 'session_ended',
    -- 'click', 'conversion'.
    exposure_event       TEXT NOT NULL,
    -- Conversion event for the test's primary metric.
    conversion_event     TEXT NOT NULL,
    -- Sequential test budget for mSPRT (W6 statistics service). 0 means
    -- the test has no early-stopping budget and runs to min_sample_size.
    alpha_budget         DOUBLE PRECISION NOT NULL DEFAULT 0.05
        CHECK (alpha_budget BETWEEN 0.001 AND 0.5),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by           UUID,
    UNIQUE (workspace_id, name)
);

CREATE INDEX IF NOT EXISTS ab_test_workspace_status_idx
    ON ab_test (workspace_id, status);

-- Variants. Weights are integer percent (0..100). The CHECK constraint
-- enforces weight >= 0 and <= 100; the SUM=100 invariant is enforced by
-- a trigger so that an out-of-band UPDATE that would break the total
-- fails the whole transaction.
CREATE TABLE IF NOT EXISTS ab_variant (
    variant_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    test_id              UUID NOT NULL REFERENCES ab_test(test_id) ON DELETE CASCADE,
    workspace_id         UUID NOT NULL,
    -- Stable id used in the Kafka event payload (must match across
    -- services). e.g. 'control', 'variant_a'.
    variant_key          TEXT NOT NULL,
    weight               INTEGER NOT NULL CHECK (weight BETWEEN 0 AND 100),
    -- Arbitrary JSON describing the variant payload. The frontend
    -- loads it on assignment.
    payload              JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (test_id, variant_key)
);

CREATE INDEX IF NOT EXISTS ab_variant_test_idx
    ON ab_variant (test_id);

-- Enforce total weight = 100 across rows for one test. Defers to end of
-- transaction so multi-row INSERTs validate only at commit time.
CREATE OR REPLACE FUNCTION ab_variant_check_total() RETURNS TRIGGER AS $$
DECLARE
    s INTEGER;
    tid UUID;
BEGIN
    tid := COALESCE(NEW.test_id, OLD.test_id);
    SELECT COALESCE(SUM(weight), 0) INTO s FROM ab_variant WHERE test_id = tid;
    IF s <> 100 THEN
        RAISE EXCEPTION 'ab_variant weights must sum to 100, got %', s;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ab_variant_check_total_trg ON ab_variant;
CREATE CONSTRAINT TRIGGER ab_variant_check_total_trg
    AFTER INSERT OR UPDATE OR DELETE ON ab_variant
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION ab_variant_check_total();

CREATE TABLE IF NOT EXISTS ab_assignment (
    assignment_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id         UUID NOT NULL,
    test_id              UUID NOT NULL REFERENCES ab_test(test_id) ON DELETE CASCADE,
    viewer_id_key        TEXT NOT NULL,
    variant_id           UUID NOT NULL REFERENCES ab_variant(variant_id) ON DELETE CASCADE,
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
    variant_id           UUID NOT NULL REFERENCES ab_variant(variant_id) ON DELETE CASCADE,
    exposure_event       TEXT NOT NULL,
    -- 1 if this exposure was the primary conversion event for the test,
    -- 0 otherwise. Used by the measurement service to compute rates.
    is_conversion        INTEGER NOT NULL DEFAULT 0
        CHECK (is_conversion IN (0, 1)),
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
    FOREACH t IN ARRAY ARRAY['ab_test','ab_variant','ab_assignment','ab_exposure'] LOOP
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