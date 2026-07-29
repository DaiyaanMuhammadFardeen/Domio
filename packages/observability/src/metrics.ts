/**
 * Metrics API — minimal OTLP-flavored counters, histograms, and gauges.
 *
 * Public API:
 *   - meter.createCounter(name, opts?)
 *   - meter.createHistogram(name, opts?)
 *   - meter.createUpDownCounter(name, opts?)
 *   - meter.flush() / meter.shutdown()
 *
 * Counters and UpDownCounters accumulate values; Histograms keep a
 * fixed bucket layout (exponential, base 2). On flush, every registered
 * instrument is serialized into a single OTLP `ExportMetricsServiceRequest`
 * and posted to the exporter.
 */

import type { ResourceAttributes } from './resource.js';
import type { OtlpHttpExporter } from './exporters/otlp-http.js';
import { resourceToOtlp } from './exporters/otlp-http.js';
import { getRedactor } from './redaction.js';

export interface Counter {
  type: 'counter';
  name: string;
  description?: string;
  unit?: string;
  add(value: number, attrs?: Record<string, string>): void;
}

export interface UpDownCounter {
  type: 'up_down_counter';
  name: string;
  description?: string;
  unit?: string;
  add(value: number, attrs?: Record<string, string>): void;
}

export interface Histogram {
  type: 'histogram';
  name: string;
  description?: string;
  unit?: string;
  record(value: number, attrs?: Record<string, string>): void;
}

export type Instrument = Counter | UpDownCounter | Histogram;

export interface Meter {
  createCounter(name: string, opts?: { description?: string; unit?: string }): Counter;
  createHistogram(name: string, opts?: { description?: string; unit?: string }): Histogram;
  createUpDownCounter(name: string, opts?: { description?: string; unit?: string }): UpDownCounter;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
  readonly resource: ResourceAttributes;
  readonly exporter: OtlpHttpExporter | null;
}

export interface MeterConfig {
  resource: ResourceAttributes;
  exporter: OtlpHttpExporter | null;
}

const SAFE_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_.]*$/;

/**
 * Default histogram buckets. They cover web request latencies from
 * ~1ms to ~16s with reasonable resolution in the SLO-relevant zone
 * (50ms..2s).
 */
export const DEFAULT_BUCKETS_MS: readonly number[] = Object.freeze([
  1, 2, 5, 10, 25, 50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 30_000,
]);

interface CounterState {
  type: 'counter' | 'up_down_counter';
  name: string;
  description?: string;
  unit?: string;
  byAttrs: Map<string, number>;
}

interface HistogramBucket {
  count: number;
  sum: number;
  buckets: number[];
}

interface HistogramState {
  type: 'histogram';
  name: string;
  description?: string;
  unit?: string;
  byAttrs: Map<string, HistogramBucket>;
  bucketBounds: readonly number[];
  buckets: number[];
}

