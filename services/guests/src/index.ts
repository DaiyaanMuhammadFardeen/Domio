/**
 * Domio guests-service (Phase 18).
 *
 * Guest access + magic-link service.
 *
 * Exports:
 *  - Service, handlers, store, types, feature flags, magic-link logic.
 */

export { GuestService } from './service.js';
export type { GuestServiceOptions } from './service.js';
export { handlers } from './handlers.js';
export type { HttpRequest, HttpResponse, GuestHandlerContext } from './handlers.js';
export { InMemoryGuestStore } from './store/mem_store.js';
export { PgGuestStore, StoreNotConfiguredError, StoreNotImplementedError } from './store/pg_store.js';
export type { GuestStore } from './store/store.js';
export { FEATURE_FLAGS, checkFeature } from './feature_flags.js';
export type { FeatureFlag } from './feature_flags.js';
export {
  ALLOWED_CAPABILITIES,
  DEFAULT_TTL_MINUTES,
  DEV_SECRET,
  issueMagicLinkToken,
  isExpired,
  validateCapabilities,
  resolveTtlMinutes,
} from './magic_link.js';

// Types
export type {
  ScopeType,
  GuestAccess,
  GuestMagicLink,
  CreateGuestInput,
  MagicLinkConsumeResult,
  GuestEvent,
  GuestEventEmitter,
} from './types.js';
export {
  GuestNotFoundError,
  MagicLinkInvalidError,
  MagicLinkExpiredError,
  MagicLinkConsumedError,
  MagicLinkInvalidatedError,
  GuestRevokedError,
  GuestExpiredError,
  InvalidCapabilityError,
  FeatureDisabledError,
  noopEmitter,
} from './types.js';
