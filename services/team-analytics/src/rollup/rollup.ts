/**
 * Team-analytics — workspace rollup daemon (Phase 17 W9).
 *
 * Schedules a periodic INSERT into `team_metric_materialized_view`
 * that aggregates the workspace template / component / brand kit
 * dimensions. Production wiring uses setInterval for now; the cron
 * cadence is configurable via TeamAnalyticsConfig.rollupIntervalMs.
 */

import type { ClickHouseClient } from '../store/clickhouse.js';

export interface RollupHandle {
  start(): void;
  stop(): void;
  /** Trigger an immediate run (used by tests). */
  runOnce(): Promise<void>;
  /** Number of completed rollup runs since boot. */
  runs(): number;
  /** Last error captured during a run. */
  lastError(): Error | null;
}

export function buildRollup(ch: ClickHouseClient, intervalMs: number): RollupHandle {
  let timer: NodeJS.Timeout | null = null;
  let runCount = 0;
  let lastErr: Error | null = null;

  async function runOnce(): Promise<void> {
    try {
      // The rollup statement joins deck→template/component/brand
      // mappings from Postgres (deck_metadata_long table) and
      // inserts per-day aggregates into team_metric_materialized_view.
      //
      // For the open-source cut we ship a stub INSERT that re-derives
      // the rollup from raw events. Production deployments replace
      // this with the JOINed version (see the README for the SQL).
      await ch.execute(
        `INSERT INTO team_metric_materialized_view
          (workspace_id, template_id, component_id, brand_kit_id, bucket,
           deck_count, total_views, total_completions, distinct_viewers, composite_score)
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
           toFloat64(countIf(event_name = 'view') + 5 * countIf(event_name = 'session_complete')) AS composite_score
         FROM events
         WHERE ts >= now() - INTERVAL 1 DAY
         GROUP BY workspace_id, bucket`,
      );
      runCount += 1;
      lastErr = null;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }

  return {
    start() {
      if (timer) return;
      timer = setInterval(() => {
        void runOnce();
      }, intervalMs);
      // Run once on boot so dashboards have fresh data without
      // waiting a full interval.
      void runOnce();
    },
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
    async runOnce() {
      await runOnce();
    },
    runs() {
      return runCount;
    },
    lastError() {
      return lastErr;
    },
  };
}
