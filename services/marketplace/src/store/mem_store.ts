/**
 * In-memory marketplace store (Phase 19 Wave 1).
 *
 * Backs every method of {@link MarketplaceStore} with Maps. Used in unit
 * tests and in dev when DATABASE_URL is unset.
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
import {
  ListingNotFoundError,
  ReviewNotFoundError,
} from '../types.js';
import type {
  CreatorProfile,
  KycSession,
  CreatorPayoutMethod,
  KycStatus,
} from '../creator/types.js';
import type { BrandLockedListing } from '../curated/types.js';
import { BrandLockNotFoundError } from '../curated/types.js';
import type { TakedownRequest, TrustScore, TakedownStatus, TakedownKind } from '../takedown/types.js';
import { TakedownNotFoundError } from '../takedown/types.js';
import type { MarketplaceStore } from './store.js';

export class InMemoryMarketplaceStore implements MarketplaceStore {
  private readonly listings = new Map<string, MarketplaceListing>();
  private readonly reviews = new Map<string, MarketplaceReview>();
  private readonly versions: ListingVersion[] = [];
  private readonly auditEvents: AuditEvent[] = [];
  private readonly paymentIntents = new Map<string, PaymentIntent>();
  private readonly licenseGrants: LicenseGrant[] = [];
  private readonly revenueShareEvents: RevenueShareEvent[] = [];
  private readonly payoutLedgerEntries: PayoutLedgerEntry[] = [];
  private readonly creatorProfiles = new Map<string, CreatorProfile>();
  private readonly kycSessions = new Map<string, KycSession>();
  private readonly payoutMethods = new Map<string, CreatorPayoutMethod>();
  private payoutPolicy: PayoutPolicy = {
    id: 'default',
    splitCreatorBps: 7000,
    splitPlatformBps: 3000,
    minPayoutCents: 5000,
    firstPayoutHoldDays: 30,
    updatedAt: new Date(),
    updatedBy: null,
  };

  // -------------------------------------------------------------------------
  // Listings
  // -------------------------------------------------------------------------

  async insertListing(listing: MarketplaceListing): Promise<void> {
    this.listings.set(listing.id, listing);
  }

  async getListing(listingId: string): Promise<MarketplaceListing | null> {
    return this.listings.get(listingId) ?? null;
  }

  async getListingByCatalogId(catalogId: string): Promise<MarketplaceListing | null> {
    for (const l of this.listings.values()) {
      if (l.catalogId === catalogId && l.status !== 'removed') return l;
    }
    return null;
  }

  async listListings(
    opts?: { status?: string; sellerId?: string; limit?: number },
  ): Promise<MarketplaceListing[]> {
    const results: MarketplaceListing[] = [];
    for (const l of this.listings.values()) {
      if (opts?.status && l.status !== opts.status) continue;
      if (!opts?.status && l.status === 'removed') continue;
      if (opts?.sellerId && l.sellerId !== opts.sellerId) continue;
      results.push(l);
    }
    return results.slice(0, opts?.limit ?? 50);
  }

  async updateListing(
    listingId: string,
    patch: Partial<Pick<MarketplaceListing,
      'title' | 'description' | 'status' | 'isFree' | 'priceCents' | 'currency' |
      'tags' | 'preview' | 'publishedAtMs' | 'deprecatedAtMs' | 'updatedAt'
    >>,
  ): Promise<MarketplaceListing> {
    const existing = this.listings.get(listingId);
    if (!existing) throw new ListingNotFoundError(listingId);
    const updated: MarketplaceListing = { ...existing, ...patch } as MarketplaceListing;
    this.listings.set(listingId, updated);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Listing Versions
  // -------------------------------------------------------------------------

  async insertListingVersion(version: ListingVersion): Promise<void> {
    this.versions.push(version);
  }

  async listListingVersions(catalogId: string): Promise<ListingVersion[]> {
    return this.versions.filter(v => v.catalogId === catalogId);
  }

  // -------------------------------------------------------------------------
  // Reviews
  // -------------------------------------------------------------------------

  async insertReview(review: MarketplaceReview): Promise<void> {
    this.reviews.set(review.id, review);
  }

  async getReview(reviewId: string): Promise<MarketplaceReview | null> {
    return this.reviews.get(reviewId) ?? null;
  }

  async listReviewsByListing(listingId: string): Promise<MarketplaceReview[]> {
    const results: MarketplaceReview[] = [];
    for (const r of this.reviews.values()) {
      if (r.listingId === listingId) results.push(r);
    }
    return results;
  }

  async updateReview(
    reviewId: string,
    patch: Partial<Pick<MarketplaceReview, 'status' | 'replyBody' | 'repliedAt'>>,
  ): Promise<MarketplaceReview> {
    const existing = this.reviews.get(reviewId);
    if (!existing) throw new ReviewNotFoundError(reviewId);
    const updated: MarketplaceReview = { ...existing, ...patch } as MarketplaceReview;
    this.reviews.set(reviewId, updated);
    return updated;
  }

  async hasVerifiedPurchase(reviewerId: string, listingId: string): Promise<boolean> {
    // Wave-1 stub: check if any review for this listing was submitted by this
    // reviewer with verifiedBuyer=true (simulates purchase verification).
    for (const r of this.reviews.values()) {
      if (r.reviewerId === reviewerId && r.listingId === listingId && r.verifiedBuyer) {
        return true;
      }
    }
    // Also allow via a dedicated flag stored on the listing (dev convenience).
    return false;
  }

  // -------------------------------------------------------------------------
  // Payout Policy
  // -------------------------------------------------------------------------

  async getPayoutPolicy(): Promise<PayoutPolicy> {
    return this.payoutPolicy;
  }

  // -------------------------------------------------------------------------
  // Audit
  // -------------------------------------------------------------------------

  async insertAuditEvent(event: AuditEvent): Promise<void> {
    this.auditEvents.push(event);
  }

  async getNextAuditSeq(workspaceId: string, eventKind: string): Promise<number> {
    let max = 0;
    for (const e of this.auditEvents) {
      if (e.workspaceId === workspaceId && e.eventKind === eventKind && e.seq > max) {
        max = e.seq;
      }
    }
    return max + 1;
  }

  async getLastAuditHash(workspaceId: string, eventKind: string): Promise<string> {
    let latest: AuditEvent | null = null;
    for (const e of this.auditEvents) {
      if (e.workspaceId === workspaceId && e.eventKind === eventKind) {
        if (!latest || e.seq > latest.seq) latest = e;
      }
    }
    return latest?.hash ?? '';
  }

  // -------------------------------------------------------------------------
  // Transaction support (no-op for in-memory)
  // -------------------------------------------------------------------------

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }

  // -------------------------------------------------------------------------
  // Payment Intents (Phase 19 Wave 2)
  // -------------------------------------------------------------------------

  async insertPaymentIntent(intent: PaymentIntent): Promise<void> {
    this.paymentIntents.set(intent.purchaseId, intent);
  }

  async getPaymentIntentByPurchaseId(purchaseId: string): Promise<PaymentIntent | null> {
    return this.paymentIntents.get(purchaseId) ?? null;
  }

  async getPaymentIntentByProviderIntentId(providerIntentId: string): Promise<PaymentIntent | null> {
    for (const intent of this.paymentIntents.values()) {
      if (intent.providerIntentId === providerIntentId) return intent;
    }
    return null;
  }

  async getPaymentIntentByIdempotencyKey(workspaceId: string, idempotencyKey: string): Promise<PaymentIntent | null> {
    for (const intent of this.paymentIntents.values()) {
      if (intent.workspaceId === workspaceId && intent.idempotencyKey === idempotencyKey) {
        return intent;
      }
    }
    return null;
  }

  async updatePaymentIntentStatus(
    purchaseId: string,
    status: PaymentIntent['status'],
    patch?: Partial<Pick<PaymentIntent, 'providerIntentId' | 'disputeStatus' | 'refundStatus' | 'refundedAt' | 'refundReason'>>,
  ): Promise<PaymentIntent> {
    const existing = this.paymentIntents.get(purchaseId);
    if (!existing) throw new ListingNotFoundError(purchaseId);
    const updated: PaymentIntent = {
      ...existing,
      status,
      ...patch,
      updatedAt: new Date(),
    } as PaymentIntent;
    this.paymentIntents.set(purchaseId, updated);
    return updated;
  }

  // -------------------------------------------------------------------------
  // License Grants (Phase 19 Wave 2)
  // -------------------------------------------------------------------------

  async insertLicenseGrant(grant: LicenseGrant): Promise<void> {
    this.licenseGrants.push(grant);
  }

  async getLicenseGrantByListingAndBuyer(listingId: string, buyerId: string): Promise<LicenseGrant | null> {
    for (const grant of this.licenseGrants) {
      if (grant.listingId === listingId && grant.buyerId === buyerId) return grant;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Revenue Share Events (Phase 19 Wave 2)
  // -------------------------------------------------------------------------

  async insertRevenueShareEvent(event: RevenueShareEvent): Promise<void> {
    this.revenueShareEvents.push(event);
  }

  // -------------------------------------------------------------------------
  // Listing Freeze (Phase 19 Wave 2)
  // -------------------------------------------------------------------------

  async markListingFrozen(listingId: string, frozenFor: string, frozenAt: Date): Promise<void> {
    const existing = this.listings.get(listingId);
    if (!existing) throw new ListingNotFoundError(listingId);
    const updated = { ...existing, frozenFor, frozenAt } as unknown as MarketplaceListing;
    this.listings.set(listingId, updated);
  }

  async clearListingFrozen(listingId: string): Promise<void> {
    const existing = this.listings.get(listingId);
    if (!existing) throw new ListingNotFoundError(listingId);
    const updated = { ...existing, frozenFor: null, frozenAt: null } as unknown as MarketplaceListing;
    this.listings.set(listingId, updated);
  }

  // -------------------------------------------------------------------------
  // Payout Ledger Entries (Phase 19 Wave 2)
  // -------------------------------------------------------------------------

  async insertPayoutLedgerEntry(entry: PayoutLedgerEntry): Promise<void> {
    this.payoutLedgerEntries.push(entry);
  }

  async listEligiblePayoutEvents(periodMonth: string): Promise<RevenueShareEvent[]> {
    return this.revenueShareEvents.filter(e => e.periodMonth === periodMonth && e.payoutStatus === 'eligible');
  }

  // -------------------------------------------------------------------------
  // Creator Profiles (Phase 19 Wave 3)
  // -------------------------------------------------------------------------

  async createCreatorProfile(profile: CreatorProfile): Promise<void> {
    this.creatorProfiles.set(profile.userId, profile);
  }

  async getCreatorProfile(userId: string): Promise<CreatorProfile | null> {
    return this.creatorProfiles.get(userId) ?? null;
  }

  async updateCreatorProfile(
    userId: string,
    patch: Partial<Pick<CreatorProfile,
      'displayName' | 'slug' | 'bio' | 'countryCode' | 'payoutMethod' |
      'payoutReady' | 'kycStatus' | 'onboardingState' | 'balanceCents' | 'currency' | 'updatedAt'
    >>,
  ): Promise<CreatorProfile> {
    const existing = this.creatorProfiles.get(userId);
    if (!existing) throw new ListingNotFoundError(userId);
    const updated: CreatorProfile = { ...existing, ...patch } as CreatorProfile;
    this.creatorProfiles.set(userId, updated);
    return updated;
  }

  async getCreatorByUserId(userId: string): Promise<CreatorProfile | null> {
    return this.creatorProfiles.get(userId) ?? null;
  }

  // -------------------------------------------------------------------------
  // KYC Sessions (Phase 19 Wave 3)
  // -------------------------------------------------------------------------

  async createKycSession(session: KycSession): Promise<void> {
    this.kycSessions.set(session.id, session);
  }

  async getKycSessionByCreator(creatorId: string): Promise<KycSession | null> {
    for (const session of this.kycSessions.values()) {
      if (session.creatorId === creatorId) return session;
    }
    return null;
  }

  async updateKycSessionStatus(
    sessionId: string,
    status: KycStatus,
    patch?: Partial<Pick<KycSession, 'lastPolledAt' | 'raw'>>,
  ): Promise<KycSession> {
    const existing = this.kycSessions.get(sessionId);
    if (!existing) throw new ListingNotFoundError(sessionId);
    const updated: KycSession = { ...existing, status, ...patch } as KycSession;
    this.kycSessions.set(sessionId, updated);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Creator Payout Methods (Phase 19 Wave 3)
  // -------------------------------------------------------------------------

  async createPayoutMethod(method: CreatorPayoutMethod): Promise<void> {
    this.payoutMethods.set(method.id, method);
  }

  async listPayoutMethodsByCreator(creatorId: string): Promise<CreatorPayoutMethod[]> {
    const results: CreatorPayoutMethod[] = [];
    for (const method of this.payoutMethods.values()) {
      if (method.creatorId === creatorId) results.push(method);
    }
    return results;
  }

  async updatePayoutMethodVerified(
    methodId: string,
    verified: boolean,
  ): Promise<CreatorPayoutMethod> {
    const existing = this.payoutMethods.get(methodId);
    if (!existing) throw new ListingNotFoundError(methodId);
    const updated: CreatorPayoutMethod = { ...existing, verified, updatedAt: new Date() } as CreatorPayoutMethod;
    this.payoutMethods.set(methodId, updated);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Brand-Locked Listings (Phase 19 Wave 4 — WS-MKT-5)
  // -------------------------------------------------------------------------

  private readonly brandLocks = new Map<string, BrandLockedListing>();

  async insertBrandLock(lock: BrandLockedListing): Promise<void> {
    this.brandLocks.set(lock.id, lock);
  }

  async getBrandLock(workspaceId: string, brandKitId: string, marketplaceListingId: string): Promise<BrandLockedListing | null> {
    for (const lock of this.brandLocks.values()) {
      if (lock.workspaceId === workspaceId && lock.brandKitId === brandKitId && lock.marketplaceListingId === marketplaceListingId) {
        return lock;
      }
    }
    return null;
  }

  async listBrandLocksByBrand(workspaceId: string, brandKitId: string): Promise<BrandLockedListing[]> {
    const results: BrandLockedListing[] = [];
    for (const lock of this.brandLocks.values()) {
      if (lock.workspaceId === workspaceId && lock.brandKitId === brandKitId) {
        results.push(lock);
      }
    }
    return results;
  }

  async listBrandLocksByListing(marketplaceListingId: string): Promise<BrandLockedListing[]> {
    const results: BrandLockedListing[] = [];
    for (const lock of this.brandLocks.values()) {
      if (lock.marketplaceListingId === marketplaceListingId) {
        results.push(lock);
      }
    }
    return results;
  }

  async updateBrandLock(
    lockId: string,
    patch: Partial<Pick<BrandLockedListing, 'state' | 'overridePriceCents' | 'notes' | 'auditActorId' | 'updatedBy'>>,
  ): Promise<BrandLockedListing> {
    const existing = this.brandLocks.get(lockId);
    if (!existing) throw new BrandLockNotFoundError(`Brand lock not found: ${lockId}`);
    const updated: BrandLockedListing = { ...existing, ...patch, updatedAt: new Date() } as BrandLockedListing;
    this.brandLocks.set(lockId, updated);
    return updated;
  }

  async deleteBrandLock(lockId: string): Promise<void> {
    if (!this.brandLocks.has(lockId)) throw new BrandLockNotFoundError(`Brand lock not found: ${lockId}`);
    this.brandLocks.delete(lockId);
  }

  // -------------------------------------------------------------------------
  // Takedown Requests (Phase 19 Wave 4 — WS-MKT-8)
  // -------------------------------------------------------------------------

  private readonly takedownRequests = new Map<string, TakedownRequest>();

  async insertTakedownRequest(request: TakedownRequest): Promise<void> {
    this.takedownRequests.set(request.id, request);
  }

  async getTakedownRequest(takedownId: string): Promise<TakedownRequest | null> {
    return this.takedownRequests.get(takedownId) ?? null;
  }

  async listTakedownRequestsByListing(listingId: string): Promise<TakedownRequest[]> {
    const results: TakedownRequest[] = [];
    for (const req of this.takedownRequests.values()) {
      if (req.listingId === listingId) results.push(req);
    }
    return results;
  }

  async listTakedownRequests(opts?: { status?: TakedownStatus; kind?: TakedownKind }): Promise<TakedownRequest[]> {
    const results: TakedownRequest[] = [];
    for (const req of this.takedownRequests.values()) {
      if (opts?.status && req.status !== opts.status) continue;
      if (opts?.kind && req.kind !== opts.kind) continue;
      results.push(req);
    }
    return results;
  }

  async updateTakedownStatus(
    takedownId: string,
    status: TakedownStatus,
    patch?: Partial<Pick<TakedownRequest, 'resolutionNotes' | 'resolvedAt' | 'updatedBy'>>,
  ): Promise<TakedownRequest> {
    const existing = this.takedownRequests.get(takedownId);
    if (!existing) throw new TakedownNotFoundError(`Takedown request not found: ${takedownId}`);
    const updated: TakedownRequest = { ...existing, status, ...patch, updatedAt: new Date() } as TakedownRequest;
    this.takedownRequests.set(takedownId, updated);
    return updated;
  }

  // -------------------------------------------------------------------------
  // Trust Scores (Phase 19 Wave 4 — WS-MKT-8)
  // -------------------------------------------------------------------------

  private readonly trustScores = new Map<string, TrustScore>();

  async upsertTrustScore(score: TrustScore): Promise<void> {
    this.trustScores.set(score.listingId, score);
  }

  async getTrustScoreByListing(listingId: string): Promise<TrustScore | null> {
    return this.trustScores.get(listingId) ?? null;
  }

  // -------------------------------------------------------------------------
  // FX Rates (Phase 19 Wave 5 — WS-MKT-7)
  // -------------------------------------------------------------------------

  private readonly fxRates: FxRate[] = [];

  async getLatestFxRate(base: string, quote: string): Promise<FxRate | null> {
    let latest: FxRate | null = null;
    for (const r of this.fxRates) {
      if (r.base === base && r.quote === quote) {
        if (!latest || r.fetchedAt > latest.fetchedAt) latest = r;
      }
    }
    return latest;
  }

  // -------------------------------------------------------------------------
  // Payout Runs (Phase 19 Wave 5 — WS-MKT-7)
  // -------------------------------------------------------------------------

  private readonly payoutRuns = new Map<string, PayoutRun>();

  async listPayoutRuns(opts?: { periodMonth?: string }): Promise<PayoutRun[]> {
    const results: PayoutRun[] = [];
    for (const run of this.payoutRuns.values()) {
      if (opts?.periodMonth && run.periodMonth !== opts.periodMonth) continue;
      results.push(run);
    }
    return results;
  }

  async getPayoutRun(runId: string): Promise<PayoutRun | null> {
    return this.payoutRuns.get(runId) ?? null;
  }

  // -------------------------------------------------------------------------
  // Webhook Deliveries (Phase 19 Wave 5 — WS-MKT-5/8/9)
  // -------------------------------------------------------------------------

  private readonly webhookDeliveries = new Map<string, WebhookDelivery>();

  async createWebhookDelivery(delivery: WebhookDelivery): Promise<void> {
    this.webhookDeliveries.set(delivery.id, delivery);
  }

  async getWebhookDelivery(deliveryId: string): Promise<WebhookDelivery | null> {
    return this.webhookDeliveries.get(deliveryId) ?? null;
  }

  async updateWebhookDeliveryStatus(
    deliveryId: string,
    status: WebhookDelivery['status'],
    patch?: Partial<Pick<WebhookDelivery, 'lastError' | 'attempts' | 'deliveredAt' | 'nextRetryAt'>>,
  ): Promise<WebhookDelivery> {
    const existing = this.webhookDeliveries.get(deliveryId);
    if (!existing) throw new ListingNotFoundError(deliveryId);
    const updated: WebhookDelivery = { ...existing, status, ...patch } as WebhookDelivery;
    this.webhookDeliveries.set(deliveryId, updated);
    return updated;
  }

  async listWebhookDeliveriesDue(nextRetryAt: Date): Promise<WebhookDelivery[]> {
    const results: WebhookDelivery[] = [];
    for (const d of this.webhookDeliveries.values()) {
      if (d.status === 'pending' && d.nextRetryAt && d.nextRetryAt <= nextRetryAt) {
        results.push(d);
      }
    }
    return results;
  }

  // -------------------------------------------------------------------------
  // Partner Clients (Phase 19 Wave 5 — WS-MKT-5/8/9)
  // -------------------------------------------------------------------------

  private readonly partnerClients = new Map<string, PartnerClient>();

  async getPartnerClientByClientId(clientId: string): Promise<PartnerClient | null> {
    for (const client of this.partnerClients.values()) {
      if (client.clientId === clientId) return client;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Test helpers
  // -------------------------------------------------------------------------

  clear(): void {
    this.listings.clear();
    this.reviews.clear();
    this.versions.length = 0;
    this.auditEvents.length = 0;
    this.paymentIntents.clear();
    this.licenseGrants.length = 0;
    this.revenueShareEvents.length = 0;
    this.payoutLedgerEntries.length = 0;
    this.creatorProfiles.clear();
    this.kycSessions.clear();
    this.payoutMethods.clear();
    this.brandLocks.clear();
    this.takedownRequests.clear();
    this.trustScores.clear();
    this.fxRates.length = 0;
    this.payoutRuns.clear();
    this.webhookDeliveries.clear();
    this.partnerClients.clear();
  }
}
