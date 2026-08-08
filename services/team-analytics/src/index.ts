/**
 * Team-analytics — barrel exports (Phase 17 W9).
 */

export { buildApp, type TeamAppDeps } from './server.js';
export { buildTemplateDao, type TemplateDao } from './store/templates.js';
export {
  buildClickHouseClient,
  buildInMemoryClickHouseClient,
  ClickHouseError,
  type ClickHouseClient,
  type InMemoryClickHouseClient,
} from './store/clickhouse.js';
export type {
  BrandHealthBadge,
  CohortRetentionCell,
  ComponentRow,
  FunnelStepRow,
  QueryScope,
  TeamAnalyticsConfig,
  TemplateRow,
} from './types.js';
export { loadConfigFromEnv } from './types.js';
export { buildRollup, type RollupHandle } from './rollup/rollup.js';
export { computeCohorts, type RetentionEvent, type RetentionRow } from './rollup/retention.js';
export { computeFunnel, type FunnelInput, type FunnelEvent, type FunnelStep } from './rollup/funnel.js';