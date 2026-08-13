/**
 * @domio/participant-session — store interface.
 *
 * Phase 16 W1. The production store is Postgres (`pg_store.ts`); the
 * in-memory implementation lives in `mem_store.ts` and is what the
 * boot tests + service tests use.
 */

import type {
  JoinInput,
  ListActiveInput,
  ListActiveResult,
  ParticipantSession,
  RateBucket,
} from '../types.js';

export interface StoreError {
  readonly kind: 'conflict' | 'not_found' | 'invalid' | 'internal';
  readonly message: string;
  /** When kind === 'conflict', the current row (post-refresh). */
  readonly current?: ParticipantSession;
}

export interface CreateParticipantInput {
  readonly session: ParticipantSession;
}

export interface UpdateParticipantInput {
  readonly expected_version: number;
  readonly next: ParticipantSession;
}

export interface ParticipantSessionStore {
  create(input: CreateParticipantInput): Promise<ParticipantSession>;
  /** Linearisable read by primary id. */
  getById(id: string): Promise<ParticipantSession | null>;
  /** Read by (session_code, participant_id). */
  getBySessionCodeAndParticipant(
    session_code: string,
    participant_id: string,
  ): Promise<ParticipantSession | null>;
  /** Optimistic-concurrency update. */
  update(input: UpdateParticipantInput): Promise<ParticipantSession>;
  /** Soft-delete by transitioning the state. */
  transition(input: {
    expected_version: number;
    next: ParticipantSession;
  }): Promise<ParticipantSession>;
  listActive(input: ListActiveInput): Promise<ListActiveResult>;
}

/** Type-guard used by the service constructor. */
export function isStore(value: unknown): value is ParticipantSessionStore {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v['create'] === 'function' &&
    typeof v['getById'] === 'function' &&
    typeof v['update'] === 'function' &&
    typeof v['transition'] === 'function' &&
    typeof v['listActive'] === 'function'
  );
}

export function defaultRateBucket(nowMs: number): RateBucket {
  return {
    tokens: 20,
    refill_per_s: 4,
    capacity: 20,
    last_refill_ms: nowMs,
  };
}

export type { JoinInput, ListActiveInput, ListActiveResult, ParticipantSession, RateBucket };
