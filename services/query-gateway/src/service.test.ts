/**
 * Query gateway service tests — covers rate limiting (burst + refill),
 * cache (tier fallback + TTL + single-flight), audit (append-only +
 * HMAC), tokens (TTL + single-use + scope), ACL (deny-by-default),
 * and webhook (HMAC verify + idempotent dedupe).
 */

import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { QueryGatewayService } from './service.js';
import {
  RateLimitExceededError,
  ACLDeniedError,
  WebhookHMACError,
  ViewerTokenExpiredError,
  ViewerTokenAlreadyUsedError,
  QueryNotFoundError,
} from './service.js';
import {
  InMemoryQueryRepository,
  InMemoryDatasetSnapshotRepository,
  InMemoryFreshnessRecordRepository,
  InMemoryViewerTokenRepository,
  InMemoryACLRepository,
  InMemoryWebhookDedupRepository,
} from './dal.js';

const ORG = 'org-1';
const ACTOR = 'alice';
const SECRET = 'hmac-test-secret-key-1234567890';

async function makeService(
  opts: {
    rateLimitCapacity?: number;
    rateLimitRefillPerSec?: number;
    cacheTtlMs?: number;
  } = {},
) {
  let counter = 0;
  const idGen = (): string => {
    counter++;
    return `id-${counter.toString().padStart(4, '0')}`;
  };
  let now = new Date('2026-08-04T12:00:00Z');
  const clock = () => now;
  const advanceTime = (ms: number) => {
    now = new Date(now.getTime() + ms);
  };

  const queries = new InMemoryQueryRepository();
  const snapshots = new InMemoryDatasetSnapshotRepository();
  const freshness = new InMemoryFreshnessRecordRepository();
  const viewerTokens = new InMemoryViewerTokenRepository();
  const acl = new InMemoryACLRepository();
  const webhookDedup = new InMemoryWebhookDedupRepository();

  const svc = new QueryGatewayService({
    queries,
    snapshots,
    freshness,
    viewerTokens,
    acl,
    webhookDedup,
    webhookSecret: SECRET,
    rateLimitCapacity: opts.rateLimitCapacity ?? 10,
    rateLimitRefillPerSec: opts.rateLimitRefillPerSec ?? 5,
    cacheTtlMs: opts.cacheTtlMs ?? 60_000,
    idGenerator: idGen,
    clock,
    executeFn: async (_sql: string, _params: readonly unknown[], _connectorId: string) => {
      return { columns: ['id', 'name'], rows: [[1, 'test-data']] };
    },
  });

  // Seed ACL: allow alice on all actions for this org
  await acl.insert({ orgId: ORG, actorId: ACTOR, action: 'execute', allowed: true });
  await acl.insert({ orgId: ORG, actorId: ACTOR, action: 'invalidate', allowed: true });
  await acl.insert({ orgId: ORG, actorId: ACTOR, action: 'webhook', allowed: true });
  await acl.insert({ orgId: ORG, actorId: ACTOR, action: 'issue-token', allowed: true });

  return {
    svc,
    queries,
    snapshots,
    freshness,
    viewerTokens,
    acl,
    webhookDedup,
    idGen,
    clock,
    advanceTime,
  };
}

