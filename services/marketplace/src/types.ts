/**
 * Marketplace service — shared types and errors (Phase 19 Wave 1).
 *
 * Domain types for listings, reviews, pricing, payout policy,
 * listing versions, and audit events.
 */

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export type ListingStatus = 'draft' | 'in_review' | 'published' | 'deprecated' | 'removed';

export interface MarketplaceListing {
  readonly id: string;
  readonly catalogId: string;
  readonly sellerId: string;
  readonly title: string;
  readonly description: string;
  readonly status: ListingStatus;
  readonly isFree: boolean;
  readonly priceCents: number | null;
  readonly currency: string | null;
  readonly tags: readonly string[];
  readonly preview: Record<string, unknown> | null;
  readonly publishedAtMs: number | null;
  readonly deprecatedAtMs: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Allowed lifecycle transitions (mirrors services/registry LISTING_TRANSITIONS). */
export const LISTING_TRANSITIONS: Record<ListingStatus, readonly ListingStatus[]> = {
  draft:      ['in_review', 'removed'],
  in_review:  ['published', 'removed', 'draft'],
  published:  ['deprecated', 'removed', 'draft'],
  deprecated: ['removed', 'draft'],
  removed:    [],
};

// ---------------------------------------------------------------------------
// Listing Version (changelog)
// ---------------------------------------------------------------------------

export interface ListingVersion {
  readonly id: string;
  readonly listingId: string;
  readonly catalogId: string;
  readonly version: string;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export type ReviewStatus = 'queued' | 'accepted' | 'auto_flagged' | 'removed';

export interface MarketplaceReview {
  readonly id: string;
  readonly listingId: string;
  readonly reviewerId: string;
  readonly rating: number;
  readonly body: string;
  readonly status: ReviewStatus;
  readonly verifiedBuyer: boolean;
  readonly replyBody: string | null;
  readonly repliedAt: Date | null;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Payout Policy
// ---------------------------------------------------------------------------

export interface PayoutPolicy {
  readonly id: string;
  readonly splitCreatorBps: number;
  readonly splitPlatformBps: number;
  readonly minPayoutCents: number;
  readonly firstPayoutHoldDays: number;
  readonly updatedAt: Date;
  readonly updatedBy: string | null;
}

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export type PricingModel = 'free' | 'one_time' | 'subscription' | 'team_seats' | 'enterprise_quote';

export interface PriceBreakdown {
  readonly priceCents: number;
  readonly currency: string;
  readonly model: PricingModel;
  readonly creatorShareCents: number;
  readonly platformFeeCents: number;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export type AuditActorType = 'user' | 'agent' | 'system';
export type AuditActorKind = 'human' | 'agent';
export type AuditEventKind =
  | 'purchase'
  | 'refund'
  | 'payout'
  | 'takedown'
  | 'kyc'
  | 'brand_lock_curation'
  | 'agent_purchase';

export interface AuditEvent {
  readonly id: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly actorType: AuditActorType;
  readonly actorKind: AuditActorKind;
  readonly eventKind: AuditEventKind;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  readonly seq: number;
  readonly prevHash: string;
  readonly hash: string;
  readonly kid: string;
  readonly recordedAt: Date;
}

// ---------------------------------------------------------------------------
// Domain events (emitted via event emitter, NOT audit table)
// ---------------------------------------------------------------------------

export interface MarketplaceEvent {
  readonly event_id: string;
  readonly event_type: string;
  readonly ts_ms: number;
  readonly workspace_id: string;
  readonly actor_id: string;
  readonly actor_type: string;
  readonly payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// EventEmitter interface (injected dependency)
// ---------------------------------------------------------------------------

export interface MarketplaceEventEmitter {
  publish(subject: string, payload: Record<string, unknown>): Promise<void>;
}

export const noopEmitter: MarketplaceEventEmitter = {
  async publish(): Promise<void> { /* drop */ },
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class FeatureDisabledError extends Error {
  readonly code = 'FEATURE_DISABLED' as const;
  constructor(public readonly flag: string) {
    super(`Feature disabled: ${flag}`);
    this.name = 'FeatureDisabledError';
  }
}

export class ListingNotFoundError extends Error {
  readonly code = 'LISTING_NOT_FOUND' as const;
  constructor(public readonly listingId: string) {
    super(`Listing not found: ${listingId}`);
    this.name = 'ListingNotFoundError';
  }
}

export class ReviewNotFoundError extends Error {
  readonly code = 'REVIEW_NOT_FOUND' as const;
  constructor(public readonly reviewId: string) {
    super(`Review not found: ${reviewId}`);
    this.name = 'ReviewNotFoundError';
  }
}

export class InvalidTransitionError extends Error {
  readonly code = 'INVALID_TRANSITION' as const;
  constructor(
    public readonly from: string,
    public readonly to: string,
    message?: string,
  ) {
    super(message ?? `Invalid transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export class DuplicateCatalogIdError extends Error {
  readonly code = 'DUPLICATE_CATALOG_ID' as const;
  constructor(public readonly catalogId: string) {
    super(`Listing already exists for catalog: ${catalogId}`);
    this.name = 'DuplicateCatalogIdError';
  }
}

export class NotVerifiedBuyerError extends Error {
  readonly code = 'ERR_NOT_VERIFIED_BUYER' as const;
  constructor() {
    super('Only verified buyers can submit reviews');
    this.name = 'NotVerifiedBuyerError';
  }
}

export class AlreadyRepliedError extends Error {
  readonly code = 'ERR_ALREADY_REPLIED' as const;
  constructor(public readonly reviewId: string) {
    super(`Review already has a reply: ${reviewId}`);
    this.name = 'AlreadyRepliedError';
  }
}

export class MarketplaceValidationError extends Error {
  readonly code: string;
  constructor(message: string, code: string = 'MARKETPLACE_VALIDATION_ERROR') {
    super(message);
    this.name = 'MarketplaceValidationError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Payment Intent (Phase 19 Wave 2)
// ---------------------------------------------------------------------------

export type PaymentProviderType = 'stripe' | 'bkash' | 'nagad';
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'refunded' | 'disputed';
export type RefundStatus = 'none' | 'requested' | 'approved' | 'refunded';
export type DisputeStatus = 'none' | 'opened' | 'won' | 'lost' | 'resolved';

export interface PaymentIntent {
  readonly id: string;
  readonly workspaceId: string;
  readonly buyerId: string;
  readonly listingId: string;
  readonly purchaseId: string;
  readonly provider: PaymentProviderType;
  readonly providerIntentId: string | null;
  readonly currency: string;
  readonly grossCents: number;
  readonly taxCents: number;
  readonly feeCents: number;
  readonly netCents: number;
  readonly fxRate: number | null;
  readonly fxTimestamp: Date | null;
  readonly status: PaymentStatus;
  readonly idempotencyKey: string;
  readonly disputeStatus: DisputeStatus;
  readonly refundStatus: RefundStatus;
  readonly refundedAt: Date | null;
  readonly refundReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Purchase Initiation (returned by createPurchase)
// ---------------------------------------------------------------------------

export interface PurchaseInitiation {
  readonly purchase_id: string;
  readonly listing_id: string;
  readonly buyer_id: string;
  readonly provider: PaymentProviderType;
  readonly provider_intent_id: string | null;
  readonly checkout_url: string | undefined;
  readonly status: PaymentStatus;
  readonly gross_cents: number;
  readonly currency: string;
}

// ---------------------------------------------------------------------------
// Refund Request (returned by requestRefund)
// ---------------------------------------------------------------------------

export interface RefundRequest {
  readonly purchase_id: string;
  readonly refund_status: RefundStatus;
  readonly auto_approved: boolean;
  readonly review_required: boolean;
}

// ---------------------------------------------------------------------------
// License Grant (Phase 19 Wave 2)
// ---------------------------------------------------------------------------

export interface LicenseGrant {
  readonly id: string;
  readonly listingId: string;
  readonly buyerId: string;
  readonly version: string;
  readonly scopes: readonly string[];
  readonly seats: number;
  readonly signedToken: string;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Revenue Share Event (Phase 19 Wave 2)
// ---------------------------------------------------------------------------

export type RevenuePayoutStatus = 'eligible' | 'refunded' | 'held';

export interface RevenueShareEvent {
  readonly id: string;
  readonly listingId: string;
  readonly sellerId: string;
  readonly workspaceId: string;
  readonly currency: string;
  readonly grossCents: number;
  readonly feeCents: number;
  readonly netCents: number;
  readonly periodMonth: string;
  readonly eventType: string;
  readonly payoutStatus: RevenuePayoutStatus;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Payout Ledger Entry (Phase 19 Wave 2)
// ---------------------------------------------------------------------------

export type PayoutEntryStatus = 'pending' | 'paid' | 'held' | 'failed' | 'refunded';

export interface PayoutLedgerEntry {
  readonly id: string;
  readonly workspaceId: string;
  readonly creatorId: string;
  readonly periodMonth: string;
  readonly eventId: string;
  readonly grossCents: number;
  readonly feeCents: number;
  readonly netCents: number;
  readonly currency: string;
  readonly status: PayoutEntryStatus;
  readonly provider: string | null;
  readonly providerTransferId: string | null;
  readonly executorRunId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Chargeback Event Types
// ---------------------------------------------------------------------------

export type ChargebackEventType = 'dispute.opened' | 'dispute.won' | 'dispute.lost' | 'dispute.resolved';

// ---------------------------------------------------------------------------
// Usage Provider Interface (Wave 2 stub)
// ---------------------------------------------------------------------------

export interface UsageProvider {
  countInserts(listingId: string, buyerId: string): Promise<number>;
}

export const defaultUsageProvider: UsageProvider = {
  async countInserts(_listingId: string, _buyerId: string): Promise<number> {
    // Wave-2 stub: returns 0. Real usage lookup is a later wave.
    return 0;
  },
};
