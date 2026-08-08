-- 0063_analytics_benchmarks.up.sql
-- Phase 17 W11: Postgres mirror + signing-key rotation.
--
-- benchmark_metric   — Postgres mirror of ClickHouse
--                      domio_analytics.benchmark_metric. Used for
--                      audit + cross-region consistency.
-- benchmark_snapshot — Postgres mirror of ClickHouse
--                      domio_analytics.benchmark_snapshot. Used by
--                      the dashboard for "trends" tile without a CH
--                      round-trip.
-- analytics_benchmark_signing_keys — HMAC key rotation. Each
--                                     (workspace_id, kid) pair
--                                     carries a key blob + active
--                                     window so callers can rotate
--                                     without downtime.
--
-- Every table gets RLS via the standard DO/EXECUTE block in
-- 0055_participation_session.up.sql:83-104.

BEGIN;

-- ---------------------------------------------------------------------------
-- benchmark_metric (mirror of ClickHouse benchmark_metric)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS benchmark_metric (
    metric_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     UUID NOT NULL,
    benchmark_id     UUID NOT NULL,
    metric_name      TEXT NOT NULL,
    value            DOUBLE PRECISION NOT NULL,
    ts_ms            BIGINT NOT NULL,
    cohort           TEXT
        CHECK (cohort IS NULL OR cohort IN ('a', 'b', '')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, benchmark_id, metric_name, ts_ms, cohort)
);

CREATE INDEX IF NOT EXISTS benchmark_metric_workspace_ts_idx
    ON benchmark_metric (workspace_id, ts_ms DESC);
CREATE INDEX IF NOT EXISTS benchmark_metric_benchmark_ts_idx
    ON benchmark_metric (benchmark_id, ts_ms DESC);

-- updated_at trigger so the row carries a stable modification time.
CREATE OR REPLACE FUNCTION benchmark_metric_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.created_at = COALESCE(NEW.created_at, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS benchmark_metric_set_updated_at ON benchmark_metric;
CREATE TRIGGER benchmark_metric_set_updated_at
BEFORE INSERT ON benchmark_metric
FOR EACH ROW
EXECUTE FUNCTION benchmark_metric_set_updated_at();

-- ---------------------------------------------------------------------------
-- benchmark_snapshot (mirror of ClickHouse benchmark_snapshot)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS benchmark_snapshot (
    snapshot_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     UUID NOT NULL,
    benchmark_id     UUID NOT NULL,
    metric_name      TEXT NOT NULL,
    bucket_date      DATE NOT NULL,
    value            DOUBLE PRECISION NOT NULL,
    sample_size      INTEGER NOT NULL CHECK (sample_size >= 0),
    region_pinned    TEXT
        CHECK (region_pinned IS NULL OR region_pinned IN ('us','eu','bd','sg','au')),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, benchmark_id, metric_name, bucket_date)
);

CREATE INDEX IF NOT EXISTS benchmark_snapshot_workspace_date_idx
    ON benchmark_snapshot (workspace_id, bucket_date DESC);
CREATE INDEX IF NOT EXISTS benchmark_snapshot_benchmark_date_idx
    ON benchmark_snapshot (benchmark_id, bucket_date DESC);

CREATE OR REPLACE FUNCTION benchmark_snapshot_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS benchmark_snapshot_set_updated_at ON benchmark_snapshot;
CREATE TRIGGER benchmark_snapshot_set_updated_at
BEFORE UPDATE ON benchmark_snapshot
FOR EACH ROW
EXECUTE FUNCTION benchmark_snapshot_set_updated_at();

-- ---------------------------------------------------------------------------
-- analytics_benchmark_signing_keys (HMAC key rotation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS analytics_benchmark_signing_keys (
    key_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id     UUID NOT NULL,
    -- 'hmac-sha256' for now; the column is text so we can add new
    -- algorithms later without a migration.
    algorithm        TEXT NOT NULL DEFAULT 'hmac-sha256'
        CHECK (algorithm IN ('hmac-sha256')),
    -- Encrypted at rest by the application layer; the database never
    -- sees a plaintext key.
    key_cipher       TEXT NOT NULL,
    -- Inclusive [active_from, active_to) — Postgres timestamptz range.
    active_from      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active_to        TIMESTAMPTZ,
    -- 'active' | 'retired'. Retired keys remain valid for a grace
    -- period so in-flight requests can still verify.
    status           TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','retired')),
    created_by       UUID,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, key_id)
);

CREATE INDEX IF NOT EXISTS analytics_benchmark_signing_keys_workspace_status_idx
    ON analytics_benchmark_signing_keys (workspace_id, status);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'benchmark_metric',
        'benchmark_snapshot',
        'analytics_benchmark_signing_keys'
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