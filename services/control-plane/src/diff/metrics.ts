/**
 * Diff service metrics — Phase 05 D.4 (subset dedicated to the diff
 * service).
 *
 * Pure counters so the control plane doesn't pull in prom-client just
 * for tests; production wiring swaps the in-memory sink for a
 * prom-client adapter behind the same surface.
 */

export interface DiffCounter {
  diffCalls: number;
  thumbnailCalls: number;
  thumbnailTotalMs: number;
}

export class InMemoryDiffMetrics {
  private counters: DiffCounter = {
    diffCalls: 0,
    thumbnailCalls: 0,
    thumbnailTotalMs: 0,
  };
  recordDiff(): void {
    this.counters.diffCalls++;
  }
  recordThumbnail(durationMs: number): void {
    this.counters.thumbnailCalls++;
    this.counters.thumbnailTotalMs += durationMs;
  }
  snapshot(): DiffCounter {
    return { ...this.counters };
  }
}
