-- 007_phase17_benchmark.sql
-- Phase 17 W11: ClickHouse benchmark_snapshot + benchmark_metric tables.
--
-- Idempotent. Applied after 001 + 002 + 003 + 004 + 005 + 006.
--
-- benchmark_snapshot — one row per (workspace, benchmark, metric, day).
--                      Used by the dashboard "trends" tile and the
--                      nightly benchmark jobs. ReplacingMergeTree
--                      keyed by bucket_date so a re-run on the same
--                      day overwrites the previous row.
--
-- benchmark_metric   — append-only time-series of the raw metric,
--                      written by the analytics-warehouse pipelines
--                      (e.g. session_dwell_ms per viewer). The
--                      benchmark service reads from this table to
--                      produce snapshots and run inference.
--
-- The Postgres mirror tables live in
-- infrastructure/postgres/migrations/0063_analytics_benchmarks.up.sql.

CREATE DATABASE IF NOT EXISTS domio_analytics;

CREATE TABLE IF NOT EXISTS domio_analytics.benchmark_snapshot
(
    workspace_id    LowCardinality(String),
    benchmark_id    LowCardinality(String),
    metric_name     LowCardinality(String),
    bucket_date     Date,
    value           Float64,
    sample_size     UInt32,
    region_pinned   LowCardinality(String) DEFAULT '',
    updated_at      DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(bucket_date)
PARTITION BY toYYYYMM(bucket_date)
ORDER BY (workspace_id, benchmark_id, bucket_date)
TTL toDate(bucket_date) + INTERVAL 25 MONTH DELETE;

CREATE TABLE IF NOT EXISTS domio_analytics.benchmark_metric
(
    workspace_id    LowCardinality(String),
    benchmark_id    LowCardinality(String),
    metric_name     LowCardinality(String),
    value           Float64,
    ts_ms           DateTime64(3, 'UTC'),
    cohort          LowCardinality(String) DEFAULT ''
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts_ms)
ORDER BY (workspace_id, benchmark_id, metric_name, ts_ms)
TTL toDateTime(ts_ms) + INTERVAL 13 MONTH DELETE;

-- Convenience view: latest snapshot per (benchmark, metric).
CREATE VIEW IF NOT EXISTS domio_analytics.benchmark_snapshot_latest_vw AS
SELECT
    workspace_id,
    benchmark_id,
    metric_name,
    argMax(value, bucket_date) AS value,
    argMax(sample_size, bucket_date) AS sample_size,
    argMax(region_pinned, bucket_date) AS region_pinned,
    max(bucket_date) AS last_bucket_date
FROM domio_analytics.benchmark_snapshot
GROUP BY workspace_id, benchmark_id, metric_name;
