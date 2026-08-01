/**
 * IndexedDB persistence provider for Yjs sub-docs.
 *
 * The module defines an injectable `KeyValueStore` interface so that
 * production code can target IndexedDB while tests swap in a plain
 * `Map`-backed in-memory store.
 *
 * ## Storage format
 *
 * Each sub-doc key maps to an **append-log** of update chunks.  A ring
 * buffer trims the oldest chunks when the count exceeds `slideOpRingBuffer`
 * (default 5 000).  Each chunk is stored as a JSON envelope:
 *
 * ```json
 * { "kind": "chunk", "idx": 0, "data": "<base64>" }
 * ```
 *
 * `data` is a base64-encoded `Uint8Array` produced by `Y.encodeStateAsUpdate`
 * or an individual incremental update.  The index is monotonically increasing
 * so that `loadAll` can sort chunks deterministically before merging.
 */

import * as Y from 'yjs';

// ----- Injectable storage interface -----

/** Minimal key-value store abstraction. */
export interface KeyValueStore {
  get(key: string): Promise<Uint8Array | null>;
  set(key: string, value: Uint8Array): Promise<void>;
  delete(key: string): Promise<void>;
  keys(): Promise<string[]>;
  /** Optional: return total bytes consumed (used by quota warnings). */
  quotaUsedBytes?(): Promise<number>;
}

// ----- IndexedDB store (browser only) -----

/** Stored envelope shape. */
interface ChunkEnvelope {
  kind: 'chunk';
  idx: number;
  data: string; // base64-encoded Uint8Array
}

