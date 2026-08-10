-- Phase 17 — ClickHouse heatmap tiles (W5).
--
-- Idempotent. Applied after 001 + 002.
--
-- Tile grid generation (32×18 default, 64×N for decks >50 slides) is done
-- client-side in apps/viewer and emitted as scroll_progress events with
-- `tile_x` and `tile_y` fields parsed into the JSON `interaction_data`
-- column. This migration creates the rollup table.
--
-- The rollup is split into two layers:
--
--   1. heatmap_tile (SummingMergeTree) — per-tile counts and totals that
--      the dashboard needs to render the heatmap. One row per
--      (workspace, deck, slide, tile_x, tile_y, day). Indexed by the
--      (workspace, deck) sort key so the dashboard query plan can prune
--      partitions without scanning other decks.
--
--   2. heatmap_tile_dwell (AggregatingMergeTree) — quantileState over
--      per-viewer dwell_ms on each tile. We use this for the
--      percentile readouts (p50, p90, p99) shown in the dashboard's
--      "engagement distribution" panel. The aggregator is
--      quantileState(0.5)/quantileState(0.9)/quantileState(0.99).
--
-- The materialized view `heatmap_tile_mv` reads from `events` (the
-- landing table that workers/columnar-loader populates from the
-- `events.ingest.raw` Kafka topic) and writes to both rollups in one
-- pass — Kafka topic events → `events` table → heatmap_materialized
-- view → heatmap_tile + heatmap_tile_dwell.

CREATE DATABASE IF NOT EXISTS domio_analytics;

-- Drop the prior SummingMergeTree version (pre-W5) so a re-apply on a
-- populated cluster upgrades cleanly. The previous version was missing
-- the dwell histogram; an AggregatingMergeTree replacement is also
-- incompatible with SummingMergeTree. We mirror the layout with the
-- dwell-quantile sidecar so existing dashboards keep working.
DROP TABLE IF EXISTS domio_analytics.heatmap_tile_dwell;
DROP TABLE IF EXISTS domio_analytics.heatmap_tile_mv;
DROP TABLE IF EXISTS domio_analytics.heatmap_tile;

CREATE TABLE IF NOT EXISTS domio_analytics.heatmap_tile
(
    workspace_id      LowCardinality(String),
    deck_id           LowCardinality(String),
    slide_id          LowCardinality(String) DEFAULT '',
    tile_x            UInt16,
    tile_y            UInt16,
    bucket            Date,
    impressions       AggregateFunction(uniq, String),  -- unique viewers
    pause_count       UInt64 CODEC(ZSTD(1)),
    pause_total_ms    Int64 CODEC(ZSTD(1)),
    scrollthrough_ms  Int64 CODEC(ZSTD(1))
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (workspace_id, deck_id, slide_id, tile_x, tile_y, bucket)
TTL toDateTime(bucket) + INTERVAL 13 MONTH DELETE;

CREATE TABLE IF NOT EXISTS domio_analytics.heatmap_tile_dwell
(
    workspace_id      LowCardinality(String),
    deck_id           LowCardinality(String),
    slide_id          LowCardinality(String) DEFAULT '',
    tile_x            UInt16,
    tile_y            UInt16,
    bucket            Date,
    -- Per-viewer dwell_ms aggregated via quantileState so we can read
    -- p50/p90/p99 without re-scanning events.
    dwell_p50         AggregateFunction(quantile, Int64),
    dwell_p90         AggregateFunction(quantile, Int64),
    dwell_p99         AggregateFunction(quantile, Int64)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (workspace_id, deck_id, slide_id, tile_x, tile_y, bucket)
TTL toDateTime(bucket) + INTERVAL 13 MONTH DELETE;

-- Single materialized view that feeds both rollups from the events
-- table. Pre-W5 the MV had a SummingMergeTree target — this new fan-out
-- handles both targets in one pass.
CREATE MATERIALIZED VIEW IF NOT EXISTS domio_analytics.heatmap_tile_mv
TO domio_analytics.heatmap_tile AS
SELECT
    workspace_id,
    deck_id,
    slide_id,
    toUInt16OrZero(JSONExtractString(interaction_data, 'tile_x')) AS tile_x,
    toUInt16OrZero(JSONExtractString(interaction_data, 'tile_y')) AS tile_y,
    toDate(ts) AS bucket,
    -- unique viewers who touched the tile (uniqState over viewer_id_key)
    uniqStateIf(viewer_id_key, event_name = 'scroll_progress') AS impressions,
    countIf(event_name = 'scroll_pause') AS pause_count,
    sumIf(dwell_ms, event_name = 'scroll_pause') AS pause_total_ms,
    sumIf(dwell_ms, event_name = 'scroll_progress') AS scrollthrough_ms
FROM domio_analytics.events
WHERE event_name IN ('scroll_progress', 'scroll_pause')
GROUP BY workspace_id, deck_id, slide_id, tile_x, tile_y, bucket;

-- The dwell histogram is a separate MV because AggregatingMergeTree
-- only allows one MV per table.
CREATE MATERIALIZED VIEW IF NOT EXISTS domio_analytics.heatmap_tile_dwell_mv
TO domio_analytics.heatmap_tile_dwell AS
SELECT
    workspace_id,
    deck_id,
    slide_id,
    toUInt16OrZero(JSONExtractString(interaction_data, 'tile_x')) AS tile_x,
    toUInt16OrZero(JSONExtractString(interaction_data, 'tile_y')) AS tile_y,
    toDate(ts) AS bucket,
    quantileState(0.5)(toInt64(dwell_ms)) AS dwell_p50,
    quantileState(0.9)(toInt64(dwell_ms)) AS dwell_p90,
    quantileState(0.99)(toInt64(dwell_ms)) AS dwell_p99
FROM domio_analytics.events
WHERE event_name = 'scroll_progress'
  AND dwell_ms > 0
GROUP BY workspace_id, deck_id, slide_id, tile_x, tile_y, bucket;

-- ---------------------------------------------------------------------------
-- Convenience view that the heatmap-generator service queries.
--
-- The selecting pattern `*Merge` materials the AggregateFunction columns
-- into their scalar forms for the dashboard. Quantile percentile reads
-- require the `-Merge` suffix (it triggers quantilesMerge()).
-- ---------------------------------------------------------------------------
CREATE VIEW IF NOT EXISTS domio_analytics.heatmap_tile_vw AS
SELECT
    workspace_id,
    deck_id,
    slide_id,
    tile_x,
    tile_y,
    bucket,
    uniqMerge(impressions) AS impressions,
    pause_count,
    pause_total_ms,
    scrollthrough_ms,
    quantilesMerge(0.5)(dwell_p50) AS dwell_p50,
    quantilesMerge(0.9)(dwell_p90) AS dwell_p90,
    quantilesMerge(0.99)(dwell_p99) AS dwell_p99
FROM domio_analytics.heatmap_tile
INNER JOIN domio_analytics.heatmap_tile_dwell USING (workspace_id, deck_id, slide_id, tile_x, tile_y, bucket);
