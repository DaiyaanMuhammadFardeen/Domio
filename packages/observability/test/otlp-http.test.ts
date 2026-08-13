import { describe, it, expect } from 'vitest';
import {
  OtlpHttpExporter,
  type OtlpTransport,
  type OtlpTransportRequest,
  type OtlpTransportResponse,
} from '../src/exporters/otlp-http.js';

function fakeTransport(
  impl: (req: OtlpTransportRequest) => Promise<OtlpTransportResponse> | OtlpTransportResponse,
): { transport: OtlpTransport; calls: OtlpTransportRequest[] } {
  const calls: OtlpTransportRequest[] = [];
  const transport: OtlpTransport = async (req) => {
    calls.push(req);
    return await Promise.resolve(impl(req));
  };
  return { transport, calls };
}

describe('OtlpHttpExporter — positive coverage', () => {
  it('initializes with a valid endpoint', () => {
    const e = new OtlpHttpExporter({ endpoint: 'http://localhost:4318' });
    expect(e.baseUrl).toBe('http://localhost:4318');
    expect(e.urlFor('traces')).toBe('http://localhost:4318/v1/traces');
    expect(e.urlFor('metrics')).toBe('http://localhost:4318/v1/metrics');
    expect(e.urlFor('logs')).toBe('http://localhost:4318/v1/logs');
  });

  it('preserves a custom path on the URL', () => {
    const e = new OtlpHttpExporter({
      endpoint: 'http://collector',
      paths: { traces: '/ingest/traces' },
    });
    expect(e.urlFor('traces')).toBe('http://collector/ingest/traces');
    expect(e.urlFor('metrics')).toBe('http://collector/v1/metrics');
  });

  it('strips a trailing slash from the endpoint', () => {
    const e = new OtlpHttpExporter({ endpoint: 'http://collector/' });
    expect(e.baseUrl).toBe('http://collector');
  });

  it('sends POST to the right URL with Content-Type: application/json', async () => {
    const { transport, calls } = fakeTransport(async () => ({
      status: 200,
      statusText: 'OK',
      body: '',
    }));
    const e = new OtlpHttpExporter({ endpoint: 'http://collector:4318', transport });
    await e.exportJson('traces', { foo: 'bar' });
    expect(calls).toHaveLength(1);
    const req = calls[0]!;
    expect(req.method).toBe('POST');
    expect(req.url).toBe('http://collector:4318/v1/traces');
    expect(req.headers['Content-Type']).toBe('application/json');
    expect(new TextDecoder().decode(req.body)).toBe('{"foo":"bar"}');
  });

  it('attaches custom headers', async () => {
    const { transport, calls } = fakeTransport(async () => ({
      status: 200,
      statusText: 'OK',
      body: '',
    }));
    const e = new OtlpHttpExporter({
      endpoint: 'http://collector',
      headers: { Authorization: 'Bearer xyz', 'x-tenant': 'org_1' },
      transport,
    });
    await e.exportJson('logs', { hi: 1 });
    expect(calls[0]!.headers['Authorization']).toBe('Bearer xyz');
    expect(calls[0]!.headers['x-tenant']).toBe('org_1');
  });

  it('shutdown() is idempotent', async () => {
    const e = new OtlpHttpExporter({ endpoint: 'http://collector' });
    await e.shutdown();
    await e.shutdown();
    await e.shutdown();
    expect(e.isClosed()).toBe(true);
  });

  it('rejects export after shutdown', async () => {
    const e = new OtlpHttpExporter({ endpoint: 'http://collector' });
    await e.shutdown();
    await expect(e.exportJson('traces', {})).rejects.toThrow(/closed/);
  });

  it('constructs a URL with https', () => {
    const e = new OtlpHttpExporter({ endpoint: 'https://collector.example.com' });
    expect(e.baseUrl).toBe('https://collector.example.com');
  });
});

describe('OtlpHttpExporter — negative coverage', () => {
  it('throws on missing endpoint', () => {
    expect(() => new OtlpHttpExporter({ endpoint: '' })).toThrow();
    expect(() => new OtlpHttpExporter({} as { endpoint: string })).toThrow();
  });

  it('throws on malformed endpoint', () => {
    expect(() => new OtlpHttpExporter({ endpoint: 'not-a-url' })).toThrow();
    expect(() => new OtlpHttpExporter({ endpoint: 'ftp://nope' })).toThrow();
  });

  it('aborts when transport times out', async () => {
    const transport: OtlpTransport = (req) =>
      new Promise((_resolve, reject) => {
        req.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const e = new OtlpHttpExporter({ endpoint: 'http://collector', transport });
    await expect(e.exportJson('traces', { a: 1 }, 25)).rejects.toThrow();
  });

  it('propagates a non-2xx response body', async () => {
    const transport: OtlpTransport = async () => ({
      status: 500,
      statusText: 'Internal Server Error',
      body: 'boom',
    });
    const e = new OtlpHttpExporter({ endpoint: 'http://collector', transport });
    const res = await e.exportJson('traces', { a: 1 });
    expect(res.status).toBe(500);
    expect(res.body).toBe('boom');
  });
});
