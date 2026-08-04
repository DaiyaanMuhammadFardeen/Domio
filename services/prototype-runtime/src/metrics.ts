/** Phase 10 prototype-runtime service metrics. */
export class PrototypeMetrics {
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

export const P10_METRICS = {
  created: 'prototype_created_total',
  updated: 'prototype_updated_total',
  deleted: 'prototype_deleted_total',
  validationFailed: 'prototype_validation_failed_total',
  conflict: 'prototype_version_conflict_total',
} as const;
