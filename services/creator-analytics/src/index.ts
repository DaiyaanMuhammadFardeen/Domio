/**
 * Domio creator-analytics-service (Phase 19 Wave 3).
 *
 * Creator analytics + statements service.
 *
 * Exports:
 *  - Service, handlers, store, types, feature flags, analytics, statements.
 */

export { CreatorAnalyticsService } from './service.js';
export type { CreatorAnalyticsServiceOptions } from './service.js';
export { handlers } from './handlers.js';
export type { HttpRequest, HttpResponse, CreatorAnalyticsHandlerContext } from './handlers.js';
export { InMemoryAnalyticsStore } from './store/mem_store.js';
export { PgAnalyticsStore, StoreNotConfiguredError } from './store/pg_store.js';
export type { AnalyticsStore } from './store/store.js';
export { FEATURE_FLAGS, checkFeature } from './feature_flags.js';
export type { FeatureFlag } from './feature_flags.js';
export { computeAnalyticsBody, validatePeriod } from './analytics.js';
export type { AnalyticsInput } from './analytics.js';
export { buildStatementBody, buildYearly1099KBody, generateStatementId } from './statements.js';

// Types
export type {
  CreatorAnalytics,
  GeoCount,
  StatementSummary,
  StatementKind,
  StatementLineItem,
  RevenueEventRow,
  PaymentIntentRow,
  LicenseGrantRow,
  CreatorAnalyticsEvent,
} from './types.js';
export {
  FeatureDisabledError,
  CreatorNotFoundError,
  StatementNotFoundError,
  InvalidPeriodError,
} from './types.js';
