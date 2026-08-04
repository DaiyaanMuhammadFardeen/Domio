/**
 * Query gateway — persistence layer (Phase 08 M2).
 *
 * Repository interfaces for queries, dataset snapshots, freshness
 * records, viewer tokens, and rate-limit buckets.  In-memory
 * implementations for tests + dev fallback.
 */

// ---------------------------------------------------------------------------
// Query records
// ---------------------------------------------------------------------------

export type FreshnessPolicyType = 'eager' | 'on_interval' | 'on_demand';

export interface FreshnessPolicy {
  readonly type: FreshnessPolicyType;
  /** Interval in ms for `on_interval` type. */
  readonly intervalMs?: number;
}

export interface QueryRecord {
  readonly queryId: string;
  readonly orgId: string;
  readonly sql: string;
  readonly connectorId: string;
  readonly params: readonly unknown[];
  readonly freshnessPolicy: FreshnessPolicy;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DatasetSnapshot {
  readonly snapshotId: string;
  readonly queryId: string;
  readonly orgId: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly unknown[])[];
  readonly rowCount: number;
  readonly createdAt: Date;
}

export type FreshnessStatus = 'ok' | 'error' | 'stale';

export interface FreshnessRecord {
  readonly recordId: string;
  readonly queryId: string;
  readonly orgId: string;
  readonly snapshotId: string | null;
  readonly status: FreshnessStatus;
  readonly source: 'poll' | 'webhook' | 'manual';
  readonly errorMessage?: string;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// Viewer tokens
// ---------------------------------------------------------------------------

export interface ViewerToken {
  readonly token: string;
  readonly queryId: string;
  readonly orgId: string;
  readonly scopes: readonly string[];
  readonly expiresAt: Date;
  readonly used: boolean;
  readonly createdAt: Date;
}

// ---------------------------------------------------------------------------
// ACL
// ---------------------------------------------------------------------------

export interface ACLRule {
  readonly orgId: string;
  readonly actorId: string;
  readonly action: 'execute' | 'invalidate' | 'webhook' | 'issue-token';
  readonly allowed: boolean;
}

// ---------------------------------------------------------------------------
// Rate limiter state
// ---------------------------------------------------------------------------

export interface RateLimitBucket {
  readonly orgId: string;
  readonly actorId: string;
  /** Token count in the bucket. */
  tokens: number;
  /** Timestamp of last refill (ms since epoch). */
  lastRefillMs: number;
}

// ---------------------------------------------------------------------------
// Repository interfaces
// ---------------------------------------------------------------------------

export interface QueryRepository {
  insert(record: QueryRecord): Promise<void>;
  findById(queryId: string, orgId: string): Promise<QueryRecord | null>;
  listByOrg(orgId: string): Promise<QueryRecord[]>;
  listByFreshnessType(type: FreshnessPolicyType): Promise<QueryRecord[]>;
  update(queryId: string, orgId: string, patch: Partial<Pick<QueryRecord, 'sql' | 'connectorId' | 'params' | 'freshnessPolicy'>>): Promise<QueryRecord>;
  delete(queryId: string, orgId: string): Promise<void>;
}

export interface DatasetSnapshotRepository {
  insert(snapshot: DatasetSnapshot): Promise<void>;
  findById(snapshotId: string): Promise<DatasetSnapshot | null>;
  findLatestByQuery(queryId: string, orgId: string): Promise<DatasetSnapshot | null>;
}

export interface FreshnessRecordRepository {
  insert(record: FreshnessRecord): Promise<void>;
  findLatestByQuery(queryId: string, orgId: string): Promise<FreshnessRecord | null>;
  listByQuery(queryId: string, orgId: string, limit?: number): Promise<FreshnessRecord[]>;
}

export interface ViewerTokenRepository {
  insert(token: ViewerToken): Promise<void>;
  findByToken(token: string): Promise<ViewerToken | null>;
  markUsed(token: string): Promise<void>;
  deleteByQuery(queryId: string, orgId: string): Promise<void>;
}

export interface ACLRepository {
  find(rule: { orgId: string; actorId: string; action: ACLRule['action'] }): Promise<ACLRule | null>;
  insert(rule: ACLRule): Promise<void>;
}

export interface WebhookDedupRepository {
  exists(idempotencyKey: string): Promise<boolean>;
  markSeen(idempotencyKey: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// In-memory implementations
// ---------------------------------------------------------------------------

export class InMemoryQueryRepository implements QueryRepository {
  private store = new Map<string, QueryRecord>();
  private k(r: QueryRecord): string { return `${r.orgId}::${r.queryId}`; }
  async insert(r: QueryRecord): Promise<void> { this.store.set(this.k(r), r); }
  async findById(queryId: string, orgId: string): Promise<QueryRecord | null> {
    return this.store.get(`${orgId}::${queryId}`) ?? null;
  }
  async listByOrg(orgId: string): Promise<QueryRecord[]> {
    const out: QueryRecord[] = [];
    for (const r of this.store.values()) {
      if (r.orgId === orgId) out.push(r);
    }
    return out;
  }
  async listByFreshnessType(type: FreshnessPolicyType): Promise<QueryRecord[]> {
    const out: QueryRecord[] = [];
    for (const r of this.store.values()) {
      if (r.freshnessPolicy.type === type) out.push(r);
    }
    return out;
  }
  async update(queryId: string, orgId: string, patch: Partial<Pick<QueryRecord, 'sql' | 'connectorId' | 'params' | 'freshnessPolicy'>>): Promise<QueryRecord> {
    const existing = await this.findById(queryId, orgId);
    if (!existing) throw new Error(`Query ${queryId} not found for org ${orgId}`);
    const updated: QueryRecord = { ...existing, ...patch, updatedAt: new Date() };
    this.store.set(this.k(updated), updated);
    return updated;
  }
  async delete(queryId: string, orgId: string): Promise<void> {
    this.store.delete(`${orgId}::${queryId}`);
  }
}

export class InMemoryDatasetSnapshotRepository implements DatasetSnapshotRepository {
  private store = new Map<string, DatasetSnapshot>();
  async insert(s: DatasetSnapshot): Promise<void> { this.store.set(s.snapshotId, s); }
  async findById(snapshotId: string): Promise<DatasetSnapshot | null> {
    return this.store.get(snapshotId) ?? null;
  }
  async findLatestByQuery(queryId: string, orgId: string): Promise<DatasetSnapshot | null> {
    let latest: DatasetSnapshot | null = null;
    for (const s of this.store.values()) {
      if (s.queryId === queryId && s.orgId === orgId) {
        if (!latest || s.createdAt > latest.createdAt) latest = s;
      }
    }
    return latest;
  }
}

export class InMemoryFreshnessRecordRepository implements FreshnessRecordRepository {
  private store: FreshnessRecord[] = [];
  async insert(r: FreshnessRecord): Promise<void> { this.store.push(r); }
  async findLatestByQuery(queryId: string, orgId: string): Promise<FreshnessRecord | null> {
    const matches = this.store.filter(r => r.queryId === queryId && r.orgId === orgId);
    if (matches.length === 0) return null;
    return matches.reduce((a, b) => a.createdAt > b.createdAt ? a : b);
  }
  async listByQuery(queryId: string, orgId: string, limit = 100): Promise<FreshnessRecord[]> {
    return this.store.filter(r => r.queryId === queryId && r.orgId === orgId).slice(-limit);
  }
}

export class InMemoryViewerTokenRepository implements ViewerTokenRepository {
  private store = new Map<string, ViewerToken>();
  async insert(t: ViewerToken): Promise<void> { this.store.set(t.token, t); }
  async findByToken(token: string): Promise<ViewerToken | null> {
    return this.store.get(token) ?? null;
  }
  async markUsed(token: string): Promise<void> {
    const existing = this.store.get(token);
    if (existing) {
      this.store.set(token, { ...existing, used: true });
    }
  }
  async deleteByQuery(queryId: string, orgId: string): Promise<void> {
    for (const [k, v] of this.store) {
      if (v.queryId === queryId && v.orgId === orgId) this.store.delete(k);
    }
  }
}

export class InMemoryACLRepository implements ACLRepository {
  private store: ACLRule[] = [];
  async find(rule: { orgId: string; actorId: string; action: ACLRule['action'] }): Promise<ACLRule | null> {
    return this.store.find(r =>
      r.orgId === rule.orgId && r.actorId === rule.actorId && r.action === rule.action,
    ) ?? null;
  }
  async insert(rule: ACLRule): Promise<void> { this.store.push(rule); }
}

export class InMemoryWebhookDedupRepository implements WebhookDedupRepository {
  private seen = new Set<string>();
  async exists(idempotencyKey: string): Promise<boolean> { return this.seen.has(idempotencyKey); }
  async markSeen(idempotencyKey: string): Promise<void> { this.seen.add(idempotencyKey); }
}
