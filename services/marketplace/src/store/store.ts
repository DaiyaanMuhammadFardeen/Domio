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
} from '../types.js';

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
  listListings(opts?: { status?: string; sellerId?: string; limit?: number }): Promise<MarketplaceListing[]>;
  updateListing(
    listingId: string,
    patch: Partial<Pick<MarketplaceListing,
      'title' | 'description' | 'status' | 'isFree' | 'priceCents' | 'currency' |
      'tags' | 'preview' | 'publishedAtMs' | 'deprecatedAtMs' | 'updatedAt'
    >>,
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
  // Transaction support
  // -------------------------------------------------------------------------

  withTransaction<T>(fn: () => Promise<T>): Promise<T>;
}
