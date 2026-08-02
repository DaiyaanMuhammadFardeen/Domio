/**
 * Lint service — Prometheus metrics.
 */

export interface LintMetricSnapshot {
  readonly lintRunsTotal: number;
  readonly findingsTotal: number;
  readonly lintLatencyMs: number[];
}

export class LintMetrics {
  lintRunsTotal = 0;
  findingsTotal = 0;
  lintLatencyMs: number[] = [];

  recordRun(findingCount: number, latencyMs: number): void {
    this.lintRunsTotal++;
    this.findingsTotal += findingCount;
    this.lintLatencyMs.push(latencyMs);
  }

  snapshot(): LintMetricSnapshot {
    return {
      lintRunsTotal: this.lintRunsTotal,
      findingsTotal: this.findingsTotal,
      lintLatencyMs: [...this.lintLatencyMs],
    };
  }
}