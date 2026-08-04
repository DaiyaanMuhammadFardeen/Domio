/** Phase 10 M5 prototype-recorder service metrics. */

export class PrototypeRecorderMetrics {
  private counters = new Map<string, number>();

  inc(name: string): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + 1);
  }

  get(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  snapshot(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.counters);
  }

  reset(): void {
    this.counters.clear();
  }
}

export const P10_M5_METRICS = {
  sessionStarted: 'prototype_recorder_session_started_total',
  eventIngested: 'prototype_recorder_event_ingested_total',
  hmacRejected: 'prototype_recorder_hmac_rejected_total',
  chainReorder: 'prototype_recorder_chain_reorder_total',
  dsrListed: 'prototype_recorder_dsr_listed_total',
  dsrDeleted: 'prototype_recorder_dsr_deleted_total',
  retentionDeleted: 'prototype_recorder_retention_deleted_total',
  keyRotated: 'prototype_recorder_key_rotated_total',
} as const;

/**
 * HMAC failure rate alert. Operators subscribe to this in their metrics
 * dashboard; > 0.01% over a 5-minute window is the trip point (per
 * spec §M5.3 "Security: HMAC failure rate alert fires when > 0.01%").
 */
export function hmacFailureTrip(counters: Readonly<Record<string, number>>): boolean {
  const good = counters[P10_M5_METRICS.eventIngested] ?? 0;
  const bad = counters[P10_M5_METRICS.hmacRejected] ?? 0;
  if (good + bad < 1000) return false; // small-sample guard
  return bad / (good + bad) > 0.0001;
}
