/**
 * @domio/annotation-engine — idempotency store.
 *
 * Mirrors the @domio/presenter-session idempotency interface exactly so
 * the runtime can wire a single Redis-backed implementation across both
 * services. In-memory and null variants cover tests and dev.
 *
 * Triple-key scoping: (workspace_id, session_id, idempotency_key).
 *   TTL defaults to 24h.
 */

export interface IdempotencyKey {
  key: string;
  workspace_id: string;
  session_id: string;
  ttl_ms: number;
}

export interface IdempotencyReservation {
  exists: boolean;
  prior?: IdempotencyRecord;
}

export interface IdempotencyRecord {
  key: string;
  workspace_id: string;
  session_id: string;
  response: unknown;
  recorded_at_ms: number;
  ttl_ms: number;
}

export interface IdempotencyCommit {
  key: string;
  workspace_id: string;
  session_id: string;
  response: unknown;
  recorded_at_ms: number;
  ttl_ms: number;
}

export interface IdempotencyStore {
  reserve(req: IdempotencyKey): Promise<IdempotencyReservation>;
  commit(commit: IdempotencyCommit): Promise<void>;
  get(key: string, workspace_id: string, session_id: string): Promise<IdempotencyRecord | null>;
}

export class NullIdempotencyStore implements IdempotencyStore {
  async reserve(): Promise<IdempotencyReservation> {
    return { exists: false };
  }
  async commit(): Promise<void> {
    /* no-op */
  }
  async get(): Promise<IdempotencyRecord | null> {
    return null;
  }
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly map = new Map<string, IdempotencyRecord>();

  private fqkey(key: string, ws: string, sid: string): string {
    return `${ws}::${sid}::${key}`;
  }

  async reserve(req: IdempotencyKey): Promise<IdempotencyReservation> {
    const k = this.fqkey(req.key, req.workspace_id, req.session_id);
    const prior = this.map.get(k);
    if (prior) return { exists: true, prior };
    return { exists: false };
  }

  async commit(c: IdempotencyCommit): Promise<void> {
    const k = this.fqkey(c.key, c.workspace_id, c.session_id);
    this.map.set(k, { ...c });
    // Best-effort expiry; for tests we keep things simple.
    setTimeout(() => this.map.delete(k), c.ttl_ms).unref?.();
  }

  async get(
    key: string,
    workspace_id: string,
    session_id: string,
  ): Promise<IdempotencyRecord | null> {
    return this.map.get(this.fqkey(key, workspace_id, session_id)) ?? null;
  }
}
