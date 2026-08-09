/**
 * Creator analytics handlers tests (Phase 19 Wave 3).
 *
 * Tests: status codes, x-actor-id, error mapping.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getCreatorAnalyticsHandler,
  listCreatorStatementsHandler,
  getCreatorStatementHandler,
  generateCreatorStatementHandler,
  type HttpRequest,
  type CreatorAnalyticsHandlerContext,
} from './handlers.js';
import { CreatorAnalyticsService } from './service.js';
import { InMemoryAnalyticsStore } from './store/mem_store.js';
import type { RevenueEventRow } from './types.js';

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

function makeReq<P = Record<string, never>, B = undefined, Q = Record<string, string | undefined>>(
  overrides: Partial<HttpRequest<P, B, Q>> = {},
): HttpRequest<P, B, Q> {
  return {
    method: overrides.method ?? 'GET',
    path: overrides.path ?? '/',
    params: overrides.params ?? ({} as P),
    body: overrides.body ?? (undefined as unknown as B),
    query: overrides.query ?? ({} as Q),
    headers: overrides.headers ?? {},
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Creator analytics handlers', () => {
  let store: InMemoryAnalyticsStore;
  let service: CreatorAnalyticsService;
  let ctx: CreatorAnalyticsHandlerContext;

  beforeEach(() => {
    store = new InMemoryAnalyticsStore();
    service = new CreatorAnalyticsService({ store });
    ctx = { service };
    delete process.env.FEATURE_MARKETPLACE_ANALYTICS_DISABLED;
  });

  afterEach(() => {
    delete process.env.FEATURE_MARKETPLACE_ANALYTICS_DISABLED;
  });

  // -------------------------------------------------------------------------
  // getCreatorAnalytics
  // -------------------------------------------------------------------------

  describe('getCreatorAnalyticsHandler', () => {
    it('returns 200 with analytics data', async () => {
      store.seedRevenueEvent(makeRevenueEvent());

      const req = makeReq<{ creator_id: string }, undefined, { period?: string }>({
        params: { creator_id: 'creator-1' },
        query: { period: '2025-06' },
      });

      const res = await getCreatorAnalyticsHandler(req, ctx);
      expect(res.status).toBe(200);
      expect((res.body as Record<string, unknown>).analytics).toBeDefined();
    });

    it('returns 400 for invalid period', async () => {
      const req = makeReq<{ creator_id: string }, undefined, { period?: string }>({
        params: { creator_id: 'creator-1' },
        query: { period: 'bad' },
      });

      const res = await getCreatorAnalyticsHandler(req, ctx);
      expect(res.status).toBe(400);
    });

    it('returns 503 when feature is disabled', async () => {
      process.env.FEATURE_MARKETPLACE_ANALYTICS_DISABLED = 'true';

      const req = makeReq<{ creator_id: string }, undefined, { period?: string }>({
        params: { creator_id: 'creator-1' },
        query: { period: '2025-06' },
      });

      const res = await getCreatorAnalyticsHandler(req, ctx);
      expect(res.status).toBe(503);
    });

    it('uses x-actor-id header when no creator_id in params', async () => {
      const req = makeReq<{ creator_id: string }, undefined, { period?: string }>({
        params: { creator_id: '' },
        query: { period: '2025-06' },
        headers: { 'x-actor-id': 'actor-1' },
      });

      const res = await getCreatorAnalyticsHandler(req, ctx);
      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // listCreatorStatements
  // -------------------------------------------------------------------------

  describe('listCreatorStatementsHandler', () => {
    it('returns 200 with statements array', async () => {
      const req = makeReq<{ creator_id: string }, undefined, { kind?: string }>({
        params: { creator_id: 'creator-1' },
        query: {},
      });

      const res = await listCreatorStatementsHandler(req, ctx);
      expect(res.status).toBe(200);
      expect((res.body as Record<string, unknown>).statements).toEqual([]);
    });

    it('returns 503 when feature is disabled', async () => {
      process.env.FEATURE_MARKETPLACE_ANALYTICS_DISABLED = 'true';

      const req = makeReq<{ creator_id: string }, undefined, { kind?: string }>({
        params: { creator_id: 'creator-1' },
        query: {},
      });

      const res = await listCreatorStatementsHandler(req, ctx);
      expect(res.status).toBe(503);
    });
  });

  // -------------------------------------------------------------------------
  // getCreatorStatement
  // -------------------------------------------------------------------------

  describe('getCreatorStatementHandler', () => {
    it('returns 404 for non-existent statement', async () => {
      const req = makeReq<{ statement_id: string }>({
        params: { statement_id: 'stmt-nonexistent' },
      });

      const res = await getCreatorStatementHandler(req, ctx);
      expect(res.status).toBe(404);
    });

    it('returns 200 for existing statement', async () => {
      store.seedRevenueEvent(makeRevenueEvent());
      const created = await service.generateMonthlyStatement({
        creator_id: 'creator-1',
        period_month: '2025-06',
      });

      const req = makeReq<{ statement_id: string }>({
        params: { statement_id: created.statement_id },
      });

      const res = await getCreatorStatementHandler(req, ctx);
      expect(res.status).toBe(200);
      expect((res.body as Record<string, unknown>).statement).toBeDefined();
    });

    it('returns 503 when feature is disabled', async () => {
      process.env.FEATURE_MARKETPLACE_ANALYTICS_DISABLED = 'true';

      const req = makeReq<{ statement_id: string }>({
        params: { statement_id: 'stmt-1' },
      });

      const res = await getCreatorStatementHandler(req, ctx);
      expect(res.status).toBe(503);
    });
  });

  // -------------------------------------------------------------------------
  // generateCreatorStatement
  // -------------------------------------------------------------------------

  describe('generateCreatorStatementHandler', () => {
    it('returns 201 with new statement', async () => {
      const req = makeReq<{ creator_id: string }, { period_month?: string }>({
        params: { creator_id: 'creator-1' },
        body: { period_month: '2025-06' },
      });

      const res = await generateCreatorStatementHandler(req, ctx);
      expect(res.status).toBe(201);
      expect((res.body as Record<string, unknown>).statement).toBeDefined();
    });

    it('returns 201 for idempotent generation (returns existing)', async () => {
      store.seedRevenueEvent(makeRevenueEvent());

      const req = makeReq<{ creator_id: string }, { period_month?: string }>({
        params: { creator_id: 'creator-1' },
        body: { period_month: '2025-06' },
      });

      const first = await generateCreatorStatementHandler(req, ctx);
      const second = await generateCreatorStatementHandler(req, ctx);

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(
        (first.body as Record<string, unknown>).statement,
      ).toEqual(
        (second.body as Record<string, unknown>).statement,
      );
    });

    it('returns 400 for invalid period', async () => {
      const req = makeReq<{ creator_id: string }, { period_month?: string }>({
        params: { creator_id: 'creator-1' },
        body: { period_month: 'bad' },
      });

      const res = await generateCreatorStatementHandler(req, ctx);
      expect(res.status).toBe(400);
    });

    it('returns 503 when feature is disabled', async () => {
      process.env.FEATURE_MARKETPLACE_ANALYTICS_DISABLED = 'true';

      const req = makeReq<{ creator_id: string }, { period_month?: string }>({
        params: { creator_id: 'creator-1' },
        body: { period_month: '2025-06' },
      });

      const res = await generateCreatorStatementHandler(req, ctx);
      expect(res.status).toBe(503);
    });
  });
});
