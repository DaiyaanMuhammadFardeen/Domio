/**
 * Brand service — Prometheus metrics (Phase 07 A.3).
 *
 * Counters + latency histograms for the load-bearing surfaces in §6 of
 * the Phase 07 spec.  The in-memory implementation lets tests assert on
 * emit counts; production wires Prometheus histograms at composition.
 */

export interface BrandMetricSnapshot {
  readonly brandKitCreatedTotal: number;
  readonly brandKitPublishedTotal: number;
  readonly brandKitArchivedTotal: number;
  readonly brandExtractionStartedTotal: number;
  readonly brandExtractionLatencyMs: number[];
  readonly brandContextSwitchTotal: number;
  readonly subBrandCycleBlockedTotal: number;
}

export class BrandMetrics {
  brandKitCreatedTotal = 0;
  brandKitPublishedTotal = 0;
  brandKitArchivedTotal = 0;
  brandExtractionStartedTotal = 0;
  brandExtractionLatencyMs: number[] = [];
  brandContextSwitchTotal = 0;
  subBrandCycleBlockedTotal = 0;

  recordKitCreate(): void { this.brandKitCreatedTotal++; }
  recordKitPublish(): void { this.brandKitPublishedTotal++; }
  recordKitArchive(): void { this.brandKitArchivedTotal++; }
  recordExtractionStart(): void { this.brandExtractionStartedTotal++; }
  recordExtractionLatency(latencyMs: number): void { this.brandExtractionLatencyMs.push(latencyMs); }
  recordContextSwitch(): void { this.brandContextSwitchTotal++; }
  recordSubBrandCycle(): void { this.subBrandCycleBlockedTotal++; }

  snapshot(): BrandMetricSnapshot {
    return {
      brandKitCreatedTotal: this.brandKitCreatedTotal,
      brandKitPublishedTotal: this.brandKitPublishedTotal,
      brandKitArchivedTotal: this.brandKitArchivedTotal,
      brandExtractionStartedTotal: this.brandExtractionStartedTotal,
      brandExtractionLatencyMs: [...this.brandExtractionLatencyMs],
      brandContextSwitchTotal: this.brandContextSwitchTotal,
      subBrandCycleBlockedTotal: this.subBrandCycleBlockedTotal,
    };
  }

  p95ExtractionLatencyMs(): number {
    if (this.brandExtractionLatencyMs.length === 0) return 0;
    const sorted = [...this.brandExtractionLatencyMs].sort((a, b) => a - b);
    const lastIdx = sorted.length - 1;
    const idx = Math.min(Math.floor(sorted.length * 0.95), lastIdx);
    return sorted[idx] ?? 0;
  }
}
