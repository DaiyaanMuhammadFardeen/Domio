/**
 * Branch / merge metrics — Phase 05 D.4.
 *
 * Pure in-process counters so the control-plane process doesn't pull
 * in a heavy Prometheus SDK just for tests.  When the production
 * service is wired up we swap the noop recorder with a
 * prom-client-backed implementation behind the same surface.
 *
 * Span names mirror the spec: `branch.create`, `diff.compute`,
 * `merge.commit`, `snapshot.materialize`.  Each span helper writes a
 * structured record into the {@link SpanSink} so an OTel exporter can
 * tail it.
 */

export interface CounterSample {
  name: string;
  value: number;
  labels?: Record<string, string>;
}

export interface SpanSample {
  name: string;
  durationMs: number;
  attributes: Record<string, string | number>;
}

export interface MetricsSink {
  recordCounter(sample: CounterSample): void;
  recordSpan(sample: SpanSample): void;
}

export class InMemoryMetricsSink implements MetricsSink {
  private readonly counters: CounterSample[] = [];
  private readonly spans: SpanSample[] = [];
  recordCounter(sample: CounterSample): void {
    this.counters.push({ ...sample, labels: { ...(sample.labels ?? {}) } });
  }
  recordSpan(sample: SpanSample): void {
    this.spans.push({ ...sample, attributes: { ...sample.attributes } });
  }
  countersByName(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const c of this.counters) {
      out[c.name] = (out[c.name] ?? 0) + c.value;
    }
    return out;
  }
  spanDurations(name: string): number[] {
    return this.spans.filter((s) => s.name === name).map((s) => s.durationMs);
  }
}

export interface BranchMetrics {
  recordBranchCreate(deckId: string, outcome: 'ok' | 'error'): void;
  recordBranchArchive(deckId: string): void;
  recordDiff(durationMs: number, fastForward: boolean): void;
  recordMerge(durationMs: number, outcome: 'ok' | 'error'): void;
  startSpan(name: string): () => SpanSample;
}

export const noopBranchMetrics: BranchMetrics = {
  recordBranchCreate: () => {},
  recordBranchArchive: () => {},
  recordDiff: () => {},
  recordMerge: () => {},
  startSpan: (_: string) => {
    const t0 = performance.now();
    return () => ({
      name: _,
      durationMs: performance.now() - t0,
      attributes: {},
    });
  },
};

export function createBranchMetrics(sink: MetricsSink): BranchMetrics {
  return {
    recordBranchCreate(deckId, outcome) {
      sink.recordCounter({
        name: 'branch_create_total',
        value: 1,
        labels: { deck: deckId, outcome },
      });
    },
    recordBranchArchive(deckId) {
      sink.recordCounter({
        name: 'branch_archive_total',
        value: 1,
        labels: { deck: deckId },
      });
    },
    recordDiff(durationMs, fastForward) {
      sink.recordCounter({
        name: 'branch_diff_duration_ms',
        value: Math.round(durationMs),
        labels: { fast_forward: String(fastForward) },
      });
      sink.recordSpan({
        name: 'diff.compute',
        durationMs,
        attributes: { fast_forward: fastForward ? 1 : 0 },
      });
    },
    recordMerge(durationMs, outcome) {
      sink.recordCounter({
        name: 'branch_merge_duration_ms',
        value: Math.round(durationMs),
        labels: { outcome },
      });
      sink.recordSpan({
        name: 'merge.commit',
        durationMs,
        attributes: { outcome },
      });
    },
    startSpan(name) {
      const t0 = performance.now();
      return () => ({
        name,
        durationMs: performance.now() - t0,
        attributes: {},
      });
    },
  };
}
