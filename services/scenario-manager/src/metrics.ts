/**
 * Scenario-manager service — Prometheus metrics.
 *
 * Counters for load-bearing surfaces.  In-memory implementation is
 * wired so tests can assert on emit counts.
 */

export interface ScenarioMetricSnapshot {
  readonly scenariosCreatedTotal: number;
  readonly overlaysAppliedTotal: number;
  readonly diffComputationsTotal: number;
}

export class ScenarioMetrics {
  scenariosCreatedTotal = 0;
  overlaysAppliedTotal = 0;
  diffComputationsTotal = 0;

  recordScenarioCreated(): void {
    this.scenariosCreatedTotal++;
  }

  recordOverlayApplied(): void {
    this.overlaysAppliedTotal++;
  }

  recordDiffComputation(): void {
    this.diffComputationsTotal++;
  }

  snapshot(): ScenarioMetricSnapshot {
    return {
      scenariosCreatedTotal: this.scenariosCreatedTotal,
      overlaysAppliedTotal: this.overlaysAppliedTotal,
      diffComputationsTotal: this.diffComputationsTotal,
    };
  }
}
