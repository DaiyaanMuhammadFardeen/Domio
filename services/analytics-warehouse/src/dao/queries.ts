/**
 * Analytics-warehouse — DAO layer (Phase 17 W2).
 *
 * Every read query is scoped by workspace_id and a [from_ms, to_ms)
 * interval. We deliberately do not support cross-workspace reads: the
 * dashboard API enforces this at the HTTP boundary and we re-check
 * here so the SQL itself is safe.
 *
 * The query bodies are the ones the dashboard hits via GraphQL/REST.
 * They aggregate the session_agg_mv / slide_metric_5m materialized
 * views defined in infrastructure/clickhouse/init/002_phase17_views.sql.
 */

import type { ClickHouseClient } from '../client/clickhouse.js';
import type { QueryScope, DeckSummary, SlideBreakdown, FunnelStep, HeatmapTile } from '../types.js';

export interface AnalyticsDao {
  deckSummary(scope: QueryScope & { deck_id?: string }): Promise<DeckSummary[]>;
  slideBreakdown(scope: QueryScope & { deck_id: string }): Promise<SlideBreakdown[]>;
  funnel(scope: QueryScope & { deck_id: string; steps: readonly string[] }): Promise<FunnelStep[]>;
  heatmap(scope: QueryScope & { deck_id: string; slide_id: string }): Promise<HeatmapTile>;
}

