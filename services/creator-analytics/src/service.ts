/**
 * Creator analytics service (Phase 19 Wave 3).
 *
 * Transport-agnostic orchestration of creator analytics and statements.
 * Depends on:
 *  - {@link AnalyticsStore} — persistence (read-only queries against P06/P19 tables).
 */

import {
  type CreatorAnalytics,
  type StatementSummary,
  type StatementKind,
  StatementNotFoundError,
} from './types.js';
import { checkFeature, FEATURE_FLAGS } from './feature_flags.js';
import { computeAnalyticsBody, validatePeriod } from './analytics.js';
import { buildStatementBody, buildYearly1099KBody, generateStatementId } from './statements.js';
import type { AnalyticsStore } from './store/store.js';

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface CreatorAnalyticsServiceOptions {
  readonly store: AnalyticsStore;
  /** Clock. Default Date.now. */
  readonly now?: () => Date;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CreatorAnalyticsService {
  private readonly store: AnalyticsStore;
  private readonly clock: () => Date;

  constructor(opts: CreatorAnalyticsServiceOptions) {
    if (!opts.store) throw new Error('CreatorAnalyticsService: store is required');
    this.store = opts.store;
    this.clock = opts.now ?? (() => new Date());
  }

  private now(): Date {
    return this.clock();
  }

  // -------------------------------------------------------------------------
  // Get creator analytics
  // -------------------------------------------------------------------------

  async getCreatorAnalytics(input: {
    creator_id: string;
    period: string;
  }): Promise<CreatorAnalytics> {
    checkFeature(FEATURE_FLAGS.analytics);

    validatePeriod(input.period);

    // Fetch data rows from store
    const revenueEvents = await this.store.getRevenueEvents({
      creator_id: input.creator_id,
      period_month: input.period,
    });

    const payments = await this.store.getPaymentIntents({
      creator_id: input.creator_id,
    });

    const licenseGrants = await this.store.getLicenseGrants(input.creator_id);

    // Count refunds: revenue events with event_type = 'refund'
    const refunds = revenueEvents.filter((e) => e.event_type === 'refund').length;

    // Build geo data — revenue events don't carry geo, so geos come from
    // payment intents or are empty (real geo data is a later-wave addition)
    const geos: Array<{ country_code: string; count: number }> = [];

    return computeAnalyticsBody(input.creator_id, input.period, {
      installs: licenseGrants.length,
      revenue_events: revenueEvents,
      payments,
      refunds,
      geos,
    });
  }

  // -------------------------------------------------------------------------
  // List creator statements
  // -------------------------------------------------------------------------

  async listCreatorStatements(input: {
    creator_id: string;
    kind?: StatementKind;
  }): Promise<readonly StatementSummary[]> {
    checkFeature(FEATURE_FLAGS.analytics);
    return this.store.listStatements({
      creator_id: input.creator_id,
      kind: input.kind,
    });
  }

  // -------------------------------------------------------------------------
  // Get single creator statement
  // -------------------------------------------------------------------------

  async getCreatorStatement(statement_id: string): Promise<StatementSummary> {
    checkFeature(FEATURE_FLAGS.analytics);
    const stmt = await this.store.getStatement(statement_id);
    if (!stmt) throw new StatementNotFoundError(statement_id);
    return stmt;
  }

  // -------------------------------------------------------------------------
  // Generate monthly statement (idempotent)
  // -------------------------------------------------------------------------

  async generateMonthlyStatement(input: {
    creator_id: string;
    period_month: string;
  }): Promise<StatementSummary> {
    checkFeature(FEATURE_FLAGS.analytics);

    validatePeriod(input.period_month);

    // Idempotency: if statement exists for (creator, period, 'monthly'), return it
    const existing = await this.store.listStatements({
      creator_id: input.creator_id,
      kind: 'monthly',
    });
    const found = existing.find((s) => s.period_month === input.period_month);
    if (found) return found;

    // Fetch revenue events for this period
    const revenueEvents = await this.store.getRevenueEvents({
      creator_id: input.creator_id,
      period_month: input.period_month,
    });

    // Build statement body
    const { summary } = buildStatementBody(input.creator_id, input.period_month, revenueEvents);

    const now = this.now();
    const fullSummary: StatementSummary = {
      statement_id: generateStatementId(),
      ...summary,
      generated_at: now.getTime(),
    };

    return this.store.insertStatement(fullSummary);
  }

  // -------------------------------------------------------------------------
  // Generate yearly 1099-K (idempotent)
  // -------------------------------------------------------------------------

  async generateYearly1099K(input: {
    creator_id: string;
    year: string;
  }): Promise<StatementSummary> {
    checkFeature(FEATURE_FLAGS.analytics);

    // Idempotency: if yearly statement exists for this year, return it
    const existing = await this.store.listStatements({
      creator_id: input.creator_id,
      kind: 'yearly_1099k',
    });
    const yearMarker = `${input.year}-12`;
    const found = existing.find((s) => s.period_month === yearMarker);
    if (found) return found;

    // Fetch monthly statements for this year
    const monthlyStatements = await this.store.listStatements({
      creator_id: input.creator_id,
      kind: 'monthly',
    });
    const yearMonthly = monthlyStatements.filter((s) => s.period_month.startsWith(input.year));

    // Build yearly body
    const { summary } = buildYearly1099KBody(input.creator_id, yearMonthly);

    const now = this.now();
    const fullSummary: StatementSummary = {
      statement_id: generateStatementId(),
      ...summary,
      generated_at: now.getTime(),
    };

    return this.store.insertStatement(fullSummary);
  }
}
