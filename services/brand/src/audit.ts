/**
 * Brand service — audit recorder (Phase 07 A.3).
 *
 * Mirrors the `audit_brand_event` schema (migration 0020).  Append-only
 * by contract; the in-memory implementation never mutates or deletes
 * entries, and the Postgres DAL will revoke UPDATE/DELETE grants for
 * non-admin roles.
 */

export interface AuditBrandEvent {
  readonly eventId: string;
  readonly orgId: string;
  readonly kitId?: string;
  readonly actorId: string;
  readonly action: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface AuditRecorder {
  record(event: Omit<AuditBrandEvent, 'eventId' | 'createdAt'>): Promise<void>;
  listByOrg(orgId: string, limit?: number): Promise<AuditBrandEvent[]>;
}

/** In-memory recorder used in tests + dev. */
export class InMemoryAuditRecorder implements AuditRecorder {
  private events: AuditBrandEvent[] = [];
  private counter = 0;
  constructor(
    _idGen: () => string,
    private readonly clock: () => Date = () => new Date(),
  ) {}
  async record(event: Omit<AuditBrandEvent, 'eventId' | 'createdAt'>): Promise<void> {
    this.counter++;
    const stripDash = (n: number) => n.toString().padStart(4, '0');
    this.events.push({
      ...event,
      eventId: `01H0000000000000000000000${stripDash(this.counter)}`,
      createdAt: this.clock(),
    });
  }
  async listByOrg(orgId: string, limit = 100): Promise<AuditBrandEvent[]> {
    return this.events.filter((e) => e.orgId === orgId).slice(-limit);
  }
}