export function createMeter(cfg: MeterConfig): Meter {
  const counters = new Map<string, CounterState>();
  const histograms = new Map<string, HistogramState>();
  let flushing = false;

  function getOrCreateCounter(
    name: string,
    type: 'counter' | 'up_down_counter',
    description?: string,
    unit?: string,
  ): CounterState {
    if (!SAFE_NAME_RE.test(name)) throw new Error(`invalid metric name: ${name}`);
    const existing = counters.get(name);
    if (existing) return existing;
    const state: CounterState = { type, name, byAttrs: new Map() };
    if (description !== undefined) state.description = description;
    if (unit !== undefined) state.unit = unit;
    counters.set(name, state);
    return state;
  }

  function getOrCreateHistogram(name: string, description?: string, unit?: string): HistogramState {
    if (!SAFE_NAME_RE.test(name)) throw new Error(`invalid metric name: ${name}`);
    const existing = histograms.get(name);
    if (existing) return existing;
    const buckets = DEFAULT_BUCKETS_MS.map(() => 0);
    const state: HistogramState = {
      type: 'histogram',
      name,
      bucketBounds: DEFAULT_BUCKETS_MS,
      buckets,
      byAttrs: new Map(),
    };
    if (description !== undefined) state.description = description;
    if (unit !== undefined) state.unit = unit;
    histograms.set(name, state);
    return state;
  }

  function attrKey(attrs: Record<string, string> | undefined): string {
    if (!attrs) return '';
    const keys = Object.keys(attrs).sort();
    return keys.map((k) => `${k}=${attrs[k] ?? ''}`).join(',');
  }

  function decorateOpts(target: { description?: string; unit?: string }, opts?: { description?: string; unit?: string }) {
    if (opts?.description !== undefined) target.description = opts.description;
    if (opts?.unit !== undefined) target.unit = opts.unit;
  }

  function createCounter(name: string, opts?: { description?: string; unit?: string }): Counter {
    const state = getOrCreateCounter(name, 'counter', opts?.description, opts?.unit);
    const counter: Counter = {
      type: 'counter',
      name,
      add(value, attrs) {
        const k = attrKey(attrs);
        state.byAttrs.set(k, (state.byAttrs.get(k) ?? 0) + value);
      },
    };
    decorateOpts(counter, opts);
    return counter;
  }

  function createUpDownCounter(name: string, opts?: { description?: string; unit?: string }): UpDownCounter {
    const state = getOrCreateCounter(name, 'up_down_counter', opts?.description, opts?.unit);
    const udc: UpDownCounter = {
      type: 'up_down_counter',
      name,
      add(value, attrs) {
        const k = attrKey(attrs);
        state.byAttrs.set(k, (state.byAttrs.get(k) ?? 0) + value);
      },
    };
    decorateOpts(udc, opts);
    return udc;
  }

  function createHistogram(name: string, opts?: { description?: string; unit?: string }): Histogram {
    const state = getOrCreateHistogram(name, opts?.description, opts?.unit);
    const h: Histogram = {
      type: 'histogram',
      name,
      record(value, attrs) {
        const k = attrKey(attrs);
        let bucket = state.byAttrs.get(k);
        if (!bucket) {
          bucket = { count: 0, sum: 0, buckets: state.bucketBounds.map(() => 0) };
          state.byAttrs.set(k, bucket);
        }
        bucket.count += 1;
        bucket.sum += value;
        for (let i = 0; i < state.bucketBounds.length; i++) {
          const bound = state.bucketBounds[i];
          if (bound === undefined) continue;
          if (value <= bound) {
            const b = bucket.buckets[i];
            if (b !== undefined) bucket.buckets[i] = b + 1;
          }
        }
      },
    };
    decorateOpts(h, opts);
    return h;
  }

  return {
    resource: cfg.resource,
    exporter: cfg.exporter,
    createCounter,
    createUpDownCounter,
    createHistogram,
    async flush() {
      if (!cfg.exporter) return;
      if (flushing) return;
      flushing = true;
      try {
        const redactor = getRedactor();
        const dataPoints: unknown[] = [];

        for (const state of counters.values()) {
          for (const [k, v] of state.byAttrs) {
            const attrs = parseAttrKey(k);
            const dp: Record<string, unknown> = {
              name: state.name,
              sum: v,
              aggregationTemporality: 2,
              isMonotonic: state.type === 'counter',
              attributes: attrToOtlp(redactor.redactValue(attrs)),
            };
            if (state.description !== undefined) dp['description'] = state.description;
            if (state.unit !== undefined) dp['unit'] = state.unit;
            dataPoints.push(dp);
            state.byAttrs.set(k, 0); // reset after delta
          }
        }

        for (const state of histograms.values()) {
          for (const [k, v] of state.byAttrs) {
            const attrs = parseAttrKey(k);
            // bucketCounts is cumulative (per the OTLP spec). The
            // trailing overflow bucket equals `count` (the total number
            // of observations); all observations fall into the overflow
            // bucket by definition, since the bucket array has no upper
            // bound on it.
            const dp: Record<string, unknown> = {
              name: state.name,
              count: v.count,
              sum: v.sum,
              aggregationTemporality: 2,
              bucketBounds: [...state.bucketBounds],
              bucketCounts: [...v.buckets, v.count],
              attributes: attrToOtlp(redactor.redactValue(attrs)),
            };
            if (state.description !== undefined) dp['description'] = state.description;
            if (state.unit !== undefined) dp['unit'] = state.unit;
            dataPoints.push(dp);
            state.byAttrs.set(k, { count: 0, sum: 0, buckets: state.bucketBounds.map(() => 0) });
          }
        }

        if (dataPoints.length === 0) return;

        const payload = {
          resourceMetrics: [
            {
              resource: resourceToOtlp(cfg.resource),
              scopeMetrics: [
                {
                  scope: { name: '@domio/observability' },
                  metrics: dataPoints,
                },
              ],
            },
          ],
        };
        await cfg.exporter.exportJson('metrics', payload);
      } finally {
        flushing = false;
      }
    },
    async shutdown() {
      await this.flush();
      if (cfg.exporter) await cfg.exporter.shutdown();
    },
  };
}

function attrToOtlp(attrs: Record<string, string>): Array<{ key: string; value: { stringValue: string } }> {
  return Object.entries(attrs).map(([key, value]) => ({ key, value: { stringValue: value } }));
}

function parseAttrKey(k: string): Record<string, string> {
  if (k.length === 0) return {};
  const out: Record<string, string> = {};
  for (const pair of k.split(',')) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    out[pair.slice(0, idx)] = pair.slice(idx + 1);
  }
  return out;
}
