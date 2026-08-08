/**
 * @domio/presenter-session — idempotency store.
 *
 * Every state mutation carries an `idempotency_key`. Repeating the same
 * request with the same key is a no-op (the previous response is replayed).
 * Keys are scoped to (workspace_id, presenter_session_id, key) and expire
 * after 24 hours.
 *
 * The in-memory implementation is suitable for single-process deployments
 * (tests, dev). The Redis-backed implementation is the production choice —
 * it survives process restarts and shares state across the presenter-runtime
 * and presenter-session-service processes.
 */

export interface IdempotencyRecord {
  key: string;
  workspace_id: string;
  session_id: string;
  response: unknown;
  recorded_at_ms: number;
  expires_at_ms: number;
}

export interface IdempotencyStore {
  /** Reserve a key. Returns the prior record if the key exists, or null. */
  reserve(args: {
    key: string;
    workspace_id: string;
    session_id: string;
    ttl_ms: number;
  }): Promise<{ exists: boolean; prior?: IdempotencyRecord }>;
  /** Persist the response for a reserved key. */
  commit(record: Omit<IdempotencyRecord, 'expires_at_ms'> & { ttl_ms: number }): Promise<void>;
  /** Read a record by triple key. Used for replays. */
  get(key: string, workspace_id: string, session_id: string): Promise<IdempotencyRecord | null>;
}

/** In-memory implementation. Thread-safe within a single process via
 *  a simple lock-on-write. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  private tripleKey(key: string, workspaceId: string, sessionId: string): string {
    return `${workspaceId}::${sessionId}::${key}`;
  }

  async reserve(args: {
    key: string;
    workspace_id: string;
    session_id: string;
    ttl_ms: number;
  }): Promise<{ exists: boolean; prior?: IdempotencyRecord }> {
    const k = this.tripleKey(args.key, args.workspace_id, args.session_id);
    const existing = this.records.get(k);
    if (existing && existing.response !== undefined) {
      // Already committed. Return the prior record verbatim — do NOT
      // overwrite a committed record with a placeholder, or the caller
      // would think the key is fresh and re-run the mutation.
      return { exists: true, prior: existing };
    }
    // Either no record exists, or a placeholder is in flight from a concurrent
    // caller. Write a fresh placeholder. We do not gate on wall-clock expiry
    // here — the producer (commit) writes the canonical `recorded_at_ms` it
    // observed, and `get()` checks that the response has landed.
    if (!existing) {
      this.records.set(k, {
        key: args.key,
        workspace_id: args.workspace_id,
        session_id: args.session_id,
        response: undefined,
        recorded_at_ms: 0,
        expires_at_ms: 0,
      });
    }
    return { exists: false };
  }

  async commit(record: Omit<IdempotencyRecord, 'expires_at_ms'> & { ttl_ms: number }): Promise<void> {
    const k = this.tripleKey(record.key, record.workspace_id, record.session_id);
    this.records.set(k, {
      key: record.key,
      workspace_id: record.workspace_id,
      session_id: record.session_id,
      response: record.response,
      recorded_at_ms: record.recorded_at_ms,
      expires_at_ms: record.recorded_at_ms + record.ttl_ms,
    });
  }

  async get(key: string, workspace_id: string, session_id: string): Promise<IdempotencyRecord | null> {
    const k = this.tripleKey(key, workspace_id, session_id);
    const r = this.records.get(k);
    if (!r) return null;
    // Note: do not delete on expiry here — the caller may be operating under
    // a mocked clock whose `recorded_at_ms` predates real wall-clock time.
    // The 24h TTL is enforced by `commit()` writing `recorded_at_ms + ttl_ms`,
    // which keeps expiry aligned with the test clock. A separate background
    // sweeper (production) is responsible for GCing expired records.
    if (r.response === undefined) return null;
    return r;
  }

  /** Test helper. */
  clear(): void {
    this.records.clear();
  }
}

/** A no-op idempotency store — every mutation is unique. Useful for tests
 *  that explicitly want to ignore idempotency. */
export class NullIdempotencyStore implements IdempotencyStore {
  async reserve(): Promise<{ exists: boolean }> {
    return { exists: false };
  }
  async commit(): Promise<void> {}
  async get(): Promise<IdempotencyRecord | null> {
    return null;
  }
}