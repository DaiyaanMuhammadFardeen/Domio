/**
 * pg-backed analytics store (Phase 19 Wave 3).
 *
 * Full parameterized-SQL implementation of all {@link AnalyticsStore} methods.
 * Accepts a `Pool` (pg's public interface). Every mutating method checks
 * `this.pool != null` upfront and throws {@link StoreNotConfiguredError}.
 *
 * SQL conventions:
 *  - All queries use $N parameterised placeholders (no string interpolation).
 *  - jsonb columns (payload): inserted via $N::jsonb,
 *    read via JSON.parse(row.col) since node-pg returns jsonb as a plain object.
 *  - bigint ↔ number: cents fields (gross_cents, fee_cents, net_cents).
 *  - Revenue share events: table has seller_id (not creator_id).
 *  - License grants: table has user_id (not buyer_id), no scopes column.
 *  - Payment intents joined to creators via marketplace_listing.seller_id.
 */

import type { Pool as PgPool } from 'pg';
import type {
  RevenueEventRow,
  PaymentIntentRow,
  LicenseGrantRow,
  StatementSummary,
} from '../types.js';
import type { AnalyticsStore } from './store.js';

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class PgAnalyticsStore implements AnalyticsStore {
  /** Public for test injection. */
  readonly pool: PgPool | null;

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
  // Revenue share events (read-only from P06 revenue_share_event table)
  // -------------------------------------------------------------------------

  async getRevenueEvents(opts: {
    creator_id: string;
    period_month: string;
  }): Promise<readonly RevenueEventRow[]> {
    if (!this.pool) throw new StoreNotConfiguredError('getRevenueEvents');
    const { rows } = await this.pool.query(
      `SELECT id, listing_id, seller_id, workspace_id, currency,
              gross_cents, fee_cents, net_cents, payout_status,
              period_month, event_type
       FROM revenue_share_event
       WHERE seller_id = $1 AND period_month = $2
       ORDER BY created_at ASC`,
      [opts.creator_id, opts.period_month],
    );
    return rows.map(revenueEventRowToDomain);
  }

  // -------------------------------------------------------------------------
  // Payment intents (read-only from P19 payment_intent table)
  // -------------------------------------------------------------------------

  async getPaymentIntents(opts: {
    buyer_id?: string;
    creator_id?: string;
  }): Promise<readonly PaymentIntentRow[]> {
    if (!this.pool) throw new StoreNotConfiguredError('getPaymentIntents');

    if (opts.buyer_id) {
      const { rows } = await this.pool.query(
        `SELECT id, workspace_id, buyer_id, listing_id, purchase_id,
                provider, currency, gross_cents, fee_cents, net_cents, status
         FROM payment_intent
         WHERE buyer_id = $1
         ORDER BY created_at ASC`,
        [opts.buyer_id],
      );
      return rows.map(paymentIntentRowToDomain);
    }

    if (opts.creator_id) {
      // creator_id = seller context: join via listing → seller
      const { rows } = await this.pool.query(
        `SELECT pi.id, pi.workspace_id, pi.buyer_id, pi.listing_id, pi.purchase_id,
                pi.provider, pi.currency, pi.gross_cents, pi.fee_cents, pi.net_cents, pi.status
         FROM payment_intent pi
         JOIN marketplace_listing ml ON pi.listing_id = ml.id
         WHERE ml.seller_id = $1
         ORDER BY pi.created_at ASC`,
        [opts.creator_id],
      );
      return rows.map(paymentIntentRowToDomain);
    }

    return [];
  }

  // -------------------------------------------------------------------------
  // License grants (read-only from P06 license_grant table)
  // -------------------------------------------------------------------------

  async getLicenseGrants(creator_id: string): Promise<readonly LicenseGrantRow[]> {
    if (!this.pool) throw new StoreNotConfiguredError('getLicenseGrants');
    const { rows } = await this.pool.query(
      `SELECT lg.id, lg.workspace_id, lg.user_id, lg.catalog_id, lg.version,
              lg.listing_id, lg.license_id, lg.seats, lg.signed_token,
              lg.issued_at_ms, lg.expires_at_ms
       FROM license_grant lg
       JOIN marketplace_listing ml ON lg.listing_id = ml.id
       WHERE ml.seller_id = $1
       ORDER BY lg.issued_at_ms ASC`,
      [creator_id],
    );
    return rows.map(licenseGrantRowToDomain);
  }

  // -------------------------------------------------------------------------
  // Statements (CRUD on P09 statement_record table)
  // -------------------------------------------------------------------------

  async listStatements(opts: {
    creator_id: string;
    kind?: string | undefined;
  }): Promise<readonly StatementSummary[]> {
    if (!this.pool) throw new StoreNotConfiguredError('listStatements');

    if (opts.kind) {
      const { rows } = await this.pool.query(
        `SELECT id, creator_id, period_month, kind,
                total_gross_cents, total_fee_cents, total_net_cents,
                currency, generated_at
         FROM statement_record
         WHERE creator_id = $1 AND kind = $2
         ORDER BY period_month ASC`,
        [opts.creator_id, opts.kind],
      );
      return rows.map(statementRowToDomain);
    }

    const { rows } = await this.pool.query(
      `SELECT id, creator_id, period_month, kind,
              total_gross_cents, total_fee_cents, total_net_cents,
              currency, generated_at
       FROM statement_record
       WHERE creator_id = $1
       ORDER BY period_month ASC`,
      [opts.creator_id],
    );
    return rows.map(statementRowToDomain);
  }

  async getStatement(statement_id: string): Promise<StatementSummary | null> {
    if (!this.pool) throw new StoreNotConfiguredError('getStatement');
    const { rows } = await this.pool.query(
      `SELECT id, creator_id, period_month, kind,
              total_gross_cents, total_fee_cents, total_net_cents,
              currency, generated_at
       FROM statement_record
       WHERE id = $1`,
      [statement_id],
    );
    if (rows.length === 0) return null;
    return statementRowToDomain(rows[0]!);
  }

  async insertStatement(summary: StatementSummary): Promise<StatementSummary> {
    if (!this.pool) throw new StoreNotConfiguredError('insertStatement');
    await this.pool.query(
      `INSERT INTO statement_record (
        id, workspace_id, creator_id, period_month, kind,
        total_gross_cents, total_fee_cents, total_net_cents,
        currency, payload, generated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10::jsonb, $11
      )`,
      [
        summary.statement_id,
        '',  // workspace_id — not available in summary; set by caller
        summary.creator_id,
        summary.period_month,
        summary.kind,
        summary.total_gross_cents,
        summary.total_fee_cents,
        summary.total_net_cents,
        summary.currency,
        JSON.stringify({}),
        new Date(summary.generated_at),
      ],
    );
    return summary;
  }
}

