/** Phase 10 M5 prototype-recorder service audit recorder. */

export interface PrototypeRecorderAuditEvent {
  readonly tenantId: string;
  readonly actorId: string | undefined;
  readonly action: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly at: number;
}

export class PrototypeRecorderAuditRecorder {
  private events: PrototypeRecorderAuditEvent[] = [];

  record(event: Omit<PrototypeRecorderAuditEvent, 'at'>): void {
    this.events.push({ ...event, at: Date.now() });
  }

  list(): readonly PrototypeRecorderAuditEvent[] {
    return this.events;
  }

  clear(): void {
    this.events.length = 0;
  }
}
