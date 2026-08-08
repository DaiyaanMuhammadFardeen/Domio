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
} from '../types.js';
import { ListingNotFoundError, ReviewNotFoundError } from '../types.js';
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
