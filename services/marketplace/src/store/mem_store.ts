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
} from '../types.js';
import {
  ListingNotFoundError,
  ReviewNotFoundError,
} from '../types.js';
import type { MarketplaceStore } from './store.js';

export class InMemoryMarketplaceStore implements MarketplaceStore {
  private readonly listings = new Map<string, MarketplaceListing>();
  private readonly reviews = new Map<string, MarketplaceReview>();
  private readonly versions: ListingVersion[] = [];
  private readonly auditEvents: AuditEvent[] = [];
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
  // Test helpers
  // -------------------------------------------------------------------------

  clear(): void {
    this.listings.clear();
    this.reviews.clear();
    this.versions.length = 0;
    this.auditEvents.length = 0;
  }
}
