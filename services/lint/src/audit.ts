/**
 * Lint service — audit recorder.
 */

export interface AuditLintEvent {
  readonly eventId: string;
  readonly orgId: string;
  readonly actorId: string;
  readonly action: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface AuditRecorder {
  record(event: Omit<AuditLintEvent, 'eventId' | 'createdAt'>): Promise<void>;
  listByOrg(orgId: string, limit?: number): Promise<AuditLintEvent[]>;
}

export class InMemoryAuditRecorder implements AuditRecorder {
  private events: AuditLintEvent[] = [];
  private counter = 0;
  constructor(_idGen: () => string, private readonly clock: () => Date = () => new Date()) {}
  async record(event: Omit<AuditLintEvent, 'eventId' | 'createdAt'>): Promise<void> {
    this.counter++;
    const pad = (n: number) => n.toString().padStart(4, '0');
    this.events.push({
      ...event,
      eventId: `01H0000000000000000000000${pad(this.counter)}`,
      createdAt: this.clock(),
    });
  }
  async listByOrg(orgId: string, limit = 100): Promise<AuditLintEvent[]> {
    return this.events.filter((e) => e.orgId === orgId).slice(-limit);
  }
}