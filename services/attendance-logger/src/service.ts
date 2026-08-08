/**
 * @domio/attendance-logger — orchestration service.
 *
 * Phase 16 W9. Joins and leaves flow through `recordJoin`/`recordLeave`.
 * The service publishes lifecycle events to `realtime.session.{id}.lifecycle`
 * so the recap and SCORM packager can react.
 */

import type { EdgeBus } from '@domio/edge-pubsub';
import { encode } from '@domio/edge-pubsub';
import type { AttendanceRecord, AttendanceSummary } from './types.js';
import { InMemoryAttendanceStore, type AppendInput } from './store.js';
import { verifyChain } from './chain.js';

export interface AttendanceLoggerOptions {
  readonly bus: EdgeBus;
  readonly store?: InMemoryAttendanceStore;
  readonly id_factory?: () => string;
  readonly now_ms?: () => number;
}

export class AttendanceLogger {
  private readonly bus: EdgeBus;
  private readonly store: InMemoryAttendanceStore;
  private readonly id_factory: () => string;
  private readonly now_ms: () => number;

  constructor(opts: AttendanceLoggerOptions) {
    this.bus = opts.bus;
    this.store = opts.store ?? new InMemoryAttendanceStore();
    this.id_factory = opts.id_factory ?? (() => cryptoRandomId());
    this.now_ms = opts.now_ms ?? (() => Date.now());
  }

  async recordJoin(input: { workspace_id: string; session_id: string; participant_id: string; joined_at_ms?: number }): Promise<AttendanceRecord> {
    const joined = input.joined_at_ms ?? this.now_ms();
    const record = await this.store.append({
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      participant_id: input.participant_id,
      joined_at_ms: joined,
      scorm_4ed_compliant: true,
      id_factory: this.id_factory,
    });
    await this.bus.publish({
      session_id: input.session_id,
      topic: 'lifecycle',
      payload: encode({ kind: 'attendance_joined', participant_id: input.participant_id, at_ms: joined }),
    });
    return record;
  }

  async recordLeave(input: { workspace_id: string; session_id: string; participant_id: string; left_at_ms?: number }): Promise<AttendanceRecord> {
    const left = input.left_at_ms ?? this.now_ms();
    const existing = await this.store.has({
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      participant_id: input.participant_id,
    });
    if (!existing) {
      // Synthesize a join-then-leave so the chain still advances.
      return this.store.append({
        workspace_id: input.workspace_id,
        session_id: input.session_id,
        participant_id: input.participant_id,
        joined_at_ms: left - 1,
        left_at_ms: left,
        scorm_4ed_compliant: true,
        id_factory: this.id_factory,
      });
    }
    const list = await this.store.list({ workspace_id: input.workspace_id, session_id: input.session_id });
    const prior = list.find((r) => r.participant_id === input.participant_id);
    const append: AppendInput = {
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      participant_id: input.participant_id,
      joined_at_ms: prior?.joined_at_ms ?? left,
      left_at_ms: left,
      scorm_4ed_compliant: true,
      id_factory: this.id_factory,
    };
    const record = await this.store.append(append);
    await this.bus.publish({
      session_id: input.session_id,
      topic: 'lifecycle',
      payload: encode({ kind: 'attendance_left', participant_id: input.participant_id, at_ms: left }),
    });
    return record;
  }

  async verify(input: { workspace_id: string; session_id: string }): Promise<{ intact: boolean; broken_at_seq: number | null }> {
    const list = await this.store.list(input);
    return verifyChain(list);
  }

  async summary(input: { workspace_id: string; session_id: string }): Promise<AttendanceSummary> {
    const list = await this.store.list(input);
    const unique = new Set(list.map((r) => r.participant_id));
    const total_duration_ms = list.reduce((acc, r) => acc + (r.duration_ms ?? 0), 0);
    const closed = list.filter((r) => r.duration_ms !== null);
    const avg_duration_ms = closed.length === 0 ? 0 : Math.round(total_duration_ms / closed.length);
    const v = verifyChain(list);
    return {
      workspace_id: input.workspace_id,
      session_id: input.session_id,
      unique_participants: unique.size,
      total_duration_ms,
      avg_duration_ms,
      chain_intact: v.intact,
      broken_at_seq: v.broken_at_seq,
    };
  }
}

function cryptoRandomId(): string {
  const g: typeof globalThis & { crypto?: { randomUUID?: () => string } } = globalThis;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  let s = '';
  for (let i = 0; i < 32; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

void encode;