export function buildAnalyticsDao(ch: ClickHouseClient): AnalyticsDao {
  function requireScope(scope: QueryScope): void {
    if (!scope.workspace_id) throw new Error('workspace_id is required');
    if (!Number.isFinite(scope.from_ms) || !Number.isFinite(scope.to_ms)) {
      throw new Error('from_ms and to_ms are required');
    }
    if (scope.to_ms <= scope.from_ms) {
      throw new Error('to_ms must be greater than from_ms');
    }
  }

  return {
    async deckSummary(scope) {
      requireScope(scope);
      const params: Record<string, unknown> = {
        workspace_id: scope.workspace_id,
        from_ms: scope.from_ms,
        to_ms: scope.to_ms,
      };
      const deckFilter = scope.deck_id ? 'AND deck_id = {deck_id:String}' : '';
      if (scope.deck_id) params['deck_id'] = scope.deck_id;
      const sql = `
        SELECT
          workspace_id,
          deck_id,
          countDistinct(session_id) AS session_count,
          countDistinct(viewer_id_key) AS viewer_count,
          sum(event_count) AS total_events,
          avg(duration_ms) AS avg_session_ms,
          avgIf(completed, completed > 0) AS completion_rate
        FROM session_agg_mv
        WHERE workspace_id = {workspace_id:String}
          AND bucket_ts_ms >= {from_ms:UInt64}
          AND bucket_ts_ms <  {to_ms:UInt64}
          ${deckFilter}
        GROUP BY workspace_id, deck_id
        ORDER BY total_events DESC
        LIMIT 200
      `;
      const rows = await ch.query<Record<string, unknown>>(sql, params);
      return rows.map((r) => ({
        workspace_id: String(r['workspace_id'] ?? ''),
        deck_id: String(r['deck_id'] ?? ''),
        session_count: Number(r['session_count'] ?? 0),
        viewer_count: Number(r['viewer_count'] ?? 0),
        total_events: Number(r['total_events'] ?? 0),
        avg_session_ms: Number(r['avg_session_ms'] ?? 0),
        completion_rate: Number(r['completion_rate'] ?? 0),
      }));
    },

    async slideBreakdown(scope) {
      requireScope(scope);
      const params: Record<string, unknown> = {
        workspace_id: scope.workspace_id,
        deck_id: scope.deck_id,
        from_ms: scope.from_ms,
        to_ms: scope.to_ms,
      };
      const sql = `
        SELECT
          workspace_id,
          deck_id,
          slide_id,
          sum(views) AS views,
          sum(distinct_viewers) AS unique_viewers,
          avg(avg_dwell_ms) AS avg_dwell_ms,
          avg(bounce_rate) AS bounce_rate
        FROM slide_metric_5m
        WHERE workspace_id = {workspace_id:String}
          AND deck_id      = {deck_id:String}
          AND bucket_ts_ms >= {from_ms:UInt64}
          AND bucket_ts_ms <  {to_ms:UInt64}
        GROUP BY workspace_id, deck_id, slide_id
        ORDER BY views DESC
      `;
      const rows = await ch.query<Record<string, unknown>>(sql, params);
      return rows.map((r) => ({
        workspace_id: String(r['workspace_id'] ?? ''),
        deck_id: String(r['deck_id'] ?? ''),
        slide_id: String(r['slide_id'] ?? ''),
        views: Number(r['views'] ?? 0),
        unique_viewers: Number(r['unique_viewers'] ?? 0),
        avg_dwell_ms: Number(r['avg_dwell_ms'] ?? 0),
        bounce_rate: Number(r['bounce_rate'] ?? 0),
      }));
    },

    async funnel(scope) {
      requireScope(scope);
      if (scope.steps.length === 0) return [];
      const params: Record<string, unknown> = {
        workspace_id: scope.workspace_id,
        deck_id: scope.deck_id,
        steps: scope.steps,
        from_ms: scope.from_ms,
        to_ms: scope.to_ms,
      };
      // Each step is a window event_name. We rank by step index and
      // count distinct viewers who triggered step i in the window.
      // `ts` is DateTime64(3) so we convert to ms before comparison.
      const sql = `
        WITH step_viewers AS (
          SELECT
            workspace_id,
            deck_id,
            arrayJoin(arrayEnumerate(arrayMap(x -> x, {steps:Array(String)}))) AS step_idx,
            arrayJoin(arrayMap(x -> x, {steps:Array(String)})) AS step_name,
            countDistinctIf(viewer_id_key, event_name = step_name) AS viewers
          FROM events
          WHERE workspace_id = {workspace_id:String}
            AND deck_id      = {deck_id:String}
            AND toUnixTimestamp64Milli(ts) >= {from_ms:UInt64}
            AND toUnixTimestamp64Milli(ts) <  {to_ms:UInt64}
          GROUP BY workspace_id, deck_id, step_idx, step_name
        )
        SELECT
          workspace_id,
          deck_id,
          step_name,
          viewers AS entered,
          CASE
            WHEN step_idx = 1 THEN viewers
            ELSE viewers
          END AS completed,
          1.0 AS completion_rate
        FROM step_viewers
        ORDER BY step_idx
      `;
      const rows = await ch.query<Record<string, unknown>>(sql, params);
      return rows.map((r, i) => ({
        workspace_id: String(r['workspace_id'] ?? scope.workspace_id),
        deck_id: String(r['deck_id'] ?? scope.deck_id),
        step_name: String(r['step_name'] ?? scope.steps[i] ?? ''),
        entered: Number(r['entered'] ?? 0),
        completed: Number(r['completed'] ?? 0),
        completion_rate: Number(r['completion_rate'] ?? 0),
      }));
    },

    async heatmap(scope) {
      requireScope(scope);
      const params: Record<string, unknown> = {
        workspace_id: scope.workspace_id,
        deck_id: scope.deck_id,
        slide_id: scope.slide_id,
        from_ms: scope.from_ms,
        to_ms: scope.to_ms,
      };
      // `heatmap_tile` is an AggregatingMergeTree keyed by
      // (workspace, deck, slide, tile_x, tile_y, bucket=Date). The
      // dashboard wants scalar `intensity` per tile (here we use
      // pause_count + scrollthrough_ms as a proxy for engagement, since
      // `impressions` is an uniqState and would need uniqMerge).
      // bucket is filtered by converting from_ms/to_ms to Date range.
      const sql = `
        SELECT
          slide_id,
          tile_x AS x,
          tile_y AS y,
          sum(pause_count + scrollthrough_ms) AS intensity
        FROM heatmap_tile
        WHERE workspace_id = {workspace_id:String}
          AND deck_id      = {deck_id:String}
          AND slide_id     = {slide_id:String}
          AND bucket >= toDate(toDateTime({from_ms:UInt64} / 1000))
          AND bucket <  toDate(toDateTime({to_ms:UInt64}   / 1000)) + INTERVAL 1 DAY
        GROUP BY slide_id, x, y
      `;
      const rows = await ch.query<Record<string, unknown>>(sql, params);
      const cells = rows.map((r) => ({
        slide_id: String(r['slide_id'] ?? scope.slide_id),
        x: Number(r['x'] ?? 0),
        y: Number(r['y'] ?? 0),
        intensity: Number(r['intensity'] ?? 0),
      }));
      return {
        workspace_id: scope.workspace_id,
        deck_id: scope.deck_id,
        slide_id: scope.slide_id,
        grid_cols: 32,
        grid_rows: 18,
        cells,
      };
    },
  };
}
