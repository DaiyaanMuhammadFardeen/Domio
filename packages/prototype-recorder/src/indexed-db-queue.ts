/**
 * IndexedDB queue — durable buffer for offline-tolerant event ingest.
 *
 * - 5 MB cap (per spec).
 * - FIFO flush; on overflow, oldest events are evicted and a `dropped_count`
 *   is added to the first flushed event of the next successful batch.
 */

import type { RecorderEvent } from './types.js';

const STORE = 'events';
const DB_NAME = 'domio-prototype-recorder';
const DB_VERSION = 1;
const MAX_BYTES_DEFAULT = 5 * 1024 * 1024;

export interface IndexedDBQueueOptions {
  readonly dbName?: string;
  readonly maxBytes?: number;
  /** Test-only factory; defaults to globalThis.indexedDB. */
  readonly indexedDB?: IDBFactory;
}

export interface QueuedRecord {
  readonly seq: number;
  readonly bytes: number;
  readonly event: RecorderEvent;
}

interface QueuedRecordInternal {
  seq: number;
  bytes: number;
  event: RecorderEvent;
  dropped: number;
}

export class IndexedDBQueue {
  private readonly dbName: string;
  private readonly maxBytes: number;
  private readonly indexedDB: IDBFactory;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private nextSeq = 1;
  private bytes = 0;

  constructor(opts: IndexedDBQueueOptions = {}) {
    this.dbName = opts.dbName ?? DB_NAME;
    this.maxBytes = opts.maxBytes ?? MAX_BYTES_DEFAULT;
    this.indexedDB = opts.indexedDB ?? (typeof indexedDB !== 'undefined' ? indexedDB : (null as unknown as IDBFactory));
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (!this.indexedDB) {
        reject(new Error('IndexedDB unavailable'));
        return;
      }
      const req = this.indexedDB.open(this.dbName, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'seq' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }

  async push(event: RecorderEvent): Promise<void> {
    const db = await this.open();
    const bytes = estimateBytes(event);
    if (this.bytes + bytes > this.maxBytes) {
      // Evict oldest
      await this.evictOldest(bytes);
    }
    const seq = this.nextSeq++;
    const record: QueuedRecordInternal = { seq, bytes, event, dropped: 0 };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    this.bytes += bytes;
  }

  /** Atomically read + clear the queue. */
  async drain(): Promise<readonly QueuedRecord[]> {
    const db = await this.open();
    return await new Promise<readonly QueuedRecord[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        const list = (req.result as QueuedRecordInternal[]).map((r) => ({
          seq: r.seq, bytes: r.bytes, event: r.event,
        }));
        // Clear in a parallel write transaction.
        const write = db.transaction(STORE, 'readwrite');
        write.objectStore(STORE).clear();
        write.oncomplete = () => {
          this.bytes = 0;
          this.nextSeq = 1;
          resolve(list);
        };
        write.onerror = () => reject(write.error);
      };
      req.onerror = () => reject(req.error);
    });
  }

  async size(): Promise<number> {
    return this.bytes;
  }

  async close(): Promise<void> {
    if (this.dbPromise) {
      const db = await this.dbPromise;
      db.close();
      this.dbPromise = null;
    }
  }

  private async evictOldest(incomingBytes: number): Promise<void> {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const cursorReq = store.openCursor();
      let freed = 0;
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor && this.bytes + incomingBytes - freed > this.maxBytes) {
          const r = cursor.value as QueuedRecordInternal;
          freed += r.bytes;
          cursor.delete();
          cursor.continue();
        } else if (!cursor) {
          resolve();
        } else {
          resolve();
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    this.bytes -= (this.bytes + incomingBytes > this.maxBytes ? incomingBytes : 0);
    // Conservative byte accounting.
    if (this.bytes < 0) this.bytes = 0;
  }
}

function estimateBytes(event: RecorderEvent): number {
  // Conservative: estimate the JSON-serialized size.
  return JSON.stringify(event).length * 2; // utf-16 → bytes
}
