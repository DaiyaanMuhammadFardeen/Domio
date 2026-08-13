/**
 * @domio/presenter-session — store interface.
 *
 * Persistence is pluggable. The service depends on this interface only.
 * Concrete implementations: in-memory (tests/dev) and Postgres (prod).
 */

import type { PresenterSession } from '../types.js';

export interface CreateSessionRow {
  session: PresenterSession;
}

export interface UpdateSessionRow {
  /** Bumped by 1 from `current_version`. The store enforces optimistic
   *  concurrency: if the row's current version != `expected_version`,
   *  the update fails. */
  expected_version: number;
  next: PresenterSession;
}

export interface StoreError extends Error {
  readonly code: 'NOT_FOUND' | 'CONFLICT' | 'ENDED';
}

function makeStoreError(code: StoreError['code'], message: string): StoreError {
  const e = new Error(message) as StoreError & { code: StoreError['code'] };
  Object.defineProperty(e, 'code', { value: code, writable: false, enumerable: true });
  return e;
}

export function notFoundError(id: string): StoreError {
  return makeStoreError('NOT_FOUND', `presenter_session not found: ${id}`);
}

export function conflictError(id: string, currentVersion: number): StoreError {
  return makeStoreError(
    'CONFLICT',
    `presenter_session ${id} optimistic concurrency conflict (current version ${currentVersion})`,
  );
}

export function endedError(id: string): StoreError {
  return makeStoreError('ENDED', `presenter_session ${id} has already ended`);
}

export interface PresenterSessionStore {
  create(row: CreateSessionRow): Promise<PresenterSession>;
  /** Reads by primary key. */
  getById(id: string): Promise<PresenterSession | null>;
  /** Reads by (workspace_id, presenter_id) for "active session" lookups. */
  getActiveByPresenter(workspaceId: string, presenterId: string): Promise<PresenterSession | null>;
  /** Optimistic update. Throws conflictError on version mismatch. */
  update(row: UpdateSessionRow): Promise<PresenterSession>;
  /** End a session — sets ended_at, bumps version. */
  end(id: string, expectedVersion: number): Promise<PresenterSession>;
  /** List active sessions for a workspace — used by the join coordinator. */
  listActive(workspaceId: string): Promise<PresenterSession[]>;
}

export function isStore(v: unknown): v is PresenterSessionStore {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as { create?: unknown }).create === 'function' &&
    typeof (v as { getById?: unknown }).getById === 'function' &&
    typeof (v as { update?: unknown }).update === 'function'
  );
}
