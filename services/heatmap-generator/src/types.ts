/**
 * Heatmap generator — shared types (Phase 17 W5).
 *
 * Tile grid: every slide is rendered into a 32×18 logical tile grid on
 * the viewer SDK side (see apps/viewer/src/heatmap/*). The browser emits
 * scroll_progress / scroll_pause events with tile_x / tile_y populated.
 * ClickHouse rollup materializes per-tile dwell + impression counts into
 * `domio_analytics.heatmap_tile` (SummingMergeTree).
 *
 * This service reads those rollup rows and produces the JSON shape the
 * dashboard consumes:
 *
 *   {
 *     deck_id,
 *     slide_id,
 *     tiles: [
 *       { x, y, dwell_ms, viewers, pause_count }
 *     ]
 *   }
 *
 * The grid is sparse — tiles with no impressions are omitted from the
 * JSON output (the dashboard fills them with zero). 32×18 = 576 cells
 * per slide, so a "full" slide would still be < 30 KB JSON.
 */

export const HEATMAP_GRID_WIDTH = 32;
export const HEATMAP_GRID_HEIGHT = 18;

/** Per-tile aggregate returned in the JSON export. */
export interface TileCell {
  /** Tile column in [0, HEATMAP_GRID_WIDTH). */
  x: number;
  /** Tile row in [0, HEATMAP_GRID_HEIGHT). */
  y: number;
  /** Total time viewers paused on this tile, in milliseconds. */
  dwell_ms: number;
  /** Number of unique viewers who scrolled through this tile. */
  viewers: number;
  /** Number of distinct scroll_pause events on this tile. */
  pause_count: number;
}

/** Raw row read from ClickHouse `heatmap_tile`. */
export interface HeatmapRow {
  workspace_id: string;
  deck_id: string;
  slide_id: string;
  tile_x: number;
  tile_y: number;
  bucket: string;
  impressions: number;
  pause_count: number;
  pause_total_ms: number;
  scrollthrough_ms: number;
}

/** Public JSON export shape. */
export interface HeatmapExport {
  deck_id: string;
  slide_id: string;
  /** Bucket the rollup was rolled up to (UTC date string YYYY-MM-DD). */
  bucket: string;
  grid_width: number;
  grid_height: number;
  tiles: TileCell[];
  /** Sum of pause_total_ms across all returned tiles (convenience field). */
  total_dwell_ms: number;
  /** Sum of viewers across all returned tiles (not unique — distinct viewers across tiles). */
  total_viewer_touches: number;
}

/**
 * Service configuration. Mirrors the pattern in services/analytics-warehouse
 * /services/sessionization — every value comes from env at boot.
 */
export interface HeatmapConfig {
  port: number;
  clickhouseUrl: string;
  clickhouseDb: string;
  clickhouseUser: string;
  clickhousePassword: string;
  /** Grid width (default 32). */
  gridWidth: number;
  /** Grid height (default 18). */
  gridHeight: number;
  /** If true, ClickHouse writes are disabled. Read path is always enabled. */
  readOnly: boolean;
}

export function loadConfigFromEnv(): HeatmapConfig {
  return {
    port: Number(process.env['PORT'] ?? '3052'),
    clickhouseUrl: process.env['CLICKHOUSE_URL'] ?? '',
    clickhouseDb: process.env['CLICKHOUSE_DB'] ?? 'domio_analytics',
    clickhouseUser: process.env['CLICKHOUSE_USER'] ?? 'default',
    clickhousePassword: process.env['CLICKHOUSE_PASSWORD'] ?? '',
    gridWidth: Number(process.env['HEATMAP_GRID_WIDTH'] ?? HEATMAP_GRID_WIDTH),
    gridHeight: Number(process.env['HEATMAP_GRID_HEIGHT'] ?? HEATMAP_GRID_HEIGHT),
    readOnly: process.env['HEATMAP_READ_ONLY'] !== 'false',
  };
}
