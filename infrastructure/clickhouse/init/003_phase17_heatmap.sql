-- Phase 17 — ClickHouse heatmap tiles (W5).
--
-- Idempotent. Applied after 001 + 002.
--
-- Tile grid generation (32×18 default, 64×N for decks >50 slides) is done
-- client-side in apps/viewer and emitted as scroll_progress events with
-- `tile_x` and `tile_y` fields parsed into the JSON `interaction_data`
-- column. This migration creates the rollup table.

CREATE DATABASE IF NOT EXISTS domio_analytics;

CREATE TABLE IF NOT EXISTS domio_analytics.heatmap_tile
(
    workspace_id      LowCardinality(String),
    deck_id           LowCardinality(String),
    slide_id          LowCardinality(String) DEFAULT '',
    tile_x            UInt16,
    tile_y            UInt16,
    bucket            Date('UTC'),
    impressions       UInt64 CODEC(ZSTD(1)),  -- unique viewers who touched the tile
    pause_count       UInt64 CODEC(ZSTD(1)),  -- scroll_pause events on the tile
    pause_total_ms    Int64 CODEC(ZSTD(1)),
    scrollthrough_ms  Int64 CODEC(ZSTD(1))    -- time spent scrolling across tile
)
ENGINE = SummingMergeTree
PARTITION BY toYYYYMM(bucket)
ORDER BY (workspace_id, deck_id, slide_id, tile_x, tile_y, bucket)
TTL toDateTime(bucket) + INTERVAL 13 MONTH DELETE;

CREATE MATERIALIZED VIEW IF NOT EXISTS domio_analytics.heatmap_mv
TO domio_analytics.heatmap_tile AS
SELECT
    workspace_id,
    deck_id,
    '' AS slide_id,
    -- tile_x / tile_y come from interaction_data JSON; for now we extract
    -- them via JSONExtract which is acceptable for the MV because the
    -- column-store scan is bounded by (workspace_id, deck_id) sort order.
    toUInt16OrZero(JSONExtractString(interaction_data, 'tile_x')) AS tile_x,
    toUInt16OrZero(JSONExtractString(interaction_data, 'tile_y')) AS tile_y,
    toDate(ts) AS bucket,
    uniqExactIf(viewer_id_key, event_name = 'scroll_progress') AS impressions,
    countIf(event_name = 'scroll_pause') AS pause_count,
    sumIf(dwell_ms, event_name = 'scroll_pause') AS pause_total_ms,
    sumIf(dwell_ms, event_name = 'scroll_progress') AS scrollthrough_ms
FROM domio_analytics.events
WHERE event_name IN ('scroll_progress', 'scroll_pause')
GROUP BY workspace_id, deck_id, slide_id, tile_x, tile_y, bucket;
