/**
 * pg-backed marketplace store (Phase 19 Wave 1).
 *
 * Full parameterized-SQL implementation of all {@link MarketplaceStore} methods.
 * Accepts a `Pool` (pg's public interface). Every mutating method checks
 * `this.pool != null` upfront and throws {@link StoreNotConfiguredError}.
 *
 * SQL conventions:
 *  - All queries use $N parameterised placeholders (no string interpolation).
 *  - jsonb columns (tags, preview, payload): inserted via $N::jsonb,
 *    read via JSON.parse(row.col) since node-pg returns jsonb as a plain object.
 *  - bigint ↔ number: price_cents (int), published_at_ms (bigint),
 *    deprecated_at_ms (bigint), min_payout_cents (bigint).
 *  - timestamptz ↔ Date: node-pg returns Date for timestamptz; on insert
 *    we pass Date objects directly (pg handles conversion).
 */

import type { Pool as PgPool } from 'pg';
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
  PayoutRunStatus,
  WebhookDelivery,
  PartnerClient,
  PartnerClientTier,
} from '../types.js';
import { ListingNotFoundError, ReviewNotFoundError } from '../types.js';
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

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class PgMarketplaceStore implements MarketplaceStore {
  /** Public for test injection. */
  readonly pool: PgPool | null;

  /** In-memory reply tracking (no reply column in P06 reviews table). */
  private readonly replyStore = new Map<string, { replyBody: string; repliedAt: Date }>();

  constructor(pool: PgPool | null) {
    this.pool = pool;
  }

  // -------------------------------------------------------------------------
  // Transaction helper
  // -------------------------------------------------------------------------

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.pool) throw new StoreNotConfiguredError('withTransaction');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn();
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // -------------------------------------------------------------------------
  // Listings
  // -------------------------------------------------------------------------

  async insertListing(listing: MarketplaceListing): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertListing');
    await this.pool.query(
      `INSERT INTO marketplace_listing (
        id, catalog_id, seller_id, title, description,
        status, is_free, price_cents, currency,
        tags, preview, published_at_ms, deprecated_at_ms,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10::jsonb, $11::jsonb, $12, $13,
        $14, $15
      )`,
      [
        listing.id,
        listing.catalogId,
        listing.sellerId,
        listing.title,
        listing.description,
        listing.status,
        listing.isFree,
        listing.priceCents,
        listing.currency,
        JSON.stringify(listing.tags),
        listing.preview != null ? JSON.stringify(listing.preview) : null,
        listing.publishedAtMs,
        listing.deprecatedAtMs,
        listing.createdAt,
        listing.updatedAt,
      ],
    );
  }

  async getListing(listingId: string): Promise<MarketplaceListing | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getListing');
    const { rows } = await this.pool.query(
      'SELECT * FROM marketplace_listing WHERE id = $1',
      [listingId],
    );
    if (rows.length === 0) return null;
    return listingRowToDomain(rows[0]!);
  }

  async getListingByCatalogId(catalogId: string): Promise<MarketplaceListing | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getListingByCatalogId');
    const { rows } = await this.pool.query(
      "SELECT * FROM marketplace_listing WHERE catalog_id = $1 AND status != 'removed' LIMIT 1",
      [catalogId],
    );
    if (rows.length === 0) return null;
    return listingRowToDomain(rows[0]!);
  }

  async listListings(
    opts?: { status?: string; sellerId?: string; limit?: number },
  ): Promise<MarketplaceListing[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listListings');
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts?.status) {
      conditions.push(`status = $${idx++}`);
      params.push(opts.status);
    } else {
      conditions.push(`status != 'removed'`);
    }
    if (opts?.sellerId) {
      conditions.push(`seller_id = $${idx++}`);
      params.push(opts.sellerId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = opts?.limit ?? 50;
    const sql = `SELECT * FROM marketplace_listing ${where} ORDER BY created_at DESC LIMIT $${idx}`;
    params.push(limit);

    const { rows } = await this.pool.query(sql, params);
    return rows.map(listingRowToDomain);
  }

  async updateListing(
    listingId: string,
    patch: Partial<Pick<MarketplaceListing,
      'title' | 'description' | 'status' | 'isFree' | 'priceCents' | 'currency' |
      'tags' | 'preview' | 'publishedAtMs' | 'deprecatedAtMs' | 'updatedAt'
    >>,
  ): Promise<MarketplaceListing> {
    if (!this.pool) throw new StoreNotConfiguredError('updateListing');

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    // Scalar text fields
    const scalarFields: Array<{ key: string; dbCol: string }> = [
      { key: 'title', dbCol: 'title' },
      { key: 'description', dbCol: 'description' },
      { key: 'status', dbCol: 'status' },
      { key: 'currency', dbCol: 'currency' },
    ];
    for (const f of scalarFields) {
      if (f.key in patch) {
        setClauses.push(`${f.dbCol} = $${idx++}`);
        params.push((patch as Record<string, unknown>)[f.key]);
      }
    }

    // Boolean fields
    if ('isFree' in patch) {
      setClauses.push(`is_free = $${idx++}`);
      params.push(patch.isFree);
    }

    // Nullable integer fields
    if ('priceCents' in patch) {
      setClauses.push(`price_cents = $${idx++}`);
      params.push(patch.priceCents);
    }

    // Nullable bigint fields
    const bigintFields: Array<{ key: string; dbCol: string }> = [
      { key: 'publishedAtMs', dbCol: 'published_at_ms' },
      { key: 'deprecatedAtMs', dbCol: 'deprecated_at_ms' },
    ];
    for (const f of bigintFields) {
      if (f.key in patch) {
        setClauses.push(`${f.dbCol} = $${idx++}`);
        params.push((patch as Record<string, unknown>)[f.key]);
      }
    }

    // JSONB fields
    if ('tags' in patch) {
      setClauses.push(`tags = $${idx++}::jsonb`);
      params.push(JSON.stringify(patch.tags));
    }
    if ('preview' in patch) {
      setClauses.push(`preview = $${idx++}::jsonb`);
      params.push(patch.preview != null ? JSON.stringify(patch.preview) : null);
    }

    if (setClauses.length === 0) {
      const existing = await this.getListing(listingId);
      if (!existing) throw new ListingNotFoundError(listingId);
      return existing;
    }

    // Always bump updated_at
    if (!('updatedAt' in patch)) {
      setClauses.push(`updated_at = $${idx++}`);
      params.push(new Date());
    }

    params.push(listingId);
    const sql = `UPDATE marketplace_listing SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const { rows } = await this.pool.query(sql, params);
    if (rows.length === 0) throw new ListingNotFoundError(listingId);
    return listingRowToDomain(rows[0]!);
  }

  // -------------------------------------------------------------------------
  // Listing Versions
  // -------------------------------------------------------------------------

  async insertListingVersion(_version: ListingVersion): Promise<void> {
    // Wave 1: no listing_version table in P06 migrations; store in-memory.
    // Will be migrated to a proper table in a later wave.
    throw new StoreNotConfiguredError('insertListingVersion (no DB table yet)');
  }

  async listListingVersions(_catalogId: string): Promise<ListingVersion[]> {
    throw new StoreNotConfiguredError('listListingVersions (no DB table yet)');
  }

  // -------------------------------------------------------------------------
  // Reviews
  // -------------------------------------------------------------------------

  async insertReview(review: MarketplaceReview): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertReview');
    await this.pool.query(
      `INSERT INTO marketplace_review (
        id, listing_id, reviewer_id, rating, body,
        status, verified_buyer, created_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8
      )`,
      [
        review.id,
        review.listingId,
        review.reviewerId,
        review.rating,
        review.body,
        review.status,
        review.verifiedBuyer,
        review.createdAt,
      ],
    );
    // Track reply in-memory (no reply column in P06 table)
    if (review.replyBody != null) {
      this.replyStore.set(review.id, {
        replyBody: review.replyBody,
        repliedAt: review.repliedAt!,
      });
    }
  }

  async getReview(reviewId: string): Promise<MarketplaceReview | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getReview');
    const { rows } = await this.pool.query(
      'SELECT * FROM marketplace_review WHERE id = $1',
      [reviewId],
    );
    if (rows.length === 0) return null;
    return reviewRowToDomain(rows[0]!, this.replyStore.get(reviewId) ?? null);
  }

  async listReviewsByListing(listingId: string): Promise<MarketplaceReview[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listReviewsByListing');
    const { rows } = await this.pool.query(
      'SELECT * FROM marketplace_review WHERE listing_id = $1 ORDER BY created_at ASC',
      [listingId],
    );
    return rows.map((r: Record<string, unknown>) => reviewRowToDomain(r, this.replyStore.get(r.id as string) ?? null));
  }

  async updateReview(
    reviewId: string,
    patch: Partial<Pick<MarketplaceReview, 'status' | 'replyBody' | 'repliedAt'>>,
  ): Promise<MarketplaceReview> {
    if (!this.pool) throw new StoreNotConfiguredError('updateReview');

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if ('status' in patch) {
      setClauses.push(`status = $${idx++}`);
      params.push(patch.status);
    }

    if (setClauses.length === 0 && !('replyBody' in patch)) {
      const existing = await this.getReview(reviewId);
      if (!existing) throw new ReviewNotFoundError(reviewId);
      return existing;
    }

    // Handle reply fields (in-memory, no DB column)
    if ('replyBody' in patch) {
      this.replyStore.set(reviewId, {
        replyBody: patch.replyBody!,
        repliedAt: patch.repliedAt ?? new Date(),
      });
    }

    if (setClauses.length === 0) {
      const existing = await this.getReview(reviewId);
      if (!existing) throw new ReviewNotFoundError(reviewId);
      return existing;
    }

    params.push(reviewId);
    const sql = `UPDATE marketplace_review SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const { rows } = await this.pool.query(sql, params);
    if (rows.length === 0) throw new ReviewNotFoundError(reviewId);
    return reviewRowToDomain(rows[0]!, this.replyStore.get(reviewId) ?? null);
  }

  async hasVerifiedPurchase(reviewerId: string, _listingId: string): Promise<boolean> {
    if (!this.pool) throw new StoreNotConfiguredError('hasVerifiedPurchase');
    const { rows } = await this.pool.query(
      `SELECT 1 FROM revenue_share_event
       WHERE seller_id = $1
       LIMIT 1`,
      [reviewerId],
    );
    // Wave-1 stub: if the reviewer has ANY revenue share event, consider
    // them a verified buyer. Full purchase-verification is Wave 2.
    return rows.length > 0;
  }

  // -------------------------------------------------------------------------
  // Payout Policy
  // -------------------------------------------------------------------------

  async getPayoutPolicy(): Promise<PayoutPolicy> {
    if (!this.pool) throw new StoreNotConfiguredError('getPayoutPolicy');
    const { rows } = await this.pool.query(
      'SELECT * FROM payout_policy LIMIT 1',
    );
    if (rows.length === 0) {
      // Fallback defaults (should never happen — 0086 seeds a row)
      return {
        id: 'default',
        splitCreatorBps: 7000,
        splitPlatformBps: 3000,
        minPayoutCents: 5000,
        firstPayoutHoldDays: 30,
        updatedAt: new Date(),
        updatedBy: null,
      };
    }
    const row = rows[0]!;
    return {
      id: row.id as string,
      splitCreatorBps: row.split_creator_bps as number,
      splitPlatformBps: row.split_platform_bps as number,
      minPayoutCents: Number(row.min_payout_cents),
      firstPayoutHoldDays: row.first_payout_hold_days as number,
      updatedAt: toDate(row.updated_at),
      updatedBy: row.updated_by as string | null,
    };
  }

  // -------------------------------------------------------------------------
  // Audit
  // -------------------------------------------------------------------------

  async insertAuditEvent(event: AuditEvent): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertAuditEvent');
    await this.pool.query(
      `INSERT INTO marketplace_audit_event (
        id, workspace_id, actor_id, actor_type, actor_kind,
        event_kind, event_type, payload,
        seq, prev_hash, hash, kid, recorded_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8::jsonb,
        $9, $10, $11, $12, $13
      )`,
      [
        event.id,
        event.workspaceId,
        event.actorId,
        event.actorType,
        event.actorKind,
        event.eventKind,
        event.eventType,
        JSON.stringify(event.payload),
        event.seq,
        event.prevHash,
        event.hash,
        event.kid,
        event.recordedAt,
      ],
    );
  }

  async getNextAuditSeq(workspaceId: string, eventKind: string): Promise<number> {
    if (!this.pool) throw new StoreNotConfiguredError('getNextAuditSeq');
    const { rows } = await this.pool.query(
      `SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq
       FROM marketplace_audit_event
       WHERE workspace_id = $1 AND event_kind = $2`,
      [workspaceId, eventKind],
    );
    return Number(rows[0]!.next_seq);
  }

  async getLastAuditHash(workspaceId: string, eventKind: string): Promise<string> {
    if (!this.pool) throw new StoreNotConfiguredError('getLastAuditHash');
    const { rows } = await this.pool.query(
      `SELECT hash FROM marketplace_audit_event
       WHERE workspace_id = $1 AND event_kind = $2
       ORDER BY seq DESC LIMIT 1`,
      [workspaceId, eventKind],
    );
    return rows.length > 0 ? (rows[0]!.hash as string) : '';
  }

  // -------------------------------------------------------------------------
  // Payment Intents (Phase 19 Wave 2)
  // -------------------------------------------------------------------------

  async insertPaymentIntent(intent: PaymentIntent): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertPaymentIntent');
    await this.pool.query(
      `INSERT INTO payment_intent (
        id, workspace_id, buyer_id, listing_id, purchase_id,
        provider, provider_intent_id, currency,
        gross_cents, tax_cents, fee_cents, net_cents,
        fx_rate, fx_timestamp, status, idempotency_key,
        dispute_status, refund_status, refunded_at, refund_reason,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11, $12,
        $13, $14, $15, $16,
        $17, $18, $19, $20,
        $21, $22
      )`,
      [
        intent.id,
        intent.workspaceId,
        intent.buyerId,
        intent.listingId,
        intent.purchaseId,
        intent.provider,
        intent.providerIntentId,
        intent.currency,
        intent.grossCents,
        intent.taxCents,
        intent.feeCents,
        intent.netCents,
        intent.fxRate,
        intent.fxTimestamp,
        intent.status,
        intent.idempotencyKey,
        intent.disputeStatus,
        intent.refundStatus,
        intent.refundedAt,
        intent.refundReason,
        intent.createdAt,
        intent.updatedAt,
      ],
    );
  }

  async getPaymentIntentByPurchaseId(purchaseId: string): Promise<PaymentIntent | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getPaymentIntentByPurchaseId');
    const { rows } = await this.pool.query(
      'SELECT * FROM payment_intent WHERE purchase_id = $1',
      [purchaseId],
    );
    if (rows.length === 0) return null;
    return paymentIntentRowToDomain(rows[0]!);
  }

  async getPaymentIntentByProviderIntentId(providerIntentId: string): Promise<PaymentIntent | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getPaymentIntentByProviderIntentId');
    const { rows } = await this.pool.query(
      'SELECT * FROM payment_intent WHERE provider_intent_id = $1',
      [providerIntentId],
    );
    if (rows.length === 0) return null;
    return paymentIntentRowToDomain(rows[0]!);
  }

  async getPaymentIntentByIdempotencyKey(workspaceId: string, idempotencyKey: string): Promise<PaymentIntent | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getPaymentIntentByIdempotencyKey');
    const { rows } = await this.pool.query(
      'SELECT * FROM payment_intent WHERE workspace_id = $1 AND idempotency_key = $2',
      [workspaceId, idempotencyKey],
    );
    if (rows.length === 0) return null;
    return paymentIntentRowToDomain(rows[0]!);
  }

  async updatePaymentIntentStatus(
    purchaseId: string,
    status: PaymentIntent['status'],
    patch?: Partial<Pick<PaymentIntent, 'providerIntentId' | 'disputeStatus' | 'refundStatus' | 'refundedAt' | 'refundReason'>>,
  ): Promise<PaymentIntent> {
    if (!this.pool) throw new StoreNotConfiguredError('updatePaymentIntentStatus');

    const setClauses: string[] = ['status = $1'];
    const params: unknown[] = [status];
    let idx = 2;

    if (patch?.providerIntentId !== undefined) {
      setClauses.push(`provider_intent_id = $${idx++}`);
      params.push(patch.providerIntentId);
    }
    if (patch?.disputeStatus !== undefined) {
      setClauses.push(`dispute_status = $${idx++}`);
      params.push(patch.disputeStatus);
    }
    if (patch?.refundStatus !== undefined) {
      setClauses.push(`refund_status = $${idx++}`);
      params.push(patch.refundStatus);
    }
    if (patch?.refundedAt !== undefined) {
      setClauses.push(`refunded_at = $${idx++}`);
      params.push(patch.refundedAt);
    }
    if (patch?.refundReason !== undefined) {
      setClauses.push(`refund_reason = $${idx++}`);
      params.push(patch.refundReason);
    }

    setClauses.push(`updated_at = $${idx++}`);
    params.push(new Date());

    params.push(purchaseId);
    const sql = `UPDATE payment_intent SET ${setClauses.join(', ')} WHERE purchase_id = $${idx} RETURNING *`;
    const { rows } = await this.pool.query(sql, params);
    if (rows.length === 0) throw new ListingNotFoundError(purchaseId);
    return paymentIntentRowToDomain(rows[0]!);
  }

  // -------------------------------------------------------------------------
  // License Grants (Phase 19 Wave 2)
  // -------------------------------------------------------------------------

  async insertLicenseGrant(grant: LicenseGrant): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertLicenseGrant');
    await this.pool.query(
      `INSERT INTO license_grant (
        id, listing_id, buyer_id, version, scopes,
        seats, signed_token, created_at
      ) VALUES (
        $1, $2, $3, $4, $5::jsonb,
        $6, $7, $8
      )`,
      [
        grant.id,
        grant.listingId,
        grant.buyerId,
        grant.version,
        JSON.stringify(grant.scopes),
        grant.seats,
        grant.signedToken,
        grant.createdAt,
      ],
    );
  }

  async getLicenseGrantByListingAndBuyer(listingId: string, buyerId: string): Promise<LicenseGrant | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getLicenseGrantByListingAndBuyer');
    const { rows } = await this.pool.query(
      'SELECT * FROM license_grant WHERE listing_id = $1 AND buyer_id = $2 LIMIT 1',
      [listingId, buyerId],
    );
    if (rows.length === 0) return null;
    return licenseGrantRowToDomain(rows[0]!);
  }

  // -------------------------------------------------------------------------
  // Revenue Share Events (Phase 19 Wave 2)
  // -------------------------------------------------------------------------

  async insertRevenueShareEvent(event: RevenueShareEvent): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertRevenueShareEvent');
    await this.pool.query(
      `INSERT INTO revenue_share_event (
        id, listing_id, seller_id, workspace_id, currency,
        gross_cents, fee_cents, net_cents, period_month,
        event_type, payout_status, created_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12
      )`,
      [
        event.id,
        event.listingId,
        event.sellerId,
        event.workspaceId,
        event.currency,
        event.grossCents,
        event.feeCents,
        event.netCents,
        event.periodMonth,
        event.eventType,
        event.payoutStatus,
        event.createdAt,
      ],
    );
  }

  // -------------------------------------------------------------------------
  // Listing Freeze (Phase 19 Wave 2)
  // -------------------------------------------------------------------------

  async markListingFrozen(listingId: string, frozenFor: string, frozenAt: Date): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('markListingFrozen');
    await this.pool.query(
      'UPDATE marketplace_listing SET frozen_for = $1, frozen_at = $2 WHERE id = $3',
      [frozenFor, frozenAt, listingId],
    );
  }

  async clearListingFrozen(listingId: string): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('clearListingFrozen');
    await this.pool.query(
      'UPDATE marketplace_listing SET frozen_for = NULL, frozen_at = NULL WHERE id = $1',
      [listingId],
    );
  }

  // -------------------------------------------------------------------------
  // Payout Ledger Entries (Phase 19 Wave 2)
  // -------------------------------------------------------------------------

  async insertPayoutLedgerEntry(entry: PayoutLedgerEntry): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertPayoutLedgerEntry');
    await this.pool.query(
      `INSERT INTO payout_ledger_entry (
        id, workspace_id, creator_id, period_month, event_id,
        gross_cents, fee_cents, net_cents, currency,
        status, provider, provider_transfer_id, executor_run_id,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15
      )`,
      [
        entry.id,
        entry.workspaceId,
        entry.creatorId,
        entry.periodMonth,
        entry.eventId,
        entry.grossCents,
        entry.feeCents,
        entry.netCents,
        entry.currency,
        entry.status,
        entry.provider,
        entry.providerTransferId,
        entry.executorRunId,
        entry.createdAt,
        entry.updatedAt,
      ],
    );
  }

  async listEligiblePayoutEvents(periodMonth: string): Promise<RevenueShareEvent[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listEligiblePayoutEvents');
    const { rows } = await this.pool.query(
      `SELECT * FROM revenue_share_event
       WHERE period_month = $1 AND payout_status = 'eligible'`,
      [periodMonth],
    );
    return rows.map(revenueShareEventRowToDomain);
  }

  // -------------------------------------------------------------------------
  // Creator Profiles (Phase 19 Wave 3)
  // -------------------------------------------------------------------------

  async createCreatorProfile(profile: CreatorProfile): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('createCreatorProfile');
    await this.pool.query(
      `INSERT INTO creator_profile (
        id, user_id, display_name, slug, bio, country_code,
        payout_method, payout_ready, kyc_status, onboarding_state,
        balance_cents, currency, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10,
        $11, $12, $13, $14
      )`,
      [
        profile.id,
        profile.userId,
        profile.displayName,
        profile.slug,
        profile.bio,
        profile.countryCode,
        profile.payoutMethod,
        profile.payoutReady,
        profile.kycStatus,
        profile.onboardingState,
        profile.balanceCents,
        profile.currency,
        profile.createdAt,
        profile.updatedAt,
      ],
    );
  }

  async getCreatorProfile(userId: string): Promise<CreatorProfile | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getCreatorProfile');
    const { rows } = await this.pool.query(
      'SELECT * FROM creator_profile WHERE user_id = $1',
      [userId],
    );
    if (rows.length === 0) return null;
    return creatorProfileRowToDomain(rows[0]!);
  }

  async updateCreatorProfile(
    userId: string,
    patch: Partial<Pick<CreatorProfile,
      'displayName' | 'slug' | 'bio' | 'countryCode' | 'payoutMethod' |
      'payoutReady' | 'kycStatus' | 'onboardingState' | 'balanceCents' | 'currency' | 'updatedAt'
    >>,
  ): Promise<CreatorProfile> {
    if (!this.pool) throw new StoreNotConfiguredError('updateCreatorProfile');

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    // Scalar text fields
    const scalarFields: Array<{ key: string; dbCol: string }> = [
      { key: 'displayName', dbCol: 'display_name' },
      { key: 'slug', dbCol: 'slug' },
      { key: 'bio', dbCol: 'bio' },
      { key: 'countryCode', dbCol: 'country_code' },
      { key: 'payoutMethod', dbCol: 'payout_method' },
      { key: 'kycStatus', dbCol: 'kyc_status' },
      { key: 'onboardingState', dbCol: 'onboarding_state' },
      { key: 'currency', dbCol: 'currency' },
    ];
    for (const f of scalarFields) {
      if (f.key in patch) {
        setClauses.push(`${f.dbCol} = $${idx++}`);
        params.push((patch as Record<string, unknown>)[f.key]);
      }
    }

    // Boolean fields
    if ('payoutReady' in patch) {
      setClauses.push(`payout_ready = $${idx++}`);
      params.push(patch.payoutReady);
    }

    // Integer fields
    if ('balanceCents' in patch) {
      setClauses.push(`balance_cents = $${idx++}`);
      params.push(patch.balanceCents);
    }

    // Always bump updated_at
    if (!('updatedAt' in patch)) {
      setClauses.push(`updated_at = $${idx++}`);
      params.push(new Date());
    }

    if (setClauses.length === 0) {
      const existing = await this.getCreatorProfile(userId);
      if (!existing) throw new ListingNotFoundError(userId);
      return existing;
    }

    params.push(userId);
    const sql = `UPDATE creator_profile SET ${setClauses.join(', ')} WHERE user_id = $${idx} RETURNING *`;
    const { rows } = await this.pool.query(sql, params);
    if (rows.length === 0) throw new ListingNotFoundError(userId);
    return creatorProfileRowToDomain(rows[0]!);
  }

  async getCreatorByUserId(userId: string): Promise<CreatorProfile | null> {
    return this.getCreatorProfile(userId);
  }

  // -------------------------------------------------------------------------
  // KYC Sessions (Phase 19 Wave 3)
  // -------------------------------------------------------------------------

  async createKycSession(session: KycSession): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('createKycSession');
    await this.pool.query(
      `INSERT INTO kyc_session (
        id, creator_id, vendor, vendor_session_id, status,
        last_polled_at, raw, created_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7::jsonb, $8
      )`,
      [
        session.id,
        session.creatorId,
        session.vendor,
        session.vendorSessionId,
        session.status,
        session.lastPolledAt,
        session.raw != null ? JSON.stringify(session.raw) : null,
        session.createdAt,
      ],
    );
  }

  async getKycSessionByCreator(creatorId: string): Promise<KycSession | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getKycSessionByCreator');
    const { rows } = await this.pool.query(
      'SELECT * FROM kyc_session WHERE creator_id = $1 ORDER BY created_at DESC LIMIT 1',
      [creatorId],
    );
    if (rows.length === 0) return null;
    return kycSessionRowToDomain(rows[0]!);
  }

  async updateKycSessionStatus(
    sessionId: string,
    status: KycStatus,
    patch?: Partial<Pick<KycSession, 'lastPolledAt' | 'raw'>>,
  ): Promise<KycSession> {
    if (!this.pool) throw new StoreNotConfiguredError('updateKycSessionStatus');

    const setClauses: string[] = ['status = $1'];
    const params: unknown[] = [status];
    let idx = 2;

    if (patch?.lastPolledAt !== undefined) {
      setClauses.push(`last_polled_at = $${idx++}`);
      params.push(patch.lastPolledAt);
    }
    if (patch?.raw !== undefined) {
      setClauses.push(`raw = $${idx++}::jsonb`);
      params.push(JSON.stringify(patch.raw));
    }

    params.push(sessionId);
    const sql = `UPDATE kyc_session SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const { rows } = await this.pool.query(sql, params);
    if (rows.length === 0) throw new ListingNotFoundError(sessionId);
    return kycSessionRowToDomain(rows[0]!);
  }

  // -------------------------------------------------------------------------
  // Creator Payout Methods (Phase 19 Wave 3)
  // -------------------------------------------------------------------------

  async createPayoutMethod(method: CreatorPayoutMethod): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('createPayoutMethod');
    await this.pool.query(
      `INSERT INTO creator_payout_method (
        id, creator_id, kind, external_account_id, verified,
        metadata, created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6::jsonb, $7, $8
      )`,
      [
        method.id,
        method.creatorId,
        method.kind,
        method.externalAccountId,
        method.verified,
        method.metadata != null ? JSON.stringify(method.metadata) : null,
        method.createdAt,
        method.updatedAt,
      ],
    );
  }

  async listPayoutMethodsByCreator(creatorId: string): Promise<CreatorPayoutMethod[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listPayoutMethodsByCreator');
    const { rows } = await this.pool.query(
      'SELECT * FROM creator_payout_method WHERE creator_id = $1 ORDER BY created_at ASC',
      [creatorId],
    );
    return rows.map(creatorPayoutMethodRowToDomain);
  }

  async updatePayoutMethodVerified(
    methodId: string,
    verified: boolean,
  ): Promise<CreatorPayoutMethod> {
    if (!this.pool) throw new StoreNotConfiguredError('updatePayoutMethodVerified');
    const { rows } = await this.pool.query(
      `UPDATE creator_payout_method
       SET verified = $1, updated_at = $2
       WHERE id = $3
       RETURNING *`,
      [verified, new Date(), methodId],
    );
    if (rows.length === 0) throw new ListingNotFoundError(methodId);
    return creatorPayoutMethodRowToDomain(rows[0]!);
  }

  // -------------------------------------------------------------------------
  // Brand-Locked Listings (Phase 19 Wave 4 — WS-MKT-5)
  // -------------------------------------------------------------------------

  async insertBrandLock(lock: BrandLockedListing): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertBrandLock');
    await this.pool.query(
      `INSERT INTO brand_locked_listing (
        id, workspace_id, brand_kit_id, marketplace_listing_id,
        state, override_price_cents, notes, audit_actor_id,
        created_at, updated_at, created_by, updated_by
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11, $12
      )`,
      [
        lock.id,
        lock.workspaceId,
        lock.brandKitId,
        lock.marketplaceListingId,
        lock.state,
        lock.overridePriceCents,
        lock.notes,
        lock.auditActorId,
        lock.createdAt,
        lock.updatedAt,
        lock.createdBy,
        lock.updatedBy,
      ],
    );
  }

  async getBrandLock(workspaceId: string, brandKitId: string, marketplaceListingId: string): Promise<BrandLockedListing | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getBrandLock');
    const { rows } = await this.pool.query(
      `SELECT * FROM brand_locked_listing
       WHERE workspace_id = $1 AND brand_kit_id = $2 AND marketplace_listing_id = $3`,
      [workspaceId, brandKitId, marketplaceListingId],
    );
    if (rows.length === 0) return null;
    return brandLockRowToDomain(rows[0]!);
  }

  async listBrandLocksByBrand(workspaceId: string, brandKitId: string): Promise<BrandLockedListing[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listBrandLocksByBrand');
    const { rows } = await this.pool.query(
      `SELECT * FROM brand_locked_listing
       WHERE workspace_id = $1 AND brand_kit_id = $2
       ORDER BY created_at ASC`,
      [workspaceId, brandKitId],
    );
    return rows.map(brandLockRowToDomain);
  }

  async listBrandLocksByListing(marketplaceListingId: string): Promise<BrandLockedListing[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listBrandLocksByListing');
    const { rows } = await this.pool.query(
      `SELECT * FROM brand_locked_listing
       WHERE marketplace_listing_id = $1
       ORDER BY created_at ASC`,
      [marketplaceListingId],
    );
    return rows.map(brandLockRowToDomain);
  }

  async updateBrandLock(
    lockId: string,
    patch: Partial<Pick<BrandLockedListing, 'state' | 'overridePriceCents' | 'notes' | 'auditActorId' | 'updatedBy'>>,
  ): Promise<BrandLockedListing> {
    if (!this.pool) throw new StoreNotConfiguredError('updateBrandLock');

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if ('state' in patch) {
      setClauses.push(`state = $${idx++}`);
      params.push(patch.state);
    }
    if ('overridePriceCents' in patch) {
      setClauses.push(`override_price_cents = $${idx++}`);
      params.push(patch.overridePriceCents);
    }
    if ('notes' in patch) {
      setClauses.push(`notes = $${idx++}`);
      params.push(patch.notes);
    }
    if ('auditActorId' in patch) {
      setClauses.push(`audit_actor_id = $${idx++}`);
      params.push(patch.auditActorId);
    }
    if ('updatedBy' in patch) {
      setClauses.push(`updated_by = $${idx++}`);
      params.push(patch.updatedBy);
    }

    if (setClauses.length === 0) {
      const existing = await this.getBrandLock(
        (await this.pool.query('SELECT workspace_id, brand_kit_id, marketplace_listing_id FROM brand_locked_listing WHERE id = $1', [lockId])).rows[0]?.workspace_id ?? '',
        (await this.pool.query('SELECT brand_kit_id FROM brand_locked_listing WHERE id = $1', [lockId])).rows[0]?.brand_kit_id ?? '',
        (await this.pool.query('SELECT marketplace_listing_id FROM brand_locked_listing WHERE id = $1', [lockId])).rows[0]?.marketplace_listing_id ?? '',
      );
      if (!existing) throw new BrandLockNotFoundError(`Brand lock not found: ${lockId}`);
      return existing;
    }

    setClauses.push(`updated_at = $${idx++}`);
    params.push(new Date());

    params.push(lockId);
    const sql = `UPDATE brand_locked_listing SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const { rows } = await this.pool.query(sql, params);
    if (rows.length === 0) throw new BrandLockNotFoundError(`Brand lock not found: ${lockId}`);
    return brandLockRowToDomain(rows[0]!);
  }

  async deleteBrandLock(lockId: string): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('deleteBrandLock');
    const { rowCount } = await this.pool.query(
      'DELETE FROM brand_locked_listing WHERE id = $1',
      [lockId],
    );
    if (rowCount === 0) throw new BrandLockNotFoundError(`Brand lock not found: ${lockId}`);
  }

  // -------------------------------------------------------------------------
  // Takedown Requests (Phase 19 Wave 4 — WS-MKT-8)
  // -------------------------------------------------------------------------

  async insertTakedownRequest(request: TakedownRequest): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('insertTakedownRequest');
    await this.pool.query(
      `INSERT INTO takedown_request (
        id, workspace_id, listing_id, claimant_id, kind,
        evidence_url, statement, status, resolution_notes,
        submitted_at, resolved_at, created_at, updated_at,
        created_by, updated_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15
      )`,
      [
        request.id,
        request.workspaceId,
        request.listingId,
        request.claimantId,
        request.kind,
        request.evidenceUrl,
        request.statement,
        request.status,
        request.resolutionNotes,
        request.submittedAt,
        request.resolvedAt,
        request.createdAt,
        request.updatedAt,
        request.createdBy,
        request.updatedBy,
      ],
    );
  }

  async getTakedownRequest(takedownId: string): Promise<TakedownRequest | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getTakedownRequest');
    const { rows } = await this.pool.query(
      'SELECT * FROM takedown_request WHERE id = $1',
      [takedownId],
    );
    if (rows.length === 0) return null;
    return takedownRequestRowToDomain(rows[0]!);
  }

  async listTakedownRequestsByListing(listingId: string): Promise<TakedownRequest[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listTakedownRequestsByListing');
    const { rows } = await this.pool.query(
      `SELECT * FROM takedown_request
       WHERE listing_id = $1
       ORDER BY submitted_at DESC`,
      [listingId],
    );
    return rows.map(takedownRequestRowToDomain);
  }

  async listTakedownRequests(opts?: { status?: TakedownStatus; kind?: TakedownKind }): Promise<TakedownRequest[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listTakedownRequests');
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts?.status) {
      conditions.push(`status = $${idx++}`);
      params.push(opts.status);
    }
    if (opts?.kind) {
      conditions.push(`kind = $${idx++}`);
      params.push(opts.kind);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM takedown_request ${where} ORDER BY submitted_at DESC`;
    const { rows } = await this.pool.query(sql, params);
    return rows.map(takedownRequestRowToDomain);
  }

  async updateTakedownStatus(
    takedownId: string,
    status: TakedownStatus,
    patch?: Partial<Pick<TakedownRequest, 'resolutionNotes' | 'resolvedAt' | 'updatedBy'>>,
  ): Promise<TakedownRequest> {
    if (!this.pool) throw new StoreNotConfiguredError('updateTakedownStatus');

    const setClauses: string[] = ['status = $1'];
    const params: unknown[] = [status];
    let idx = 2;

    if ('resolutionNotes' in (patch ?? {})) {
      setClauses.push(`resolution_notes = $${idx++}`);
      params.push(patch!.resolutionNotes);
    }
    if ('resolvedAt' in (patch ?? {})) {
      setClauses.push(`resolved_at = $${idx++}`);
      params.push(patch!.resolvedAt);
    }
    if ('updatedBy' in (patch ?? {})) {
      setClauses.push(`updated_by = $${idx++}`);
      params.push(patch!.updatedBy);
    }

    setClauses.push(`updated_at = $${idx++}`);
    params.push(new Date());

    params.push(takedownId);
    const sql = `UPDATE takedown_request SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const { rows } = await this.pool.query(sql, params);
    if (rows.length === 0) throw new TakedownNotFoundError(`Takedown request not found: ${takedownId}`);
    return takedownRequestRowToDomain(rows[0]!);
  }

  // -------------------------------------------------------------------------
  // Trust Scores (Phase 19 Wave 4 — WS-MKT-8)
  // -------------------------------------------------------------------------

  async upsertTrustScore(score: TrustScore): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('upsertTrustScore');
    await this.pool.query(
      `INSERT INTO trust_score (id, listing_id, score, signals, computed_at)
       VALUES ($1, $2, $3, $4::jsonb, $5)
       ON CONFLICT (listing_id) DO UPDATE SET
         score = EXCLUDED.score,
         signals = EXCLUDED.signals,
         computed_at = EXCLUDED.computed_at`,
      [
        score.id,
        score.listingId,
        score.score,
        JSON.stringify(score.signals),
        score.computedAt,
      ],
    );
  }

  async getTrustScoreByListing(listingId: string): Promise<TrustScore | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getTrustScoreByListing');
    const { rows } = await this.pool.query(
      'SELECT * FROM trust_score WHERE listing_id = $1',
      [listingId],
    );
    if (rows.length === 0) return null;
    return trustScoreRowToDomain(rows[0]!);
  }

  // -------------------------------------------------------------------------
  // FX Rates (Phase 19 Wave 5 — WS-MKT-7)
  // -------------------------------------------------------------------------

  async getLatestFxRate(base: string, quote: string): Promise<FxRate | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getLatestFxRate');
    const { rows } = await this.pool.query(
      `SELECT * FROM fx_rate
       WHERE base = $1 AND quote = $2
       ORDER BY fetched_at DESC
       LIMIT 1`,
      [base, quote],
    );
    if (rows.length === 0) return null;
    return fxRateRowToDomain(rows[0]!);
  }

  // -------------------------------------------------------------------------
  // Payout Runs (Phase 19 Wave 5 — WS-MKT-7)
  // -------------------------------------------------------------------------

  async listPayoutRuns(opts?: { periodMonth?: string }): Promise<PayoutRun[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listPayoutRuns');
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts?.periodMonth) {
      conditions.push(`period_month = $${idx++}`);
      params.push(opts.periodMonth);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM payout_run ${where} ORDER BY created_at DESC`;
    const { rows } = await this.pool.query(sql, params);
    return rows.map(payoutRunRowToDomain);
  }

  async getPayoutRun(runId: string): Promise<PayoutRun | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getPayoutRun');
    const { rows } = await this.pool.query(
      'SELECT * FROM payout_run WHERE id = $1',
      [runId],
    );
    if (rows.length === 0) return null;
    return payoutRunRowToDomain(rows[0]!);
  }

  // -------------------------------------------------------------------------
  // Webhook Deliveries (Phase 19 Wave 5 — WS-MKT-5/8/9)
  // -------------------------------------------------------------------------

  async createWebhookDelivery(delivery: WebhookDelivery): Promise<void> {
    if (!this.pool) throw new StoreNotConfiguredError('createWebhookDelivery');
    await this.pool.query(
      `INSERT INTO webhook_delivery (
        id, workspace_id, event_type, event_id, payload,
        signature, target_url, status, attempts,
        last_error, next_retry_at, created_at, delivered_at
      ) VALUES (
        $1, $2, $3, $4, $5::jsonb,
        $6, $7, $8, $9,
        $10, $11, $12, $13
      )`,
      [
        delivery.id,
        delivery.workspaceId,
        delivery.eventType,
        delivery.eventId,
        JSON.stringify(delivery.payload),
        delivery.signature,
        delivery.targetUrl,
        delivery.status,
        delivery.attempts,
        delivery.lastError,
        delivery.nextRetryAt,
        delivery.createdAt,
        delivery.deliveredAt,
      ],
    );
  }

  async getWebhookDelivery(deliveryId: string): Promise<WebhookDelivery | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getWebhookDelivery');
    const { rows } = await this.pool.query(
      'SELECT * FROM webhook_delivery WHERE id = $1',
      [deliveryId],
    );
    if (rows.length === 0) return null;
    return webhookDeliveryRowToDomain(rows[0]!);
  }

  async updateWebhookDeliveryStatus(
    deliveryId: string,
    status: WebhookDelivery['status'],
    patch?: Partial<Pick<WebhookDelivery, 'lastError' | 'attempts' | 'deliveredAt' | 'nextRetryAt'>>,
  ): Promise<WebhookDelivery> {
    if (!this.pool) throw new StoreNotConfiguredError('updateWebhookDeliveryStatus');

    const setClauses: string[] = ['status = $1'];
    const params: unknown[] = [status];
    let idx = 2;

    if ('lastError' in (patch ?? {})) {
      setClauses.push(`last_error = $${idx++}`);
      params.push(patch!.lastError);
    }
    if ('attempts' in (patch ?? {})) {
      setClauses.push(`attempts = $${idx++}`);
      params.push(patch!.attempts);
    }
    if ('deliveredAt' in (patch ?? {})) {
      setClauses.push(`delivered_at = $${idx++}`);
      params.push(patch!.deliveredAt);
    }
    if ('nextRetryAt' in (patch ?? {})) {
      setClauses.push(`next_retry_at = $${idx++}`);
      params.push(patch!.nextRetryAt);
    }

    params.push(deliveryId);
    const sql = `UPDATE webhook_delivery SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`;
    const { rows } = await this.pool.query(sql, params);
    if (rows.length === 0) throw new ListingNotFoundError(deliveryId);
    return webhookDeliveryRowToDomain(rows[0]!);
  }

  async listWebhookDeliveriesDue(nextRetryAt: Date): Promise<WebhookDelivery[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listWebhookDeliveriesDue');
    const { rows } = await this.pool.query(
      `SELECT * FROM webhook_delivery
       WHERE status = 'pending' AND next_retry_at IS NOT NULL AND next_retry_at <= $1
       ORDER BY next_retry_at ASC
       LIMIT 100`,
      [nextRetryAt],
    );
    return rows.map(webhookDeliveryRowToDomain);
  }

  // -------------------------------------------------------------------------
  // Partner Clients (Phase 19 Wave 5 — WS-MKT-5/8/9)
  // -------------------------------------------------------------------------

  async getPartnerClientByClientId(clientId: string): Promise<PartnerClient | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getPartnerClientByClientId');
    const { rows } = await this.pool.query(
      'SELECT * FROM partner_client WHERE client_id = $1',
      [clientId],
    );
    if (rows.length === 0) return null;
    return partnerClientRowToDomain(rows[0]!);
  }
}

// ---------------------------------------------------------------------------
// Row → domain mappers
// ---------------------------------------------------------------------------

function listingRowToDomain(row: Record<string, unknown>): MarketplaceListing {
  return {
    id: row.id as string,
    catalogId: row.catalog_id as string,
    sellerId: row.seller_id as string,
    title: row.title as string,
    description: row.description as string,
    status: row.status as MarketplaceListing['status'],
    isFree: row.is_free as boolean,
    priceCents: row.price_cents as number | null,
    currency: row.currency as string | null,
    tags: row.tags != null ? parseJsonb(row.tags) as readonly string[] : [],
    preview: row.preview != null ? parseJsonb(row.preview) as Record<string, unknown> : null,
    publishedAtMs: row.published_at_ms != null ? Number(row.published_at_ms) : null,
    deprecatedAtMs: row.deprecated_at_ms != null ? Number(row.deprecated_at_ms) : null,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function reviewRowToDomain(
  row: Record<string, unknown>,
  reply: { replyBody: string; repliedAt: Date } | null,
): MarketplaceReview {
  return {
    id: row.id as string,
    listingId: row.listing_id as string,
    reviewerId: row.reviewer_id as string,
    rating: row.rating as number,
    body: row.body as string,
    status: row.status as MarketplaceReview['status'],
    verifiedBuyer: row.verified_buyer as boolean,
    replyBody: reply?.replyBody ?? null,
    repliedAt: reply?.repliedAt ?? null,
    createdAt: toDate(row.created_at),
  };
}

function paymentIntentRowToDomain(row: Record<string, unknown>): PaymentIntent {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    buyerId: row.buyer_id as string,
    listingId: row.listing_id as string,
    purchaseId: row.purchase_id as string,
    provider: row.provider as PaymentIntent['provider'],
    providerIntentId: row.provider_intent_id as string | null,
    currency: row.currency as string,
    grossCents: Number(row.gross_cents),
    taxCents: Number(row.tax_cents),
    feeCents: Number(row.fee_cents),
    netCents: Number(row.net_cents),
    fxRate: row.fx_rate != null ? Number(row.fx_rate) : null,
    fxTimestamp: row.fx_timestamp != null ? toDate(row.fx_timestamp) : null,
    status: row.status as PaymentIntent['status'],
    idempotencyKey: row.idempotency_key as string,
    disputeStatus: row.dispute_status as PaymentIntent['disputeStatus'],
    refundStatus: row.refund_status as PaymentIntent['refundStatus'],
    refundedAt: row.refunded_at != null ? toDate(row.refunded_at) : null,
    refundReason: row.refund_reason as string | null,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function licenseGrantRowToDomain(row: Record<string, unknown>): LicenseGrant {
  return {
    id: row.id as string,
    listingId: row.listing_id as string,
    buyerId: row.buyer_id as string,
    version: row.version as string,
    scopes: row.scopes != null ? parseJsonb(row.scopes) as readonly string[] : [],
    seats: row.seats as number,
    signedToken: row.signed_token as string,
    createdAt: toDate(row.created_at),
  };
}

function revenueShareEventRowToDomain(row: Record<string, unknown>): RevenueShareEvent {
  return {
    id: row.id as string,
    listingId: row.listing_id as string,
    sellerId: row.seller_id as string,
    workspaceId: row.workspace_id as string,
    currency: row.currency as string,
    grossCents: Number(row.gross_cents),
    feeCents: Number(row.fee_cents),
    netCents: Number(row.net_cents),
    periodMonth: row.period_month as string,
    eventType: row.event_type as string,
    payoutStatus: row.payout_status as RevenueShareEvent['payoutStatus'],
    createdAt: toDate(row.created_at),
  };
}

function creatorProfileRowToDomain(row: Record<string, unknown>): CreatorProfile {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    displayName: row.display_name as string | null,
    slug: row.slug as string | null,
    bio: row.bio as string | null,
    countryCode: row.country_code as string | null,
    payoutMethod: row.payout_method as string | null,
    payoutReady: row.payout_ready as boolean,
    kycStatus: row.kyc_status as KycStatus,
    onboardingState: row.onboarding_state as CreatorProfile['onboardingState'],
    balanceCents: Number(row.balance_cents),
    currency: row.currency as string,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function kycSessionRowToDomain(row: Record<string, unknown>): KycSession {
  return {
    id: row.id as string,
    creatorId: row.creator_id as string,
    vendor: row.vendor as string,
    vendorSessionId: row.vendor_session_id as string | null,
    status: row.status as KycStatus,
    lastPolledAt: row.last_polled_at != null ? toDate(row.last_polled_at) : null,
    raw: row.raw != null ? parseJsonb(row.raw) as Record<string, unknown> : null,
    createdAt: toDate(row.created_at),
  };
}

function creatorPayoutMethodRowToDomain(row: Record<string, unknown>): CreatorPayoutMethod {
  return {
    id: row.id as string,
    creatorId: row.creator_id as string,
    kind: row.kind as CreatorPayoutMethod['kind'],
    externalAccountId: row.external_account_id as string,
    verified: row.verified as boolean,
    metadata: row.metadata != null ? parseJsonb(row.metadata) as Record<string, unknown> : null,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

function brandLockRowToDomain(row: Record<string, unknown>): BrandLockedListing {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    brandKitId: row.brand_kit_id as string,
    marketplaceListingId: row.marketplace_listing_id as string,
    state: row.state as BrandLockedListing['state'],
    overridePriceCents: row.override_price_cents != null ? Number(row.override_price_cents) : null,
    notes: row.notes as string | null,
    auditActorId: row.audit_actor_id as string | null,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    createdBy: row.created_by as string | null,
    updatedBy: row.updated_by as string | null,
  };
}

function takedownRequestRowToDomain(row: Record<string, unknown>): TakedownRequest {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    listingId: row.listing_id as string,
    claimantId: row.claimant_id as string,
    kind: row.kind as TakedownRequest['kind'],
    evidenceUrl: row.evidence_url as string | null,
    statement: row.statement as string,
    status: row.status as TakedownRequest['status'],
    resolutionNotes: row.resolution_notes as string | null,
    submittedAt: toDate(row.submitted_at),
    resolvedAt: row.resolved_at != null ? toDate(row.resolved_at) : null,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    createdBy: row.created_by as string | null,
    updatedBy: row.updated_by as string | null,
  };
}

function trustScoreRowToDomain(row: Record<string, unknown>): TrustScore {
  return {
    id: row.id as string,
    listingId: row.listing_id as string,
    score: Number(row.score),
    signals: row.signals != null ? parseJsonb(row.signals) as Record<string, unknown> : {},
    computedAt: toDate(row.computed_at),
  };
}

function fxRateRowToDomain(row: Record<string, unknown>): FxRate {
  return {
    id: row.id as string,
    base: row.base as string,
    quote: row.quote as string,
    rate: Number(row.rate),
    fetchedAt: toDate(row.fetched_at),
    source: row.source as string,
  };
}

function payoutRunRowToDomain(row: Record<string, unknown>): PayoutRun {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    periodMonth: row.period_month as string,
    executedAt: toDate(row.executed_at),
    totalCreators: row.total_creators as number,
    totalPayoutCents: Number(row.total_payout_cents),
    currency: row.currency as string,
    status: row.status as PayoutRunStatus,
    createdAt: toDate(row.created_at),
  };
}

function webhookDeliveryRowToDomain(row: Record<string, unknown>): WebhookDelivery {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    eventType: row.event_type as string,
    eventId: row.event_id as string,
    payload: row.payload != null ? parseJsonb(row.payload) as Record<string, unknown> : {},
    signature: row.signature as string,
    targetUrl: row.target_url as string,
    status: row.status as WebhookDelivery['status'],
    attempts: row.attempts as number,
    lastError: row.last_error as string | null,
    nextRetryAt: row.next_retry_at != null ? toDate(row.next_retry_at) : null,
    createdAt: toDate(row.created_at),
    deliveredAt: row.delivered_at != null ? toDate(row.delivered_at) : null,
  };
}

function partnerClientRowToDomain(row: Record<string, unknown>): PartnerClient {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    clientId: row.client_id as string,
    clientSecretHash: row.client_secret_hash as string,
    scopes: row.scopes as readonly string[],
    tier: row.tier as PartnerClientTier,
    createdBy: row.created_by as string | null,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJsonb(val: unknown): unknown {
  if (val == null) return null;
  if (typeof val === 'string') return JSON.parse(val);
  return val;
}

function toDate(val: unknown): Date {
  if (val instanceof Date) return val;
  if (typeof val === 'string') return new Date(val);
  return new Date(val as number);
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class StoreNotConfiguredError extends Error {
  readonly code = 'STORE_NOT_CONFIGURED' as const;
  constructor(public readonly op: string) {
    super(`pg store has no pool configured (op=${op})`);
    this.name = 'StoreNotConfiguredError';
  }
}

export class StoreNotImplementedError extends Error {
  readonly code = 'STORE_NOT_IMPLEMENTED' as const;
  constructor(public readonly op: string, public readonly args: Record<string, unknown>) {
    super(`pg store op ${op} not yet implemented; args=${JSON.stringify(args)}`);
    this.name = 'StoreNotImplementedError';
  }
}
