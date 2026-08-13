/**
 * CreatorAnalyticsService tests (Phase 19 Wave 3).
 *
 * Tests: feature flag gate, idempotent monthly statement, not-found, period validation.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CreatorAnalyticsService } from './service.js';
import { InMemoryAnalyticsStore } from './store/mem_store.js';
import { FeatureDisabledError, StatementNotFoundError, InvalidPeriodError } from './types.js';
import type { RevenueEventRow, LicenseGrantRow } from './types.js';

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CreatorAnalyticsService', () => {
  let store: InMemoryAnalyticsStore;
  let service: CreatorAnalyticsService;

  beforeEach(() => {
    store = new InMemoryAnalyticsStore();
    service = new CreatorAnalyticsService({ store });
    delete process.env.FEATURE_MARKETPLACE_ANALYTICS_DISABLED;
  });

  afterEach(() => {
    delete process.env.FEATURE_MARKETPLACE_ANALYTICS_DISABLED;
  });

  // -------------------------------------------------------------------------
  // Feature flag gate
  // -------------------------------------------------------------------------

  describe('feature flag gate', () => {
    it('throws FeatureDisabledError when feature is disabled', async () => {
      process.env.FEATURE_MARKETPLACE_ANALYTICS_DISABLED = 'true';

      await expect(
        service.getCreatorAnalytics({ creator_id: 'c1', period: '2025-06' }),
      ).rejects.toThrow(FeatureDisabledError);
    });

    it('allows access when feature is not disabled', async () => {
      const result = await service.getCreatorAnalytics({ creator_id: 'c1', period: '2025-06' });
      expect(result).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // getCreatorAnalytics
  // -------------------------------------------------------------------------

  describe('getCreatorAnalytics', () => {
    it('rejects invalid period format', async () => {
      await expect(
        service.getCreatorAnalytics({ creator_id: 'c1', period: '2025/06' }),
      ).rejects.toThrow(InvalidPeriodError);
    });

    it('returns analytics with correct structure', async () => {
      store.seedRevenueEvent(makeRevenueEvent({ net_cents: 700 }));
      store.seedRevenueEvent(makeRevenueEvent({ net_cents: 1400, id: 'rev-2' }));
      store.seedLicenseGrant(makeLicenseGrant());

      const result = await service.getCreatorAnalytics({
        creator_id: 'creator-1',
        period: '2025-06',
      });

      expect(result.creator_id).toBe('creator-1');
      expect(result.period).toBe('2025-06');
      expect(result.installs).toBe(1);
      expect(result.downloads).toBe(3); // 1 install + 2 revenue events
    });
  });

  // -------------------------------------------------------------------------
  // generateMonthlyStatement
  // -------------------------------------------------------------------------

  describe('generateMonthlyStatement', () => {
    it('rejects invalid period format', async () => {
      await expect(
        service.generateMonthlyStatement({ creator_id: 'c1', period_month: 'bad' }),
      ).rejects.toThrow(InvalidPeriodError);
    });

    it('creates a new statement when none exists', async () => {
      store.seedRevenueEvent(makeRevenueEvent({ gross_cents: 1000, net_cents: 700 }));

      const result = await service.generateMonthlyStatement({
        creator_id: 'creator-1',
        period_month: '2025-06',
      });

      expect(result.statement_id).toMatch(/^stmt-/);
      expect(result.creator_id).toBe('creator-1');
      expect(result.period_month).toBe('2025-06');
      expect(result.kind).toBe('monthly');
      expect(result.total_gross_cents).toBe(1000);
      expect(result.total_net_cents).toBe(700);
    });

    it('is idempotent — returns existing statement if one exists', async () => {
      store.seedRevenueEvent(makeRevenueEvent({ gross_cents: 1000, net_cents: 700 }));

      const first = await service.generateMonthlyStatement({
        creator_id: 'creator-1',
        period_month: '2025-06',
      });

      const second = await service.generateMonthlyStatement({
        creator_id: 'creator-1',
        period_month: '2025-06',
      });

      expect(first.statement_id).toBe(second.statement_id);
    });

    it('creates separate statements for different months', async () => {
      store.seedRevenueEvent(makeRevenueEvent({ period_month: '2025-06' }));
      store.seedRevenueEvent(makeRevenueEvent({ period_month: '2025-07', id: 'rev-2' }));

      const jun = await service.generateMonthlyStatement({
        creator_id: 'creator-1',
        period_month: '2025-06',
      });
      const jul = await service.generateMonthlyStatement({
        creator_id: 'creator-1',
        period_month: '2025-07',
      });

      expect(jun.statement_id).not.toBe(jul.statement_id);
      expect(jun.period_month).toBe('2025-06');
      expect(jul.period_month).toBe('2025-07');
    });
  });

  // -------------------------------------------------------------------------
  // getCreatorStatement
  // -------------------------------------------------------------------------

  describe('getCreatorStatement', () => {
    it('throws StatementNotFoundError for non-existent statement', async () => {
      await expect(service.getCreatorStatement('stmt-nonexistent')).rejects.toThrow(
        StatementNotFoundError,
      );
    });

    it('returns existing statement', async () => {
      store.seedRevenueEvent(makeRevenueEvent());
      const created = await service.generateMonthlyStatement({
        creator_id: 'creator-1',
        period_month: '2025-06',
      });

      const found = await service.getCreatorStatement(created.statement_id);
      expect(found.statement_id).toBe(created.statement_id);
    });
  });

  // -------------------------------------------------------------------------
  // listCreatorStatements
  // -------------------------------------------------------------------------

  describe('listCreatorStatements', () => {
    it('returns empty array when no statements exist', async () => {
      const result = await service.listCreatorStatements({ creator_id: 'creator-1' });
      expect(result).toHaveLength(0);
    });

    it('returns statements for the creator', async () => {
      store.seedRevenueEvent(makeRevenueEvent());
      await service.generateMonthlyStatement({
        creator_id: 'creator-1',
        period_month: '2025-06',
      });
      await service.generateMonthlyStatement({
        creator_id: 'creator-1',
        period_month: '2025-07',
      });

      const result = await service.listCreatorStatements({ creator_id: 'creator-1' });
      expect(result).toHaveLength(2);
    });

    it('filters by kind', async () => {
      store.seedRevenueEvent(makeRevenueEvent());
      await service.generateMonthlyStatement({
        creator_id: 'creator-1',
        period_month: '2025-06',
      });

      const monthly = await service.listCreatorStatements({
        creator_id: 'creator-1',
        kind: 'monthly',
      });
      expect(monthly).toHaveLength(1);

      const yearly = await service.listCreatorStatements({
        creator_id: 'creator-1',
        kind: 'yearly_1099k',
      });
      expect(yearly).toHaveLength(0);
    });
  });
});
