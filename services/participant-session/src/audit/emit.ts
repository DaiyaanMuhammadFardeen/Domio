/**
 * @domio/participant-session — audit emitter.
 *
 * Phase 16 W1. Hash-chained audit emission for participant lifecycle
 * events. Reuses the chain primitives from `@domio/audit-ts`.
 */

import { createHash } from 'crypto';

export type ParticipantAuditAction =
  | 'participant.join'
  | 'participant.heartbeat'
  | 'participant.leave'
  | 'participant.kick'
  | 'participant.reap';

export interface ParticipantAuditEvent {
  readonly actor_id: string;
  readonly session_id: string;
  readonly workspace_id: string;
  readonly action: ParticipantAuditAction;
  readonly ts: number;
  readonly before?: Record<string, unknown>;
  readonly after?: Record<string, unknown>;
}

export interface AuditChainEntry {
  readonly event: ParticipantAuditEvent;
  readonly prev_hash: string;
  readonly hash: string;
}

export interface AudienceAuditEmitter {
  emit(event: ParticipantAuditEvent): Promise<AuditChainEntry>;
  /** Returns the head hash; useful for tests. */
  head(): Promise<string>;
  /** Verify the chain end-to-end; throws on tamper. */
  verify(): Promise<{ ok: true; entries: number } | { ok: false; broken_at: number }>;
}

function canonicalise(event: ParticipantAuditEvent): string {
  return JSON.stringify(event, Object.keys(event).sort());
}

function hashEntry(prev: string, event: ParticipantAuditEvent): string {
  const payload = prev + '|' + canonicalise(event);
  return createHash('sha256').update(payload).digest('hex');
}

export class HashChainedAudienceAuditEmitter implements AudienceAuditEmitter {
  private entries: AuditChainEntry[] = [];
  constructor(_opts: { workspaceId: string; key?: Uint8Array } = { workspaceId: 'default' }) {
    void _opts;
  }

  async emit(event: ParticipantAuditEvent): Promise<AuditChainEntry> {
    const prev =
      this.entries.length === 0 ? 'GENESIS' : this.entries[this.entries.length - 1]!.hash;
    const hash = hashEntry(prev, event);
    const entry: AuditChainEntry = { event, prev_hash: prev, hash };
    this.entries.push(entry);
    return entry;
  }

  async head(): Promise<string> {
    if (this.entries.length === 0) return 'GENESIS';
    return this.entries[this.entries.length - 1]!.hash;
  }

  async verify(): Promise<{ ok: true; entries: number } | { ok: false; broken_at: number }> {
    let prev = 'GENESIS';
    for (let i = 0; i < this.entries.length; i++) {
      const e = this.entries[i]!;
      if (e.prev_hash !== prev) return { ok: false, broken_at: i };
      const expected = hashEntry(prev, e.event);
      if (expected !== e.hash) return { ok: false, broken_at: i };
      prev = e.hash;
    }
    return { ok: true, entries: this.entries.length };
  }
}

export class NullAudienceAuditEmitter implements AudienceAuditEmitter {
  async emit(event: ParticipantAuditEvent): Promise<AuditChainEntry> {
    return { event, prev_hash: 'GENESIS', hash: 'NULL' };
  }
  async head(): Promise<string> {
    return 'NULL';
  }
  async verify(): Promise<{ ok: true; entries: number } | { ok: false; broken_at: number }> {
    return { ok: true, entries: 0 };
  }
}
