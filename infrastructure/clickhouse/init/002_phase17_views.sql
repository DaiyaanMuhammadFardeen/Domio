-- Phase 17 — ClickHouse materialized views (rollups).
--
-- Idempotent. Applied after 001_phase17_schema.sql.
--
-- These views feed the dashboard read surface (services/analytics-warehouse)
-- and the post-session summary worker. They are deliberately separate from
-- the raw `events` table so a rollup bug never corrupts ingest.
--
-- Granularities:
--   * session_agg_mv   — one row per session (drives per-viewer detail page)
--   * deck_metric_5m   — one row per (deck, 5-min bucket) (drives /deck/[id])
--   * slide_metric_5m  — one row per (deck, slide, 5-min bucket)
--   * funnel_step_hourly — sales funnel rollup (drives /funnel)
--   * team_metric_mv   — workspace template/component/brand engagement

CREATE DATABASE IF NOT EXISTS domio_analytics;

-- ---------------------------------------------------------------------------
-- session_agg_mv — one row per session; sessionization fills these in W4.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domio_analytics.session_agg
(
    workspace_id      LowCardinality(String),
    session_id        String,
    viewer_id_key     String,
    deck_id           LowCardinality(String),
    privacy_mode      Enum8(
        'identified'      = 1,
        'pseudonymous'    = 2,
        'anon_consent'    = 3,
        'anon_no_track'   = 4
    ),
    started_at        DateTime64(3, 'UTC'),
    ended_at          DateTime64(3, 'UTC'),
    duration_ms       Int64 CODEC(ZSTD(1)),
    event_count       UInt32 CODEC(ZSTD(1)),
    max_slide_index   UInt16 DEFAULT 0,
    completed         UInt8 DEFAULT 0,        -- 1 if reached the last slide
    is_bot            UInt8 DEFAULT 0,
    source_app        LowCardinality(String) DEFAULT '',
    country_iso       LowCardinality(FixedString(2)) DEFAULT 'XX'
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(started_at)
ORDER BY (workspace_id, deck_id, started_at)
TTL toDateTime(started_at) + INTERVAL 13 MONTH DELETE;

CREATE MATERIALIZED VIEW IF NOT EXISTS domio_analytics.session_agg_mv
TO domio_analytics.session_agg AS
SELECT
    workspace_id,
    session_id,
    any(viewer_id_key) AS viewer_id_key,
    deck_id,
    any(privacy_mode) AS privacy_mode,
    min(ts) AS started_at,
    max(ts) AS ended_at,
    toInt64(dateDiff('millisecond', min(ts), max(ts))) AS duration_ms,
    count() AS event_count,
    max(toUInt16OrZero(scene_node_id)) AS max_slide_index,
    0 AS completed,
    0 AS is_bot,
    any(source_app) AS source_app,
    any(country_iso) AS country_iso
FROM domio_analytics.events
WHERE session_id != ''
GROUP BY workspace_id, session_id, deck_id;

-- ---------------------------------------------------------------------------
-- deck_metric_5m — drives /deck/[id] KPI tiles + sparklines.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domio_analytics.deck_metric_5m
(
    workspace_id      LowCardinality(String),
    deck_id           LowCardinality(String),
    bucket            DateTime('UTC'),
    views             UInt64 CODEC(ZSTD(1)),
    distinct_viewers  UInt64 CODEC(ZSTD(1)),
    unique_sessions   AggregateFunction(uniq, String),
    total_dwell_ms    Int64 CODEC(ZSTD(1)),
    completions       UInt64 CODEC(ZSTD(1)),
    interactions      UInt64 CODEC(ZSTD(1))
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (workspace_id, deck_id, bucket)
TTL toDateTime(bucket) + INTERVAL 13 MONTH DELETE;

CREATE MATERIALIZED VIEW IF NOT EXISTS domio_analytics.deck_metric_5m_mv
TO domio_analytics.deck_metric_5m AS
SELECT
    workspace_id,
    deck_id,
    toStartOfFiveMinute(ts) AS bucket,
    countIf(event_name = 'view') AS views,
    uniqExactIf(viewer_id_key, event_name = 'view') AS distinct_viewers,
    uniqStateIf(session_id, event_name = 'view' AND session_id != '') AS unique_sessions,
    sumIf(dwell_ms, event_name = 'scroll_progress') AS total_dwell_ms,
    countIf(event_name = 'session_complete') AS completions,
    countIf(event_name = 'interaction') AS interactions
FROM domio_analytics.events
GROUP BY workspace_id, deck_id, bucket;

-- ---------------------------------------------------------------------------
-- slide_metric_5m — drives the per-slide breakdown in /deck/[id].
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domio_analytics.slide_metric_5m
(
    workspace_id      LowCardinality(String),
    deck_id           LowCardinality(String),
    slide_id          LowCardinality(String),
    bucket            DateTime('UTC'),
    views             UInt64 CODEC(ZSTD(1)),
    distinct_viewers  UInt64 CODEC(ZSTD(1)),
    total_dwell_ms    Int64 CODEC(ZSTD(1)),
    max_dwell_ms      Int32 CODEC(ZSTD(1)),
    drops             UInt64 CODEC(ZSTD(1))
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (workspace_id, deck_id, slide_id, bucket)
TTL toDateTime(bucket) + INTERVAL 13 MONTH DELETE;

CREATE MATERIALIZED VIEW IF NOT EXISTS domio_analytics.slide_metric_5m_mv
TO domio_analytics.slide_metric_5m AS
SELECT
    workspace_id,
    deck_id,
    slide_id,
    toStartOfFiveMinute(ts) AS bucket,
    countIf(event_name = 'view') AS views,
    uniqExactIf(viewer_id_key, event_name = 'view') AS distinct_viewers,
    sumIf(dwell_ms, event_name = 'scroll_progress') AS total_dwell_ms,
    maxIf(dwell_ms, event_name = 'scroll_progress') AS max_dwell_ms,
    countIf(event_name = 'slide_exit' AND slide_id != '') AS drops
FROM domio_analytics.events
WHERE slide_id != ''
GROUP BY workspace_id, deck_id, slide_id, bucket;

-- ---------------------------------------------------------------------------
-- funnel_step_hourly — sales funnel rollup for /funnel (feature #177).
-- Stages: sent → opened → completed → replied.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domio_analytics.funnel_step_hourly
(
    workspace_id   LowCardinality(String),
    deck_id        LowCardinality(String),
    bucket         DateTime('UTC'),
    stage          Enum8(
        'sent'        = 1,
        'opened'      = 2,
        'completed'   = 3,
        'replied'     = 4
    ),
    audience_tier  LowCardinality(String) DEFAULT '',
    campaign_id    LowCardinality(String) DEFAULT '',
    experiment_id  LowCardinality(String) DEFAULT '',
    variant_id     LowCardinality(String) DEFAULT '',
    n              UInt64 CODEC(ZSTD(1)),
    time_to_step_ms AggregateFunction(quantile, Int64)
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (workspace_id, deck_id, stage, bucket)
TTL toDateTime(bucket) + INTERVAL 13 MONTH DELETE;

CREATE MATERIALIZED VIEW IF NOT EXISTS domio_analytics.funnel_step_hourly_mv
TO domio_analytics.funnel_step_hourly AS
SELECT
    workspace_id,
    deck_id,
    toStartOfHour(ts) AS bucket,
    multiIf(
        event_name = 'send',           'sent',
        event_name = 'view',           'opened',
        event_name = 'session_complete', 'completed',
        event_name = 'reply',          'replied',
        ''
    ) AS stage,
    '' AS audience_tier,
    '' AS campaign_id,
    experiment_id,
    variant_id,
    count() AS n,
    quantileState(toInt64(dwell_ms)) AS time_to_step_ms
FROM domio_analytics.events
WHERE event_name IN ('send', 'view', 'session_complete', 'reply')
GROUP BY workspace_id, deck_id, bucket, stage, audience_tier, campaign_id, experiment_id, variant_id;

-- ---------------------------------------------------------------------------
-- team_metric_mv — workspace template/component/brand engagement (W9).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domio_analytics.team_metric
(
    workspace_id       LowCardinality(String),
    template_id        LowCardinality(String),
    component_id       LowCardinality(String) DEFAULT '',
    brand_kit_id       LowCardinality(String) DEFAULT '',
    bucket             Date('UTC'),
    deck_count         UInt32 CODEC(ZSTD(1)),
    total_views        UInt64 CODEC(ZSTD(1)),
    total_completions  UInt64 CODEC(ZSTD(1)),
    distinct_viewers   AggregateFunction(uniq, String),
    composite_score    Float64 CODEC(ZSTD(1))  -- weighted engagement
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (workspace_id, template_id, component_id, brand_kit_id, bucket)
TTL toDateTime(bucket) + INTERVAL 13 MONTH DELETE;

CREATE MATERIALIZED VIEW IF NOT EXISTS domio_analytics.team_metric_mv
TO domio_analytics.team_metric AS
SELECT
    workspace_id,
    '' AS template_id,
    '' AS component_id,
    '' AS brand_kit_id,
    toDate(ts) AS bucket,
    uniqExact(deck_id) AS deck_count,
    countIf(event_name = 'view') AS total_views,
    countIf(event_name = 'session_complete') AS total_completions,
    uniqStateIf(viewer_id_key, event_name = 'view') AS distinct_viewers,
    toFloat64(countIf(event_name = 'view') + 5 * countIf(event_name = 'session_complete'))
        AS composite_score
FROM domio_analytics.events
GROUP BY workspace_id, bucket;

-- Note: template/component/brand_kit dimension columns are populated by the
-- team-analytics service (W9) which has access to the deck→template mapping
-- from Postgres. The MV above populates the workspace/day rollup which the
-- service joins on for the composite scoring.