/** Encode Uint8Array → base64 string. */
function toBase64(bytes: Uint8Array): string {
  // Works in Node 16+ and all modern browsers.
  if (typeof globalThis.Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  // Browser fallback
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/** Decode base64 string → Uint8Array. */
function fromBase64(b64: string): Uint8Array {
  if (typeof globalThis.Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Create a `KeyValueStore` backed by the browser's IndexedDB.
 *
 * Throws a clear error if `globalThis.indexedDB` is unavailable (e.g. in
 * Node without a polyfill) — use the in-memory store for tests.
 */
export function createIndexedDBStore(
  dbName = 'domio/yjs',
  storeName = 'updates',
): KeyValueStore {
  const idbFactory = (globalThis as Record<string, unknown>)['indexedDB'] as
    | IDBFactory
    | undefined;
  if (!idbFactory) {
    throw new Error(
      'createIndexedDBStore: globalThis.indexedDB is not available. ' +
        'Use createMemoryStore() for Node/test environments.',
    );
  }

  function openDB(): Promise<IDBDatabase> {
    const idb: IDBFactory = idbFactory!;
    return new Promise((resolve, reject) => {
      const req = idb.open(dbName, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(storeName);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function withStore<R>(
    mode: IDBTransactionMode,
    fn: (store: IDBObjectStore) => IDBRequest<R>,
  ): Promise<R> {
    const db = await openDB();
    return new Promise<R>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const req = fn(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  return {
    async get(key: string): Promise<Uint8Array | null> {
      const raw = await withStore('readonly', (s) => s.get(key));
      return raw ?? null;
    },
    async set(key: string, value: Uint8Array): Promise<void> {
      await withStore('readwrite', (s) => s.put(value, key));
    },
    async delete(key: string): Promise<void> {
      await withStore('readwrite', (s) => s.delete(key));
    },
    async keys(): Promise<string[]> {
      const all = await withStore('readonly', (s) => s.getAllKeys());
      return all as string[];
    },
  };
}

// ----- In-memory store (for tests) -----

/** Create a simple in-memory `KeyValueStore` for testing. */
export function createMemoryStore(): KeyValueStore {
  const data = new Map<string, Uint8Array>();
  let usedBytes = 0;

  return {
    async get(key: string): Promise<Uint8Array | null> {
      const v = data.get(key);
      return v !== undefined ? v : null;
    },
    async set(key: string, value: Uint8Array): Promise<void> {
      const prev = data.get(key);
      if (prev) usedBytes -= prev.length;
      data.set(key, value);
      usedBytes += value.length;
    },
    async delete(key: string): Promise<void> {
      const prev = data.get(key);
      if (prev) usedBytes -= prev.length;
      data.delete(key);
    },
    async keys(): Promise<string[]> {
      return Array.from(data.keys());
    },
    async quotaUsedBytes(): Promise<number> {
      return usedBytes;
    },
  };
}

// ----- Persistence provider -----

/** Options for `PersistenceProvider`. */
export interface PersistenceOpts {
  /**
   * Maximum number of update chunks kept per sub-doc key.
   * Older chunks are evicted when the count exceeds this value.
   * @default 5000
   */
  slideOpRingBuffer?: number;
  /** Called when quota usage exceeds the threshold. */
  onQuotaWarning?: (usedBytes: number, ratio: number) => void;
}

/** Write-through persistence with ring-buffer eviction. */
export class PersistenceProvider {
  private readonly store: KeyValueStore;
  private readonly ringBufferSize: number;
  private readonly onQuotaWarning: ((usedBytes: number, ratio: number) => void) | undefined;

  constructor(store: KeyValueStore, opts?: PersistenceOpts) {
    this.store = store;
    this.ringBufferSize = opts?.slideOpRingBuffer ?? 5000;
    this.onQuotaWarning = opts?.onQuotaWarning;
  }

  /**
   * Persist an update chunk for `subDocKey`.
   *
   * The chunk is appended to the existing log for the key.  If the total
   * chunk count exceeds `ringBufferSize`, the oldest chunks are removed.
   */
  async persistSubDocUpdate(subDocKey: string, update: Uint8Array): Promise<void> {
    const existing = await this.store.get(subDocKey);
    let envelopes: ChunkEnvelope[] = [];

    if (existing) {
      try {
        const json = new TextDecoder().decode(existing);
        envelopes = JSON.parse(json) as ChunkEnvelope[];
      } catch {
        envelopes = [];
      }
    }

    const nextIdx = envelopes.length > 0
      ? (envelopes[envelopes.length - 1]!.idx + 1)
      : 0;

    envelopes.push({ kind: 'chunk', idx: nextIdx, data: toBase64(update) });

    // Ring-buffer trim: keep only the last N chunks.
    if (envelopes.length > this.ringBufferSize) {
      envelopes = envelopes.slice(envelopes.length - this.ringBufferSize);
    }

    const encoded = new TextEncoder().encode(JSON.stringify(envelopes));
    await this.store.set(subDocKey, encoded);
  }

  /**
   * Load and merge all persisted updates for `subDocKey`.
   *
   * Returns an empty array if nothing has been persisted for this key.
   */
  async loadAll(subDocKey: string): Promise<Uint8Array[]> {
    const raw = await this.store.get(subDocKey);
    if (!raw) return [];

    try {
      const json = new TextDecoder().decode(raw);
      const envelopes = JSON.parse(json) as ChunkEnvelope[];
      // Sort by idx for deterministic merge order.
      envelopes.sort((a, b) => a.idx - b.idx);
      return envelopes.map((e) => fromBase64(e.data));
    } catch {
      return [];
    }
  }

  /** Clear all persisted data, or just one sub-doc key. */
  async clear(subDocKey?: string): Promise<void> {
    if (subDocKey !== undefined) {
      await this.store.delete(subDocKey);
    } else {
      const allKeys = await this.store.keys();
      for (const k of allKeys) {
        await this.store.delete(k);
      }
    }
  }

  /**
   * Check quota usage and fire `onQuotaWarning` if it exceeds `thresholdRatio`.
   *
   * No-op if `store.quotaUsedBytes` is not implemented.
   */
  async warnOnQuota(thresholdRatio = 0.8): Promise<void> {
    if (!this.store.quotaUsedBytes || !this.onQuotaWarning) return;

    const used = await this.store.quotaUsedBytes();
    // We don't know the total quota, so we treat the first call as a
    // baseline and use a heuristic: warn if used exceeds 50 MB * threshold.
    // In production the IndexedDB adapter would report real quota numbers.
    const heuristicQuota = 50 * 1024 * 1024; // 50 MB
    const ratio = used / heuristicQuota;

    if (ratio > thresholdRatio) {
      this.onQuotaWarning(used, ratio);
    }
  }
}

// ----- Chunk merge helper -----

/**
 * Merge an array of incremental Yjs update chunks into a single update.
 *
 * This is a thin wrapper around `Y.mergeUpdates` provided for convenience
 * and to keep the Yjs import surface small in downstream modules.
 */
export function mergeChunks(updates: Uint8Array[]): Uint8Array {
  if (updates.length === 0) return new Uint8Array(0);
  return Y.mergeUpdates(updates);
}
