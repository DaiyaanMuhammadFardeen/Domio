/**
 * Analytics-warehouse — shared types (Phase 17 W2).
 *
 * The warehouse aggregates the slice of the analytics surface that the
 * dashboard (apps/dashboard) consumes. The table layout is defined in
 * infrastructure/clickhouse/init/00{1,2,3,4}_phase17_*.sql.
 */

/** Minimal scoping input shared by every query. */
export interface QueryScope {
  workspace_id: string;
  /** Inclusive lower bound, epoch ms. */
  from_ms: number;
  /** Exclusive upper bound, epoch ms. */
  to_ms: number;
}

export interface DeckSummary {
  workspace_id: string;
  deck_id: string;
  session_count: number;
  viewer_count: number;
  total_events: number;
  avg_session_ms: number;
  completion_rate: number;
}

export interface SlideBreakdown {
  workspace_id: string;
  deck_id: string;
  slide_id: string;
  views: number;
  unique_viewers: number;
  avg_dwell_ms: number;
  bounce_rate: number;
}

export interface FunnelStep {
  workspace_id: string;
  deck_id: string;
  step_name: string;
  entered: number;
  completed: number;
  completion_rate: number;
}

export interface HeatmapCell {
  slide_id: string;
  x: number;
  y: number;
  intensity: number;
}

export interface HeatmapTile {
  workspace_id: string;
  deck_id: string;
  slide_id: string;
  grid_cols: number;
  grid_rows: number;
  cells: HeatmapCell[];
}

export interface WarehouseConfig {
  clickhouseUrl: string;
  clickhouseDb: string;
  clickhouseUser: string;
  clickhousePassword: string;
  port: number;
  /** When true, the warehouse issues read-only queries (force at the HTTP layer). */
  readOnly: boolean;
}

export function loadConfigFromEnv(): WarehouseConfig {
  return {
    clickhouseUrl: process.env['CLICKHOUSE_URL'] ?? 'http://localhost:8123',
    clickhouseDb: process.env['CLICKHOUSE_DB'] ?? 'domio_analytics',
    clickhouseUser: process.env['CLICKHOUSE_USER'] ?? 'default',
    clickhousePassword: process.env['CLICKHOUSE_PASSWORD'] ?? '',
    port: Number(process.env['PORT'] ?? '3030'),
    readOnly: process.env['READ_ONLY'] !== 'false',
  };
}
