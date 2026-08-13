/**
 * Heatmap generator — ClickHouse reader (Phase 17 W5).
 *
 * Reads from `domio_analytics.heatmap_tile` (SummingMergeTree), the
 * rollup materialized by infrastructure/clickhouse/init/003_phase17_heatmap.sql.
 *
 * Because SummingMergeTree merges asynchronously, the same
 * (workspace, deck, slide, tile_x, tile_y, bucket) key can appear in
 * multiple rows until the merge runs. The aggregator in engine/aggregator.ts
 * deduplicates those rows by summing them.
 *
 * We re-use the ClickHouse HTTP client shape from analytics-warehouse
 * so the dependency stays minimal. The HeatmapClient interface is a
 * subset of ClickHouseClient that the warehouse exposes.
 */

import type { HeatmapRow } from '../types.js';

export interface HeatmapClient {
  query<T = Record<string, unknown>>(sql: string, params?: Record<string, unknown>): Promise<T[]>;
  execute(sql: string, params?: Record<string, unknown>): Promise<void>;
  ping(): Promise<boolean>;
}

export interface HeatmapStore {
  /**
   * Read rollup rows for a single (deck, slide) on a single day. The
   * SummingMergeTree guarantees (after merge) one row per tile, but the
   * aggregator handles partial rows in the meantime.
   */
  fetchDay(
    workspace_id: string,
    deck_id: string,
    slide_id: string,
    bucket: string,
  ): Promise<HeatmapRow[]>;
  /**
   * Read rollup rows for a (deck, slide) across a date range. Returns
   * rows in bucket ASC order; the aggregator stitches them.
   */
  fetchRange(
    workspace_id: string,
    deck_id: string,
    slide_id: string,
    fromDate: string,
    toDate: string,
  ): Promise<HeatmapRow[]>;
  /**
   * Read rollup rows for an entire deck (all slides) on a single day.
   * Used by the per-deck dashboard view.
   */
  fetchDeckDay(workspace_id: string, deck_id: string, bucket: string): Promise<HeatmapRow[]>;
}

export function buildHeatmapStore(client: HeatmapClient): HeatmapStore {
  return {
    async fetchDay(workspace_id, deck_id, slide_id, bucket) {
      const rows = await client.query<HeatmapRow>(
        `SELECT workspace_id, deck_id, slide_id, tile_x, tile_y, bucket,
                impressions, pause_count, pause_total_ms, scrollthrough_ms
           FROM heatmap_tile
          WHERE workspace_id = {workspace_id:String}
            AND deck_id = {deck_id:String}
            AND slide_id = {slide_id:String}
            AND bucket = toDate({bucket:String})`,
        { workspace_id, deck_id, slide_id, bucket },
      );
      return rows;
    },
    async fetchRange(workspace_id, deck_id, slide_id, fromDate, toDate) {
      const rows = await client.query<HeatmapRow>(
        `SELECT workspace_id, deck_id, slide_id, tile_x, tile_y, bucket,
                impressions, pause_count, pause_total_ms, scrollthrough_ms
           FROM heatmap_tile
          WHERE workspace_id = {workspace_id:String}
            AND deck_id = {deck_id:String}
            AND slide_id = {slide_id:String}
            AND bucket >= toDate({from_date:String})
            AND bucket <= toDate({to_date:String})
          ORDER BY bucket ASC`,
        { workspace_id, deck_id, slide_id, from_date: fromDate, to_date: toDate },
      );
      return rows;
    },
    async fetchDeckDay(workspace_id, deck_id, bucket) {
      const rows = await client.query<HeatmapRow>(
        `SELECT workspace_id, deck_id, slide_id, tile_x, tile_y, bucket,
                impressions, pause_count, pause_total_ms, scrollthrough_ms
           FROM heatmap_tile
          WHERE workspace_id = {workspace_id:String}
            AND deck_id = {deck_id:String}
            AND bucket = toDate({bucket:String})`,
        { workspace_id, deck_id, bucket },
      );
      return rows;
    },
  };
}
