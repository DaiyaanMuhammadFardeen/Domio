/**
 * @domio/recording-orchestrator — idempotency store.
 *
 * Replay-safe dedup of mutations. Mirrors the interface in
 * services/presenter-session/src/idempotency/index.ts. The Null impl is
 * the default; production binds a Redis-backed impl.
 */

export interface IdempotencyStore {
  /** Returns true if the key was claimed by this call; false if it was already taken. */
  claim(key: string, ttl_seconds?: number): Promise<boolean>;
  /** Releases a previously-claimed key (used when an operation fails after claim). */
  release(key: string): Promise<void>;
}

export class NullIdempotencyStore implements IdempotencyStore {
  private readonly claimed = new Set<string>();
  async claim(key: string): Promise<boolean> {
    if (this.claimed.has(key)) return false;
    this.claimed.add(key);
    return true;
  }
  async release(key: string): Promise<void> {
    this.claimed.delete(key);
  }
}