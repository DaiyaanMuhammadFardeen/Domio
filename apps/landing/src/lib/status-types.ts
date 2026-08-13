/**
 * Domain types for the public status page (Wave 12 §S12.8).
 *
 * The status page is a marketing surface, so the types here are
 * deliberately lean and fully serialisable. Consumers (the page,
 * the components, the JSON seed) all import from this file so the
 * shape stays in one place.
 */

export type ServiceHealth =
  | 'operational'
  | 'degraded'
  | 'partial_outage'
  | 'major_outage'
  | 'maintenance';

export interface StatusService {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: ServiceHealth;
  readonly uptime_pct_90d: number;
  /**
   * 90 entries, one per day. `history[0]` is the oldest day and
   * `history[89]` is the most recent day. This gives the
   * `UptimeBar` component a deterministic left-to-right ordering.
   */
  readonly history: ReadonlyArray<ServiceHealth>;
}

export interface Incident {
  readonly id: string;
  readonly title: string;
  /** Unix epoch milliseconds. */
  readonly started_at_ms: number;
  /** `null` while the incident is still active. */
  readonly resolved_at_ms: number | null;
  readonly severity: 'minor' | 'major' | 'critical';
  readonly affected_services: ReadonlyArray<string>;
  readonly summary: string;
}

export interface StatusSnapshot {
  readonly overall: ServiceHealth;
  readonly services: ReadonlyArray<StatusService>;
  readonly incidents: ReadonlyArray<Incident>;
  /** Unix epoch milliseconds when the snapshot was produced. */
  readonly fetched_at_ms: number;
}
