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
export class NullIdempotencyStore {
  async reserve() {
    return { exists: false };
  }
  async commit() {}
  async get() {
    return null;
  }
}
export class InMemoryIdempotencyStore {
  map = new Map();
  fqkey(key, ws, sid) {
    return `${ws}::${sid}::${key}`;
  }
  async reserve(req) {
    const k = this.fqkey(req.key, req.workspace_id, req.session_id);
    const prior = this.map.get(k);
    if (prior) return { exists: true, prior };
    return { exists: false };
  }
  async commit(c) {
    const k = this.fqkey(c.key, c.workspace_id, c.session_id);
    this.map.set(k, { ...c });
    // Best-effort expiry; for tests we keep things simple.
    setTimeout(() => this.map.delete(k), c.ttl_ms).unref?.();
  }
  async get(key, workspace_id, session_id) {
    return this.map.get(this.fqkey(key, workspace_id, session_id)) ?? null;
  }
}
//# sourceMappingURL=index.js.map
