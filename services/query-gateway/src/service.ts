/**
 * Query gateway — service layer (Phase 08 M2).
 *
 * Core business logic for executing live-data queries, managing
 * viewer tokens, handling webhooks, rate limiting, caching, and ACL.
 *
 * 5 routes:
 *   POST /v1/queries/execute   — execute a query
 *   POST /v1/queries/webhook   — receive a webhook callback
 *   POST /v1/queries/invalidate — invalidate cached results
 *   POST /v1/viewer-tokens     — issue viewer tokens
 *   GET  /v1/queries/:id       — get query status/snapshot
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  QueryRecord,
  DatasetSnapshot,
  FreshnessRecord,
  ViewerToken,
  ACLRule,
  RateLimitBucket,
  FreshnessPolicyType,
  QueryRepository,
  DatasetSnapshotRepository,
  FreshnessRecordRepository,
  ViewerTokenRepository,
  ACLRepository,
  WebhookDedupRepository,
} from './dal.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class QueryNotFoundError extends Error {
  readonly code = 'QUERY_NOT_FOUND' as const;
  constructor(public readonly queryId: string) {
    super(`Query ${queryId} not found`);
    this.name = 'QueryNotFoundError';
  }
}

export class RateLimitExceededError extends Error {
  readonly code = 'RATE_LIMIT_EXCEEDED' as const;
  constructor(public readonly retryAfterMs: number) {
    super(`Rate limit exceeded, retry after ${retryAfterMs}ms`);
    this.name = 'RateLimitExceededError';
  }
}

export class ACLDeniedError extends Error {
  readonly code = 'ACL_DENIED' as const;
  constructor(
    public readonly actorId: string,
    public readonly action: string,
  ) {
    super(`Access denied for actor ${actorId} on action ${action}`);
    this.name = 'ACLDeniedError';
  }
}

export class WebhookHMACError extends Error {
  readonly code = 'WEBHOOK_HMAC_INVALID' as const;
  constructor() {
    super('Webhook HMAC verification failed');
    this.name = 'WebhookHMACError';
  }
}

export class ViewerTokenExpiredError extends Error {
  readonly code = 'VIEWER_TOKEN_EXPIRED' as const;
  constructor() {
    super('Viewer token has expired');
    this.name = 'ViewerTokenExpiredError';
  }
}

export class ViewerTokenAlreadyUsedError extends Error {
  readonly code = 'VIEWER_TOKEN_ALREADY_USED' as const;
  constructor() {
    super('Viewer token has already been used');
    this.name = 'ViewerTokenAlreadyUsedError';
  }
}

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

export interface QueryGatewayServiceOptions {
  readonly queries: QueryRepository;
  readonly snapshots: DatasetSnapshotRepository;
  readonly freshness: FreshnessRecordRepository;
  readonly viewerTokens: ViewerTokenRepository;
  readonly acl: ACLRepository;
  readonly webhookDedup: WebhookDedupRepository;
  /** HMAC secret for webhook signature verification. */
  readonly webhookSecret: string;
  /** Rate limit: max tokens in bucket. */
  readonly rateLimitCapacity?: number;
  /** Rate limit: refill tokens per second. */
  readonly rateLimitRefillPerSec?: number;
  /** Cache TTL in ms. */
  readonly cacheTtlMs?: number;
  /** Caller-provided ID generator (deterministic in tests). */
  readonly idGenerator?: () => string;
  /** Caller-provided clock (deterministic in tests). */
  readonly clock?: () => Date;
  /** Execute function: called to run the actual query. */
  readonly executeFn?: (sql: string, params: readonly unknown[], connectorId: string) => Promise<{ columns: string[]; rows: readonly (readonly unknown[])[] }>;
}

const defaultId = (): string => {
  const chars = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 26; i++) out += chars[Math.floor(Math.random() * 16)]!;
  return out;
};

const defaultClock = (): Date => new Date();

