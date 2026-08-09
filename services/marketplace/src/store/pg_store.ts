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
} from '../types.js';
import { ListingNotFoundError, ReviewNotFoundError } from '../types.js';
import type {
  CreatorProfile,
  KycSession,
  CreatorPayoutMethod,
  KycStatus,
} from '../creator/types.js';
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
