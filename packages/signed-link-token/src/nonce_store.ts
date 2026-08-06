/**
 * @domio/signed-link-token — nonce store interface + in-memory implementation.
 *
 * Phase 14 W1. Every minted link token includes a 128-bit random nonce.
 * The verifier must reject re-use of the same nonce within the token's
 * TTL window. In production this is backed by Redis; in tests and in
 * the in-memory dev store we use a simple Map keyed by `nonce`.
 *
 * Public API:
 *  - `NonceStore` — interface (put/get/has).
 *  - `InMemoryNonceStore` — Map-backed, TTL-aware, single-process store.
 *  - `NullNonceStore` — no-op store; accepts everything, never rejects.
 *    Used in dev when REPLAY_PROTECTION=false.
 */

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface NonceStore {
  /**
   * Atomically record the nonce as "seen".
   *  - returns true if the nonce was new (first use) → token is fresh.
   *  - returns false if the nonce was already used → token is a replay.
   * After `ttlMs` elapses the nonce is forgotten (next `seen` returns true).
   */
  seen(nonce: string, ttlMs: number): Promise<boolean> | boolean;
}

// ---------------------------------------------------------------------------
// In-memory
// ---------------------------------------------------------------------------

export class InMemoryNonceStore implements NonceStore {
  private readonly seenAt = new Map<string, number>();

  constructor(
    /** Returns current time in ms. Default `Date.now`. */
    private readonly clock: () => number = () => Date.now(),
  ) {}

  seen(nonce: string, ttlMs: number): boolean {
    // Lazy GC: drop expired entries on each call.
    const now = this.clock();
    for (const [key, ts] of this.seenAt) {
      if (now - ts >= ttlMs) this.seenAt.delete(key);
    }
    if (this.seenAt.has(nonce)) return false;
    this.seenAt.set(nonce, now);
    return true;
  }

  /** Test helper: number of nonces currently retained. */
  size(): number {
    return this.seenAt.size;
  }

  /** Test helper: clear all entries. */
  clear(): void {
    this.seenAt.clear();
  }
}

// ---------------------------------------------------------------------------
// Null store (dev convenience)
// ---------------------------------------------------------------------------

/**
 * A nonce store that accepts everything. Used when `REPLAY_PROTECTION=false`
 * in dev so tests can replay tokens without a backing Redis. NEVER use in
 * production.
 */
export class NullNonceStore implements NonceStore {
  seen(_nonce: string, _ttlMs: number): boolean {
    return true;
  }
}
