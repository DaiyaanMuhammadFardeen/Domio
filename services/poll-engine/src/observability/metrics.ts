/**
 * @domio/poll-engine — observability.
 *
 * Lightweight metrics interface to avoid pulling the full OTEL stack into
 * a single-purpose service. Production wires a Prometheus exporter.
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

export interface PollEngineMetrics {
  polls_created: CounterLike;
  votes_cast: CounterLike;
  cast_latency_ms: HistogramLike;
  open_polls: UpDownCounterLike;
}

export class NullPollEngineMetrics implements PollEngineMetrics {
  polls_created = makeCounter();
  votes_cast = makeCounter();
  cast_latency_ms = makeHistogram();
  open_polls = makeUpDown();
}

function makeCounter(): CounterLike {
  return { inc: () => undefined };
}
function makeHistogram(): HistogramLike {
  return { observe: () => undefined };
}
function makeUpDown(): UpDownCounterLike {
  return { inc: () => undefined, dec: () => undefined };
}
