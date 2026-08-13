/**
 * Export pipeline — audit recorder (Phase 09).
 *
 * Append-only audit log for export job lifecycle events.
 * Mirrors the theme service audit pattern.
 */

export interface ExportAuditEvent {
  readonly eventId: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly action: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface ExportAuditRecorder {
  record(event: Omit<ExportAuditEvent, 'eventId' | 'createdAt'>): Promise<void>;
  listByTenant(tenantId: string, limit?: number): Promise<ExportAuditEvent[]>;
}

/** In-memory audit recorder used in tests + dev. */
export class InMemoryExportAuditRecorder implements ExportAuditRecorder {
  private events: ExportAuditEvent[] = [];
  private eventCounter = 0;

  constructor(private readonly clock: () => Date = () => new Date()) {}

  async record(event: Omit<ExportAuditEvent, 'eventId' | 'createdAt'>): Promise<void> {
    this.eventCounter++;
    const stripDash = (n: number) => n.toString().padStart(4, '0');
    this.events.push({
      ...event,
      eventId: `01H0000000000000000000000${stripDash(this.eventCounter)}`,
      createdAt: this.clock(),
    });
  }

  async listByTenant(tenantId: string, limit = 100): Promise<ExportAuditEvent[]> {
    return this.events.filter((e) => e.tenantId === tenantId).slice(-limit);
  }
}
