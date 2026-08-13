/**
 * Query gateway — audit recorder (Phase 08 M2).
 *
 * Append-only audit log for query gateway actions. Mirrors the
 * `services/theme/src/audit.ts` pattern.
 */

export interface QueryGatewayAuditEvent {
  readonly eventId: string;
  readonly orgId: string;
  readonly actorId: string;
  readonly action: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface QueryGatewayAuditRecorder {
  record(event: Omit<QueryGatewayAuditEvent, 'eventId' | 'createdAt'>): Promise<void>;
  listByOrg(orgId: string, limit?: number): Promise<QueryGatewayAuditEvent[]>;
}

/** In-memory recorder used in tests + dev. */
export class InMemoryQueryGatewayAuditRecorder implements QueryGatewayAuditRecorder {
  private events: QueryGatewayAuditEvent[] = [];
  private counter = 0;
  constructor(
    _idGen: () => string,
    private readonly clock: () => Date = () => new Date(),
  ) {
    void _idGen;
  }

  async record(event: Omit<QueryGatewayAuditEvent, 'eventId' | 'createdAt'>): Promise<void> {
    this.counter++;
    const stripDash = (n: number) => n.toString().padStart(4, '0');
    this.events.push({
      ...event,
      eventId: `01H0000000000000000000000${stripDash(this.counter)}`,
      createdAt: this.clock(),
    });
  }

  async listByOrg(orgId: string, limit = 100): Promise<QueryGatewayAuditEvent[]> {
    return this.events.filter((e) => e.orgId === orgId).slice(-limit);
  }
}
