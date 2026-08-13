/**
 * Timeline API — audit recorder (Phase 09).
 *
 * Append-only audit log for timeline API actions.
 * Mirrors the `services/theme/src/audit.ts` pattern.
 */

export interface TimelineAuditEvent {
  readonly eventId: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly action: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface TimelineAuditRecorder {
  record(event: Omit<TimelineAuditEvent, 'eventId' | 'createdAt'>): Promise<void>;
  listByTenant(tenantId: string, limit?: number): Promise<TimelineAuditEvent[]>;
}

/** In-memory recorder used in tests + dev. */
export class InMemoryTimelineAuditRecorder implements TimelineAuditRecorder {
  private events: TimelineAuditEvent[] = [];
  private counter = 0;
  constructor(
    _idGen: () => string,
    private readonly clock: () => Date = () => new Date(),
  ) {
    void _idGen;
  }

  async record(event: Omit<TimelineAuditEvent, 'eventId' | 'createdAt'>): Promise<void> {
    this.counter++;
    const stripDash = (n: number) => n.toString().padStart(4, '0');
    this.events.push({
      ...event,
      eventId: `01H0000000000000000000000${stripDash(this.counter)}`,
      createdAt: this.clock(),
    });
  }

  async listByTenant(tenantId: string, limit = 100): Promise<TimelineAuditEvent[]> {
    return this.events.filter((e) => e.tenantId === tenantId).slice(-limit);
  }
}
