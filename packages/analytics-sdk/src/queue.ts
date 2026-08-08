/**
 * Queue stores for the batcher.
 *
 * Two implementations:
 *   * MemoryQueueStore — in-process, FIFO. Used in tests and as a
 *     fallback when IndexedDB is unavailable (Safari ITP, etc.).
 *   * IdbQueueStore — IndexedDB-backed. Default in the browser. The
 *     5 MB cap from packages/prototype-recorder carries over.
 *
 * Both implement the QueueStore interface from types.ts. The batcher
 * talks only to the interface so swapping stores is transparent.
 */

import type { QueuedEvent, QueueStore } from './types.js';

const IDB_DB_NAME = 'domio-analytics-sdk';
const IDB_STORE = 'events';
const IDB_VERSION = 1;
const MAX_BYTES_DEFAULT = 5 * 1024 * 1024;

/**
 * In-memory FIFO queue. Used in tests + server-side SDK consumers.
 */
export class MemoryQueueStore implements QueueStore {
  private readonly records: QueuedEvent[] = [];

  async enqueue(record: QueuedEvent): Promise<void> {
    this.records.push(record);
  }

  async peek(limit: number): Promise<QueuedEvent[]> {
    return this.records.slice(0, limit);
  }

  async drop(seqs: readonly number[]): Promise<void> {
    const set = new Set(seqs);
    for (let i = this.records.length - 1; i >= 0; i--) {
      const r = this.records[i];
      if (r && set.has(r.seq)) this.records.splice(i, 1);
    }
  }

  async size(): Promise<number> {
    return this.records.reduce((n, r) => n + r.bytes, 0);
  }

  async count(): Promise<number> {
    return this.records.length;
  }
}

/**
 * IndexedDB-backed durable queue.
 *
 * Schema:
 *   object store `events` keyed by `seq` (auto-increment).
 *   value: { event_id, bytes, event, dropped }.
 *
 * Capacity: 5 MB (configurable). On overflow we evict oldest events and
 * record the drop count in the next enqueued event so the dashboard can
 * surface data-loss telemetry.
 */
export class IdbQueueStore implements QueueStore {
  private readonly dbName: string;
  private readonly maxBytes: number;
  private readonly indexedDB: IDBFactory;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private cachedBytes = 0;
  private cachedCount = 0;

  constructor(opts: IdbQueueStoreOptions = {}) {
    this.dbName = opts.dbName ?? IDB_DB_NAME;
    this.maxBytes = opts.maxBytes ?? MAX_BYTES_DEFAULT;
    const globalIdb = typeof indexedDB !== 'undefined' ? indexedDB : null;
    this.indexedDB = opts.indexedDB ?? globalIdb;
    if (!this.indexedDB) {
      throw new Error('IndexedDB unavailable; pass MemoryQueueStore instead');
    }
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = this.indexedDB.open(this.dbName, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'seq', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
    });
    return this.dbPromise;
  }

  async enqueue(record: QueuedEvent): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.add({ bytes: record.bytes, event: record.event, dropped: record.dropped });
    await txDone(tx);
    this.cachedBytes += record.bytes;
    this.cachedCount += 1;
    await this.evictIfOverflow();
  }

  async peek(limit: number): Promise<QueuedEvent[]> {
    const db = await this.open();
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const records: QueuedEvent[] = [];
    await new Promise<void>((resolve, reject) => {
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || records.length >= limit) {
          resolve();
          return;
        }
        const v = cursor.value as { seq: number; bytes: number; event: unknown; dropped: number };
        records.push({ seq: v.seq, bytes: v.bytes, event: v.event as QueuedEvent['event'], dropped: v.dropped });
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error ?? new Error('IDB cursor failed'));
    });
    return records;
  }

  async drop(seqs: readonly number[]): Promise<void> {
    if (seqs.length === 0) return;
    const db = await this.open();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    for (const seq of seqs) store.delete(seq);
    await txDone(tx);
  }

  async size(): Promise<number> {
    return this.cachedBytes;
  }

  async count(): Promise<number> {
    return this.cachedCount;
  }

  private async evictIfOverflow(): Promise<void> {
    if (this.cachedBytes <= this.maxBytes) return;
    const db = await this.open();
    const overflow = this.cachedBytes - this.maxBytes;
    let evictedBytes = 0;
    let evictedCount = 0;
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    await new Promise<void>((resolve, reject) => {
      const cursorReq = store.openCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor || evictedBytes >= overflow) {
          resolve();
          return;
        }
        const v = cursor.value as { bytes: number };
        evictedBytes += v.bytes;
        evictedCount += 1;
        cursor.delete();
        cursor.continue();
      };
      cursorReq.onerror = () => reject(cursorReq.error ?? new Error('IDB evict failed'));
    });
    await txDone(tx);
    this.cachedBytes -= evictedBytes;
    this.cachedCount -= evictedCount;
  }
}

export interface IdbQueueStoreOptions {
  dbName?: string;
  maxBytes?: number;
  /** Test-only factory; defaults to globalThis.indexedDB. */
  indexedDB?: IDBFactory | null;
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IDB tx failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IDB tx aborted'));
  });
}
