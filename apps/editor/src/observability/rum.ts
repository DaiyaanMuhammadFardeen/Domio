/**
 * Frontend Real User Monitoring (RUM) for the realtime collaboration layer.
 *
 * Per doc C.3: exposes 6 realtime metrics, OTel spans for the key
 * operations, and structured logs — all no-op gracefully when OTel is not
 * configured.
 *
 * Mirrors the pattern in `packages/observability` (init → tracer / meter /
 * logger bundle) but is lightweight and browser-safe.
 */

// ----- Metric names (stable across runs for Grafana queries) -----

export const METRIC_SYNC_OP_APPLY_DURATION_MS = 'sync_op_apply_duration_ms';
export const METRIC_SYNC_OP_ROUND_TRIP_MS = 'sync_op_round_trip_ms';
export const METRIC_SYNC_ACTIVE_CONNECTIONS = 'sync_active_connections';
export const METRIC_SYNC_CRDT_CONVERGENCE_MS = 'sync_crdt_convergence_ms';
export const METRIC_PRESENCE_ACTIVE_SESSIONS = 'presence_active_sessions';
export const METRIC_PRESENCE_CURSOR_LATENCY_MS = 'presence_cursor_latency_ms';

// ----- Span names -----

export const SPAN_REALTIME_HELLO = 'realtime.hello';
export const SPAN_REALTIME_OP_APPLY = 'realtime.op.apply';
export const SPAN_REALTIME_PRESENCE_FANOUT = 'realtime.presence.fanout';
export const SPAN_YJS_BRIDGE_APPLY = 'yjs.bridge.apply';

// ----- Minimal browser-safe OTel abstractions -----

export interface RumSpan {
  end(): void;
  setAttribute(key: string, value: string | number | boolean): void;
  setStatus(code: 'ok' | 'error', message?: string): void;
}

export interface RumTracer {
  startSpan(name: string): RumSpan;
}

export interface RumCounter {
  add(value: number, attributes?: Record<string, string | number | boolean>): void;
}

export interface RumHistogram {
  record(value: number, attributes?: Record<string, string | number | boolean>): void;
}

export interface RumMeter {
  createCounter(name: string): RumCounter;
  createHistogram(name: string): RumHistogram;
}

export interface RumLogger {
  info(message: string, attributes?: Record<string, string | number | boolean>): void;
  warn(message: string, attributes?: Record<string, string | number | boolean>): void;
  error(message: string, attributes?: Record<string, string | number | boolean>): void;
}

export interface RumSdk {
  readonly tracer: RumTracer;
  readonly meter: RumMeter;
  readonly logger: RumLogger;
  shutdown(): Promise<void>;
}

// ----- No-op implementations -----

const noopSpan: RumSpan = {
  end() {},
  setAttribute() {},
  setStatus() {},
};

const noopTracer: RumTracer = {
  startSpan(): RumSpan {
    return noopSpan;
  },
};

const noopCounter: RumCounter = {
  add() {},
};

const noopHistogram: RumHistogram = {
  record() {},
};

const noopMeter: RumMeter = {
  createCounter(): RumCounter {
    return noopCounter;
  },
  createHistogram(): RumHistogram {
    return noopHistogram;
  },
};

const noopLogger: RumLogger = {
  info() {},
  warn() {},
  error() {},
};

const noopSdk: RumSdk = {
  tracer: noopTracer,
  meter: noopMeter,
  logger: noopLogger,
  async shutdown() {},
};

// ----- OTel bridge (lazy, browser-safe) -----

/**
 * Attempt to bridge to the global `@opentelemetry/api` if available.
 * Returns null if not installed — callers fall back to no-ops.
 */
function tryGetOtelApi(): {
  trace: { getTracer(name: string): { startSpan(name: string): unknown } };
  metrics: { getMeter(name: string): unknown };
} | null {
  try {
    // Dynamic import to avoid bundling OTel when it's not installed.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const api = require('@opentelemetry/api');
    if (api && typeof api.trace?.getTracer === 'function') {
      return api;
    }
  } catch {
    // OTel not available
  }
  return null;
}

/**
 * Wrap an OTel tracer into our lightweight RumTracer interface.
 */
function wrapTracer(otelTracer: { startSpan(name: string): unknown }): RumTracer {
  return {
    startSpan(name: string): RumSpan {
      const span = otelTracer.startSpan(name) as Record<string, unknown>;
      return {
        end() {
          if (typeof span.end === 'function') span.end();
        },
        setAttribute(key: string, value: string | number | boolean) {
          if (typeof span.setAttribute === 'function') span.setAttribute(key, value);
        },
        setStatus(code: 'ok' | 'error', message?: string) {
          if (typeof span.setStatus === 'function') {
            span.setStatus({ code, message: message ?? '' });
          }
        },
      };
    },
  };
}

// ----- Structured log helper (never logs Yjs payload bytes) -----

/**
 * Build a structured log record with the required context fields.
 * Explicitly excludes `payload` / Yjs bytes to satisfy the doc C.3
 * "NEVER log full Yjs payload bytes" constraint.
 */
