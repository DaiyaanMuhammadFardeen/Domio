/**
 * Domio expiry-service (Phase 18).
 *
 * Expiry policy + freshness-flag service.
 *
 * Exports:
 *  - Service, handlers, store, types, feature flags, policies.
 */

export { ExpiryService } from './service.js';
export type { ExpiryServiceOptions } from './service.js';
export { handlers } from './handlers.js';
export type { HttpRequest, HttpResponse, ExpiryHandlerContext } from './handlers.js';
export { InMemoryExpiryStore } from './store/mem_store.js';
export {
  PgExpiryStore,
  StoreNotConfiguredError,
  StoreNotImplementedError,
} from './store/pg_store.js';
export type { ExpiryStore } from './store/store.js';
export { FEATURE_FLAGS, checkFeature } from './feature_flags.js';
export type { FeatureFlag } from './feature_flags.js';
export {
  effectivePolicy,
  isOverdue,
  tierAction,
  validatePolicyInput,
  getExpiryDashboard,
} from './policies.js';
export type { TierAction, DashboardTierSummary, ExpiryDashboard } from './policies.js';

// Types
export type {
  ExpiryPolicy,
  ExpiryPolicyInput,
  EscalationTier,
  WorkspaceDefaults,
  FreshnessFlag,
  FlagReason,
  ShareRevoker,
  ExpiryEvent,
  ExpiryEventEmitter,
} from './types.js';
export {
  DEFAULT_WORKSPACE_DEFAULTS,
  NoopShareRevoker,
  noopEmitter,
  ExpiryValidationError,
  PolicyNotFoundError,
  ResourceFlaggedError,
  FeatureDisabledError,
} from './types.js';
