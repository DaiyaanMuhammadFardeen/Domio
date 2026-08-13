/**
 * @domio/phone-pairing — in-memory store.
 *
 * Suitable for single-process deployments (dev, tests). A Map indexed by
 * id and a secondary index by (session_id, device_id). Operations are
 * serialized via a per-key async mutex.
 */

import type { PairingRecord } from '../types.js';
import { makePairingStoreError } from './store.js';
import type { PairingStore } from './store.js';

export class InMemoryPairingStore implements PairingStore {
  private readonly byId = new Map<string, PairingRecord>();
  private readonly bySessionDevice = new Map<string, string>();
  private readonly locks = new Map<string, Promise<void>>();

  private compositeKey(sessionId: string, deviceId: string): string {
    return `${sessionId}::${deviceId}`;
  }

  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(
      key,
      prev.then(() => next),
    );
    try {
      await prev;
      return await fn();
    } finally {
      release();
    }
  }

  async create(record: PairingRecord): Promise<PairingRecord> {
    const k = this.compositeKey(record.presenter_session_id, record.device_id);
    return this.withLock(k, async () => {
      if (this.bySessionDevice.has(k)) {
        throw makePairingStoreError(
          'PAIRING_CONFLICT',
          `pairing for (${record.presenter_session_id}, ${record.device_id}) already exists`,
        );
      }
      this.byId.set(record.id, record);
      this.bySessionDevice.set(k, record.id);
      return record;
    });
  }

  async getById(id: string): Promise<PairingRecord | null> {
    return this.byId.get(id) ?? null;
  }

  async getBySessionDevice(session_id: string, device_id: string): Promise<PairingRecord | null> {
    const id = this.bySessionDevice.get(this.compositeKey(session_id, device_id));
    if (!id) return null;
    return this.byId.get(id) ?? null;
  }

  async listBySession(session_id: string): Promise<PairingRecord[]> {
    const out: PairingRecord[] = [];
    for (const r of this.byId.values()) {
      if (r.presenter_session_id === session_id) out.push(r);
    }
    return out;
  }

  async update(id: string, patch: Partial<PairingRecord>): Promise<PairingRecord> {
    const existing = this.byId.get(id);
    if (!existing) {
      throw makePairingStoreError('PAIRING_NOT_FOUND', `pairing ${id} not found`);
    }
    const next: PairingRecord = {
      ...existing,
      ...patch,
      id: existing.id,
      updated_at_ms: Date.now(),
    };
    this.byId.set(id, next);
    return next;
  }

  async delete(id: string): Promise<void> {
    const r = this.byId.get(id);
    if (!r) return;
    this.byId.delete(id);
    this.bySessionDevice.delete(this.compositeKey(r.presenter_session_id, r.device_id));
  }

  /** Test helper. */
  clear(): void {
    this.byId.clear();
    this.bySessionDevice.clear();
    this.locks.clear();
  }
}
