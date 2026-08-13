/**
 * Lint service handler tests.
 */

import { describe, it, expect } from 'vitest';
import type { ULID } from '@domio/schema';
import { asULID } from '@domio/schema';

import { handlers, type HttpRequest } from './handlers.js';
import { LintService } from './service.js';
import { InMemoryLintRunRepository } from './dal.js';
import { LintMetrics } from './metrics.js';
import { InMemoryAuditRecorder } from './audit.js';

const ORG = 'org-1';
const ACTOR = 'alice';

function makeCtx() {
  let counter = 0;
  const idGen = (): ULID => {
    counter++;
    const ts = '01H0A0B0C0D';
    const rand = counter.toString(32).padStart(16, '0').toUpperCase().slice(-16);
    return asULID(`${ts}${rand}`);
  };
  const svc = new LintService({ runs: new InMemoryLintRunRepository(), idGenerator: idGen });
  const metrics = new LintMetrics();
  const audit = new InMemoryAuditRecorder(() => 'unused');
  return { svc, ctx: { service: svc, metrics, audit } as const, metrics, audit };
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

describe('lint-service handlers — run', () => {
  it('POST /v1/lint/run returns findings', async () => {
    const { ctx, metrics } = makeCtx();
    const res = await handlers.runLint(
      req(
        'POST',
        '/v1/lint/run',
        { orgId: ORG },
        {
          deckId: 'd-1',
          elements: [{ elementRef: 'e1' }],
          actorId: ACTOR,
        },
      ),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(metrics.lintRunsTotal).toBe(1);
  });

  it('POST /v1/lint/run 400s on empty elements', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.runLint(
      req(
        'POST',
        '/v1/lint/run',
        { orgId: ORG },
        {
          deckId: 'd-1',
          elements: [],
          actorId: ACTOR,
        },
      ),
      ctx,
    );
    expect(res.status).toBe(400);
  });
});

describe('lint-service handlers — list + latest', () => {
  it('GET /v1/lint/runs requires deckId', async () => {
    const { ctx } = makeCtx();
    const res = await handlers.listByDeck(
      req('GET', '/v1/lint/runs', { orgId: ORG }, undefined, {}),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('GET /v1/lint/runs + latest', async () => {
    const { ctx } = makeCtx();
    await handlers.runLint(
      req(
        'POST',
        '/v1/lint/run',
        { orgId: ORG },
        {
          deckId: 'd-1',
          elements: [{ elementRef: 'e1' }],
          actorId: ACTOR,
        },
      ),
      ctx,
    );
    await handlers.runLint(
      req(
        'POST',
        '/v1/lint/run',
        { orgId: ORG },
        {
          deckId: 'd-1',
          elements: [{ elementRef: 'e1' }],
          actorId: ACTOR,
        },
      ),
      ctx,
    );
    const list = await handlers.listByDeck(
      req('GET', '/v1/lint/runs', { orgId: ORG }, undefined, { deckId: 'd-1' }),
      ctx,
    );
    expect((list.body as { runs: unknown[] }).runs.length).toBe(2);
    const latest = await handlers.getLatest(
      req('GET', '/v1/lint/runs/latest', { orgId: ORG }, undefined, { deckId: 'd-1' }),
      ctx,
    );
    expect(latest.status).toBe(200);
  });
});

describe('lint-service handlers — audit', () => {
  it('records audit events on runs', async () => {
    const { ctx, audit } = makeCtx();
    await handlers.runLint(
      req(
        'POST',
        '/v1/lint/run',
        { orgId: ORG },
        {
          deckId: 'd-1',
          elements: [{ elementRef: 'e1' }],
          actorId: ACTOR,
        },
      ),
      ctx,
    );
    const events = await audit.listByOrg(ORG);
    expect(events[0]?.action).toBe('lint.run');
  });
});
