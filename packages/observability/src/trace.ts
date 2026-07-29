/**
 * Trace API — minimal OTLP-flavored span model.
 *
 * This is intentionally a hand-rolled shim rather than a wrapper around
 * `@opentelemetry/api`. The shim keeps the public surface small, the
 * dependency footprint zero, and the export wire-format deterministic
 * for tests. P02+ swaps in the real OpenTelemetry SDK; the public API
 * (startSpan / span.setAttribute / span.end / tracer.flush) stays
 * compatible.
 */

import type { ResourceAttributes } from './resource.js';
import type { OtlpHttpExporter } from './exporters/otlp-http.js';
import { resourceToOtlp } from './exporters/otlp-http.js';
import { getRedactor } from './redaction.js';

export interface SpanContext {
  traceId: string;
  spanId: string;
}

export interface SpanOptions {
  name: string;
  attributes?: Record<string, string | number | boolean>;
  parent?: SpanContext;
  startTime?: number; // ms epoch
  kind?: 'internal' | 'server' | 'client' | 'producer' | 'consumer';
}

export interface Span extends SpanContext {
  name: string;
  setAttribute(key: string, value: string | number | boolean): void;
  recordException(err: unknown): void;
  setStatus(status: 'ok' | 'error', message?: string): void;
  end(endTime?: number): void;
}

export interface Tracer {
  startSpan(name: string, options?: SpanOptions): Span;
  flush(): Promise<void>;
  shutdown(): Promise<void>;
  readonly resource: ResourceAttributes;
  readonly exporter: OtlpHttpExporter | null;
}

export interface TracerConfig {
  resource: ResourceAttributes;
  exporter: OtlpHttpExporter | null;
}

const TRACE_ID_RE = /^[0-9a-f]{32}$/;
const SPAN_ID_RE = /^[0-9a-f]{16}$/;

export class TracerError extends Error {
  override readonly name = 'TracerError';
}

export function generateTraceId(rng: () => number = Math.random): string {
  return randomHex(32, rng);
}

export function generateSpanId(rng: () => number = Math.random): string {
  return randomHex(16, rng);
}

function randomHex(n: number, rng: () => number): string {
  let out = '';
  for (let i = 0; i < n; i++) {
    out += Math.floor(rng() * 16).toString(16);
  }
  return out;
}

function nowMs(): number {
  return Date.now();
}

interface InternalSpanData {
  startMs: number;
  endMs?: number;
  kind: SpanOptions['kind'];
  attributes: Record<string, string | number | boolean>;
  events: Array<{ timeMs: number; name: string; attributes: Record<string, string | number | boolean> }>;
  status: { code: 'unset' | 'ok' | 'error'; message?: string | undefined };
  ended: boolean;
}

interface InternalSpan extends Span {
  __internal: InternalSpanData;
  parentSpanId?: string | undefined;
}