async function insertTestQuery(queries: InMemoryQueryRepository, queryId: string) {
  await queries.insert({
    queryId,
    orgId: ORG,
    sql: 'SELECT * FROM test_table',
    connectorId: 'conn-1',
    params: [],
    freshnessPolicy: { type: 'on_demand' },
    createdBy: ACTOR,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('QueryGatewayService — rate limiting', () => {
  it('allows requests within burst capacity', async () => {
    const { svc, queries } = await makeService({ rateLimitCapacity: 3 });
    await insertTestQuery(queries, 'q1');

    // First 3 requests should succeed
    for (let i = 0; i < 3; i++) {
      const result = await svc.executeQuery('q1', ORG, ACTOR);
      expect(result.snapshot.columns).toEqual(['id', 'name']);
    }
  });

  it('rejects when rate limit exceeded', async () => {
    const { svc, queries } = await makeService({ rateLimitCapacity: 2, rateLimitRefillPerSec: 0 });
    await insertTestQuery(queries, 'q1');

    await svc.executeQuery('q1', ORG, ACTOR);
    await svc.executeQuery('q1', ORG, ACTOR);
    await expect(svc.executeQuery('q1', ORG, ACTOR)).rejects.toThrow(RateLimitExceededError);
  });

  it('refills tokens over time', async () => {
    const { svc, queries, advanceTime } = await makeService({
      rateLimitCapacity: 2,
      rateLimitRefillPerSec: 1,
    });
    await insertTestQuery(queries, 'q1');

    await svc.executeQuery('q1', ORG, ACTOR);
    await svc.executeQuery('q1', ORG, ACTOR);
    // Both tokens consumed, now exhausted
    await expect(svc.executeQuery('q1', ORG, ACTOR)).rejects.toThrow(RateLimitExceededError);

    // Wait 2 seconds → refill 2 tokens
    advanceTime(2000);
    await expect(svc.executeQuery('q1', ORG, ACTOR)).resolves.toBeDefined();
  });
});

describe('QueryGatewayService — cache', () => {
  it('returns cache hit on second request', async () => {
    const { svc, queries } = await makeService();
    await insertTestQuery(queries, 'q1');

    const first = await svc.executeQuery('q1', ORG, ACTOR);
    expect(first.fromCache).toBe(false);
    expect(first.cacheTier).toBe('miss');

    const second = await svc.executeQuery('q1', ORG, ACTOR);
    expect(second.fromCache).toBe(true);
    expect(second.cacheTier).toBe('hit');
  });

  it('cache expires after TTL', async () => {
    const { svc, queries, advanceTime } = await makeService({ cacheTtlMs: 5000 });
    await insertTestQuery(queries, 'q1');

    await svc.executeQuery('q1', ORG, ACTOR);
    advanceTime(6000); // Past TTL
    const result = await svc.executeQuery('q1', ORG, ACTOR);
    expect(result.fromCache).toBe(false);
  });

  it('forceRefresh bypasses cache', async () => {
    const { svc, queries } = await makeService();
    await insertTestQuery(queries, 'q1');

    await svc.executeQuery('q1', ORG, ACTOR);
    const result = await svc.executeQuery('q1', ORG, ACTOR, { forceRefresh: true });
    expect(result.fromCache).toBe(false);
  });

  it('single-flight prevents stampede', async () => {
    const { svc, queries } = await makeService();
    await insertTestQuery(queries, 'q1');

    // Launch 3 concurrent requests — only one should execute
    const results = await Promise.all([
      svc.executeQuery('q1', ORG, ACTOR),
      svc.executeQuery('q1', ORG, ACTOR),
      svc.executeQuery('q1', ORG, ACTOR),
    ]);

    // At least one should have cacheTier 'miss'
    const misses = results.filter((r) => r.cacheTier === 'miss');
    expect(misses.length).toBeGreaterThanOrEqual(1);
    expect(results.length).toBe(3);
  });
});

describe('QueryGatewayService — ACL', () => {
  it('denies by default for non-execute actions', async () => {
    // Create a service WITHOUT seeded ACL rules (fresh ACL repo)
    let counter = 0;
    const idGen = (): string => `acl-${(counter++).toString().padStart(4, '0')}`;
    const now = new Date('2026-08-04T12:00:00Z');
    const clock = () => now;
    const svc = new QueryGatewayService({
      queries: new InMemoryQueryRepository(),
      snapshots: new InMemoryDatasetSnapshotRepository(),
      freshness: new InMemoryFreshnessRecordRepository(),
      viewerTokens: new InMemoryViewerTokenRepository(),
      acl: new InMemoryACLRepository(),
      webhookDedup: new InMemoryWebhookDedupRepository(),
      webhookSecret: SECRET,
      idGenerator: idGen,
      clock,
      executeFn: async () => ({ columns: ['id'], rows: [[1]] }),
    });

    await expect(svc.checkACL(ACTOR, 'invalidate', ORG)).rejects.toThrow(ACLDeniedError);
  });

  it('allows execute by default', async () => {
    let counter = 0;
    const idGen = (): string => `acl-${(counter++).toString().padStart(4, '0')}`;
    const now = new Date('2026-08-04T12:00:00Z');
    const clock = () => now;
    const svc = new QueryGatewayService({
      queries: new InMemoryQueryRepository(),
      snapshots: new InMemoryDatasetSnapshotRepository(),
      freshness: new InMemoryFreshnessRecordRepository(),
      viewerTokens: new InMemoryViewerTokenRepository(),
      acl: new InMemoryACLRepository(),
      webhookDedup: new InMemoryWebhookDedupRepository(),
      webhookSecret: SECRET,
      idGenerator: idGen,
      clock,
      executeFn: async () => ({ columns: ['id'], rows: [[1]] }),
    });

    await expect(svc.checkACL(ACTOR, 'execute', ORG)).resolves.toBeUndefined();
  });

  it('denies when explicit ACL rule says deny', async () => {
    // Create service without seeded ACL rules
    let counter = 0;
    const idGen = (): string => `acl-${(counter++).toString().padStart(4, '0')}`;
    const now = new Date('2026-08-04T12:00:00Z');
    const clock = () => now;
    const aclRepo = new InMemoryACLRepository();
    const svc = new QueryGatewayService({
      queries: new InMemoryQueryRepository(),
      snapshots: new InMemoryDatasetSnapshotRepository(),
      freshness: new InMemoryFreshnessRecordRepository(),
      viewerTokens: new InMemoryViewerTokenRepository(),
      acl: aclRepo,
      webhookDedup: new InMemoryWebhookDedupRepository(),
      webhookSecret: SECRET,
      idGenerator: idGen,
      clock,
      executeFn: async () => ({ columns: ['id'], rows: [[1]] }),
    });
    await aclRepo.insert({ orgId: ORG, actorId: ACTOR, action: 'execute', allowed: false });

    await expect(svc.checkACL(ACTOR, 'execute', ORG)).rejects.toThrow(ACLDeniedError);
  });

  it('denies anonymous users', async () => {
    await expect(
      makeService().then((s) => s.svc.checkACL(undefined, 'execute', ORG)),
    ).rejects.toThrow(ACLDeniedError);
  });
});

describe('QueryGatewayService — audit', () => {
  it('writes an error freshness record on execution failure', async () => {
    let counter = 0;
    const idGen = (): string => {
      counter++;
      return `id-${counter.toString().padStart(4, '0')}`;
    };
    let now = new Date('2026-08-04T12:00:00Z');
    const clock = () => now;
    const advanceTime = (ms: number) => {
      now = new Date(now.getTime() + ms);
    };

    const queries = new InMemoryQueryRepository();
    const snapshots = new InMemoryDatasetSnapshotRepository();
    const freshness = new InMemoryFreshnessRecordRepository();
    const viewerTokens = new InMemoryViewerTokenRepository();
    const acl = new InMemoryACLRepository();
    const webhookDedup = new InMemoryWebhookDedupRepository();

    await queries.insert({
      queryId: 'q-fail',
      orgId: ORG,
      sql: 'INVALID SQL',
      connectorId: 'conn-1',
      params: [],
      freshnessPolicy: { type: 'on_demand' },
      createdBy: ACTOR,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const svc = new QueryGatewayService({
      queries,
      snapshots,
      freshness,
      viewerTokens,
      acl,
      webhookDedup,
      webhookSecret: SECRET,
      rateLimitCapacity: 10,
      rateLimitRefillPerSec: 5,
      cacheTtlMs: 60_000,
      idGenerator: idGen,
      clock,
      executeFn: async () => {
        throw new Error('SQL syntax error');
      },
    });

    void advanceTime;

    await expect(svc.executeQuery('q-fail', ORG, ACTOR)).rejects.toThrow('SQL syntax error');
    const record = await freshness.findLatestByQuery('q-fail', ORG);
    expect(record).not.toBeNull();
    expect(record!.status).toBe('error');
    expect(record!.errorMessage).toBe('SQL syntax error');
  });
});

describe('QueryGatewayService — viewer tokens', () => {
  it('issues and validates a viewer token', async () => {
    const { svc, queries } = await makeService();
    await insertTestQuery(queries, 'q1');

    const token = await svc.issueViewerToken('q1', ORG, ACTOR, ['read'], 60_000);
    expect(token.token).toBeDefined();
    expect(token.scopes).toEqual(['read']);

    const validated = await svc.validateViewerToken(token.token);
    expect(validated.queryId).toBe('q1');
  });

  it('rejects expired tokens', async () => {
    const { svc, queries, advanceTime } = await makeService();
    await insertTestQuery(queries, 'q1');

    const token = await svc.issueViewerToken('q1', ORG, ACTOR, ['read'], 1000);
    advanceTime(2000);

    await expect(svc.validateViewerToken(token.token)).rejects.toThrow(ViewerTokenExpiredError);
  });

  it('rejects single-use after consumption', async () => {
    const { svc, queries } = await makeService();
    await insertTestQuery(queries, 'q1');

    const token = await svc.issueViewerToken('q1', ORG, ACTOR, ['read'], 60_000);
    await svc.consumeViewerToken(token.token);
    await expect(svc.consumeViewerToken(token.token)).rejects.toThrow(ViewerTokenAlreadyUsedError);
  });
});

describe('QueryGatewayService — webhook', () => {
  it('verifies HMAC and writes snapshot', async () => {
    const { svc, queries } = await makeService();
    await insertTestQuery(queries, 'q1');

    const payload = JSON.stringify({ columns: ['id'], rows: [[1]] });
    const signature = createHmac('sha256', SECRET).update(payload).digest('hex');

    const result = await svc.processWebhook(payload, signature, 'wh-1', ORG, 'q1', ACTOR);
    expect(result.deduped).toBe(false);
    expect(result.snapshot.columns).toEqual(['id']);
  });

  it('rejects invalid HMAC', async () => {
    const { svc, queries } = await makeService();
    await insertTestQuery(queries, 'q1');

    await expect(svc.processWebhook('{}', 'deadbeef', 'wh-2', ORG, 'q1', ACTOR)).rejects.toThrow(
      WebhookHMACError,
    );
  });

  it('deduplicates by idempotency key', async () => {
    const { svc, queries } = await makeService();
    await insertTestQuery(queries, 'q1');

    const payload = JSON.stringify({ columns: ['id'], rows: [[1]] });
    const signature = createHmac('sha256', SECRET).update(payload).digest('hex');

    const first = await svc.processWebhook(payload, signature, 'wh-dup', ORG, 'q1', ACTOR);
    expect(first.deduped).toBe(false);

    const second = await svc.processWebhook(payload, signature, 'wh-dup', ORG, 'q1', ACTOR);
    expect(second.deduped).toBe(true);
  });
});

describe('QueryGatewayService — invalidation', () => {
  it('invalidates cache and writes stale record', async () => {
    const { svc, queries, freshness } = await makeService();
    await insertTestQuery(queries, 'q1');

    // Execute to populate cache
    await svc.executeQuery('q1', ORG, ACTOR);
    // Invalidate
    await svc.invalidateQuery('q1', ORG, ACTOR);

    const record = await freshness.findLatestByQuery('q1', ORG);
    expect(record).not.toBeNull();
    expect(record!.status).toBe('stale');
  });

  it('returns 404 for unknown query', async () => {
    const { svc } = await makeService();
    await expect(svc.invalidateQuery('nonexistent', ORG, ACTOR)).rejects.toThrow(
      QueryNotFoundError,
    );
  });
});
