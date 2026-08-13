/**
 * Heatmap generator — aggregator (Phase 17 W5).
 *
 * Pure functions over the ClickHouse rows. Two responsibilities:
 *
 *   1. Deduplicate rows that target the same (workspace, deck, slide,
 *      tile_x, tile_y) key by summing impressions, pause_count and
 *      dwell fields. SummingMergeTree on the ClickHouse side normally
 *      collapses duplicates at flush time, but until a partition is
 *      merged you can get two partial rows for the same key.
 *
 *   2. Drop tiles that fall outside the configured grid. Decks that
 *      have rotated slides may have rows whose tile_x ≥ grid_width.
 *
 * The aggregator is deterministic and pure — feeds the same rows in, get
 * the same cells out. No RNG, no clock.
 */

import type { HeatmapRow, HeatmapExport, TileCell } from '../types.js';
import { HEATMAP_GRID_HEIGHT, HEATMAP_GRID_WIDTH } from '../types.js';

export interface AggregatorConfig {
  /** Maximum valid x index (inclusive upper bound — 32 means [0..32)). */
  gridWidth: number;
  /** Maximum valid y index (inclusive upper bound). */
  gridHeight: number;
}

const DEFAULT_CFG: AggregatorConfig = {
  gridWidth: HEATMAP_GRID_WIDTH,
  gridHeight: HEATMAP_GRID_HEIGHT,
};

interface AggBucket {
  impressions: number;
  pause_count: number;
  pause_total_ms: number;
  scrollthrough_ms: number;
  x: number;
  y: number;
}

/**
 * Group rollup rows by (slide_id, tile_x, tile_y) and sum the engagement
 * fields. Rows with out-of-grid coordinates are silently dropped.
 */
export function aggregate(
  rows: readonly HeatmapRow[],
  cfg: AggregatorConfig = DEFAULT_CFG,
): Map<string, AggBucket> {
  const out = new Map<string, AggBucket>();
  for (const r of rows) {
    if (r.tile_x < 0 || r.tile_y < 0) continue;
    if (r.tile_x >= cfg.gridWidth || r.tile_y >= cfg.gridHeight) continue;
    if (r.impressions < 0 || r.pause_count < 0 || r.pause_total_ms < 0) continue;

    const key = `${r.slide_id}|${r.tile_x}|${r.tile_y}`;
    const existing = out.get(key);
    if (existing) {
      existing.impressions += r.impressions;
      existing.pause_count += r.pause_count;
      existing.pause_total_ms += r.pause_total_ms;
      existing.scrollthrough_ms += r.scrollthrough_ms;
    } else {
      out.set(key, {
        x: r.tile_x,
        y: r.tile_y,
        impressions: r.impressions,
        pause_count: r.pause_count,
        pause_total_ms: r.pause_total_ms,
        scrollthrough_ms: r.scrollthrough_ms,
      });
    }
  }
  return out;
}

/**
 * Build the public JSON export for one (deck_id, slide_id) from the
 * aggregated buckets. Tiles with zero engagement are omitted from the
 * output — the dashboard fills the rest with neutral cells.
 *
 * bucket: the day that was rolled up; the dashboard needs to render
 * time-windowed variants in the future so we keep it in the output.
 */
export function buildExport(
  deck_id: string,
  slide_id: string,
  bucket: string,
  buckets: Map<string, AggBucket>,
  cfg: AggregatorConfig = DEFAULT_CFG,
): HeatmapExport {
  const tiles: TileCell[] = [];
  let total_dwell_ms = 0;
  let total_viewer_touches = 0;

  // Stable ordering: by y (top → bottom), then x (left → right). The
  // dashboard uses this to draw heatmaps deterministically.
  const entries = Array.from(buckets.values()).sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return a.x - b.x;
  });

  for (const b of entries) {
    // Defensive: never include zero-engagement tiles. The aggregator
    // already filters by validity; this is belt-and-braces for callers
    // that hand-roll buckets.
    if (b.impressions === 0 && b.pause_total_ms === 0 && b.scrollthrough_ms === 0) continue;
    tiles.push({
      x: b.x,
      y: b.y,
      dwell_ms: b.pause_total_ms,
      viewers: b.impressions,
      pause_count: b.pause_count,
    });
    total_dwell_ms += b.pause_total_ms;
    total_viewer_touches += b.impressions;
  }

  return {
    deck_id,
    slide_id,
    bucket,
    grid_width: cfg.gridWidth,
    grid_height: cfg.gridHeight,
    tiles,
    total_dwell_ms,
    total_viewer_touches,
  };
}

/**
 * Stitch multiple rollup buckets (e.g. daily buckets covering a date
 * range) into a single export. Used by the /v1/heatmap endpoint when
 * the caller asks for a date window rather than a single day.
 */
export function stitchBuckets(
  deck_id: string,
  slide_id: string,
  buckets: readonly string[],
  perBucketRows: ReadonlyArray<readonly HeatmapRow[]>,
  cfg: AggregatorConfig = DEFAULT_CFG,
): HeatmapExport {
  const merged = new Map<string, AggBucket>();
  for (const rows of perBucketRows) {
    const agg = aggregate(rows, cfg);
    for (const [key, b] of agg) {
      const existing = merged.get(key);
      if (existing) {
        existing.impressions += b.impressions;
        existing.pause_count += b.pause_count;
        existing.pause_total_ms += b.pause_total_ms;
        existing.scrollthrough_ms += b.scrollthrough_ms;
      } else {
        merged.set(key, { ...b });
      }
    }
  }
  const bucketLabel =
    buckets.length === 1 ? buckets[0]! : `${buckets[0]}..${buckets[buckets.length - 1]}`;
  return buildExport(deck_id, slide_id, bucketLabel, merged, cfg);
}
