-- Phase 17 — ClickHouse benchmark snapshots (W11).
--
-- Idempotent. Applied after 001 + 002 + 003.
--
-- `benchmark_snapshot` stores per-cohort percentile distributions computed
-- nightly by services/benchmark. Using ReplacingMergeTree so a re-run on
-- the same (cohort, bucket_date) overwrites the previous snapshot.

CREATE DATABASE IF NOT EXISTS domio_analytics;

CREATE TABLE IF NOT EXISTS domio_analytics.benchmark_snapshot
(
    workspace_id      LowCardinality(String),   -- 'global' for cross-tenant pool (P22)
    cohort_key        String,                   -- category|tier|slide_count_bucket|duration_bucket
    metric            LowCardinality(String),   -- 'dwell_ms' | 'completion_pct' | 'conversion_pct'
    bucket_date       Date,                     -- night of computation
    n                 UInt32 CODEC(ZSTD(1)),
    p25               Float64 CODEC(ZSTD(1)),
    p50               Float64 CODEC(ZSTD(1)),
    p75               Float64 CODEC(ZSTD(1)),
    p95               Float64 CODEC(ZSTD(1)),
    p99               Float64 CODEC(ZSTD(1)),
    tdigest_centroids Array(Tuple(Float64, Float64)) DEFAULT []
)
ENGINE = ReplacingMergeTree(bucket_date)
PARTITION BY toYYYYMM(bucket_date)
ORDER BY (workspace_id, cohort_key, metric, bucket_date);

-- A small dictionary table for cold-start detection; the benchmark service
-- publishes "insufficient data" when cohort n < 30 (DoD #29 in spec).
CREATE TABLE IF NOT EXISTS domio_analytics.benchmark_cohort_index
(
    cohort_key        String,
    n                 UInt32,
    last_refreshed    DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(last_refreshed)
ORDER BY cohort_key;
