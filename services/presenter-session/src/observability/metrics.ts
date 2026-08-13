/**
 * @domio/presenter-session — metrics facade.
 *
 * Phase 15 W16. The four SLOs surfaced in this file are pinned by the
 * Grafana dashboard at
 *   infrastructure/grafana/provisioning/dashboards/phase-15-presenter.json
 * and routed to PagerDuty via
 *   infrastructure/observability/pagerduty.yaml
 *
 *   - presenter.ws.p95_open_ms           — handshake latency
 *   - presenter.annotation.p95_replay_ms — overlay replay latency
 *   - presenter.handoff.p95_ms           — handover token mint + apply
 *   - presenter.recap.p95_ms             — recap aggregation latency
 *
 * The module is intentionally tiny — no exporter coupling. The actual
 * flush is owned by the embedding app (apps/api), which passes the
 * initialized `@domio/observability` bundle in via {@link bind}. When
 * `bind` is never called (e.g. inside a unit test or in `pnpm dev`
 * without OTEL_EXPORTER_OTLP_ENDPOINT set), every method is a no-op.
 */

import type { Histogram, Meter } from '@domio/observability';

export interface PresenterMetrics {
  /** WS handshake latency from first byte to first authenticated frame. */
  readonly wsOpenMs: Histogram;
  /** Annotation overlay replay — strokes reconstructed into Yjs updates. */
  readonly annotationReplayMs: Histogram;
  /** Handover round-trip: token mint + verify + apply. */
  readonly handoffMs: Histogram;
  /** Recap aggregation latency for the post-session dashboard. */
  readonly recapMs: Histogram;
  /** Slide-advance counter — feeds presenter throughput dashboards. */
  readonly advanceCount: Histogram;
  /** Conflict counter — useful for tracking optimistic-concurrency retries. */
  readonly conflictCount: Histogram;
  /** Tracer/parent meter flush + shutdown handle. */
  flush(): Promise<void>;
  shutdown(): Promise<void>;
}

/**
 * No-op facade used by default. All histogram records accumulate in
 * memory and are dropped on flush. Useful for unit tests and for
 * running the service without an OTLP collector.
 */
class NullPresenterMetrics implements PresenterMetrics {
  private static readonly noopHist = (): Histogram => ({
    type: 'histogram',
    name: 'noop',
    record: () => {},
  });
  readonly wsOpenMs = NullPresenterMetrics.noopHist();
  readonly annotationReplayMs = NullPresenterMetrics.noopHist();
  readonly handoffMs = NullPresenterMetrics.noopHist();
  readonly recapMs = NullPresenterMetrics.noopHist();
  readonly advanceCount = NullPresenterMetrics.noopHist();
  readonly conflictCount = NullPresenterMetrics.noopHist();
  async flush(): Promise<void> {}
  async shutdown(): Promise<void> {}
}

export interface BindOptions {
  readonly meter: Meter;
  /** Resource attributes that show up on every observation. */
  readonly resourceAttrs?: Record<string, string>;
}

/**
 * Create a metrics facade bound to a real OTLP meter. The caller owns
 * the meter lifecycle (init + shutdown); the facade only adds named
 * instruments with stable bucket boundaries.
 *
 * Bucket layout is tuned for web/SaaS latencies — see
 * `packages/observability/src/metrics.ts` for the global default.
 */
export function bindPresenterMetrics(opts: BindOptions): PresenterMetrics {
  const { meter } = opts;
  return {
    wsOpenMs: meter.createHistogram('presenter_ws_open_ms', {
      description: 'WS handshake latency',
      unit: 'ms',
    }),
    annotationReplayMs: meter.createHistogram('presenter_annotation_replay_ms', {
      description: 'Annotation overlay replay latency',
      unit: 'ms',
    }),
    handoffMs: meter.createHistogram('presenter_handoff_ms', {
      description: 'Handover token mint + verify + apply',
      unit: 'ms',
    }),
    recapMs: meter.createHistogram('presenter_recap_ms', {
      description: 'Recap aggregation latency',
      unit: 'ms',
    }),
    advanceCount: meter.createHistogram('presenter_advance_count', {
      description: 'Slide advance events per session',
      unit: '1',
    }),
    conflictCount: meter.createHistogram('presenter_conflict_count', {
      description: 'Optimistic-concurrency conflicts',
      unit: '1',
    }),
    flush: () => meter.flush(),
    shutdown: () => meter.shutdown(),
  };
}

const NULL_METRICS: PresenterMetrics = new NullPresenterMetrics();

/** Default — bound when no observability context is wired (tests, CLI). */
export function nullPresenterMetrics(): PresenterMetrics {
  return NULL_METRICS;
}
