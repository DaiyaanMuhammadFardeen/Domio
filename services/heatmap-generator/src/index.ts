/**
 * @domio/heatmap-generator — public surface (Phase 17 W5).
 */

export * from './types.js';
export {
  aggregate,
  buildExport,
  stitchBuckets,
  type AggregatorConfig,
} from './engine/aggregator.js';
export { encodeHeatmapPng } from './engine/png_export.js';
export type { HeatmapClient, HeatmapStore } from './store/clickhouse.js';
export { buildHeatmapStore } from './store/clickhouse.js';
export { buildHeatmapClient } from './client.js';
export { buildApp } from './server.js';
export { defaultDeps } from './default_deps.js';
export type { HeatmapDeps } from './deps.js';
export { heatmapRoutes, enumerateDates, defaultGrid } from './routes/heatmap.js';