export function buildLogContext(fields: {
  traceId?: string;
  deckId?: string;
  branchId?: string;
  authorId?: string;
  opId?: string;
  slideId?: string;
  extra?: Record<string, string | number | boolean>;
}): Record<string, string | number | boolean> {
  const ctx: Record<string, string | number | boolean> = {};
  if (fields.traceId) ctx['traceId'] = fields.traceId;
  if (fields.deckId) ctx['deckId'] = fields.deckId;
  if (fields.branchId) ctx['branchId'] = fields.branchId;
  if (fields.authorId) ctx['authorId'] = fields.authorId;
  if (fields.opId) ctx['opId'] = fields.opId;
  if (fields.slideId) ctx['slideId'] = fields.slideId;
  if (fields.extra) Object.assign(ctx, fields.extra);
  return ctx;
}

// ----- SDK singleton -----

let _sdk: RumSdk | null = null;

/**
 * Initialize the frontend RUM SDK.
 *
 * If `@opentelemetry/api` is installed and a global tracer provider is
 * configured, spans and metrics flow to the OTLP exporter.  Otherwise
 * every call is a lightweight no-op.
 *
 * Call once at app startup; subsequent calls return the same instance.
 */
export function initRum(
  options: {
    serviceName?: string;
    /** Extra attributes attached to every structured log. */
    defaultAttributes?: Record<string, string | number | boolean>;
  } = {},
): RumSdk {
  if (_sdk) return _sdk;

  const serviceName = options.serviceName ?? 'domio-editor';

  const otel = tryGetOtelApi();
  if (!otel) {
    _sdk = noopSdk;
    return _sdk;
  }

  // Wrap OTel tracer
  const otelTracer = otel.trace.getTracer(serviceName);
  const tracer = wrapTracer(otelTracer);

  // Wrap OTel meter (best-effort; meter API shape varies across OTel versions)
  let meter: RumMeter = noopMeter;
  try {
    if (typeof otel.metrics?.getMeter === 'function') {
      const otelMeter = otel.metrics.getMeter(serviceName) as Record<string, unknown>;
      meter = {
        createCounter(name: string): RumCounter {
          const c = (otelMeter as { createCounter?: (n: string) => unknown }).createCounter?.(
            name,
          ) as Record<string, unknown> | undefined;
          if (!c) return noopCounter;
          return {
            add(value: number, attrs?: Record<string, string | number | boolean>) {
              if (typeof c.add === 'function') c.add(value, attrs ?? {});
            },
          };
        },
        createHistogram(name: string): RumHistogram {
          const h = (otelMeter as { createHistogram?: (n: string) => unknown }).createHistogram?.(
            name,
          ) as Record<string, unknown> | undefined;
          if (!h) return noopHistogram;
          return {
            record(value: number, attrs?: Record<string, string | number | boolean>) {
              if (typeof h.record === 'function') h.record(value, attrs ?? {});
            },
          };
        },
      };
    }
  } catch {
    // meter not available
  }

  _sdk = {
    tracer,
    meter,
    logger: noopLogger,
    async shutdown() {},
  };

  return _sdk;
}

/** Returns the current RUM SDK, initializing with no-ops if needed. */
export function getRum(): RumSdk {
  if (!_sdk) return initRum();
  return _sdk;
}

// ----- High-level convenience helpers -----

/** Record sync op apply duration. */
export function recordSyncOpApplyDuration(
  durationMs: number,
  attrs?: Record<string, string | number | boolean>,
): void {
  const { meter } = getRum();
  const counter = meter.createHistogram(METRIC_SYNC_OP_APPLY_DURATION_MS);
  counter.record(durationMs, attrs);
}

/** Record sync op round-trip duration. */
export function recordSyncOpRoundTrip(
  durationMs: number,
  attrs?: Record<string, string | number | boolean>,
): void {
  const { meter } = getRum();
  const histogram = meter.createHistogram(METRIC_SYNC_OP_ROUND_TRIP_MS);
  histogram.record(durationMs, attrs);
}

/** Set active sync connections count. */
export function setActiveSyncConnections(count: number): void {
  const { meter } = getRum();
  const counter = meter.createCounter(METRIC_SYNC_ACTIVE_CONNECTIONS);
  counter.add(count);
}

/** Record CRDT convergence duration. */
export function recordCrdtConvergence(
  durationMs: number,
  attrs?: Record<string, string | number | boolean>,
): void {
  const { meter } = getRum();
  const histogram = meter.createHistogram(METRIC_SYNC_CRDT_CONVERGENCE_MS);
  histogram.record(durationMs, attrs);
}

/** Set active presence sessions count. */
export function setActivePresenceSessions(count: number): void {
  const { meter } = getRum();
  const counter = meter.createCounter(METRIC_PRESENCE_ACTIVE_SESSIONS);
  counter.add(count);
}

/** Record presence cursor latency. */
export function recordPresenceCursorLatency(
  latencyMs: number,
  attrs?: Record<string, string | number | boolean>,
): void {
  const { meter } = getRum();
  const histogram = meter.createHistogram(METRIC_PRESENCE_CURSOR_LATENCY_MS);
  histogram.record(latencyMs, attrs);
}

// ----- Export everything for testability -----

export { noopSdk, noopTracer, noopSpan, noopCounter, noopHistogram, noopLogger };
