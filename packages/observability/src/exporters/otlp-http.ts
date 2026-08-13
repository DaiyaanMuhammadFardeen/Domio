/**
 * Minimal OTLP/HTTP exporter for traces, metrics, and logs.
 *
 * We do not pull in the official `@opentelemetry/exporter-trace-otlp-http`
 * package because:
 *   1. The OTLP/HTTP wire format is small enough (~25 fields per
 *      resource) that we can serialize it ourselves.
 *   2. We want a single dependency-free implementation that works in
 *      tests without pulling in protobufjs or grpc.
 *   3. We want the exporter to be testable in isolation — every
 *      outgoing HTTP request is funneled through a single
 *      `transport` function that tests can stub.
 *
 * The shape emitted is `ExportTraceServiceRequest` (protobuf JSON
 * encoding). The collector accepts JSON on the OTLP/HTTP port at
 * `/v1/traces`, `/v1/metrics`, `/v1/logs`.
 */

import type { ResourceAttributes } from '../resource.js';
import { parseOtlpEndpoint, type EndpointError } from '../resource.js';

export type OtlpContentType = 'application/json';

export interface OtlpHttpExporterOptions {
  endpoint: string;
  /**
   * Headers to attach to every request. Common use-cases:
   *   - `Authorization: Bearer <token>`
   *   - `x-domio-tenant-id: org_123`
   */
  headers?: Record<string, string>;
  /**
   * Path overrides. Defaults to the OTLP/HTTP standard:
   *   - /v1/traces
   *   - /v1/metrics
   *   - /v1/logs
   */
  paths?: Partial<Record<OtlpSignal, string>>;
  /**
   * Transport used for outgoing requests. Defaults to `globalThis.fetch`.
   * Tests inject a fake to capture and assert against outgoing bytes.
   */
  transport?: OtlpTransport;
  /**
   * Override content type. Only `application/json` is supported today.
   */
  contentType?: OtlpContentType;
}

export type OtlpSignal = 'traces' | 'metrics' | 'logs';

export interface OtlpTransportRequest {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: Uint8Array;
  signal: AbortSignal;
}

export interface OtlpTransportResponse {
  status: number;
  statusText: string;
  body: string;
}

export type OtlpTransport = (req: OtlpTransportRequest) => Promise<OtlpTransportResponse>;

export class OtlpHttpExporter {
  private readonly endpoint: URL;
  private readonly headers: Record<string, string>;
  private readonly paths: Record<OtlpSignal, string>;
  private readonly transport: OtlpTransport;
  private readonly contentType: OtlpContentType;
  private closed = false;

  constructor(opts: OtlpHttpExporterOptions) {
    if (!opts || typeof opts.endpoint !== 'string') {
      throw new Error('OtlpHttpExporter requires { endpoint: string }');
    }
    this.endpoint = parseOtlpEndpoint(opts.endpoint);
    this.headers = opts.headers ?? {};
    this.paths = {
      traces: opts.paths?.traces ?? '/v1/traces',
      metrics: opts.paths?.metrics ?? '/v1/metrics',
      logs: opts.paths?.logs ?? '/v1/logs',
    };
    this.contentType = opts.contentType ?? 'application/json';
    this.transport = opts.transport ?? defaultFetchTransport;
  }

  /** Returns the endpoint base URL with no trailing slash. */
  get baseUrl(): string {
    return this.endpoint.toString().replace(/\/$/, '');
  }

  /** Returns the resolved URL for a signal. */
  urlFor(signal: OtlpSignal): string {
    return `${this.baseUrl}${this.paths[signal]}`;
  }

  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Export a JSON-encoded OTLP payload for the given signal. The body
   * MUST be a serializable JSON value; it is encoded with
   * `TextEncoder` so non-ASCII strings round-trip safely.
   */
  async exportJson(
    signal: OtlpSignal,
    payload: unknown,
    timeoutMs = 5_000,
  ): Promise<OtlpTransportResponse> {
    if (this.closed) {
      throw new Error('exporter is closed');
    }
    const body = encodeJson(payload);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.transport({
        url: this.urlFor(signal),
        method: 'POST',
        headers: {
          'Content-Type': this.contentType,
          ...this.headers,
        },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  /** Idempotent. Subsequent calls are no-ops. */
  async shutdown(): Promise<void> {
    this.closed = true;
  }
}

function encodeJson(payload: unknown): Uint8Array {
  const text = JSON.stringify(payload);
  return new TextEncoder().encode(text);
}

const defaultFetchTransport: OtlpTransport = async (req) => {
  const f = globalThis.fetch;
  if (typeof f !== 'function') {
    throw new Error('global fetch is unavailable');
  }
  const res = await f(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body,
    signal: req.signal,
  });
  const body = await res.text().catch(() => '');
  return {
    status: res.status,
    statusText: res.statusText,
    body,
  };
};

/**
 * Build the OTLP JSON wire-format `Resource` object from the
 * ResourceAttributes map.
 */
export function resourceToOtlp(attrs: ResourceAttributes): {
  attributes: Array<{ key: string; value: { stringValue: string } }>;
} {
  const out: Array<{ key: string; value: { stringValue: string } }> = [];
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue;
    out.push({ key: k, value: { stringValue: v } });
  }
  return { attributes: out };
}

export type { EndpointError };
