/**
 * Pure statement building (Phase 19 Wave 3).
 *
 * Groups revenue_share_events by event_type to produce line items and totals.
 * Generates 1099-K yearly aggregates from monthly statement_record rows.
 * NO PDF generation — payload jsonb holds structured data.
 */

import type {
  StatementSummary,
  StatementLineItem,
  RevenueEventRow,
} from './types.js';

// ---------------------------------------------------------------------------
// Statement ID generator (ULID-ish)
// ---------------------------------------------------------------------------

/**
 * Generate a statement ID in the form 'stmt-' + ULID-ish string.
 * Uses timestamp prefix for chronological ordering.
 */
export function generateStatementId(): string {
  const ts = Date.now().toString(36).padStart(10, '0');
  const rand = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 36).toString(36),
  ).join('');
  return `stmt-${ts}${rand}`;
}

// ---------------------------------------------------------------------------
// Build monthly statement body
// ---------------------------------------------------------------------------

/**
 * From eligible revenue_share_events in a period_month, group by event_type
 * and produce line items + totals.
 */
export function buildStatementBody(
  creatorId: string,
  periodMonth: string,
  events: readonly RevenueEventRow[],
): {
  summary: Omit<StatementSummary, 'statement_id' | 'generated_at'>;
  lineItems: StatementLineItem[];
} {
  // Group by event_type
  const groups = new Map<string, { count: number; gross_cents: number; net_cents: number }>();

  for (const ev of events) {
    const existing = groups.get(ev.event_type);
    if (existing) {
      existing.count += 1;
      existing.gross_cents += ev.gross_cents;
      existing.net_cents += ev.net_cents;
    } else {
      groups.set(ev.event_type, {
        count: 1,
        gross_cents: ev.gross_cents,
        net_cents: ev.net_cents,
      });
    }
  }

  const lineItems: StatementLineItem[] = [];
  let total_gross_cents = 0;
  let total_fee_cents = 0;
  let total_net_cents = 0;

  for (const [event_type, agg] of groups) {
    lineItems.push({
      event_type,
      count: agg.count,
      gross_cents: agg.gross_cents,
      net_cents: agg.net_cents,
    });
    total_gross_cents += agg.gross_cents;
    total_net_cents += agg.net_cents;
  }

  total_fee_cents = total_gross_cents - total_net_cents;

  // Determine currency from events (default USD)
  const currency = events.length > 0 ? events[0]!.currency : 'USD';

  return {
    summary: {
      creator_id: creatorId,
      period_month: periodMonth,
      kind: 'monthly',
      total_gross_cents,
      total_fee_cents,
      total_net_cents,
      currency,
    },
    lineItems,
  };
}

// ---------------------------------------------------------------------------
// Build yearly 1099-K body
// ---------------------------------------------------------------------------

/**
 * Build a yearly 1099-K statement from monthly statement_record rows.
 * Aggregates 12 months of totals.
 */
export function buildYearly1099KBody(
  creatorId: string,
  monthlyStatements: readonly StatementSummary[],
): {
  summary: Omit<StatementSummary, 'statement_id' | 'generated_at'>;
  monthlyBreakdown: StatementLineItem[];
} {
  let total_gross_cents = 0;
  let total_fee_cents = 0;
  let total_net_cents = 0;
  const currency = monthlyStatements.length > 0 ? monthlyStatements[0]!.currency : 'USD';

  // Build line items by period_month
  const monthlyBreakdown: StatementLineItem[] = [];

  for (const ms of monthlyStatements) {
    total_gross_cents += ms.total_gross_cents;
    total_fee_cents += ms.total_fee_cents;
    total_net_cents += ms.total_net_cents;

    monthlyBreakdown.push({
      event_type: ms.period_month,
      count: 1,
      gross_cents: ms.total_gross_cents,
      net_cents: ms.total_net_cents,
    });
  }

  // Derive year from the first statement's period_month
  const year = monthlyStatements.length > 0
    ? monthlyStatements[0]!.period_month.slice(0, 4)
    : new Date().getFullYear().toString();

  return {
    summary: {
      creator_id: creatorId,
      period_month: `${year}-12`, // Year-end marker
      kind: 'yearly_1099k',
      total_gross_cents,
      total_fee_cents,
      total_net_cents,
      currency,
    },
    monthlyBreakdown,
  };
}
