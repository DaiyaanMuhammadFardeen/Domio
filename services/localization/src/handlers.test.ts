/**
 * Localization handler tests — 200/400/404/401.
 */

import { describe, it, expect } from 'vitest';
import { handlers, type HttpRequest } from './handlers.js';
import { LocalizationService } from './service.js';
import {
  InMemoryExchangeRateRepository,
  InMemoryLocaleConfigRepository,
} from './dal.js';
import { LocalizationMetrics } from './metrics.js';
import { InMemoryAuditRecorder } from './audit.js';

function makeCtx() {
  const svc = new LocalizationService({
    exchangeRates: new InMemoryExchangeRateRepository(),
    localeConfigs: new InMemoryLocaleConfigRepository(),
  });
  const metrics = new LocalizationMetrics();
  const audit = new InMemoryAuditRecorder(() => 'unused');
  return {
    svc,
    ctx: { service: svc, metrics, audit } as const,
    metrics,
    audit,
  };
}

function req<P, B, Q = Record<string, string | undefined>>(
  method: string,
  path: string,
  params: P,
  body: B,
  query: Q = {} as Q,
): HttpRequest<P, B, Q> {
  return { method, path, params, body, query, headers: {} };
}

describe('localization handlers — format', () => {
  it('POST /v1/localization/format returns formatted number', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.format(
      req('POST', '/v1/localization/format', {}, {
        value: 1234567.89,
        locale: 'en-US',
        style: 'decimal',
        decimals: 2,
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as { formatted: string }).formatted).toBe('1,234,567.89');
  });

  it('POST /v1/localization/format 400s on invalid locale', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.format(
      req('POST', '/v1/localization/format', {}, {
        value: 100,
        locale: 'invalid-LOCALE!',
      }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect((res.body as { code: string }).code).toBe('INVALID_LOCALE');
  });
});

describe('localization handlers — rates', () => {
  it('POST /v1/localization/rates ingests rates', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.rates(
      req('POST', '/v1/localization/rates', {}, {
        pairs: [{ pair: 'USD/EUR', rate: 0.92, asOf: new Date('2026-08-01') }],
      }, { actorId: 'alice' }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as { ingested: number }).ingested).toBe(1);
  });

  it('POST /v1/localization/rates 401s without actorId', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.rates(
      req('POST', '/v1/localization/rates', {}, {
        pairs: [{ pair: 'USD/EUR', rate: 0.92, asOf: new Date('2026-08-01') }],
      }),
      ctx,
    );
    expect(res.status).toBe(401);
  });
});

describe('localization handlers — convert', () => {
  it('POST /v1/localization/convert converts amount', async () => {
    const { ctx, svc } = makeCtx();
    await svc.ingestRates([{ pair: 'USD/EUR', rate: 0.92, asOf: new Date('2026-08-01') }]);
    const res = await handlers.convert(
      req('POST', '/v1/localization/convert', {}, {
        amount: 100,
        from: 'USD',
        to: 'EUR',
      }),
      ctx,
    );
    expect(res.status).toBe(200);
    expect((res.body as { convertedAmount: number }).convertedAmount).toBe(92);
  });

  it('POST /v1/localization/convert 404s on missing rate', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.convert(
      req('POST', '/v1/localization/convert', {}, {
        amount: 100,
        from: 'USD',
        to: 'XYZ',
      }),
      ctx,
    );
    expect(res.status).toBe(404);
    expect((res.body as { code: string }).code).toBe('NOT_FOUND');
  });
});

describe('localization handlers — audit', () => {
  it('records audit events on format', async () => {
    const { ctx, audit } = makeCtx();
    await handlers.format(
      req('POST', '/v1/localization/format', {}, {
        value: 100,
        locale: 'en-US',
      }),
      ctx,
    );
    const events = await audit.listByTenant('default');
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]?.action).toBe('localization.format');
  });
});
