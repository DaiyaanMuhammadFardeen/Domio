'use client';

/**
 * OfflineCache — IndexedDB-backed snapshot store + replay queue.
 *
 * Phase 15 W13. Used by the presenter runtime to:
 *   1. Persist the last 50 slide snapshots per session.
 *   2. Buffer mutations while offline; flush on reconnect.
 *
 * Server is authoritative on reconnect: when the network returns, the
 * next GET returns fresh state and the runtime refetches. Buffered
 * mutations are re-posted in order with idempotency keys; duplicates
 * (matching idempotency keys) are dropped by the server.
 *
 * The IndexedDB usage is intentionally minimal — schema is `sessions`
 * and `mutations`, both keyed by `session_id`. No migrations; schema
 * can evolve freely while the cache only ever holds ephemeral data.
 */

export interface CachedSnapshot {
  session_id: string;
  captured_at_ms: number;
  payload: unknown;
}

export interface BufferedMutation {
  id: string;
  session_id: string;
  endpoint: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  body: unknown;
  idempotency_key: string;
  queued_at_ms: number;
  attempts: number;
}

const DB_NAME = 'domio-presenter';
const DB_VERSION = 1;
const SESSIONS_STORE = 'sessions';
const MUTATIONS_STORE = 'mutations';
const MAX_SNAPSHOTS = 50;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: 'session_id' });
      }
      if (!db.objectStoreNames.contains(MUTATIONS_STORE)) {
        db.createObjectStore(MUTATIONS_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(storeName: string, mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    Promise.resolve(fn(store)).then(
      (value) => {
        tx.oncomplete = () => resolve(value);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      },
      (err) => {
        reject(err);
      },
    );
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class OfflineCache {
  async saveSnapshot(snapshot: CachedSnapshot): Promise<void> {
    await withStore(SESSIONS_STORE, 'readwrite', async (store) => {
      await reqToPromise(store.put(snapshot));
    });
  }

  async loadSnapshot(sessionId: string): Promise<CachedSnapshot | null> {
    return withStore(SESSIONS_STORE, 'readonly', async (store) => {
      const result = await reqToPromise<CachedSnapshot | undefined>(store.get(sessionId));
      return result ?? null;
    });
  }

  async listSnapshots(): Promise<CachedSnapshot[]> {
    return withStore(SESSIONS_STORE, 'readonly', async (store) => {
      return reqToPromise<CachedSnapshot[]>(store.getAll());
    });
  }

  /** Trim the snapshot store to `maxEntries` (LRU by captured_at_ms). */
  async trim(maxEntries: number = MAX_SNAPSHOTS): Promise<void> {
    const all = await this.listSnapshots();
    if (all.length <= maxEntries) return;
    const sorted = [...all].sort((a, b) => b.captured_at_ms - a.captured_at_ms);
    const keep = new Set(sorted.slice(0, maxEntries).map((s) => s.session_id));
    for (const s of all) {
      if (!keep.has(s.session_id)) {
        await withStore(SESSIONS_STORE, 'readwrite', (store) =>
          reqToPromise(store.delete(s.session_id)),
        );
      }
    }
  }

  async enqueueMutation(mutation: BufferedMutation): Promise<void> {
    await withStore(MUTATIONS_STORE, 'readwrite', async (store) => {
      await reqToPromise(store.put(mutation));
    });
  }

  async listMutations(): Promise<BufferedMutation[]> {
    return withStore(MUTATIONS_STORE, 'readonly', async (store) => {
      return reqToPromise<BufferedMutation[]>(store.getAll());
    });
  }

  async removeMutation(id: string): Promise<void> {
    await withStore(MUTATIONS_STORE, 'readwrite', (store) => reqToPromise(store.delete(id)));
  }

  async clear(): Promise<void> {
    await withStore(SESSIONS_STORE, 'readwrite', (store) => reqToPromise(store.clear()));
    await withStore(MUTATIONS_STORE, 'readwrite', (store) => reqToPromise(store.clear()));
  }
}

/** Hook — register the service worker on mount. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined') return null;
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch (e) {
    console.warn('service worker registration failed', e);
    return null;
  }
}
