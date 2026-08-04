/**
 * Connector framework — audit recorder (Phase 08).
 *
 * Append-only in-memory audit writer recording every query/ping with
 * tenant + actor.  Mirrors the theme service audit pattern.
 */

export interface ConnectorAuditEvent {
  readonly eventId: string;
  readonly tenant_id: string;
  readonly actor_id: string;
  readonly action: string;
  readonly connector_id: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface ConnectorAuditRecorder {
  record(event: Omit<ConnectorAuditEvent, 'eventId' | 'createdAt'>): Promise<void>;
  listByTenant(tenant_id: string, limit?: number): Promise<ConnectorAuditEvent[]>;
}

/** In-memory recorder used in tests + dev. */
export class InMemoryConnectorAuditRecorder implements ConnectorAuditRecorder {
  private events: ConnectorAuditEvent[] = [];
  private counter = 0;

  constructor(
    private readonly idGen: () => string,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async record(event: Omit<ConnectorAuditEvent, 'eventId' | 'createdAt'>): Promise<void> {
    this.counter++;
    this.events.push({
      ...event,
      eventId: this.idGen(),
      createdAt: this.clock(),
    });
  }

  async listByTenant(tenant_id: string, limit = 100): Promise<ConnectorAuditEvent[]> {
    return this.events.filter((e) => e.tenant_id === tenant_id).slice(-limit);
  }
}
