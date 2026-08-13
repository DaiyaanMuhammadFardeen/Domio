/**
 * Analytics-warehouse — barrel exports (Phase 17 W2).
 */

export { buildApp } from './server.js';
export { buildClickHouseClient, ClickHouseError } from './client/clickhouse.js';
export { buildAnalyticsDao, type AnalyticsDao } from './dao/queries.js';
export {
  buildOrchestrator,
  startOrchestrator,
  defaultRollupConfig,
} from './rollup/orchestrator.js';
export { analyticsTypeDefs } from './graphql/schema.js';
export { buildResolvers } from './graphql/resolvers.js';
export type {
  WarehouseConfig,
  QueryScope,
  DeckSummary,
  SlideBreakdown,
  FunnelStep,
  HeatmapTile,
  HeatmapCell,
} from './types.js';
