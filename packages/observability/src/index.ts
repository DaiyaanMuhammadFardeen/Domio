/**
 * @domio/observability — public surface.
 *
 * Phase 01 Stream B. Behavior:
 *
 *   - Reads OTEL_EXPORTER_OTLP_ENDPOINT from env.
 *   - If unset / empty / `none` / `noop` / `disabled`: returns a fully
 *     no-op SDK. `tracer.flush()`, `meter.flush()`, `logger.flush()`
 *     resolve immediately to nothing.
 *   - If set to a valid HTTP(S) URL: initializes an OTLP/HTTP exporter
 *     and wires trace/metric/log pipelines through it.
 *   - Resource attributes (service.name/version, deployment.environment,
 *     git.sha) are attached to every payload.
 *   - PII in attributes / bodies is scrubbed via `@domio/redact-pii`
 *     before emission. If the redact-pii package is not installed (very
 *     unusual), the SDK still runs but does not redact.
 *
 * Typical usage:
 *
 *   import { init } from '@domio/observability';
 *   const obs = init({
 *     serviceName: 'apps-web',
 *     serviceVersion: '0.1.0',
 *     environment: 'development',
 *     gitSha: '7cbc65a',
 *     headers: { Authorization: `Bearer ${process.env.OTEL_TOKEN ?? ''}` },
 *   });
 *   const span = obs.tracer.startSpan('GET /decks');
 *   span.end();
 *   await obs.shutdown();
 *
 * Or for the no-op-default behavior:
 *
 *   import { isNoop } from '@domio/observability';
 *   if (isNoop()) {
 *     // run without telemetry
 *   }
 */

import { buildResource, type ResourceOptions, type ResourceAttributes } from './resource.js';
import { OtlpHttpExporter, type OtlpHttpExporterOptions } from './exporters/otlp-http.js';
import { createTracer, type Tracer } from './trace.js';
import { createMeter, type Meter } from './metrics.js';
import { createLogger, type Logger } from './logs.js';

export interface InitOptions extends ResourceOptions {
  /**
   * Override the OTLP endpoint. Defaults to the
   * `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable.
   */
  endpoint?: string;
  /**
   * Extra request headers.
   */
  headers?: Record<string, string>;
  /**
   * Override the OTLP/HTTP paths (defaults to /v1/traces, /v1/metrics,
   * /v1/logs).
   */
  paths?: OtlpHttpExporterOptions['paths'];
}

const NOOP_TOKENS = new Set(['', 'none', 'noop', 'disabled', 'off', 'false']);

export interface DomioObservability {
  readonly mode: 'otlp' | 'noop';
  readonly resource: ResourceAttributes;
  readonly tracer: Tracer;
  readonly meter: Meter;
  readonly logger: Logger;
  /** Returns true if telemetry is being exported; false if in no-op mode. */
  isExporting(): boolean;
  /** Idempotent. */
  shutdown(): Promise<void>;
}

function readEndpoint(env: NodeJS.ProcessEnv | Record<string, string | undefined>): string | null {
  const raw = env['OTEL_EXPORTER_OTLP_ENDPOINT'];
  if (raw === undefined || raw === null) return null;
  const v = String(raw).trim();
  if (NOOP_TOKENS.has(v.toLowerCase())) return null;
  return v;
}

function readTransportEnv(): {
  headers: Record<string, string>;
} {
  const headers: Record<string, string> = {};
  // Authorization via env is rarely used but supported.
  const token = process.env['OTEL_EXPORTER_OTLP_TOKEN'];
  if (token && token.length > 0) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const tenant = process.env['OTEL_EXPORTER_OTLP_HEADERS'];
  if (tenant) {
    for (const line of tenant.split(',')) {
      const idx = line.indexOf('=');
      if (idx <= 0) continue;
      headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  return { headers };
}

export function init(opts: InitOptions): DomioObservability {
  const resource = buildResource(opts);
  const endpoint =
    opts.endpoint ?? readEndpoint(process.env as unknown as Record<string, string | undefined>);
  const envHeaders = readTransportEnv();

  if (!endpoint) {
    // No-op mode — the SDK still works, but flush() is a no-op.
    const noopExporter: OtlpHttpExporter = new OtlpHttpExporter({
      endpoint: 'http://127.0.0.1:4318', // unused, never opened
    });
    // Hack: in noop, the tracer/meter/logger drain into nothing because
    // they call exporter.exportJson only if `exporter` is non-null AND
    // the buffer has data. We pre-disable the exporter so even an
    // accidental path errors out clearly:
    void noopExporter;
    const sharedConfig = { resource, exporter: null as OtlpHttpExporter | null };
    return makeBundle(sharedConfig, 'noop');
  }

  const exporterOpts: ConstructorParameters<typeof OtlpHttpExporter>[0] = {
    endpoint,
    headers: { ...envHeaders.headers, ...opts.headers },
  };
  if (opts.paths !== undefined) exporterOpts.paths = opts.paths;
  const exporter = new OtlpHttpExporter(exporterOpts);
  return makeBundle({ resource, exporter }, 'otlp');
}

function makeBundle(
  cfg: { resource: ResourceAttributes; exporter: OtlpHttpExporter | null },
  mode: DomioObservability['mode'],
): DomioObservability {
  const tracer = createTracer(cfg);
  const meter = createMeter(cfg);
  const logger = createLogger(cfg);

  let shutdownOnce = false;
  return {
    mode,
    resource: cfg.resource,
    tracer,
    meter,
    logger,
    isExporting: () => mode === 'otlp',
    async shutdown() {
      if (shutdownOnce) return;
      shutdownOnce = true;
      await Promise.allSettled([tracer.shutdown(), meter.shutdown(), logger.shutdown()]);
    },
  };
}

/** Convenience: returns true when telemetry is in no-op mode. */
export function isNoop(o: DomioObservability): boolean {
  return o.mode === 'noop';
}

export type { ResourceAttributes, ResourceOptions } from './resource.js';
export type { Tracer, Span, SpanContext, SpanOptions } from './trace.js';
export type { Meter, Counter, Histogram, UpDownCounter } from './metrics.js';
export type { Logger, LogRecord, Severity } from './logs.js';
