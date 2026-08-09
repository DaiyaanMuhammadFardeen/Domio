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
  }
}
