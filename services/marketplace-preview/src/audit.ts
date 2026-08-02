/**
 * Marketplace preview — audit recorder (Phase 07 #45).
 *
 * Mirrors `audit_brand_event` for install / publish events.
 */

export interface MarketplaceAuditEvent {
  readonly eventId: string;
  readonly orgId: string;
  readonly listingId?: string;
  readonly installId?: string;
  readonly actorId: string;
  readonly action: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface MarketplaceAuditRecorder {
  record(event: Omit<MarketplaceAuditEvent, 'eventId' | 'createdAt'>): Promise<void>;
  listByOrg(orgId: string, limit?: number): Promise<MarketplaceAuditEvent[]>;
}

export class InMemoryMarketplaceAuditRecorder implements MarketplaceAuditRecorder {
  private events: MarketplaceAuditEvent[] = [];
  private counter = 0;
  constructor(_idGen: () => string, private readonly clock: () => Date = () => new Date()) {}
  async record(
    event: Omit<MarketplaceAuditEvent, 'eventId' | 'createdAt'>,
  ): Promise<void> {
    this.counter++;
    const stripDash = (n: number) => n.toString().padStart(4, '0');
    this.events.push({
      ...event,
      eventId: `01H0000000000000000000000${stripDash(this.counter)}`,
      createdAt: this.clock(),
    });
  }
  async listByOrg(orgId: string, limit = 100): Promise<MarketplaceAuditEvent[]> {
    return this.events.filter((e) => e.orgId === orgId).slice(-limit);
  }
}
