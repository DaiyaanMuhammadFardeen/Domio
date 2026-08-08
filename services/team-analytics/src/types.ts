/**
 * Team-analytics — shared types (Phase 17 W9).
 *
 * Team analytics aggregates the workspace-scoped engagement signals
 * (templates, components, brand kits) so team admins can see which
 * design primitives drive retention. The endpoints run read-only
 * queries against ClickHouse materialized views and `events`.
 */

/** Minimal scoping input shared by every query. */
export interface QueryScope {
  workspace_id: string;
  /** Inclusive lower bound, epoch ms. */
  from_ms: number;
  /** Exclusive upper bound, epoch ms. */
  to_ms: number;
}

export interface TeamAnalyticsConfig {
  port: number;
  /** ClickHouse HTTP endpoint. */
  clickhouseUrl: string;
  clickhouseDb: string;
  clickhouseUser: string;
  clickhousePassword: string;
  /** When false, rollup writes are disabled. */
  rollupEnabled: boolean;
  /** Cron interval for rollups (ms). Default 24h. */
  rollupIntervalMs: number;
}

export function loadConfigFromEnv(): TeamAnalyticsConfig {
  return {
    port: Number(process.env['PORT'] ?? '3060'),
    clickhouseUrl: process.env['CLICKHOUSE_URL'] ?? 'http://localhost:8123',
    clickhouseDb: process.env['CLICKHOUSE_DB'] ?? 'domio_analytics',
    clickhouseUser: process.env['CLICKHOUSE_USER'] ?? 'default',
    clickhousePassword: process.env['CLICKHOUSE_PASSWORD'] ?? '',
    rollupEnabled: process.env['TEAM_ROLLUP_ENABLED'] !== 'false',
    rollupIntervalMs: Number(process.env['TEAM_ROLLUP_INTERVAL_MS'] ?? 24 * 60 * 60 * 1000),
  };
}

export interface TemplateRow {
  workspace_id: string;
  template_id: string;
  deck_count: number;
  total_views: number;
  total_completions: number;
  distinct_viewers: number;
  composite_score: number;
}

export interface ComponentRow {
  workspace_id: string;
  component_id: string;
  usage_count: number;
  total_dwell_ms: number;
  distinct_viewers: number;
}

export interface BrandHealthBadge {
  brand_kit_id: string;
  status: 'trending' | 'stable' | 'declining';
  delta_pct: number;
  total_views_30d: number;
}

export interface CohortRetentionCell {
  cohort_week: string; // ISO date of the Monday
  cohort_size: number;
  retained_day_1: number;
  retained_day_7: number;
  retained_day_30: number;
  retention_day_1: number; // 0..1
  retention_day_7: number;
  retention_day_30: number;
}

export interface FunnelStepRow {
  step_index: number;
  step_name: string;
  entered: number;
  completed: number;
  conversion_rate: number; // entered / step 0 entered
}