export function createTracer(cfg: TracerConfig): Tracer {
  const buffer: Array<{ spans: InternalSpan[] }> = [];
  let flushing = false;

  function takeBuffer(): InternalSpan[] {
    if (buffer.length === 0) return [];
    const all: InternalSpan[] = [];
    for (const b of buffer.splice(0, buffer.length)) all.push(...b.spans);
    return all;
  }

  return {
    resource: cfg.resource,
    exporter: cfg.exporter,
    startSpan(name, options: SpanOptions = { name }) {
      const traceId = options.parent?.traceId ?? generateTraceId();
      const spanId = generateSpanId();
      const parentSpanId = options.parent?.spanId;
      const startMs = options.startTime ?? nowMs();
      const attrs: Record<string, string | number | boolean> = {};
      if (options.attributes) Object.assign(attrs, options.attributes);

      const internal: InternalSpan = {
        traceId,
        spanId,
        name,
        setAttribute(key, value) {
          attrs[key] = value;
        },
        recordException(err) {
          const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
          this.__internal.events.push({
            timeMs: nowMs(),
            name: 'exception',
            attributes: { 'exception.message': msg.slice(0, 256) },
          });
          this.__internal.status = { code: 'error', message: msg.slice(0, 256) };
        },
        setStatus(status, message) {
          const next: InternalSpanData['status'] = { code: status };
          if (message !== undefined) next.message = message;
          this.__internal.status = next;
        },
        end(endTime) {
          if (this.__internal.ended) return; // idempotent
          this.__internal.ended = true;
          this.__internal.endMs = endTime ?? nowMs();
          buffer.push({ spans: [this] });
        },
        __internal: {
          startMs,
          kind: options.kind ?? 'internal',
          attributes: attrs,
          events: [],
          status: { code: 'unset' },
          ended: false,
        },
      };
      // Trace/span id validation.
      if (!TRACE_ID_RE.test(traceId)) throw new TracerError(`invalid traceId: ${traceId}`);
      if (!SPAN_ID_RE.test(spanId)) throw new TracerError(`invalid spanId: ${spanId}`);
      if (parentSpanId !== undefined && !SPAN_ID_RE.test(parentSpanId)) {
        throw new TracerError(`invalid parent spanId: ${parentSpanId}`);
      }
      // Decorate the span context object for ergonomics.
      if (parentSpanId !== undefined) internal.parentSpanId = parentSpanId;
      return internal;
    },
    async flush() {
      if (!cfg.exporter) return; // no-op mode
      const spans = takeBuffer();
      if (spans.length === 0) return;
      if (flushing) return; // already in flight, spans stay queued
      flushing = true;
      try {
        const redactor = getRedactor();
        const resource = resourceToOtlp(cfg.resource);
        const scopeSpans = new Map<string, InternalSpan[]>();
        for (const s of spans) {
          const key = (s as Span & { parentSpanId?: string }).parentSpanId ?? '';
          const arr = scopeSpans.get(key) ?? [];
          arr.push(s);
          scopeSpans.set(key, arr);
        }
        const otlpSpans = spans.map((s) => {
          const ev = s.__internal;
          const parentId = (s as Span & { parentSpanId?: string }).parentSpanId;
          const otlp: Record<string, unknown> = {
            traceId: s.traceId,
            spanId: s.spanId,
            name: s.name,
            kind: kindToOtlp(ev.kind),
            startTimeUnixNano: String(ev.startMs * 1_000_000),
            endTimeUnixNano: String((ev.endMs ?? ev.startMs) * 1_000_000),
            attributes: attrToOtlp(redactor.redactValue(ev.attributes)),
            events: ev.events.map((e) => ({
              timeUnixNano: String(e.timeMs * 1_000_000),
              name: e.name,
              attributes: attrToOtlp(redactor.redactValue(e.attributes)),
            })),
            status: { code: statusToOtlp(ev.status.code), message: ev.status.message ?? '' },
          };
          if (parentId) otlp['parentSpanId'] = parentId;
          return otlp;
        });
        const payload = {
          resourceSpans: [{ resource, scopeSpans: [{ scope: { name: '@domio/observability' }, spans: otlpSpans }] }],
        };
        await cfg.exporter.exportJson('traces', payload);
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

function attrToOtlp(attrs: Record<string, string | number | boolean>): Array<{ key: string; value: unknown }> {
  return Object.entries(attrs).map(([key, value]) => ({ key, value: scalarToOtlp(value) }));
}

function scalarToOtlp(v: string | number | boolean): unknown {
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { intValue: String(v) } : { doubleValue: v };
  return { boolValue: v };
}

function kindToOtlp(kind: SpanOptions['kind']): number {
  switch (kind) {
    case 'internal':
      return 1;
    case 'server':
      return 2;
    case 'client':
      return 3;
    case 'producer':
      return 4;
    case 'consumer':
      return 5;
    default:
      return 0;
  }
}

function statusToOtlp(code: 'unset' | 'ok' | 'error'): number {
  if (code === 'ok') return 1;
  if (code === 'error') return 2;
  return 0;
}