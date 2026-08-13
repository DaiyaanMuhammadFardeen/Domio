/**
 * Marketplace store interface (Phase 19 Wave 1).
 *
 * Transport-agnostic persistence layer for listings, reviews, payout policy,
 * listing versions, and audit events.
 * Two implementations:
 *  - {@link InMemoryMarketplaceStore} — used in tests and dev.
 *  - {@link PgMarketplaceStore}       — pg-pool-backed (scaffolding + full DML).
 */

import type {
  MarketplaceListing,
  MarketplaceReview,
  PayoutPolicy,
  ListingVersion,
  AuditEvent,
  PaymentIntent,
  LicenseGrant,
  RevenueShareEvent,
  PayoutLedgerEntry,
  FxRate,
  PayoutRun,
  WebhookDelivery,
  PartnerClient,
} from '../types.js';
import type {
  CreatorProfile,
  KycSession,
  CreatorPayoutMethod,
  KycStatus,
} from '../creator/types.js';
import type { BrandLockedListing } from '../curated/types.js';
import type {
  TakedownRequest,
  TrustScore,
  TakedownStatus,
  TakedownKind,
} from '../takedown/types.js';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface MarketplaceStore {
  // -------------------------------------------------------------------------
  // Listings
  // -------------------------------------------------------------------------

  insertListing(listing: MarketplaceListing): Promise<void>;
  getListing(listingId: string): Promise<MarketplaceListing | null>;
  getListingByCatalogId(catalogId: string): Promise<MarketplaceListing | null>;
  listListings(opts?: {
    status?: string;
    sellerId?: string;
    limit?: number;
  }): Promise<MarketplaceListing[]>;
  updateListing(
    listingId: string,
    patch: Partial<
      Pick<
        MarketplaceListing,
        | 'title'
        | 'description'
        | 'status'
        | 'isFree'
        | 'priceCents'
        | 'currency'
        | 'tags'
        | 'preview'
        | 'publishedAtMs'
        | 'deprecatedAtMs'
        | 'updatedAt'
      >
    >,
  ): Promise<MarketplaceListing>;

  // -------------------------------------------------------------------------
  // Listing Versions (changelog)
  // -------------------------------------------------------------------------

  insertListingVersion(version: ListingVersion): Promise<void>;
  listListingVersions(catalogId: string): Promise<ListingVersion[]>;

  // -------------------------------------------------------------------------
  // Reviews
  // -------------------------------------------------------------------------

  insertReview(review: MarketplaceReview): Promise<void>;
  getReview(reviewId: string): Promise<MarketplaceReview | null>;
  listReviewsByListing(listingId: string): Promise<MarketplaceReview[]>;
  updateReview(
    reviewId: string,
    patch: Partial<Pick<MarketplaceReview, 'status' | 'replyBody' | 'repliedAt'>>,
  ): Promise<MarketplaceReview>;
  hasVerifiedPurchase(reviewerId: string, listingId: string): Promise<boolean>;

  // -------------------------------------------------------------------------
  // Payout Policy
  // -------------------------------------------------------------------------

  getPayoutPolicy(): Promise<PayoutPolicy>;

  // -------------------------------------------------------------------------
  // Audit
  // -------------------------------------------------------------------------

  insertAuditEvent(event: AuditEvent): Promise<void>;
  getNextAuditSeq(workspaceId: string, eventKind: string): Promise<number>;
  getLastAuditHash(workspaceId: string, eventKind: string): Promise<string>;

  // -------------------------------------------------------------------------
  // Payment Intents (Phase 19 Wave 2)
  // -------------------------------------------------------------------------

  insertPaymentIntent(intent: PaymentIntent): Promise<void>;
  getPaymentIntentByPurchaseId(purchaseId: string): Promise<PaymentIntent | null>;
  getPaymentIntentByProviderIntentId(providerIntentId: string): Promise<PaymentIntent | null>;
  getPaymentIntentByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string,
  ): Promise<PaymentIntent | null>;
  updatePaymentIntentStatus(
    purchaseId: string,
    status: PaymentIntent['status'],
    patch?: Partial<
      Pick<
        PaymentIntent,
        'providerIntentId' | 'disputeStatus' | 'refundStatus' | 'refundedAt' | 'refundReason'
      >
    >,
  ): Promise<PaymentIntent>;

  // -------------------------------------------------------------------------
  // License Grants (Phase 19 Wave 2)
  // -------------------------------------------------------------------------

  insertLicenseGrant(grant: LicenseGrant): Promise<void>;
  getLicenseGrantByListingAndBuyer(
    listingId: string,
    buyerId: string,
  ): Promise<LicenseGrant | null>;

  // -------------------------------------------------------------------------
  // Revenue Share Events (Phase 19 Wave 2)
  // -------------------------------------------------------------------------

  insertRevenueShareEvent(event: RevenueShareEvent): Promise<void>;

  // -------------------------------------------------------------------------
  // Listing Freeze (Phase 19 Wave 2)
  // -------------------------------------------------------------------------

  markListingFrozen(listingId: string, frozenFor: string, frozenAt: Date): Promise<void>;
  clearListingFrozen(listingId: string): Promise<void>;

  // -------------------------------------------------------------------------
  // Payout Ledger Entries (Phase 19 Wave 2)
  // -------------------------------------------------------------------------

  insertPayoutLedgerEntry(entry: PayoutLedgerEntry): Promise<void>;
  listEligiblePayoutEvents(periodMonth: string): Promise<RevenueShareEvent[]>;

  // -------------------------------------------------------------------------
  // Creator Profiles (Phase 19 Wave 3)
  // -------------------------------------------------------------------------

  createCreatorProfile(profile: CreatorProfile): Promise<void>;
  getCreatorProfile(userId: string): Promise<CreatorProfile | null>;
  updateCreatorProfile(
    userId: string,
    patch: Partial<
      Pick<
        CreatorProfile,
        | 'displayName'
        | 'slug'
        | 'bio'
        | 'countryCode'
        | 'payoutMethod'
        | 'payoutReady'
        | 'kycStatus'
        | 'onboardingState'
        | 'balanceCents'
        | 'currency'
        | 'updatedAt'
      >
    >,
  ): Promise<CreatorProfile>;
  getCreatorByUserId(userId: string): Promise<CreatorProfile | null>;

  // -------------------------------------------------------------------------
  // KYC Sessions (Phase 19 Wave 3)
  // -------------------------------------------------------------------------

  createKycSession(session: KycSession): Promise<void>;
  getKycSessionByCreator(creatorId: string): Promise<KycSession | null>;
  updateKycSessionStatus(
    sessionId: string,
    status: KycStatus,
    patch?: Partial<Pick<KycSession, 'lastPolledAt' | 'raw'>>,
  ): Promise<KycSession>;

  // -------------------------------------------------------------------------
  // Creator Payout Methods (Phase 19 Wave 3)
  // -------------------------------------------------------------------------

  createPayoutMethod(method: CreatorPayoutMethod): Promise<void>;
  listPayoutMethodsByCreator(creatorId: string): Promise<CreatorPayoutMethod[]>;
  updatePayoutMethodVerified(methodId: string, verified: boolean): Promise<CreatorPayoutMethod>;

  // -------------------------------------------------------------------------
  // Transaction support
  // -------------------------------------------------------------------------

  withTransaction<T>(fn: () => Promise<T>): Promise<T>;

  // -------------------------------------------------------------------------
  // Brand-Locked Listings (Phase 19 Wave 4 — WS-MKT-5)
  // -------------------------------------------------------------------------

  insertBrandLock(lock: BrandLockedListing): Promise<void>;
  getBrandLock(
    workspaceId: string,
    brandKitId: string,
    marketplaceListingId: string,
  ): Promise<BrandLockedListing | null>;
  listBrandLocksByBrand(workspaceId: string, brandKitId: string): Promise<BrandLockedListing[]>;
  listBrandLocksByListing(marketplaceListingId: string): Promise<BrandLockedListing[]>;
  updateBrandLock(
    lockId: string,
    patch: Partial<
      Pick<
        BrandLockedListing,
        'state' | 'overridePriceCents' | 'notes' | 'auditActorId' | 'updatedBy'
      >
    >,
  ): Promise<BrandLockedListing>;
  deleteBrandLock(lockId: string): Promise<void>;

  // -------------------------------------------------------------------------
  // Takedown Requests (Phase 19 Wave 4 — WS-MKT-8)
  // -------------------------------------------------------------------------

  insertTakedownRequest(request: TakedownRequest): Promise<void>;
  getTakedownRequest(takedownId: string): Promise<TakedownRequest | null>;
  listTakedownRequests(opts?: {
    status?: TakedownStatus;
    kind?: TakedownKind;
  }): Promise<TakedownRequest[]>;
  listTakedownRequestsByListing(listingId: string): Promise<TakedownRequest[]>;
  updateTakedownStatus(
    takedownId: string,
    status: TakedownStatus,
    patch?: Partial<Pick<TakedownRequest, 'resolutionNotes' | 'resolvedAt' | 'updatedBy'>>,
  ): Promise<TakedownRequest>;

  // -------------------------------------------------------------------------
  // Trust Scores (Phase 19 Wave 4 — WS-MKT-8)
  // -------------------------------------------------------------------------

  upsertTrustScore(score: TrustScore): Promise<void>;
  getTrustScoreByListing(listingId: string): Promise<TrustScore | null>;

  // -------------------------------------------------------------------------
  // FX Rates (Phase 19 Wave 5 — WS-MKT-7)
  // -------------------------------------------------------------------------

  getLatestFxRate(base: string, quote: string): Promise<FxRate | null>;

  // -------------------------------------------------------------------------
  // Payout Runs (Phase 19 Wave 5 — WS-MKT-7)
  // -------------------------------------------------------------------------

  listPayoutRuns(opts?: { periodMonth?: string }): Promise<PayoutRun[]>;
  getPayoutRun(runId: string): Promise<PayoutRun | null>;

  // -------------------------------------------------------------------------
  // Webhook Deliveries (Phase 19 Wave 5 — WS-MKT-5/8/9)
  // -------------------------------------------------------------------------

  createWebhookDelivery(delivery: WebhookDelivery): Promise<void>;
  getWebhookDelivery(deliveryId: string): Promise<WebhookDelivery | null>;
  updateWebhookDeliveryStatus(
    deliveryId: string,
    status: WebhookDelivery['status'],
    patch?: Partial<
      Pick<WebhookDelivery, 'lastError' | 'attempts' | 'deliveredAt' | 'nextRetryAt'>
    >,
  ): Promise<WebhookDelivery>;
  listWebhookDeliveriesDue(nextRetryAt: Date): Promise<WebhookDelivery[]>;

  // -------------------------------------------------------------------------
  // Partner Clients (Phase 19 Wave 5 — WS-MKT-5/8/9)
  // -------------------------------------------------------------------------

  getPartnerClientByClientId(clientId: string): Promise<PartnerClient | null>;
}
