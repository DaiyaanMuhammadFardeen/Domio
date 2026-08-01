/**
 * Audit log — Phase 05 D.5.
 *
 * Every branch / checkpoint / merge commit writes one record to the
 * {@link AuditSink}.  The shape matches the Phase 19
 * `audit_events` table (`actor_id`, `action`, `target_kind`,
 * `target_id`, `metadata`), but we don't write to Postgres from this
 * module — the in-memory sink is what tests exercise, and the
 * production service reuses the same surface for an outbound NATS
 * subject (`audit.events`) that the audit-log service consumes.
 */

import type { ULID } from '@domio/schema';

export type AuditAction =
  | 'branch.create'
  | 'branch.archive'
  | 'branch.restore'
  | 'branch.checkout'
  | 'merge.commit'
  | 'merge.resolve'
  | 'checkpoint.create'
  | 'checkpoint.restore'
  | 'checkpoint.rename';

export interface AuditEvent {
  actorId: string;
  action: AuditAction;
  targetKind: 'branch' | 'merge_request' | 'checkpoint' | 'deck';
  targetId: ULID | string;
  metadata: Record<string, string | number | boolean | null>;
  timestamp: Date;
}

export interface AuditSink {
  record(event: AuditEvent): void;
}

export class InMemoryAuditSink implements AuditSink {
  private readonly events: AuditEvent[] = [];
  record(event: AuditEvent): void {
    this.events.push({ ...event, metadata: { ...event.metadata } });
  }
  list(): AuditEvent[] {
    return this.events.slice();
  }
  listByAction(action: AuditAction): AuditEvent[] {
    return this.events.filter((e) => e.action === action);
  }
  reset(): void {
    this.events.length = 0;
  }
}

export interface AuditRecorder {
  record(args: Omit<AuditEvent, 'timestamp'>): void;
}

export class AuditRecorderImpl implements AuditRecorder {
  constructor(
    private readonly sink: AuditSink,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  record(args: Omit<AuditEvent, 'timestamp'>): void {
    this.sink.record({ ...args, timestamp: this.clock() });
  }
}
