/**
 * Domio marketplace-service (Phase 19 Wave 1+2).
 *
 * Marketplace & Creator Economy service.
 *
 * Exports:
 *  - Service, handlers, store, types, feature flags, pricing, audit,
 *    payments, license.
 */

export { MarketplaceService } from './service.js';
export type { MarketplaceServiceOptions } from './service.js';
export { handlers } from './handlers.js';
export type { HttpRequest, HttpResponse, MarketplaceHandlerContext } from './handlers.js';
export { InMemoryMarketplaceStore } from './store/mem_store.js';
export { PgMarketplaceStore, StoreNotConfiguredError, StoreNotImplementedError } from './store/pg_store.js';
export type { MarketplaceStore } from './store/store.js';
export { FEATURE_FLAGS, checkFeature } from './feature_flags.js';
export type { FeatureFlag } from './feature_flags.js';
export { calculatePrice, normalizeCurrency } from './pricing.js';
export { InMemoryAuditRecorder, computeHash, verifyHash, AUDIT_KID, GENESIS_HASH } from './audit.js';
export type { AuditRecorder, AuditStore } from './audit.js';

// Payment providers (Phase 19 Wave 2)
export { StripeSandboxProvider, BkashSandboxProvider, NagadSandboxProvider } from './payments/providers.js';
export type { PaymentProvider, CreateCheckoutInput, CreateCheckoutResult } from './payments/types.js';

// License signer (Phase 19 Wave 2)
export { SandboxLicenseSigner, verifyLicenseToken } from './license.js';
export type { LicenseSigner } from './license.js';

// Types
export type {
  MarketplaceListing,
  ListingStatus,
  ListingVersion,
  MarketplaceReview,
  ReviewStatus,
  PayoutPolicy,
  PriceBreakdown,
  PricingModel,
  AuditEvent,
  AuditActorType,
  AuditActorKind,
  AuditEventKind,
  MarketplaceEvent,
  MarketplaceEventEmitter,
  PaymentIntent,
  PaymentProviderType,
  PaymentStatus,
  RefundStatus,
  DisputeStatus,
  PurchaseInitiation,
  RefundRequest,
  LicenseGrant,
  RevenueShareEvent,
  RevenuePayoutStatus,
  PayoutLedgerEntry,
  PayoutEntryStatus,
  ChargebackEventType,
  UsageProvider,
} from './types.js';
export {
  LISTING_TRANSITIONS,
  noopEmitter,
  FeatureDisabledError,
  ListingNotFoundError,
  ReviewNotFoundError,
  InvalidTransitionError,
  DuplicateCatalogIdError,
  NotVerifiedBuyerError,
  AlreadyRepliedError,
  MarketplaceValidationError,
  defaultUsageProvider,
} from './types.js';
