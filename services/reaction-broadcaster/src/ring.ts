/**
 * @domio/reaction-broadcaster — ring buffer + idempotency.
 *
 * Per-session ring buffer of the most recent N reactions (default 64)
 * keyed by `idempotency_key`. When a duplicate key arrives within the
 * window, the prior event is replayed; otherwise the ring evicts the
 * oldest. The buffer is intentionally small: it's only used to catch
 * network retries and to back the "recent reactions" UI panel.
 */

export interface RingOptions {
  readonly capacity?: number;
}

export class ReactionRing {
  private readonly capacity: number;
  private readonly entries = new Map<string, { value: unknown; inserted_at_ms: number }>();
  private order: string[] = [];

  constructor(opts: RingOptions = {}) {
    this.capacity = opts.capacity ?? 64;
  }

  /** Reserve a key. Returns true if the key is new (caller should write). */
  reserve(key: string): boolean {
    if (this.entries.has(key)) return false;
    this.order.push(key);
    while (this.order.length > this.capacity) {
      const evicted = this.order.shift();
      if (evicted) this.entries.delete(evicted);
    }
    this.entries.set(key, { value: undefined, inserted_at_ms: Date.now() });
    return true;
  }

  commit(key: string, value: unknown): void {
    const slot = this.entries.get(key);
    if (slot) slot.value = value;
  }

  get(key: string): unknown | null {
    return this.entries.get(key)?.value ?? null;
  }

  size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
    this.order = [];
  }
}