// ---------------------------------------------------------------------------
// Row → domain mappers
// ---------------------------------------------------------------------------

function revenueEventRowToDomain(row: Record<string, unknown>): RevenueEventRow {
  return {
    id: row.id as string,
    listing_id: row.listing_id as string,
    seller_id: row.seller_id as string,
    workspace_id: row.workspace_id as string,
    currency: row.currency as string,
    gross_cents: Number(row.gross_cents),
    fee_cents: Number(row.fee_cents),
    net_cents: Number(row.net_cents),
    payout_status: row.payout_status as string,
    period_month: row.period_month as string,
    event_type: row.event_type as string,
  };
}

function paymentIntentRowToDomain(row: Record<string, unknown>): PaymentIntentRow {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    buyer_id: row.buyer_id as string,
    listing_id: row.listing_id as string,
    purchase_id: row.purchase_id as string,
    provider: row.provider as string,
    currency: row.currency as string,
    gross_cents: Number(row.gross_cents),
    fee_cents: Number(row.fee_cents),
    net_cents: Number(row.net_cents),
    status: row.status as string,
  };
}

function licenseGrantRowToDomain(row: Record<string, unknown>): LicenseGrantRow {
  return {
    id: row.id as string,
    workspace_id: row.workspace_id as string,
    user_id: row.user_id as string | null,
    catalog_id: row.catalog_id as string,
    version: row.version as string,
    listing_id: row.listing_id as string | null,
    license_id: row.license_id as string,
    seats: row.seats as number,
    signed_token: row.signed_token as string,
    issued_at_ms: Number(row.issued_at_ms),
    expires_at_ms: Number(row.expires_at_ms),
  };
}

function statementRowToDomain(row: Record<string, unknown>): StatementSummary {
  return {
    statement_id: row.id as string,
    creator_id: row.creator_id as string,
    period_month: row.period_month as string,
    kind: row.kind as StatementSummary['kind'],
    total_gross_cents: Number(row.total_gross_cents),
    total_fee_cents: Number(row.total_fee_cents),
    total_net_cents: Number(row.total_net_cents),
    currency: row.currency as string,
    generated_at: row.generated_at instanceof Date
      ? row.generated_at.getTime()
      : typeof row.generated_at === 'string'
        ? new Date(row.generated_at).getTime()
        : Number(row.generated_at),
  };
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