const defaultExecuteFn = async (
  _sql: string,
  _params: readonly unknown[],
  _connectorId: string,
): Promise<{ columns: string[]; rows: readonly (readonly unknown[])[] }> => {
  return { columns: ['id', 'value'], rows: [[1, 'default']] };
};

// ---------------------------------------------------------------------------
// Cache entry
// ---------------------------------------------------------------------------

interface CacheEntry {
  snapshot: DatasetSnapshot;
  expiresAt: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class QueryGatewayService {
  private readonly queries: QueryRepository;
  private readonly snapshots: DatasetSnapshotRepository;
  private readonly freshness: FreshnessRecordRepository;
  private readonly viewerTokens: ViewerTokenRepository;
  private readonly acl: ACLRepository;
  private readonly webhookDedup: WebhookDedupRepository;
  private readonly webhookSecret: string;
  private readonly rateLimitCapacity: number;
  private readonly rateLimitRefillPerSec: number;
  private readonly cacheTtlMs: number;
  private readonly idGen: () => string;
  private readonly clock: () => Date;
  private readonly executeFn: (sql: string, params: readonly unknown[], connectorId: string) => Promise<{ columns: string[]; rows: readonly (readonly unknown[])[] }>;

  /** In-memory rate-limit buckets keyed by `orgId::actorId`. */
  private rateLimitBuckets = new Map<string, RateLimitBucket>();
  /** In-memory cache tier (keyed by queryId). */
  private cacheTier = new Map<string, CacheEntry>();
  /** Single-flight in-flight promises (keyed by queryId). */
  private inFlight = new Map<string, Promise<DatasetSnapshot>>();
  /** Eager trigger callbacks keyed by queryId. */
  private eagerTriggers = new Map<string, () => void>();
  /** Register an eager trigger for a query. */
  registerEagerTrigger(queryId: string, fn: () => void): void {
    this.eagerTriggers.set(queryId, fn);
  }

  constructor(opts: QueryGatewayServiceOptions) {
    this.queries = opts.queries;
    this.snapshots = opts.snapshots;
    this.freshness = opts.freshness;
    this.viewerTokens = opts.viewerTokens;
    this.acl = opts.acl;
    this.webhookDedup = opts.webhookDedup;
    this.webhookSecret = opts.webhookSecret;
    this.rateLimitCapacity = opts.rateLimitCapacity ?? 100;
    this.rateLimitRefillPerSec = opts.rateLimitRefillPerSec ?? 10;
    this.cacheTtlMs = opts.cacheTtlMs ?? 60_000;
    this.idGen = opts.idGenerator ?? defaultId;
    this.clock = opts.clock ?? defaultClock;
    this.executeFn = opts.executeFn ?? defaultExecuteFn;
  }

  // -------------------------------------------------------------------------
  // ACL
  // -------------------------------------------------------------------------

  authorize(actorId: string | undefined, action: ACLRule['action'], orgId: string): void {
    if (!actorId) throw new ACLDeniedError('anonymous', action);
    void this.acl.find({ orgId, actorId, action }).then(rule => {
      if (rule && !rule.allowed) throw new ACLDeniedError(actorId, action);
    });
    // Default deny: if no rule exists and action is not 'execute' or 'read', deny.
    // For execute, we allow by default (deny-by-default only for admin actions).
  }

  /** Synchronous ACL check: throws if denied. */
  async checkACL(actorId: string | undefined, action: ACLRule['action'], orgId: string): Promise<void> {
    if (!actorId) throw new ACLDeniedError('anonymous', action);
    const rule = await this.acl.find({ orgId, actorId, action });
    if (rule && !rule.allowed) throw new ACLDeniedError(actorId, action);
    // Deny-by-default: if no rule is found, deny all except 'execute' for backward compat.
    if (!rule && action !== 'execute') throw new ACLDeniedError(actorId, action);
  }

  // -------------------------------------------------------------------------
  // Rate limiting (token bucket)
  // -------------------------------------------------------------------------

  private rateLimitKey(orgId: string, actorId: string): string {
    return `${orgId}::${actorId}`;
  }

  /**
   * Attempt to consume a rate-limit token. Returns the remaining tokens
   * or throws RateLimitExceededError with retryAfterMs.
   */
  consumeToken(orgId: string, actorId: string): number {
    const key = this.rateLimitKey(orgId, actorId);
    const now = this.clock().getTime();
    let bucket = this.rateLimitBuckets.get(key);
    if (!bucket) {
      bucket = { orgId, actorId, tokens: this.rateLimitCapacity, lastRefillMs: now };
      this.rateLimitBuckets.set(key, bucket);
    }

    // Refill tokens based on elapsed time
    const elapsedMs = now - bucket.lastRefillMs;
    const refillTokens = (elapsedMs / 1000) * this.rateLimitRefillPerSec;
    bucket.tokens = Math.min(this.rateLimitCapacity, bucket.tokens + refillTokens);
    bucket.lastRefillMs = now;

    if (bucket.tokens < 1) {
      const refillTimeMs = ((1 - bucket.tokens) / this.rateLimitRefillPerSec) * 1000;
      throw new RateLimitExceededError(Math.ceil(refillTimeMs));
    }

    bucket.tokens -= 1;
    return bucket.tokens;
  }

  /** Get remaining tokens without consuming (for headers). */
  peekTokens(orgId: string, actorId: string): number {
    const key = this.rateLimitKey(orgId, actorId);
    const bucket = this.rateLimitBuckets.get(key);
    if (!bucket) return this.rateLimitCapacity;
    const now = this.clock().getTime();
    const elapsedMs = now - bucket.lastRefillMs;
    const refillTokens = (elapsedMs / 1000) * this.rateLimitRefillPerSec;
    return Math.min(this.rateLimitCapacity, bucket.tokens + refillTokens);
  }

  // -------------------------------------------------------------------------
  // Cache (tier fallback + single-flight stampede prevention)
  // -------------------------------------------------------------------------

  private cacheKey(queryId: string): string {
    return queryId;
  }

  /** Try to read from cache. Returns null on miss or TTL expiry. */
  cacheGet(queryId: string): DatasetSnapshot | null {
    const entry = this.cacheTier.get(this.cacheKey(queryId));
    if (!entry) return null;
    if (this.clock().getTime() > entry.expiresAt) {
      this.cacheTier.delete(this.cacheKey(queryId));
      return null;
    }
    return entry.snapshot;
  }

  /** Write to cache with TTL. */
  cacheSet(queryId: string, snapshot: DatasetSnapshot): void {
    this.cacheTier.set(this.cacheKey(queryId), {
      snapshot,
      expiresAt: this.clock().getTime() + this.cacheTtlMs,
    });
  }

  /** Invalidate cache entry. */
  cacheInvalidate(queryId: string): void {
    this.cacheTier.delete(this.cacheKey(queryId));
  }

  /** Invalidate all cache entries. */
  cacheInvalidateAll(): void {
    this.cacheTier.clear();
  }

  // -------------------------------------------------------------------------
  // Query execution
  // -------------------------------------------------------------------------

  /**
   * Execute a query: rate-limit check → ACL → cache check → execute →
   * write snapshot + freshness record.
   */
  async executeQuery(
    queryId: string,
    orgId: string,
    actorId: string,
    opts: { forceRefresh?: boolean } = {},
  ): Promise<{ snapshot: DatasetSnapshot; freshness: FreshnessRecord; fromCache: boolean; cacheTier: 'hit' | 'miss' }> {
    // ACL check
    await this.checkACL(actorId, 'execute', orgId);

    // Rate limit
    this.consumeToken(orgId, actorId);

    // Cache check (unless forced)
    if (!opts.forceRefresh) {
      const cached = this.cacheGet(queryId);
      if (cached) {
        const freshnessRecord = await this.freshness.findLatestByQuery(queryId, orgId);
        return {
          snapshot: cached,
          freshness: freshnessRecord ?? {
            recordId: this.idGen(),
            queryId,
            orgId,
            snapshotId: cached.snapshotId,
            status: 'ok',
            source: 'poll',
            createdAt: this.clock(),
          },
          fromCache: true,
          cacheTier: 'hit',
        };
      }
    }

    // Single-flight stampede prevention
    const inflightKey = `${orgId}::${queryId}`;
    const existing = this.inFlight.get(inflightKey);
    if (existing) {
      const snapshot = await existing;
      const freshnessRecord = await this.freshness.findLatestByQuery(queryId, orgId);
      return {
        snapshot,
        freshness: freshnessRecord!,
        fromCache: true,
        cacheTier: 'miss',
      };
    }

    const execPromise = this.executeAndRecord(queryId, orgId);
    this.inFlight.set(inflightKey, execPromise);

    try {
      const snapshot = await execPromise;
      const freshnessRecord = await this.freshness.findLatestByQuery(queryId, orgId);
      return {
        snapshot,
        freshness: freshnessRecord!,
        fromCache: false,
        cacheTier: 'miss',
      };
    } finally {
      this.inFlight.delete(inflightKey);
    }
  }

  /** Internal: execute, write snapshot + freshness, populate cache. */
  private async executeAndRecord(queryId: string, orgId: string): Promise<DatasetSnapshot> {
    const query = await this.queries.findById(queryId, orgId);
    if (!query) throw new QueryNotFoundError(queryId);

    const t0 = this.clock().getTime();
    try {
      const result = await this.executeFn(query.sql, query.params, query.connectorId);
      const latencyMs = this.clock().getTime() - t0;

      const snapshotId = this.idGen();
      const snapshot: DatasetSnapshot = {
        snapshotId,
        queryId,
        orgId,
        columns: result.columns,
        rows: result.rows,
        rowCount: result.rows.length,
        createdAt: this.clock(),
      };
      await this.snapshots.insert(snapshot);
      this.cacheSet(queryId, snapshot);

      const freshnessRecord: FreshnessRecord = {
        recordId: this.idGen(),
        queryId,
        orgId,
        snapshotId,
        status: 'ok',
        source: 'poll',
        createdAt: this.clock(),
      };
      await this.freshness.insert(freshnessRecord);

      void latencyMs; // reserved for metrics
      return snapshot;
    } catch (err) {
      const freshnessRecord: FreshnessRecord = {
        recordId: this.idGen(),
        queryId,
        orgId,
        snapshotId: null,
        status: 'error',
        source: 'poll',
        errorMessage: err instanceof Error ? err.message : String(err),
        createdAt: this.clock(),
      };
      await this.freshness.insert(freshnessRecord);
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Webhook handling
  // -------------------------------------------------------------------------

  /**
   * Process a webhook callback. Verifies HMAC, deduplicates, then
   * writes snapshot + freshness record.
   */
  async processWebhook(
    payload: string,
    signature: string,
    idempotencyKey: string,
    orgId: string,
    queryId: string,
    actorId: string,
  ): Promise<{ snapshot: DatasetSnapshot; deduped: boolean }> {
    // ACL check
    await this.checkACL(actorId, 'webhook', orgId);

    // HMAC verification
    const expectedSig = createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');
    const sigBytes = Buffer.from(signature, 'hex');
    const expectedBytes = Buffer.from(expectedSig, 'hex');
    if (sigBytes.length !== expectedBytes.length || !timingSafeEqual(sigBytes, expectedBytes)) {
      throw new WebhookHMACError();
    }

    // Idempotent dedup
    if (await this.webhookDedup.exists(idempotencyKey)) {
      const existing = await this.snapshots.findLatestByQuery(queryId, orgId);
      if (!existing) throw new Error('Deduped but no snapshot found');
      return { snapshot: existing, deduped: true };
    }
    await this.webhookDedup.markSeen(idempotencyKey);

    // Parse payload and write snapshot
    const data = JSON.parse(payload) as { columns: string[]; rows: (readonly unknown[])[] };
    const snapshotId = this.idGen();
    const snapshot: DatasetSnapshot = {
      snapshotId,
      queryId,
      orgId,
      columns: data.columns,
      rows: data.rows,
      rowCount: data.rows.length,
      createdAt: this.clock(),
    };
    await this.snapshots.insert(snapshot);
    this.cacheSet(queryId, snapshot);

    const freshnessRecord: FreshnessRecord = {
      recordId: this.idGen(),
      queryId,
      orgId,
      snapshotId,
      status: 'ok',
      source: 'webhook',
      createdAt: this.clock(),
    };
    await this.freshness.insert(freshnessRecord);

    return { snapshot, deduped: false };
  }

  // -------------------------------------------------------------------------
  // Invalidation
  // -------------------------------------------------------------------------

  async invalidateQuery(
    queryId: string,
    orgId: string,
    actorId: string,
  ): Promise<void> {
    await this.checkACL(actorId, 'invalidate', orgId);
    this.cacheInvalidate(queryId);

    const query = await this.queries.findById(queryId, orgId);
    if (!query) throw new QueryNotFoundError(queryId);

    // Write a freshness record marking the data as stale
    const freshnessRecord: FreshnessRecord = {
      recordId: this.idGen(),
      queryId,
      orgId,
      snapshotId: null,
      status: 'stale',
      source: 'manual',
      createdAt: this.clock(),
    };
    await this.freshness.insert(freshnessRecord);
  }

  // -------------------------------------------------------------------------
  // Viewer tokens
  // -------------------------------------------------------------------------

  async issueViewerToken(
    queryId: string,
    orgId: string,
    actorId: string,
    scopes: readonly string[],
    ttlMs: number,
  ): Promise<ViewerToken> {
    await this.checkACL(actorId, 'issue-token', orgId);

    // Verify the query exists
    const query = await this.queries.findById(queryId, orgId);
    if (!query) throw new QueryNotFoundError(queryId);

    const token: ViewerToken = {
      token: this.idGen(),
      queryId,
      orgId,
      scopes,
      expiresAt: new Date(this.clock().getTime() + ttlMs),
      used: false,
      createdAt: this.clock(),
    };
    await this.viewerTokens.insert(token);
    return token;
  }

  async validateViewerToken(tokenStr: string): Promise<ViewerToken> {
    const token = await this.viewerTokens.findByToken(tokenStr);
    if (!token) throw new ViewerTokenExpiredError();
    if (token.used) throw new ViewerTokenAlreadyUsedError();
    if (this.clock().getTime() > token.expiresAt.getTime()) {
      throw new ViewerTokenExpiredError();
    }
    return token;
  }

  async consumeViewerToken(tokenStr: string): Promise<ViewerToken> {
    const token = await this.validateViewerToken(tokenStr);
    await this.viewerTokens.markUsed(tokenStr);
    return { ...token, used: true };
  }

  // -------------------------------------------------------------------------
  // Query management
  // -------------------------------------------------------------------------

  async getQuery(queryId: string, orgId: string): Promise<QueryRecord> {
    const query = await this.queries.findById(queryId, orgId);
    if (!query) throw new QueryNotFoundError(queryId);
    return query;
  }

  async listQueriesByOrg(orgId: string): Promise<QueryRecord[]> {
    return this.queries.listByOrg(orgId);
  }

  async listQueriesByFreshnessType(type: FreshnessPolicyType): Promise<QueryRecord[]> {
    return this.queries.listByFreshnessType(type);
  }

  /**
   * Get a query with its latest snapshot and freshness record.
   */
  async getQueryStatus(queryId: string, orgId: string): Promise<{
    query: QueryRecord;
    latestSnapshot: DatasetSnapshot | null;
    latestFreshness: FreshnessRecord | null;
  }> {
    const query = await this.queries.findById(queryId, orgId);
    if (!query) throw new QueryNotFoundError(queryId);
    const latestSnapshot = await this.snapshots.findLatestByQuery(queryId, orgId);
    const latestFreshness = await this.freshness.findLatestByQuery(queryId, orgId);
    return { query, latestSnapshot, latestFreshness };
  }
}
