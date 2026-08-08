-- 0063_analytics_benchmarks.down.sql
-- Phase 17 W11: tear down the benchmark tables + signing keys.

BEGIN;

DROP POLICY IF EXISTS analytics_benchmark_signing_keys_tenant_isolation
    ON analytics_benchmark_signing_keys;
DROP POLICY IF EXISTS benchmark_snapshot_tenant_isolation
    ON benchmark_snapshot;
DROP POLICY IF EXISTS benchmark_metric_tenant_isolation
    ON benchmark_metric;

DROP TABLE IF EXISTS analytics_benchmark_signing_keys CASCADE;
DROP TABLE IF EXISTS benchmark_snapshot CASCADE;
DROP TABLE IF EXISTS benchmark_metric CASCADE;

DROP FUNCTION IF EXISTS benchmark_snapshot_set_updated_at();
DROP FUNCTION IF EXISTS benchmark_metric_set_updated_at();

COMMIT;