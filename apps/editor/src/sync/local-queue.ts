/**
 * Outbound op queue — buffers local Yjs updates as pending Ops until
 * the server acknowledges them with OpAck. Persists pending ops in
 * IndexedDB so they survive page refreshes. On reconnect, resends
 * the queue in causal order.
 *
 * Each op gets a monotonically increasing clientClock per author and
 * a ULID-shaped opId for global uniqueness.
 */

import { newToken } from '@domio/common';
import {
  Op,
  OpType,
  HLC,
} from '@domio/api-client/gen/domio/realtime/v1/realtime_pb.js';
import type { OpAck } from '@domio/api-client/gen/domio/realtime/v1/realtime_pb.js';

// ----- Pending op entry -----

export interface PendingOp {
  /** ULID-shaped unique op ID. */
  opId: string;
  deckId: string;
  branchId: string;
  slideId: string;
  /** Raw Yjs update bytes. */
  opBytes: Uint8Array;
  /** HLC timestamp for this op. */
  hlc: HLC;
  /** HLC of the op this causally depends on. */
  parentHlc: HLC | null;
  /** Monotonically increasing per-author clock. */
  clientClock: number;
  /** Op type (default YJS_UPDATE). */
  opType: OpType;
}

// ----- IndexedDB persistence for pending ops -----

const DB_NAME = 'domio/sync-queue';
const STORE_NAME = 'pending-ops';
const DB_VERSION = 1;

function openQueueDb(): Promise<IDBDatabase> {
  const idbFactory = (globalThis as Record<string, unknown>)['indexedDB'] as IDBFactory | undefined;
  if (!idbFactory) {
    throw new Error('IndexedDB not available for local queue persistence');
  }
  return new Promise((resolve, reject) => {
    const req = idbFactory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'opId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function persistPendingOps(ops: PendingOp[]): Promise<void> {
  try {
    const db = await openQueueDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    // Clear and rewrite all
    store.clear();
    for (const op of ops) {
      const record = {
        opId: op.opId,
        deckId: op.deckId,
        branchId: op.branchId,
        slideId: op.slideId,
        opBytes: Array.from(op.opBytes),
        hlc: { physical: Number(op.hlc.physical), logical: Number(op.hlc.logical) },
        parentHlc: op.parentHlc
          ? { physical: Number(op.parentHlc.physical), logical: Number(op.parentHlc.logical) }
          : null,
        clientClock: op.clientClock,
        opType: op.opType,
      };
      store.put(record);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch {
    // IndexedDB unavailable (test env) — skip persistence
  }
}

async function loadPendingOps(): Promise<PendingOp[]> {
  try {
    const db = await openQueueDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const all = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as Array<Record<string, unknown>>);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
    return all.map((r) => ({
      opId: r['opId'] as string,
      deckId: r['deckId'] as string,
      branchId: r['branchId'] as string,
      slideId: r['slideId'] as string,
      opBytes: new Uint8Array(r['opBytes'] as number[]),
      hlc: new HLC(r['hlc'] as { physical: number; logical: number }),
      parentHlc: r['parentHlc'] ? new HLC(r['parentHlc'] as { physical: number; logical: number }) : null,
      clientClock: r['clientClock'] as number,
      opType: r['opType'] as OpType,
    }));
  } catch {
    return [];
  }
}

// ----- Local op queue -----

export interface LocalQueueOptions {
  deckId: string;
  branchId?: string;
}

export class LocalQueue {
  private pending: PendingOp[] = [];
  private clientClock = 0;
  private readonly deckId: string;
  private readonly branchId: string;
  private lastHlc: HLC | null = null;

  constructor(options: LocalQueueOptions) {
    this.deckId = options.deckId;
    this.branchId = options.branchId ?? 'main';
  }

  /** Initialize — loads any persisted pending ops from IndexedDB. */
  async init(): Promise<void> {
    this.pending = await loadPendingOps();
    if (this.pending.length > 0) {
      const last = this.pending[this.pending.length - 1];
      if (last) {
        this.clientClock = last.clientClock;
        this.lastHlc = last.hlc;
      }
    }
  }

  /**
   * Enqueue a local Yjs update as a pending Op.
   * Returns the Op that should be sent to the gateway.
   */
  enqueue(params: {
    slideId: string;
    opBytes: Uint8Array;
    authorId: string;
  }): Op {
    this.clientClock++;

    const hlc = new HLC({
      physical: BigInt(Date.now()) * 1_000_000n,
      logical: BigInt(this.clientClock),
    });

    const parentHlc = this.lastHlc;
    this.lastHlc = hlc;

    const opId = newToken(16);

    const pending: PendingOp = {
      opId,
      deckId: this.deckId,
      branchId: this.branchId,
      slideId: params.slideId,
      opBytes: params.opBytes,
      hlc,
      parentHlc,
      clientClock: this.clientClock,
      opType: OpType.YJS_UPDATE,
    };

    this.pending.push(pending);
    void persistPendingOps(this.pending);

    return new Op({
      opId,
      deckId: this.deckId,
      branchId: this.branchId,
      slideId: params.slideId,
      authorId: params.authorId,
      hlc,
      parentHlc: parentHlc ?? undefined,
      payload: params.opBytes,
      clientClock: BigInt(this.clientClock),
      opType: OpType.YJS_UPDATE,
    });
  }

  /** Acknowledge an op — removes it from the pending queue. */
  acknowledge(ack: OpAck): boolean {
    const idx = this.pending.findIndex((p) => p.opId === ack.opId);
    if (idx < 0) return false;
    this.pending.splice(idx, 1);
    void persistPendingOps(this.pending);
    return true;
  }

  /** Get all pending ops (for resend on reconnect). */
  getPending(): readonly PendingOp[] {
    return this.pending;
  }

  /** Build Op messages for all pending ops (resend in causal order). */
  buildResendOps(authorId: string): Op[] {
    return this.pending.map(
      (p) =>
        new Op({
          opId: p.opId,
          deckId: p.deckId,
          branchId: p.branchId,
          slideId: p.slideId,
          authorId,
          hlc: p.hlc,
          parentHlc: p.parentHlc ?? undefined,
          payload: p.opBytes,
          clientClock: BigInt(p.clientClock),
          opType: p.opType,
        }),
    );
  }

  /** Number of pending ops. */
  get size(): number {
    return this.pending.length;
  }

  /** Clear all pending ops (e.g., after full resync). */
  clear(): void {
    this.pending = [];
    this.clientClock = 0;
    this.lastHlc = null;
    void persistPendingOps(this.pending);
  }
}
