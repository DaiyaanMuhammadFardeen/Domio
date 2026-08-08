/**
 * Team-analytics — template/component/brand read DAO (Phase 17 W9).
 *
 * Each function issues a parameterised SELECT against the
 * `team_metric` materialized view (or `events` when the rollup is
 * missing a dimension) and returns the typed result. All functions
 * require an explicit workspace_id; never read across tenant lines.
 */

import type { ClickHouseClient } from './clickhouse.js';
import type {
  BrandHealthBadge,
  CohortRetentionCell,
  ComponentRow,
  FunnelStepRow,
  QueryScope,
  TemplateRow,
} from '../types.js';

function dateRange(scope: QueryScope): { fromDate: string; toDate: string } {
  return {
    fromDate: toDateTime(scope.from_ms),
    toDate: toDateTime(scope.to_ms),
  };
}

function toDateTime(ms: number): string {
  return new Date(ms).toISOString().replace('T', ' ').replace('Z', '');
}

export interface TemplateDao {
  topTemplates(scope: QueryScope, limit: number): Promise<TemplateRow[]>;
  topComponents(scope: QueryScope, limit: number): Promise<ComponentRow[]>;
  brandHealth(workspace_id: string, now_ms: number): Promise<BrandHealthBadge[]>;
  retentionCohorts(workspace_id: string, weeks: number, now_ms: number): Promise<CohortRetentionCell[]>;
  funnel(scope: QueryScope, steps: string[]): Promise<FunnelStepRow[]>;
}

export function buildTemplateDao(ch: ClickHouseClient): TemplateDao {
  return {
    async topTemplates(scope, limit) {
      const { fromDate, toDate } = dateRange(scope);
      const sql = `
        SELECT
          workspace_id,
          template_id,
          sum(deck_count) AS deck_count,
          sum(total_views) AS total_views,
          sum(total_completions) AS total_completions,
          uniqMerge(distinct_viewers) AS distinct_viewers,
          sum(composite_score) AS composite_score
        FROM team_metric_materialized_view
        WHERE workspace_id = {workspace_id:String}
          AND bucket >= toDate({from:DateTime})
          AND bucket < toDate({to:DateTime})
          AND template_id != ''
        GROUP BY workspace_id, template_id
        ORDER BY composite_score DESC
        LIMIT {limit:UInt32}
      `;
      return ch.query<TemplateRow>(sql, {
        workspace_id: scope.workspace_id,
        from: fromDate,
        to: toDate,
        limit,
      });
    },

    async topComponents(scope, limit) {
      const { fromDate, toDate } = dateRange(scope);
      const sql = `
        SELECT
          workspace_id,
          component_id,
          count() AS usage_count,
          sumIf(dwell_ms, event_name = 'scroll_progress') AS total_dwell_ms,
          uniqExact(viewer_id_key) AS distinct_viewers
        FROM events
        WHERE workspace_id = {workspace_id:String}
          AND ts >= {from:DateTime}
          AND ts < {to:DateTime}
          AND component_id != ''
          AND event_name IN ('view', 'interaction', 'scroll_progress')
        GROUP BY workspace_id, component_id
        ORDER BY usage_count DESC
        LIMIT {limit:UInt32}
      `;
      return ch.query<ComponentRow>(sql, {
        workspace_id: scope.workspace_id,
        from: fromDate,
        to: toDate,
        limit,
      });
    },

    async brandHealth(workspace_id, now_ms) {
      const halfMs = 30 * 24 * 60 * 60 * 1000;
      const halfStart = toDateTime(now_ms - halfMs);
      const nowDate = toDateTime(now_ms);
      const prevStart = toDateTime(now_ms - 2 * halfMs);
      const sql = `
        WITH
          toDate({now:DateTime}) AS today,
          toDate({half_start:DateTime}) AS half_start,
          toDate({prev_start:DateTime}) AS prev_start
        SELECT
          brand_kit_id,
          sumIf(total_views, bucket >= half_start AND bucket < today) AS total_views_30d,
          sumIf(total_views, bucket >= prev_start AND bucket < half_start) AS total_views_prev
        FROM team_metric_materialized_view
        WHERE workspace_id = {workspace_id:String}
          AND brand_kit_id != ''
          AND bucket >= prev_start AND bucket < today
        GROUP BY brand_kit_id
        ORDER BY total_views_30d DESC
      `;
      const rows = await ch.query<{
        brand_kit_id: string;
        total_views_30d: string | number;
        total_views_prev: string | number;
      }>(sql, {
        workspace_id,
        now: nowDate,
        half_start: halfStart,
        prev_start: prevStart,
      });
      return rows.map((r) => brandHealthRow(r));
    },

    async retentionCohorts(workspace_id, weeks, now_ms) {
      const startMs = now_ms - weeks * 7 * 24 * 60 * 60 * 1000;
      const startDate = toDateTime(startMs);
      const nowDate = toDateTime(now_ms);
      const sql = `
        WITH
          toDate({start:DateTime}) AS start_d,
          toDate({now:DateTime}) AS now_d
        SELECT
          toMonday(cohort) AS cohort_week,
          countIf(day = 0) AS cohort_size,
          countIf(day = 1) AS retained_day_1,
          countIf(day = 7) AS retained_day_7,
          countIf(day = 30) AS retained_day_30
        FROM (
          SELECT
            viewer_id_key,
            min(toDate(ts)) AS cohort
          FROM events
          WHERE workspace_id = {workspace_id:String}
            AND ts >= {start:DateTime}
            AND event_name = 'view'
            AND viewer_id_key != ''
          GROUP BY viewer_id_key
        ) cohorts
        INNER JOIN (
          SELECT
            viewer_id_key,
            dateDiff('day', cohort, event_day) AS day
          FROM (
            SELECT
              viewer_id_key,
              min(toDate(ts)) AS cohort,
              arrayJoin(groupArrayDistinct(toDate(ts))) AS event_day
            FROM events
            WHERE workspace_id = {workspace_id:String}
              AND ts >= {start:DateTime}
              AND event_name = 'view'
              AND viewer_id_key != ''
            GROUP BY viewer_id_key
          )
        ) activity USING viewer_id_key
        GROUP BY cohort_week
        ORDER BY cohort_week ASC
      `;
      const rows = await ch.query<{
        cohort_week: string;
        cohort_size: string | number;
        retained_day_1: string | number;
        retained_day_7: string | number;
        retained_day_30: string | number;
      }>(sql, {
        workspace_id,
        start: startDate,
        now: nowDate,
      });
      return rows.map((r) => retentionRow(r));
    },

    async funnel(scope, steps) {
      if (steps.length === 0) return [];
      const { fromDate, toDate } = dateRange(scope);
      // Build a UNION ALL of one SELECT per step that returns
      // (viewer_id_key) for events matching that step. The outer
      // SELECT counts distinct viewers at each step.
      const stepSelects = steps
        .map(
          (_, i) => `SELECT
              ${i} AS step_index,
              {step_${i}:String} AS step_name,
              viewer_id_key
            FROM events
            WHERE workspace_id = {workspace_id:String}
              AND ts >= {from:DateTime}
              AND ts < {to:DateTime}
              AND event_name = {step_${i}:String}`,
        )
        .join(' UNION ALL ');
      const sql = `
        SELECT
          step_index,
          step_name,
          uniqExact(viewer_id_key) AS entered
        FROM (${stepSelects})
        GROUP BY step_index, step_name
        ORDER BY step_index ASC
      `;
      const params: Record<string, unknown> = {
        workspace_id: scope.workspace_id,
        from: fromDate,
        to: toDate,
      };
      steps.forEach((s, i) => {
        params[`step_${i}`] = s;
      });
      const rows = await ch.query<{
        step_index: string | number;
        step_name: string;
        entered: string | number;
      }>(sql, params);
      const first = Number(rows[0]?.entered ?? 0);
      return rows.map((r, i) => funnelStepRow(r, i, first));
    },
  };
}

