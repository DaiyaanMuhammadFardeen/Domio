/**
 * Phase 02 stub of the autosave queue (#22). The deferred-write queue
 * debounces edits within a 16 ms window and persists them to an in-memory
 * store that is meant to be replaced with IndexedDB by Phase 03. The
 * intent is to ship the **plumbing** so the editor can be wired to a
 * single `flush()` call, while the server push itself lands in P04/P05.
 *
 * No external dependencies: IndexedDB is wired through an injected
 * `PersistentStore` so tests can substitute an in-memory implementation.
 */

export interface AutosavePayload<T> {
  id: string;
  payload: T;
  enqueuedAt: number;
}

export interface PersistentStore {
  put(entry: AutosavePayload<unknown>): Promise<void>;
  list(): Promise<AutosavePayload<unknown>[]>;
  clear(): Promise<void>;
}

export class InMemoryPersistentStore implements PersistentStore {
  private readonly store = new Map<string, AutosavePayload<unknown>>();

  async put(entry: AutosavePayload<unknown>): Promise<void> {
    this.store.set(entry.id, entry);
  }

  async list(): Promise<AutosavePayload<unknown>[]> {
    return Array.from(this.store.values()).sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

export interface AutosaveQueueOptions {
  /** Debounce window in milliseconds (default 16). */
  debounceMs?: number;
  /** Flush batch size — limits how many entries flush at once. */
  batchSize?: number;
  /** Persistent store implementation (defaults to in-memory). */
  store?: PersistentStore;
  /** Optional clock override for deterministic tests. */
  now?: () => number;
}

export class AutosaveQueue<T> {
  private readonly store: PersistentStore;
  private readonly debounceMs: number;
  private readonly batchSize: number;
  private readonly now: () => number;

  private readonly pending = new Map<string, AutosavePayload<T>>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private inflight = false;
  private quotaExceededHandler?: (error: unknown) => void;

  constructor(options: AutosaveQueueOptions = {}) {
    this.store = options.store ?? new InMemoryPersistentStore();
    this.debounceMs = options.debounceMs ?? 16;
    this.batchSize = options.batchSize ?? 25;
    this.now = options.now ?? Date.now;
  }

  enqueue(id: string, payload: T): void {
    this.pending.set(id, { id, payload, enqueuedAt: this.now() });
    this.scheduleFlush();
  }

  pendingCount(): number {
    return this.pending.size;
  }

  list(): AutosavePayload<T>[] {
    return Array.from(this.pending.values()).sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  }

  onQuotaExceeded(handler: (error: unknown) => void): void {
    this.quotaExceededHandler = handler;
  }

  /**
   * Drain the queue to the persistent store. Idempotent — calling it
   * again while a flush is in progress is a no-op.
   */
  async flush(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.inflight || this.pending.size === 0) return;
    this.inflight = true;
    try {
      const batch = Array.from(this.pending.values()).slice(0, this.batchSize);
      for (const entry of batch) {
        await this.store.put(entry as AutosavePayload<unknown>);
        this.pending.delete(entry.id);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'QuotaExceededError' || error.message.includes('quota'))
      ) {
        this.quotaExceededHandler?.(error);
      } else {
        throw error;
      }
    } finally {
      this.inflight = false;
      if (this.pending.size > 0) this.scheduleFlush();
    }
  }

  /**
   * Used by Phase 03 to repopulate the queue after a page reload. Loads
   * everything from the persistent store and treats each entry as a
   * pending edit.
   */
  async rehydrate(): Promise<void> {
    const stored = await this.store.list();
    for (const entry of stored) {
      this.pending.set(entry.id, entry as AutosavePayload<T>);
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.debounceMs);
  }
}
