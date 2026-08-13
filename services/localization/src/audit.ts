/**
 * Localization service — audit recorder.
 *
 * Append-only by contract; the in-memory implementation never mutates
 * or deletes entries.
 */

export interface AuditLocalizationEvent {
  readonly eventId: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly action: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface AuditRecorder {
  record(event: Omit<AuditLocalizationEvent, 'eventId' | 'createdAt'>): Promise<void>;
  listByTenant(tenantId: string, limit?: number): Promise<AuditLocalizationEvent[]>;
}

/** In-memory recorder used in tests + dev. */
export class InMemoryAuditRecorder implements AuditRecorder {
  private events: AuditLocalizationEvent[] = [];
  private counter = 0;
  constructor(
    _idGen: () => string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async record(event: Omit<AuditLocalizationEvent, 'eventId' | 'createdAt'>): Promise<void> {
    this.counter++;
    const pad = (n: number) => n.toString().padStart(4, '0');
    this.events.push({
      ...event,
      eventId: `01H0000000000000000000000${pad(this.counter)}`,
      createdAt: this.clock(),
    });
  }

  async listByTenant(tenantId: string, limit = 100): Promise<AuditLocalizationEvent[]> {
    return this.events.filter((e) => e.tenantId === tenantId).slice(-limit);
  }
}
