/**
 * InMemoryAnalyticsStore tests (Phase 19 Wave 3).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAnalyticsStore } from './mem_store.js';
import type { RevenueEventRow, LicenseGrantRow, StatementSummary } from '../types.js';

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

function makeLicenseGrant(overrides: Partial<LicenseGrantRow> = {}): LicenseGrantRow {
  return {
    id: overrides.id ?? 'lg-1',
    workspace_id: overrides.workspace_id ?? 'ws-1',
    user_id: overrides.user_id ?? 'user-1',
    catalog_id: overrides.catalog_id ?? 'cat-1',
    version: overrides.version ?? '1.0',
    listing_id: overrides.listing_id ?? 'list-1',
    license_id: overrides.license_id ?? 'lic-1',
    seats: overrides.seats ?? 1,
    signed_token: overrides.signed_token ?? 'token-1',
    issued_at_ms: overrides.issued_at_ms ?? Date.now(),
    expires_at_ms: overrides.expires_at_ms ?? Date.now() + 365 * 24 * 60 * 60 * 1000,
  };
}

function makeStatement(overrides: Partial<StatementSummary> = {}): StatementSummary {
  return {
    statement_id: overrides.statement_id ?? 'stmt-1',
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
// Tests
// ---------------------------------------------------------------------------

describe('InMemoryAnalyticsStore', () => {
  let store: InMemoryAnalyticsStore;

  beforeEach(() => {
    store = new InMemoryAnalyticsStore();
  });

  // -------------------------------------------------------------------------
  // getRevenueEvents
  // -------------------------------------------------------------------------

  describe('getRevenueEvents', () => {
    it('returns events matching creator_id and period_month', async () => {
      store.seedRevenueEvent(makeRevenueEvent());
      store.seedRevenueEvent(makeRevenueEvent({ id: 'rev-2', period_month: '2025-07' }));
      store.seedRevenueEvent(makeRevenueEvent({ id: 'rev-3', seller_id: 'creator-2' }));

      const result = await store.getRevenueEvents({
        creator_id: 'creator-1',
        period_month: '2025-06',
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('rev-1');
    });

    it('returns empty when no matches', async () => {
      const result = await store.getRevenueEvents({
        creator_id: 'creator-1',
        period_month: '2025-06',
      });
      expect(result).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // getPaymentIntents
  // -------------------------------------------------------------------------

  describe('getPaymentIntents', () => {
    it('returns payment intents by buyer_id', async () => {
      store.seedPaymentIntent({
        id: 'pi-1',
        workspace_id: 'ws-1',
        buyer_id: 'buyer-1',
        listing_id: 'list-1',
        purchase_id: 'p-1',
        provider: 'stripe',
        currency: 'USD',
        gross_cents: 1000,
        fee_cents: 300,
        net_cents: 700,
        status: 'succeeded',
      });

      const result = await store.getPaymentIntents({ buyer_id: 'buyer-1' });
      expect(result).toHaveLength(1);
      expect(result[0]!.buyer_id).toBe('buyer-1');
    });
  });

  // -------------------------------------------------------------------------
  // getLicenseGrants
  // -------------------------------------------------------------------------

  describe('getLicenseGrants', () => {
    it('returns all seeded grants', async () => {
      store.seedLicenseGrant(makeLicenseGrant());
      store.seedLicenseGrant(makeLicenseGrant({ id: 'lg-2' }));

      const result = await store.getLicenseGrants('creator-1');
      expect(result).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // listStatements
  // -------------------------------------------------------------------------

  describe('listStatements', () => {
    it('returns statements for the creator', async () => {
      await store.insertStatement(makeStatement());
      await store.insertStatement(
        makeStatement({
          statement_id: 'stmt-2',
          period_month: '2025-07',
        }),
      );

      const result = await store.listStatements({ creator_id: 'creator-1' });
      expect(result).toHaveLength(2);
    });

    it('filters by kind', async () => {
      await store.insertStatement(makeStatement({ kind: 'monthly' }));
      await store.insertStatement(
        makeStatement({
          statement_id: 'stmt-2',
          kind: 'yearly_1099k',
        }),
      );

      const monthly = await store.listStatements({ creator_id: 'creator-1', kind: 'monthly' });
      expect(monthly).toHaveLength(1);

      const yearly = await store.listStatements({ creator_id: 'creator-1', kind: 'yearly_1099k' });
      expect(yearly).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // getStatement / insertStatement
  // -------------------------------------------------------------------------

  describe('getStatement / insertStatement', () => {
    it('retrieves inserted statement by ID', async () => {
      const stmt = makeStatement();
      await store.insertStatement(stmt);

      const found = await store.getStatement('stmt-1');
      expect(found).toEqual(stmt);
    });

    it('returns null for non-existent statement', async () => {
      const found = await store.getStatement('stmt-nonexistent');
      expect(found).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // clear
  // -------------------------------------------------------------------------

  describe('clear', () => {
    it('clears all data', async () => {
      store.seedRevenueEvent(makeRevenueEvent());
      store.seedLicenseGrant(makeLicenseGrant());
      await store.insertStatement(makeStatement());

      store.clear();

      const events = await store.getRevenueEvents({
        creator_id: 'creator-1',
        period_month: '2025-06',
      });
      expect(events).toHaveLength(0);

      const grants = await store.getLicenseGrants('creator-1');
      expect(grants).toHaveLength(0);

      const stmts = await store.listStatements({ creator_id: 'creator-1' });
      expect(stmts).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // withTransaction
  // -------------------------------------------------------------------------

  describe('withTransaction', () => {
    it('executes the function', async () => {
      const result = await store.withTransaction(async () => 42);
      expect(result).toBe(42);
    });
  });
});
