-- Phase 17 — ClickHouse A/B exposure table (W6).
--
-- Idempotent. Applied after 001 + 002 + 003.
--
-- The ab-assignment service writes exposures to this table via the
-- ClickHouse HTTP client (JSONEachRow). The measurement service
-- computes Bayesian and frequentist comparisons from the rollup.
--
-- The Postgres mirror lives in ab_exposure (0060_analytics_ab.up.sql)
-- and is used for transactional durability; this ClickHouse table is
-- the read path the measurement service consumes.

CREATE DATABASE IF NOT EXISTS domio_analytics;

CREATE TABLE IF NOT EXISTS domio_analytics.ab_exposure
(
    workspace_id      LowCardinality(String),
    test_id           LowCardinality(String),
    viewer_id_key     String,
    variant_id        LowCardinality(String),
    exposure_event    LowCardinality(String),
    is_conversion     UInt8 DEFAULT 0,
    occurred_at       DateTime64(3, 'UTC'),
    ch_event_id       String DEFAULT ''
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (workspace_id, test_id, occurred_at)
TTL toDateTime(occurred_at) + INTERVAL 13 MONTH DELETE;

-- Convenience view that joins exposures to the variant metadata cached
-- in Postgres. The measurement service uses this for variant-level
-- rollups.
CREATE VIEW IF NOT EXISTS domio_analytics.ab_exposure_vw AS
SELECT
    workspace_id,
    test_id,
    variant_id,
    is_conversion,
    count() AS n
FROM domio_analytics.ab_exposure
GROUP BY workspace_id, test_id, variant_id, is_conversion;

-- The ab_measurement view aggregates exposures and conversions per
-- (test, variant) for the last 90 days. The measurement service uses
-- it to compute the Beta posteriors without scanning the raw events.
CREATE TABLE IF NOT EXISTS domio_analytics.ab_variant_metric
(
    workspace_id   LowCardinality(String),
    test_id        LowCardinality(String),
    variant_id     LowCardinality(String),
    bucket         Date,
    exposures      UInt64 CODEC(ZSTD(1)),
    conversions    UInt64 CODEC(ZSTD(1))
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (workspace_id, test_id, variant_id, bucket)
TTL toDateTime(bucket) + INTERVAL 13 MONTH DELETE;

CREATE MATERIALIZED VIEW IF NOT EXISTS domio_analytics.ab_variant_metric_mv
TO domio_analytics.ab_variant_metric AS
SELECT
    workspace_id,
    test_id,
    variant_id,
    toDate(occurred_at) AS bucket,
    count() AS exposures,
    countIf(is_conversion = 1) AS conversions
FROM domio_analytics.ab_exposure
GROUP BY workspace_id, test_id, variant_id, bucket;