/**
 * Query gateway handler tests — exercises the REST surface against an
 * in-memory service. Each test issues a request through the handler
 * and asserts on the HTTP status + body.
 */

import { describe, it, expect } from 'vitest';
import type { HttpRequest } from './handlers.js';
import { handlers } from './handlers.js';
import { QueryGatewayService } from './service.js';
import {
  InMemoryQueryRepository,
  InMemoryDatasetSnapshotRepository,
  InMemoryFreshnessRecordRepository,
  InMemoryViewerTokenRepository,
  InMemoryACLRepository,
  InMemoryWebhookDedupRepository,
} from './dal.js';
import { QueryGatewayMetrics } from './metrics.js';
import { InMemoryQueryGatewayAuditRecorder } from './audit.js';

const ORG = 'org-1';
const ACTOR = 'alice';
const WEBHOOK_SECRET = 'test-secret-1234567890abcdef';

async function makeCtx() {
  let counter = 0;
  const idGen = (): string => {
    counter++;
    return `id-${counter.toString().padStart(4, '0')}`;
  };
  const svc = new QueryGatewayService({
    queries: new InMemoryQueryRepository(),
    snapshots: new InMemoryDatasetSnapshotRepository(),
    freshness: new InMemoryFreshnessRecordRepository(),
    viewerTokens: new InMemoryViewerTokenRepository(),
    acl: new InMemoryACLRepository(),
    webhookDedup: new InMemoryWebhookDedupRepository(),
    webhookSecret: WEBHOOK_SECRET,
    idGenerator: idGen,
    executeFn: async (_sql: string, _params: readonly unknown[], _connectorId: string) => {
      return { columns: ['id', 'name'], rows: [[1, 'test']] };
    },
  });
  const metrics = new QueryGatewayMetrics();
  const audit = new InMemoryQueryGatewayAuditRecorder(() => 'unused');
  // Seed ACL: allow alice on all actions for this org
  await svc['acl'].insert({ orgId: ORG, actorId: ACTOR, action: 'execute', allowed: true });
  await svc['acl'].insert({ orgId: ORG, actorId: ACTOR, action: 'invalidate', allowed: true });
  await svc['acl'].insert({ orgId: ORG, actorId: ACTOR, action: 'webhook', allowed: true });
  await svc['acl'].insert({ orgId: ORG, actorId: ACTOR, action: 'issue-token', allowed: true });
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

describe('query-gateway handlers — execute', () => {
  it('POST /v1/queries/execute executes a query', async () => {
    const { ctx, svc } = await makeCtx();
    // Insert a test query
    await svc['queries'].insert({
      queryId: 'q1',
      orgId: ORG,
      sql: 'SELECT * FROM users',
      connectorId: 'conn-1',
      params: [],
      freshnessPolicy: { type: 'on_demand' },
      createdBy: ACTOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await handlers.executeQuery(
      req('POST', '/v1/queries/execute', { orgId: ORG }, { queryId: 'q1' }, { actorId: ACTOR }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = res.body as {
      snapshot: { columns: string[]; rows: unknown[][] };
      fromCache: boolean;
      cacheTier: string;
    };
    expect(body.snapshot.columns).toEqual(['id', 'name']);
    expect(body.fromCache).toBe(false);
    expect(body.cacheTier).toBe('miss');
  });

  it('POST /v1/queries/execute returns 401 without actorId', async () => {
    const { ctx, svc } = await makeCtx();
    await svc['queries'].insert({
      queryId: 'q1',
      orgId: ORG,
      sql: 'SELECT * FROM users',
      connectorId: 'conn-1',
      params: [],
      freshnessPolicy: { type: 'on_demand' },
      createdBy: ACTOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await handlers.executeQuery(
      req('POST', '/v1/queries/execute', { orgId: ORG }, { queryId: 'q1' }),
      ctx,
    );
    expect(res.status).toBe(401);
  });

  it('POST /v1/queries/execute returns 404 for unknown query', async () => {
    const { ctx } = await makeCtx();
    const res = await handlers.executeQuery(
      req(
        'POST',
        '/v1/queries/execute',
        { orgId: ORG },
        { queryId: 'nonexistent' },
        { actorId: ACTOR },
      ),
      ctx,
    );
    expect(res.status).toBe(404);
  });

  it('POST /v1/queries/execute returns 429 when rate-limited', async () => {
    let counter = 0;
    const idGen = (): string => {
      counter++;
      return `id-${counter.toString().padStart(4, '0')}`;
    };
    const svc = new QueryGatewayService({
      queries: new InMemoryQueryRepository(),
      snapshots: new InMemoryDatasetSnapshotRepository(),
      freshness: new InMemoryFreshnessRecordRepository(),
      viewerTokens: new InMemoryViewerTokenRepository(),
      acl: new InMemoryACLRepository(),
      webhookDedup: new InMemoryWebhookDedupRepository(),
      webhookSecret: WEBHOOK_SECRET,
      idGenerator: idGen,
      rateLimitCapacity: 1,
      rateLimitRefillPerSec: 0,
      executeFn: async () => ({ columns: ['id', 'name'], rows: [[1, 'test']] }),
    });
    const metrics = new QueryGatewayMetrics();
    const audit = new InMemoryQueryGatewayAuditRecorder(() => 'unused');
    const ctx = { service: svc, metrics, audit };

    await svc['queries'].insert({
      queryId: 'q1',
      orgId: ORG,
      sql: 'SELECT * FROM users',
      connectorId: 'conn-1',
      params: [],
      freshnessPolicy: { type: 'on_demand' },
      createdBy: ACTOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // First request should succeed
    const res1 = await handlers.executeQuery(
      req('POST', '/v1/queries/execute', { orgId: ORG }, { queryId: 'q1' }, { actorId: ACTOR }),
      ctx,
    );
    expect(res1.status).toBe(200);

    // Second request should be rate-limited
    const res2 = await handlers.executeQuery(
      req('POST', '/v1/queries/execute', { orgId: ORG }, { queryId: 'q1' }, { actorId: ACTOR }),
      ctx,
    );
    expect(res2.status).toBe(429);
  });
});

describe('query-gateway handlers — webhook', () => {
  it('POST /v1/queries/webhook processes a valid webhook', async () => {
    const { ctx, svc } = await makeCtx();
    await svc['queries'].insert({
      queryId: 'q1',
      orgId: ORG,
      sql: 'SELECT * FROM users',
      connectorId: 'conn-1',
      params: [],
      freshnessPolicy: { type: 'on_demand' },
      createdBy: ACTOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { createHmac } = await import('node:crypto');
    const payload = JSON.stringify({ columns: ['id', 'name'], rows: [[1, 'webhook-data']] });
    const signature = createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');

    const res = await handlers.processWebhook(
      req(
        'POST',
        '/v1/queries/webhook',
        { orgId: ORG },
        {
          payload,
          signature,
          idempotencyKey: 'wh-1',
          queryId: 'q1',
        },
        { actorId: ACTOR },
      ),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = res.body as { snapshot: { rowCount: number }; deduped: boolean };
    expect(body.deduped).toBe(false);
    expect(body.snapshot.rowCount).toBe(1);
  });

  it('POST /v1/queries/webhook returns 400 on invalid HMAC', async () => {
    const { ctx, svc } = await makeCtx();
    await svc['queries'].insert({
      queryId: 'q1',
      orgId: ORG,
      sql: 'SELECT * FROM users',
      connectorId: 'conn-1',
      params: [],
      freshnessPolicy: { type: 'on_demand' },
      createdBy: ACTOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await handlers.processWebhook(
      req(
        'POST',
        '/v1/queries/webhook',
        { orgId: ORG },
        {
          payload: '{}',
          signature: 'invalid-hmac-signature',
          idempotencyKey: 'wh-2',
          queryId: 'q1',
        },
        { actorId: ACTOR },
      ),
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it('POST /v1/queries/webhook deduplicates by idempotencyKey', async () => {
    const { ctx, svc } = await makeCtx();
    await svc['queries'].insert({
      queryId: 'q1',
      orgId: ORG,
      sql: 'SELECT * FROM users',
      connectorId: 'conn-1',
      params: [],
      freshnessPolicy: { type: 'on_demand' },
      createdBy: ACTOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { createHmac } = await import('node:crypto');
    const payload = JSON.stringify({ columns: ['id'], rows: [[1]] });
    const signature = createHmac('sha256', WEBHOOK_SECRET).update(payload).digest('hex');

    const res1 = await handlers.processWebhook(
      req(
        'POST',
        '/v1/queries/webhook',
        { orgId: ORG },
        {
          payload,
          signature,
          idempotencyKey: 'wh-dup',
          queryId: 'q1',
        },
        { actorId: ACTOR },
      ),
      ctx,
    );
    expect(res1.status).toBe(200);

    const res2 = await handlers.processWebhook(
      req(
        'POST',
        '/v1/queries/webhook',
        { orgId: ORG },
        {
          payload,
          signature,
          idempotencyKey: 'wh-dup',
          queryId: 'q1',
        },
        { actorId: ACTOR },
      ),
      ctx,
    );
    expect(res2.status).toBe(200);
    const body = res2.body as { deduped: boolean };
    expect(body.deduped).toBe(true);
  });
});

describe('query-gateway handlers — invalidate', () => {
  it('POST /v1/queries/invalidate invalidates cache', async () => {
    const { ctx, svc } = await makeCtx();
    await svc['queries'].insert({
      queryId: 'q1',
      orgId: ORG,
      sql: 'SELECT * FROM users',
      connectorId: 'conn-1',
      params: [],
      freshnessPolicy: { type: 'on_demand' },
      createdBy: ACTOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await handlers.invalidateQuery(
      req('POST', '/v1/queries/invalidate', { orgId: ORG }, { queryId: 'q1' }, { actorId: ACTOR }),
      ctx,
    );
    expect(res.status).toBe(204);
  });

  it('POST /v1/queries/invalidate returns 401 without actorId', async () => {
    const { ctx, svc } = await makeCtx();
    await svc['queries'].insert({
      queryId: 'q1',
      orgId: ORG,
      sql: 'SELECT * FROM users',
      connectorId: 'conn-1',
      params: [],
      freshnessPolicy: { type: 'on_demand' },
      createdBy: ACTOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await handlers.invalidateQuery(
      req('POST', '/v1/queries/invalidate', { orgId: ORG }, { queryId: 'q1' }),
      ctx,
    );
    expect(res.status).toBe(401);
  });
});

describe('query-gateway handlers — viewer tokens', () => {
  it('POST /v1/viewer-tokens issues a token', async () => {
    const { ctx, svc } = await makeCtx();
    await svc['queries'].insert({
      queryId: 'q1',
      orgId: ORG,
      sql: 'SELECT * FROM users',
      connectorId: 'conn-1',
      params: [],
      freshnessPolicy: { type: 'on_demand' },
      createdBy: ACTOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await handlers.issueViewerToken(
      req(
        'POST',
        '/v1/viewer-tokens',
        { orgId: ORG },
        { queryId: 'q1', scopes: ['read'], ttlMs: 60000 },
        { actorId: ACTOR },
      ),
      ctx,
    );
    expect(res.status).toBe(201);
    const body = res.body as { token: string; queryId: string };
    expect(body.queryId).toBe('q1');
    expect(body.token).toBeDefined();
  });

  it('POST /v1/viewer-tokens returns 401 without actorId', async () => {
    const { ctx, svc } = await makeCtx();
    await svc['queries'].insert({
      queryId: 'q1',
      orgId: ORG,
      sql: 'SELECT * FROM users',
      connectorId: 'conn-1',
      params: [],
      freshnessPolicy: { type: 'on_demand' },
      createdBy: ACTOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await handlers.issueViewerToken(
      req('POST', '/v1/viewer-tokens', { orgId: ORG }, { queryId: 'q1' }),
      ctx,
    );
    expect(res.status).toBe(401);
  });
});

describe('query-gateway handlers — get query', () => {
  it('GET /v1/queries/:id returns the query', async () => {
    const { ctx, svc } = await makeCtx();
    await svc['queries'].insert({
      queryId: 'q1',
      orgId: ORG,
      sql: 'SELECT * FROM users',
      connectorId: 'conn-1',
      params: [],
      freshnessPolicy: { type: 'on_demand' },
      createdBy: ACTOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await handlers.getQuery(
      req('GET', '/v1/queries/:id', { orgId: ORG, queryId: 'q1' }, undefined, { actorId: ACTOR }),
      ctx,
    );
    expect(res.status).toBe(200);
    const body = res.body as { query: { queryId: string } };
    expect(body.query.queryId).toBe('q1');
  });

  it('GET /v1/queries/:id returns 404 for unknown query', async () => {
    const { ctx } = await makeCtx();
    const res = await handlers.getQuery(
      req('GET', '/v1/queries/:id', { orgId: ORG, queryId: 'nonexistent' }, undefined, {
        actorId: ACTOR,
      }),
      ctx,
    );
    expect(res.status).toBe(404);
  });
});
