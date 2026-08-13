/**
 * Theme service — Prometheus metrics (Phase 07 A.1).
 *
 * Histograms + counters for the load-bearing surfaces in §6 of the
 * Phase 07 spec.  The in-memory implementation is wired so tests can
 * assert on emit counts; production wires Prometheus histograms at
 * composition time.
 */

export interface ThemeMetricSnapshot {
  readonly themeAppliedTotal: number;
  readonly themeApplyLatencyMs: number[];
  readonly tokenAliasCycleBlockedTotal: number;
  readonly tokenDeletionBlockedTotal: number;
  readonly overrideCreatedTotal: number;
}

export class ThemeMetrics {
  themeAppliedTotal = 0;
  themeApplyLatencyMs: number[] = [];
  tokenAliasCycleBlockedTotal = 0;
  tokenDeletionBlockedTotal = 0;
  overrideCreatedTotal = 0;

  recordThemeApply(latencyMs: number): void {
    this.themeAppliedTotal++;
    this.themeApplyLatencyMs.push(latencyMs);
  }
  recordAliasCycle(): void {
    this.tokenAliasCycleBlockedTotal++;
  }
  recordDeletionBlock(): void {
    this.tokenDeletionBlockedTotal++;
  }
  recordOverride(): void {
    this.overrideCreatedTotal++;
  }

  snapshot(): ThemeMetricSnapshot {
    return {
      themeAppliedTotal: this.themeAppliedTotal,
      themeApplyLatencyMs: [...this.themeApplyLatencyMs],
      tokenAliasCycleBlockedTotal: this.tokenAliasCycleBlockedTotal,
      tokenDeletionBlockedTotal: this.tokenDeletionBlockedTotal,
      overrideCreatedTotal: this.overrideCreatedTotal,
    };
  }

  /** p95 of recorded latencies (returns 0 if no samples). */
  p95ApplyLatencyMs(): number {
    if (this.themeApplyLatencyMs.length === 0) return 0;
    const sorted = [...this.themeApplyLatencyMs].sort((a, b) => a - b);
    const lastIdx = sorted.length - 1;
    const idx = Math.min(Math.floor(sorted.length * 0.95), lastIdx);
    return sorted[idx] ?? 0;
  }
}
