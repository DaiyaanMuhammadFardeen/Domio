/**
 * @domio/presenter-session — in-memory store.
 *
 * Suitable for tests, dev, and single-process edge deployments. Persists
 * nothing across restarts. Concurrency is enforced via a per-row mutex.
 */

import {
  conflictError,
  endedError,
  notFoundError,
  type CreateSessionRow,
  type PresenterSessionStore,
  type StoreError,
  type UpdateSessionRow,
} from './store.js';
import type { PresenterSession } from '../types.js';

export class InMemoryPresenterSessionStore implements PresenterSessionStore {
  private readonly rows = new Map<string, PresenterSession>();
  private readonly locks = new Map<string, Promise<unknown>>();

  /** Async mutex — serializes reads/writes on the same id. */
  private async withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const next = new Promise<void>((r) => { release = r; });
    this.locks.set(id, prev.then(() => next));
    try {
      await prev;
      return await fn();
    } finally {
      release?.();
      if (this.locks.get(id) === prev.then(() => next)) {
        this.locks.delete(id);
      }
    }
  }

  async create(row: CreateSessionRow): Promise<PresenterSession> {
    return this.withLock(row.session.id, async () => {
      if (this.rows.has(row.session.id)) {
        throw conflictError(row.session.id, this.rows.get(row.session.id)!.version);
      }
      this.rows.set(row.session.id, row.session);
      return row.session;
    });
  }

  async getById(id: string): Promise<PresenterSession | null> {
    return this.rows.get(id) ?? null;
  }

  async getActiveByPresenter(workspaceId: string, presenterId: string): Promise<PresenterSession | null> {
    for (const row of this.rows.values()) {
      if (row.workspace_id === workspaceId && row.presenter_id === presenterId && !row.ended_at) {
        return row;
      }
    }
    return null;
  }

  async update(row: UpdateSessionRow): Promise<PresenterSession> {
    return this.withLock(row.next.id, async () => {
      const current = this.rows.get(row.next.id);
      if (!current) throw notFoundError(row.next.id);
      if (current.ended_at) throw endedError(row.next.id);
      if (current.version !== row.expected_version) {
        throw conflictError(row.next.id, current.version);
      }
      if (row.next.version !== row.expected_version + 1) {
        throw new Error(
          `update: next.version (${row.next.version}) must equal expected_version + 1 (${row.expected_version + 1})`,
        );
      }
      this.rows.set(row.next.id, row.next);
      return row.next;
    });
  }

  async end(id: string, expectedVersion: number): Promise<PresenterSession> {
    return this.withLock(id, async () => {
      const current = this.rows.get(id);
      if (!current) throw notFoundError(id);
      if (current.ended_at) throw endedError(id);
      if (current.version !== expectedVersion) {
        throw conflictError(id, current.version);
      }
      const next: PresenterSession = {
        ...current,
        ended_at: new Date().toISOString(),
        version: current.version + 1,
      };
      this.rows.set(id, next);
      return next;
    });
  }

  async listActive(workspaceId: string): Promise<PresenterSession[]> {
    return Array.from(this.rows.values()).filter(
      (r) => r.workspace_id === workspaceId && !r.ended_at,
    );
  }

  /** Test helper. */
  clear(): void {
    this.rows.clear();
    this.locks.clear();
  }

  /** Test helper — inspect internal state. */
  __rawSize(): number {
    return this.rows.size;
  }
}

export { type StoreError };