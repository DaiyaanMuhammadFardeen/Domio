/** Phase 10 prototype-runtime service audit recorder. */

export interface PrototypeAuditEvent {
  readonly tenantId: string;
  readonly actorId: string | undefined;
  readonly action: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly at: number;
}

export class PrototypeAuditRecorder {
  private events: PrototypeAuditEvent[] = [];

  record(event: Omit<PrototypeAuditEvent, 'at'>): void {
    this.events.push({ ...event, at: Date.now() });
  }

  list(): readonly PrototypeAuditEvent[] {
    return this.events;
  }

  clear(): void {
    this.events.length = 0;
  }
}