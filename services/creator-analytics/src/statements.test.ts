/**
 * Pure statement building tests (Phase 19 Wave 3).
 *
 * Tests: line items, totals, 1099-K aggregation, statement ID format.
 */

import { describe, it, expect } from 'vitest';
import { buildStatementBody, buildYearly1099KBody, generateStatementId } from './statements.js';
import type { RevenueEventRow, StatementSummary } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRevenueEvent(overrides: Partial<RevenueEventRow> = {}): RevenueEventRow {
  return {
    id: overrides.id ?? 'rev-1',
    listing_id: overrides.listing_id ?? 'list-1',
    seller_id: overrides.seller_id ?? 'creator-1',
    workspace_id: overrides.workspace_id ?? 'ws-1',
    currency: overrides.currency ?? 'USD',
    gross_cents: overrides.gross_cents ?? 1000,
    fee_cents: overrides.fee_cents ?? 300,
    net_cents: overrides.net_cents ?? 700,
    payout_status: overrides.payout_status ?? 'eligible',
    period_month: overrides.period_month ?? '2025-06',
    event_type: overrides.event_type ?? 'purchase',
  };
}

function makeStatement(overrides: Partial<StatementSummary> = {}): StatementSummary {
  return {
    statement_id: overrides.statement_id ?? 'stmt-test',
    creator_id: overrides.creator_id ?? 'creator-1',
    period_month: overrides.period_month ?? '2025-06',
    kind: overrides.kind ?? 'monthly',
    total_gross_cents: overrides.total_gross_cents ?? 1000,
    total_fee_cents: overrides.total_fee_cents ?? 300,
    total_net_cents: overrides.total_net_cents ?? 700,
    currency: overrides.currency ?? 'USD',
    generated_at: overrides.generated_at ?? Date.now(),
  };
}

// ---------------------------------------------------------------------------
// generateStatementId
// ---------------------------------------------------------------------------

describe('generateStatementId', () => {
  it('generates ID starting with stmt-', () => {
    const id = generateStatementId();
    expect(id).toMatch(/^stmt-/);
  });

  it('generates unique IDs', () => {
    const id1 = generateStatementId();
    const id2 = generateStatementId();
    expect(id1).not.toBe(id2);
  });
});

// ---------------------------------------------------------------------------
// buildStatementBody
// ---------------------------------------------------------------------------

describe('buildStatementBody', () => {
  it('groups events by event_type into line items', () => {
    const events = [
      makeRevenueEvent({ event_type: 'purchase', gross_cents: 1000, net_cents: 700 }),
      makeRevenueEvent({ event_type: 'purchase', gross_cents: 2000, net_cents: 1400, id: 'rev-2' }),
      makeRevenueEvent({
        event_type: 'subscription',
        gross_cents: 500,
        net_cents: 350,
        id: 'rev-3',
      }),
    ];

    const { summary, lineItems } = buildStatementBody('creator-1', '2025-06', events);

    expect(summary.creator_id).toBe('creator-1');
    expect(summary.period_month).toBe('2025-06');
    expect(summary.kind).toBe('monthly');
    expect(summary.currency).toBe('USD');

    expect(lineItems).toHaveLength(2);

    const purchaseItem = lineItems.find((l) => l.event_type === 'purchase');
    expect(purchaseItem).toBeDefined();
    expect(purchaseItem!.count).toBe(2);
    expect(purchaseItem!.gross_cents).toBe(3000);
    expect(purchaseItem!.net_cents).toBe(2100);

    const subscriptionItem = lineItems.find((l) => l.event_type === 'subscription');
    expect(subscriptionItem).toBeDefined();
    expect(subscriptionItem!.count).toBe(1);
    expect(subscriptionItem!.gross_cents).toBe(500);
    expect(subscriptionItem!.net_cents).toBe(350);
  });

  it('computes totals correctly', () => {
    const events = [
      makeRevenueEvent({ gross_cents: 1000, net_cents: 700 }),
      makeRevenueEvent({ gross_cents: 2000, net_cents: 1400, id: 'rev-2' }),
    ];

    const { summary } = buildStatementBody('creator-1', '2025-06', events);

    expect(summary.total_gross_cents).toBe(3000);
    expect(summary.total_net_cents).toBe(2100);
    expect(summary.total_fee_cents).toBe(900); // gross - net
  });

  it('handles empty events', () => {
    const { summary, lineItems } = buildStatementBody('creator-1', '2025-06', []);

    expect(summary.total_gross_cents).toBe(0);
    expect(summary.total_fee_cents).toBe(0);
    expect(summary.total_net_cents).toBe(0);
    expect(summary.currency).toBe('USD');
    expect(lineItems).toHaveLength(0);
  });

  it('uses first event currency', () => {
    const events = [makeRevenueEvent({ currency: 'EUR' })];

    const { summary } = buildStatementBody('creator-1', '2025-06', events);
    expect(summary.currency).toBe('EUR');
  });
});

// ---------------------------------------------------------------------------
// buildYearly1099KBody
// ---------------------------------------------------------------------------

describe('buildYearly1099KBody', () => {
  it('aggregates monthly statements into yearly totals', () => {
    const monthlyStatements = [
      makeStatement({
        period_month: '2025-01',
        total_gross_cents: 1000,
        total_fee_cents: 300,
        total_net_cents: 700,
      }),
      makeStatement({
        period_month: '2025-02',
        total_gross_cents: 2000,
        total_fee_cents: 600,
        total_net_cents: 1400,
      }),
      makeStatement({
        period_month: '2025-03',
        total_gross_cents: 500,
        total_fee_cents: 150,
        total_net_cents: 350,
      }),
    ];

    const { summary, monthlyBreakdown } = buildYearly1099KBody('creator-1', monthlyStatements);

    expect(summary.creator_id).toBe('creator-1');
    expect(summary.kind).toBe('yearly_1099k');
    expect(summary.total_gross_cents).toBe(3500);
    expect(summary.total_fee_cents).toBe(1050);
    expect(summary.total_net_cents).toBe(2450);
    expect(summary.period_month).toBe('2025-12');
    expect(summary.currency).toBe('USD');

    expect(monthlyBreakdown).toHaveLength(3);
    expect(monthlyBreakdown[0]!.event_type).toBe('2025-01');
    expect(monthlyBreakdown[1]!.event_type).toBe('2025-02');
    expect(monthlyBreakdown[2]!.event_type).toBe('2025-03');
  });

  it('handles empty monthly statements', () => {
    const { summary, monthlyBreakdown } = buildYearly1099KBody('creator-1', []);

    expect(summary.total_gross_cents).toBe(0);
    expect(summary.total_fee_cents).toBe(0);
    expect(summary.total_net_cents).toBe(0);
    expect(summary.kind).toBe('yearly_1099k');
    expect(monthlyBreakdown).toHaveLength(0);
  });

  it('uses first statement currency', () => {
    const monthlyStatements = [makeStatement({ currency: 'GBP' })];

    const { summary } = buildYearly1099KBody('creator-1', monthlyStatements);
    expect(summary.currency).toBe('GBP');
  });
});
