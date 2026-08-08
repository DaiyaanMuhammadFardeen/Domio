/**
 * @domio/phone-pairing — persistence interface.
 *
 * The pairing store keeps a small row per paired phone. Reads are by
 * (session_id, device_id) or by id; writes are by id. There is no
 * query-by-workspace short-circuit because the size is bounded by the
 * number of paired phones (typically 1-3) per session.
 */

import type { PairingRecord } from '../types.js';

export interface PairingStoreError extends Error {
  readonly code: 'PAIRING_NOT_FOUND' | 'PAIRING_CONFLICT' | 'PAIRING_INVALID';
}

export function makePairingStoreError(
  code: PairingStoreError['code'],
  message: string,
): PairingStoreError {
  const e = new Error(message) as PairingStoreError;
  Object.defineProperty(e, 'code', { value: code, writable: false, enumerable: true });
  return e;
}

export function isPairingStore(value: unknown): value is PairingStore {
  return !!value && typeof (value as PairingStore).create === 'function'
    && typeof (value as PairingStore).getBySessionDevice === 'function';
}

export interface PairingStore {
  create(record: PairingRecord): Promise<PairingRecord>;
  getById(id: string): Promise<PairingRecord | null>;
  getBySessionDevice(session_id: string, device_id: string): Promise<PairingRecord | null>;
  listBySession(session_id: string): Promise<PairingRecord[]>;
  update(id: string, patch: Partial<PairingRecord>): Promise<PairingRecord>;
  delete(id: string): Promise<void>;
}