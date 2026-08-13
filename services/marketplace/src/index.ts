/**
 * Domio marketplace-service (Phase 19 Wave 1+2+3+4+5).
 *
 * Marketplace & Creator Economy service.
 *
 * Exports:
 *  - Service, handlers, store, types, feature flags, pricing, audit,
 *    payments, license, creator, curated, takedown, mcp, webhooks, partner.
 */

export { MarketplaceService } from './service.js';
export type { MarketplaceServiceOptions } from './service.js';
export { handlers } from './handlers.js';
export type { HttpRequest, HttpResponse, MarketplaceHandlerContext } from './handlers.js';
export { InMemoryMarketplaceStore } from './store/mem_store.js';
export {
  PgMarketplaceStore,
  StoreNotConfiguredError,
  StoreNotImplementedError,
} from './store/pg_store.js';
export type { MarketplaceStore } from './store/store.js';
export { FEATURE_FLAGS, checkFeature } from './feature_flags.js';
export type { FeatureFlag } from './feature_flags.js';
export { calculatePrice, normalizeCurrency } from './pricing.js';
export {
  InMemoryAuditRecorder,
  computeHash,
  verifyHash,
  AUDIT_KID,
  GENESIS_HASH,
} from './audit.js';
export type { AuditRecorder, AuditStore } from './audit.js';

// Payment providers (Phase 19 Wave 2)
export {
  StripeSandboxProvider,
  BkashSandboxProvider,
  NagadSandboxProvider,
} from './payments/providers.js';
export type {
  PaymentProvider,
  CreateCheckoutInput,
  CreateCheckoutResult,
} from './payments/types.js';

// License signer (Phase 19 Wave 2)
export { SandboxLicenseSigner, verifyLicenseToken } from './license.js';
export type { LicenseSigner } from './license.js';

// Creator module (Phase 19 Wave 3)
export { SandboxKycProvider, SandboxPayoutConnectProvider } from './creator/providers.js';
export {
  validateTransition,
  canSellPaidListings,
  ONBOARDING_TRANSITIONS,
} from './creator/onboarding.js';
export { startKycSessionBody, pollKycStatusBody } from './creator/kyc.js';
export {
  validatePayoutMethodKind,
  createPayoutMethodBody,
  connectLinkBody,
} from './creator/payout.js';
export type {
  CreatorProfile,
  KycSession,
  CreatorPayoutMethod,
  OnboardingState,
  KycStatus,
  PayoutMethodKind,
  KycProvider,
  PayoutConnectProvider,
} from './creator/types.js';
export {
  OnboardingTransitionError,
  KycNotStartedError,
  KycInProgressError,
  PayoutMethodNotFoundError,
  PayoutNotReadyError,
} from './creator/types.js';

// Curated / Brand-Lock module (Phase 19 Wave 4 — WS-MKT-5)
export {
  validateBrandLockInput,
  assertNotDenied,
  resolveVisibleListingIds,
  getOverridePrice,
} from './curated/logic.js';
export type { BrandLockedListing, BrandLockState } from './curated/types.js';
export {
  BrandLockDeniedError,
  InvalidBrandLockError,
  BrandLockNotFoundError,
} from './curated/types.js';

// Takedown + Trust module (Phase 19 Wave 4 — WS-MKT-8)
export {
  TAKEDOWN_TRANSITIONS,
  validateTakedownTransition,
  validateTakedownInput,
  fileTakedownBody,
  resolveBody,
  dismissBody,
  counterNoticeBody,
  computeTrustScore,
} from './takedown/logic.js';
export type {
  TakedownRequest,
  TakedownKind,
  TakedownStatus,
  TrustScore,
} from './takedown/types.js';
export {
  InvalidTakedownTransitionError,
  TakedownNotFoundError,
  TrustScoreNotFoundError,
} from './takedown/types.js';

// MCP module (Phase 19 Wave 5 — WS-MKT-9)
export { checkMcpCapability, validateMcpToolInput } from './mcp/access.js';
export { MCP_TOOL_DEFINITIONS, CAPABILITY_TOOLS, executeMcpTool } from './mcp/tools.js';

// Webhooks module (Phase 19 Wave 5 — WS-MKT-5/8/9)
export { WebhookDispatcher, RateLimiter } from './webhooks/dispatcher.js';

// Partner module (Phase 19 Wave 5 — WS-MKT-5/8/9)
export { PartnerClientService } from './partner/client.js';
export { hasScope, getRateLimit, validatePartnerAccess } from './partner/access.js';
export type { PartnerClientServiceOptions } from './partner/client.js';
export {
  PartnerClientNotFoundError,
  InvalidClientSecretError,
  InsufficientScopeError,
  McpPermissionDeniedError,
} from './types.js';
export type {
  FxRate,
  PayoutRun,
  PayoutRunStatus,
  WebhookDelivery,
  WebhookDeliveryStatus,
  PartnerClient,
  PartnerClientTier,
  McpCapability,
  McpToolName,
  McpToolResult,
  McpToolInput,
} from './types.js';

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
