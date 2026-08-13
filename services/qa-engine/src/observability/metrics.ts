/**
 * @domio/qa-engine — observability.
 */

export interface CounterLike {
  inc(by?: number, attrs?: Record<string, string>): void;
}
export interface HistogramLike {
  observe(value_ms: number, attrs?: Record<string, string>): void;
}
export interface UpDownCounterLike {
  inc(by?: number, attrs?: Record<string, string>): void;
  dec(by?: number, attrs?: Record<string, string>): void;
}
export interface QaEngineMetrics {
  threads_created: CounterLike;
  submits: CounterLike;
  upvotes: CounterLike;
  submit_latency_ms: HistogramLike;
  parking_lot_promotions: CounterLike;
}
export class NullQaEngineMetrics implements QaEngineMetrics {
  threads_created = makeCounter();
  submits = makeCounter();
  upvotes = makeCounter();
  submit_latency_ms = makeHistogram();
  parking_lot_promotions = makeCounter();
}
function makeCounter(): CounterLike {
  return { inc: () => undefined };
}
function makeHistogram(): HistogramLike {
  return { observe: () => undefined };
}
