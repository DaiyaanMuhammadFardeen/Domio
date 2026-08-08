/**
 * Heatmap generator — service dependencies (Phase 17 W5).
 */

import type { HeatmapConfig } from './types.js';
import type { HeatmapClient, HeatmapStore } from './store/clickhouse.js';
import type { AggregatorConfig } from './engine/aggregator.js';

export interface HeatmapDeps {
  cfg: HeatmapConfig;
  grid: AggregatorConfig;
  ch: HeatmapClient;
  store: HeatmapStore;
}
