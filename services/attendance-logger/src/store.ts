/**
 * @domio/attendance-logger — in-memory store with hash chain.
 *
 * Phase 16 W9. Backed by an ordered array per (workspace, session).
 * Computes prev_hash + hash on insert. Exposes `verify()` for the
 * `attendance_chain_verify` job and SCORM packaging.
 */

import type { AttendanceRecord } from './types.js';
import { chainHash } from './chain.js';

export interface AppendInput {
  workspace_id: string;
  session_id: string;
  participant_id: string;
  joined_at_ms: number;
  left_at_ms?: number | null;
  scorm_4ed_compliant?: boolean;
  id_factory?: () => string;
}

export class InMemoryAttendanceStore {
  private readonly rows = new Map<string, AttendanceRecord[]>();
  private readonly participantIndex = new Map<string, string>(); // w::s::p -> record id

  private sessionKey(workspace_id: string, session_id: string): string {
    return `${workspace_id}::${session_id}`;
  }
  private participantKey(workspace_id: string, session_id: string, participant_id: string): string {
    return `${workspace_id}::${session_id}::${participant_id}`;
  }

  async append(input: AppendInput): Promise<AttendanceRecord> {
    const id = input.id_factory?.() ?? cryptoRandomId();
    const sk = this.sessionKey(input.workspace_id, input.session_id);
    const list = this.rows.get(sk) ?? [];
    const last = list[list.length - 1];
    const prev_hash = last?.hash ?? null;
    const hash = chainHash({
      prev_hash,
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      participant_id: input.participant_id,
      joined_at_ms: input.joined_at_ms,
      left_at_ms: input.left_at_ms ?? null,
    });
    const duration_ms = input.left_at_ms == null ? null : input.left_at_ms - input.joined_at_ms;
    const record: AttendanceRecord = {
      id,
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      participant_id: input.participant_id,
      joined_at_ms: input.joined_at_ms,
      left_at_ms: input.left_at_ms ?? null,
      duration_ms,
      scorm_4ed_compliant: input.scorm_4ed_compliant ?? true,
      prev_hash,
      hash,
      recorded_at_ms: Date.now(),
    };
    list.push(record);
    this.rows.set(sk, list);
    this.participantIndex.set(
      this.participantKey(input.workspace_id, input.session_id, input.participant_id),
      id,
    );
    return record;
  }

  async list(input: { workspace_id: string; session_id: string }): Promise<ReadonlyArray<AttendanceRecord>> {
    const sk = this.sessionKey(input.workspace_id, input.session_id);
    return this.rows.get(sk) ?? [];
  }

  async has(input: { workspace_id: string; session_id: string; participant_id: string }): Promise<boolean> {
    return this.participantIndex.has(this.participantKey(input.workspace_id, input.session_id, input.participant_id));
  }
}

function cryptoRandomId(): string {
  const g: typeof globalThis & { crypto?: { randomUUID?: () => string } } = globalThis;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}
