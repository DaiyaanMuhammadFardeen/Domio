/**
 * Localization service — Prometheus metrics.
 *
 * Counters for load-bearing surfaces.
 */

export interface LocalizationMetricSnapshot {
  readonly formatsTotal: number;
  readonly rateIngestsTotal: number;
  readonly conversionsTotal: number;
}

export class LocalizationMetrics {
  formatsTotal = 0;
  rateIngestsTotal = 0;
  conversionsTotal = 0;

  recordFormat(): void {
    this.formatsTotal++;
  }

  recordRateIngest(): void {
    this.rateIngestsTotal++;
  }

  recordConversion(): void {
    this.conversionsTotal++;
  }

  snapshot(): LocalizationMetricSnapshot {
    return {
      formatsTotal: this.formatsTotal,
      rateIngestsTotal: this.rateIngestsTotal,
      conversionsTotal: this.conversionsTotal,
    };
  }
}
