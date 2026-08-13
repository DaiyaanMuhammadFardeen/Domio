/**
 * Heatmap generator — default dependency wiring (Phase 17 W5).
 */

import type { HeatmapConfig } from './types.js';
import type { HeatmapDeps } from './deps.js';
import { buildHeatmapClient } from './client.js';
import { buildHeatmapStore } from './store/clickhouse.js';
import { HEATMAP_GRID_HEIGHT, HEATMAP_GRID_WIDTH } from './types.js';

export function defaultDeps(cfg: HeatmapConfig): HeatmapDeps {
  const ch = buildHeatmapClient(cfg);
  const store = buildHeatmapStore(ch);
  return {
    cfg,
    grid: {
      gridWidth: cfg.gridWidth ?? HEATMAP_GRID_WIDTH,
      gridHeight: cfg.gridHeight ?? HEATMAP_GRID_HEIGHT,
    },
    ch,
    store,
  };
}