function brandHealthRow(r: {
  brand_kit_id: string;
  total_views_30d: string | number;
  total_views_prev: string | number;
}): BrandHealthBadge {
  const recent = Number(r.total_views_30d);
  const prev = Number(r.total_views_prev);
  let status: BrandHealthBadge['status'] = 'stable';
  let delta = 0;
  if (prev > 0) {
    delta = (recent - prev) / prev;
  } else if (recent > 0) {
    delta = 1;
  }
  if (delta > 0.2) status = 'trending';
  else if (delta < -0.2) status = 'declining';
  return {
    brand_kit_id: r.brand_kit_id,
    status,
    delta_pct: Math.round(delta * 1000) / 10,
    total_views_30d: recent,
  };
}

function retentionRow(r: {
  cohort_week: string;
  cohort_size: string | number;
  retained_day_1: string | number;
  retained_day_7: string | number;
  retained_day_30: string | number;
}): CohortRetentionCell {
  const size = Number(r.cohort_size);
  const d1 = Number(r.retained_day_1);
  const d7 = Number(r.retained_day_7);
  const d30 = Number(r.retained_day_30);
  return {
    cohort_week: r.cohort_week,
    cohort_size: size,
    retained_day_1: d1,
    retained_day_7: d7,
    retained_day_30: d30,
    retention_day_1: size > 0 ? d1 / size : 0,
    retention_day_7: size > 0 ? d7 / size : 0,
    retention_day_30: size > 0 ? d30 / size : 0,
  };
}

function funnelStepRow(
  r: { step_index: string | number; step_name: string; entered: string | number },
  fallbackIndex: number,
  firstEntered: number,
): FunnelStepRow {
  const entered = Number(r.entered);
  return {
    step_index: Number(r.step_index) || fallbackIndex,
    step_name: r.step_name,
    entered,
    completed: entered,
    conversion_rate: firstEntered > 0 ? entered / firstEntered : 0,
  };
}
