/**
 * In-memory analytics store (Phase 19 Wave 3).
 *
 * Backs every method of {@link AnalyticsStore} with Maps/arrays.
 * Used in unit tests and in dev when DATABASE_URL is unset.
 */

import type {
  RevenueEventRow,
  PaymentIntentRow,
  LicenseGrantRow,
  StatementSummary,
} from '../types.js';
import type { AnalyticsStore } from './store.js';

export class InMemoryAnalyticsStore implements AnalyticsStore {
  private readonly revenueEvents: RevenueEventRow[] = [];
  private readonly paymentIntents: PaymentIntentRow[] = [];
  private readonly licenseGrants: LicenseGrantRow[] = [];
  private readonly statements = new Map<string, StatementSummary>();

  // -------------------------------------------------------------------------
  // Seed helpers (for tests)
  // -------------------------------------------------------------------------

  seedRevenueEvent(event: RevenueEventRow): void {
    this.revenueEvents.push(event);
  }

  seedPaymentIntent(intent: PaymentIntentRow): void {
    this.paymentIntents.push(intent);
  }

  seedLicenseGrant(grant: LicenseGrantRow): void {
    this.licenseGrants.push(grant);
  }

  clear(): void {
    this.revenueEvents.length = 0;
    this.paymentIntents.length = 0;
    this.licenseGrants.length = 0;
    this.statements.clear();
  }

  // -------------------------------------------------------------------------
  // AnalyticsStore implementation
  // -------------------------------------------------------------------------

  async getRevenueEvents(opts: {
    creator_id: string;
    period_month: string;
  }): Promise<readonly RevenueEventRow[]> {
    return this.revenueEvents.filter(
      (e) => e.seller_id === opts.creator_id && e.period_month === opts.period_month,
    );
  }

  async getPaymentIntents(opts: {
    buyer_id?: string;
    creator_id?: string;
  }): Promise<readonly PaymentIntentRow[]> {
    if (opts.buyer_id) {
      return this.paymentIntents.filter((p) => p.buyer_id === opts.buyer_id);
    }
    // creator_id context: in-memory can't join via listing, so we'd need
    // listing→seller mapping. For simplicity, the mem_store returns all
    // payment intents (tests should seed accordingly).
    if (opts.creator_id) {
      // Return empty — real join requires listing data.
      // Tests should use the pg_store or seed with buyer_id.
      return [];
    }
    return [];
  }

  async getLicenseGrants(_creator_id: string): Promise<readonly LicenseGrantRow[]> {
    // In-memory: return all grants (simplified — no listing join).
    return this.licenseGrants;
  }

  async listStatements(opts: {
    creator_id: string;
    kind?: string | undefined;
  }): Promise<readonly StatementSummary[]> {
    const results: StatementSummary[] = [];
    for (const s of this.statements.values()) {
      if (s.creator_id !== opts.creator_id) continue;
      if (opts.kind && s.kind !== opts.kind) continue;
      results.push(s);
    }
    return results;
  }

  async getStatement(statement_id: string): Promise<StatementSummary | null> {
    return this.statements.get(statement_id) ?? null;
  }

  async insertStatement(summary: StatementSummary): Promise<StatementSummary> {
    this.statements.set(summary.statement_id, summary);
    return summary;
  }

  async withTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}
