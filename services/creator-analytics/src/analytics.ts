/**
 * Pure analytics computation (Phase 19 Wave 3).
 *
 * Zero side-effects: given raw data rows, produce a CreatorAnalytics body
 * and validate period strings.
 */

import type {
  CreatorAnalytics,
  GeoCount,
  RevenueEventRow,
  PaymentIntentRow,
} from './types.js';
import { InvalidPeriodError } from './types.js';

// ---------------------------------------------------------------------------
// Period validation
// ---------------------------------------------------------------------------

const PERIOD_RE = /^\d{4}-\d{2}$/;

/** Throws InvalidPeriodError if the period is not 'YYYY-MM'. */
export function validatePeriod(period: string): void {
  if (!PERIOD_RE.test(period)) {
    throw new InvalidPeriodError(period);
  }
}

// ---------------------------------------------------------------------------
// Analytics body computation
// ---------------------------------------------------------------------------

export interface AnalyticsInput {
  /** Number of install/license-grant events. */
  readonly installs: number;
  /** Revenue events for this creator in this period. */
  readonly revenue_events: readonly RevenueEventRow[];
  /** Payment intents for this creator (seller context) in this period. */
  readonly payments: readonly PaymentIntentRow[];
  /** Number of refund events. */
  readonly refunds: number;
  /** Geo distribution. */
  readonly geos: readonly GeoCount[];
}

/**
 * Compute the analytics body from raw data.
 *
 * Rules:
 *  - downloads = installs + count(revenue_events)
 *  - installs  = number of license_grant rows
 *  - mrr_cents = sum of net_cents for subscription-kind revenue events in period
 *  - conversion_rate = payments_with_succeeded_status / max(installs, 1)
 *  - refund_rate = refunds / max(installs, 1)
 *  - top_geos = sorted descending, top 5
 */
export function computeAnalyticsBody(
  creatorId: string,
  period: string,
  input: AnalyticsInput,
): CreatorAnalytics {
  const downloads = input.installs + input.revenue_events.length;
  const installs = input.installs;

  // MRR: sum net_cents for subscription-kind revenue events
  let mrr_cents = 0;
  for (const ev of input.revenue_events) {
    if (ev.event_type === 'subscription') {
      mrr_cents += ev.net_cents;
    }
  }

  // Conversion rate: how many payments succeeded vs installs
  const successfulPayments = input.payments.filter(p => p.status === 'succeeded').length;
  const conversion_rate = installs > 0 ? successfulPayments / installs : 0;

  // Refund rate
  const refund_rate = installs > 0 ? input.refunds / installs : 0;

  // Top geos: sorted descending by count, take top 5
  const top_geos = [...input.geos]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    creator_id: creatorId,
    period,
    downloads,
    installs,
    mrr_cents,
    conversion_rate,
    refund_rate,
    top_geos,
    computed_at: Date.now(),
  };
}
