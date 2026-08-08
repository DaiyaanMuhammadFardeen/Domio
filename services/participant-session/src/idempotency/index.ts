/**
 * @domio/participant-session — idempotency store.
 *
 * Phase 16 W1. Replay-safe dedup for the audience join/leave
 * mutations. Mirrors the interface in
 * `services/presenter-session/src/idempotency/index.ts`.
 */

import type { ParticipantSession } from '../types.js';

export interface IdempotencyEntry {
  readonly key: string;
  readonly workspace_id: string;
  readonly session_id: string;
  readonly response: ParticipantSession;
  readonly recorded_at_ms: number;
  readonly ttl_ms: number;
}

export interface IdempotencyReservation {
  readonly exists: boolean;
  readonly prior?: IdempotencyEntry;
}

export interface IdempotencyStore {
  get(key: string, workspace_id: string, session_id: string): Promise<IdempotencyEntry | null>;
  reserve(input: Omit<IdempotencyEntry, 'response'>): Promise<IdempotencyReservation>;
  commit(input: IdempotencyEntry): Promise<void>;
  prune(now_ms: number): Promise<number>;
}

export class NullIdempotencyStore implements IdempotencyStore {
  async get(): Promise<IdempotencyEntry | null> { return null; }
  async reserve(): Promise<IdempotencyReservation> { return { exists: false }; }
  async commit(): Promise<void> { /* noop */ }
  async prune(): Promise<number> { return 0; }
}

export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, IdempotencyEntry>();
  constructor(private readonly defaultTtlMs = 24 * 60 * 60 * 1000) {}

  private keyOf(k: string, w: string, s: string): string { return `${w}|${s}|${k}`; }

  async get(key: string, workspace_id: string, session_id: string): Promise<IdempotencyEntry | null> {
    const k = this.keyOf(key, workspace_id, session_id);
    const e = this.entries.get(k);
    if (!e) return null;
    if (Date.now() - e.recorded_at_ms > e.ttl_ms) {
      this.entries.delete(k);
      return null;
    }
    return e;
  }

  async reserve(input: Omit<IdempotencyEntry, 'response'>): Promise<IdempotencyReservation> {
    const k = this.keyOf(input.key, input.workspace_id, input.session_id);
    const e = this.entries.get(k);
    if (e && Date.now() - e.recorded_at_ms <= e.ttl_ms) {
      return { exists: true, prior: e };
    }
    // Reserve by inserting a placeholder with a synthesized response.
    const placeholder: IdempotencyEntry = {
      ...input,
      response: {} as ParticipantSession,
      recorded_at_ms: Date.now(),
      ttl_ms: input.ttl_ms ?? this.defaultTtlMs,
    };
    this.entries.set(k, placeholder);
    return { exists: false };
  }

  async commit(input: IdempotencyEntry): Promise<void> {
    const k = this.keyOf(input.key, input.workspace_id, input.session_id);
    this.entries.set(k, input);
  }

  async prune(now_ms: number): Promise<number> {
    let n = 0;
    for (const [k, e] of this.entries) {
      if (now_ms - e.recorded_at_ms > e.ttl_ms) {
        this.entries.delete(k);
        n += 1;
      }
    }
    return n;
  }
}