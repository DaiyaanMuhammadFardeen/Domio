/**
 * Creator analytics store interface (Phase 19 Wave 3).
 *
 * Read-only queries against existing P06/P19 tables plus statement CRUD.
 * Two implementations:
 *  - {@link InMemoryAnalyticsStore} — used in tests and dev.
 *  - {@link PgAnalyticsStore}       — pg-pool-backed.
 */

import type {
  RevenueEventRow,
  PaymentIntentRow,
  LicenseGrantRow,
  StatementSummary,
} from '../types.js';

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface AnalyticsStore {
  /** Revenue share events for a creator in a specific month. */
  getRevenueEvents(opts: {
    creator_id: string;
    period_month: string;
  }): Promise<readonly RevenueEventRow[]>;

  /**
   * Payment intents — buyer_id for buyer context, creator_id (seller) for
   * creator context (joins via listing → seller).
   */
  getPaymentIntents(opts: {
    buyer_id?: string;
    creator_id?: string;
  }): Promise<readonly PaymentIntentRow[]>;

  /** License grants for a creator (via listing → seller join). */
  getLicenseGrants(creator_id: string): Promise<readonly LicenseGrantRow[]>;

  /** List statements, optionally filtered by kind. */
  listStatements(opts: {
    creator_id: string;
    kind?: string | undefined;
  }): Promise<readonly StatementSummary[]>;

  /** Get a single statement by ID. */
  getStatement(statement_id: string): Promise<StatementSummary | null>;

  /** Insert a new statement. Returns the inserted summary. */
  insertStatement(summary: StatementSummary): Promise<StatementSummary>;

  /** Transaction support. */
  withTransaction<T>(fn: () => Promise<T>): Promise<T>;
}
