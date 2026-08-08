/**
 * @domio/permission-engine — optional audit recorder.
 *
 * Self-contained audit module.  Does NOT depend on @domio/audit-ts at runtime;
 * the service toggles recording via the `auditEnabled` constructor flag
 * (default false) so tests never need the external package.
 */

export interface PermissionAuditEvent {
  readonly service: string;
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: Date;
}

export interface PermissionAuditRecorder {
  record(event: Omit<PermissionAuditEvent, 'createdAt'>): Promise<void>;
  list(limit?: number): Promise<PermissionAuditEvent[]>;
}

/** In-memory recorder used in tests + dev. */
export class InMemoryPermissionAuditRecorder implements PermissionAuditRecorder {
  private events: PermissionAuditEvent[] = [];
  private readonly clock: () => Date;

  constructor(clock: () => Date = () => new Date()) {
    this.clock = clock;
  }

  async record(event: Omit<PermissionAuditEvent, 'createdAt'>): Promise<void> {
    this.events.push({ ...event, createdAt: this.clock() });
  }

  async list(limit = 100): Promise<PermissionAuditEvent[]> {
    return this.events.slice(-limit);
  }
}
