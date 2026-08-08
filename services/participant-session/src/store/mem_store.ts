/**
 * @domio/participant-session — in-memory store.
 *
 * Used by boot tests + the service unit tests. Mirrors the optimistic
 * concurrency semantics of the Postgres store: `update` and
 * `transition` throw {@link StoreError} with `kind: 'conflict'` when
 * `expected_version` doesn't match.
 */

import type {
  CreateParticipantInput,
  ParticipantSessionStore,
  StoreError,
  UpdateParticipantInput,
} from './store.js';
import type {
  ListActiveInput,
  ListActiveResult,
  ParticipantSession,
} from '../types.js';

class StoreConflictError extends Error {
  readonly kind: 'conflict' = 'conflict';
  readonly current: ParticipantSession;
  constructor(current: ParticipantSession) {
    super(`version conflict (expected=${current.version})`);
    this.current = current;
  }
}

class StoreNotFoundError extends Error {
  readonly kind: 'not_found' = 'not_found';
  readonly id: string;
  constructor(id: string) {
    super(`participant ${id} not found`);
    this.id = id;
  }
}

export class InMemoryParticipantSessionStore implements ParticipantSessionStore {
  private readonly rows = new Map<string, ParticipantSession>();
  private readonly byCode = new Map<string, string>(); // session_code + participant_id → id

  async create(input: CreateParticipantInput): Promise<ParticipantSession> {
    const s = input.session;
    const key = `${s.session_code}|${s.participant_id}`;
    if (this.rows.has(s.id) || this.byCode.has(key)) {
      throw new Error(`duplicate participant ${s.id} or ${key}`);
    }
    this.rows.set(s.id, s);
    this.byCode.set(key, s.id);
    return s;
  }

  async getById(id: string): Promise<ParticipantSession | null> {
    return this.rows.get(id) ?? null;
  }

  async getBySessionCodeAndParticipant(
    session_code: string,
    participant_id: string,
  ): Promise<ParticipantSession | null> {
    const id = this.byCode.get(`${session_code}|${participant_id}`);
    if (!id) return null;
    return this.rows.get(id) ?? null;
  }

  async update(input: UpdateParticipantInput): Promise<ParticipantSession> {
    const current = this.rows.get(input.next.id);
    if (!current) throw new StoreNotFoundError(input.next.id);
    if (current.version !== input.expected_version) {
      throw new StoreConflictError(current);
    }
    this.rows.set(current.id, input.next);
    return input.next;
  }

  async transition(input: { expected_version: number; next: ParticipantSession }): Promise<ParticipantSession> {
    const current = this.rows.get(input.next.id);
    if (!current) throw new StoreNotFoundError(input.next.id);
    if (current.version !== input.expected_version) {
      throw new StoreConflictError(current);
    }
    this.rows.set(current.id, input.next);
    return input.next;
  }

  async listActive(input: ListActiveInput): Promise<ListActiveResult> {
    const limit = input.limit ?? 100;
    const items: ParticipantSession[] = [];
    for (const row of this.rows.values()) {
      if (row.workspace_id !== input.workspace_id) continue;
      if (input.session_id && row.session_id !== input.session_id) continue;
      if (input.since_ms !== undefined) {
        const joinedAt = new Date(row.joined_at).getTime();
        if (joinedAt < input.since_ms) continue;
      }
      if (row.state === 'left' || row.state === 'reaped' || row.state === 'kicked') continue;
      items.push(row);
    }
    items.sort((a, b) => a.joined_at.localeCompare(b.joined_at));
    const sliced = items.slice(0, limit);
    const nextCursor = items.length > limit ? sliced[sliced.length - 1]?.id ?? null : null;
    return { items: sliced, next_cursor: nextCursor };
  }
}

export function asStoreError(e: unknown): StoreError {
  if (e instanceof StoreConflictError) {
    return { kind: 'conflict', message: e.message, current: e.current };
  }
  if (e instanceof StoreNotFoundError) {
    return { kind: 'not_found', message: e.message };
  }
  return { kind: 'internal', message: (e as Error).message };
}