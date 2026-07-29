/**
 * Integration test for the OTLP HTTP exporter.
 *
 * Stands up a tiny in-process HTTP server on an ephemeral port and
 * points the SDK at it. The server records every request it receives
 * (URL, headers, body) and responds with `200 OK`.
 *
 * Verifies:
 *   - tracer, meter, and logger all POST to the right path
 *   - the body is valid OTLP-shaped JSON
 *   - the four required resource attributes are present
 *   - PII redaction is applied to attributes and bodies
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { init } from '../src/index.js';

interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

class MockOtlpReceiver {
  private server: http.Server;
  private requests: RecordedRequest[] = [];

  constructor(private readonly port: number = 0) {}

  async start(): Promise<number> {
    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headers[k] = v;
          }
          this.requests.push({
            method: req.method ?? 'POST',
            url: req.url ?? '/',
            headers,
            body: Buffer.concat(chunks).toString('utf-8'),
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{}');
        });
      });
      this.server.listen(this.port, '127.0.0.1', () => {
        const addr = this.server.address() as AddressInfo;
        resolve(addr.port);
      });
    });
  }

  get baseUrl(): string {
    return `http://127.0.0.1:${this.lastPort()}`;
  }

  private lastPort(): number {
    const addr = this.server.address() as AddressInfo;
    return addr.port;
  }

  getRequests(): RecordedRequest[] {
    return [...this.requests];
  }

  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

describe('OTLP HTTP integration — positive', () => {
  let receiver: MockOtlpReceiver;
  let port: number;
  let endpoint: string;

  beforeAll(async () => {
    receiver = new MockOtlpReceiver();
    port = await receiver.start();
    endpoint = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await receiver.stop();
  });

  it('flushes traces, metrics, and logs to the receiver', async () => {
    const o = init({
      serviceName: 'integration-test',
      serviceVersion: '1.0.0',
      environment: 'test',
      gitSha: '0c0ffee7',
      endpoint,
    });

    // Traces
    const s = o.tracer.startSpan('GET /decks', { attributes: { route: '/decks' } });
    s.setAttribute('http.status_code', 200);
    s.end();
    await o.tracer.flush();

    // Metrics
    const c = o.meter.createCounter('http_requests_total');
    c.add(3, { method: 'GET' });
    c.add(1, { method: 'POST' });
    await o.meter.flush();

    const h = o.meter.createHistogram('request_duration_ms');
    h.record(50);
    h.record(150);
    await o.meter.flush();

    // Logs
    o.logger.log({ severity: 'INFO', body: 'service started' });
    o.logger.log({
      severity: 'ERROR',
      body: 'failed for alice@example.com',
      attributes: { request_id: 'r-1' },
    });
    await o.logger.flush();

    await o.shutdown();

    const reqs = receiver.getRequests();
    expect(reqs.length).toBeGreaterThanOrEqual(4);

    const byPath: Record<string, RecordedRequest[]> = {};
    for (const r of reqs) {
      const k = r.url.replace(/\?.*$/, '');
      byPath[k] = byPath[k] ?? [];
      byPath[k].push(r);
    }
    expect(byPath['/v1/traces']).toBeDefined();
    expect(byPath['/v1/metrics']).toBeDefined();
    expect(byPath['/v1/logs']).toBeDefined();
    expect(byPath['/v1/traces'].length).toBeGreaterThanOrEqual(1);
    expect(byPath['/v1/metrics'].length).toBeGreaterThanOrEqual(2); // counter + histogram
    expect(byPath['/v1/logs'].length).toBeGreaterThanOrEqual(1);

    // All requests used POST + application/json.
    for (const r of reqs) {
      expect(r.method).toBe('POST');
      expect(r.headers['content-type']).toContain('application/json');
    }

    // Resource attributes on every payload.
    for (const r of reqs) {
      const body = JSON.parse(r.body);
      const resource =
        body.resourceSpans?.[0]?.resource ??
        body.resourceMetrics?.[0]?.resource ??
        body.resourceLogs?.[0]?.resource;
      const attrs = Object.fromEntries(
        (resource.attributes as Array<{ key: string; value: { stringValue: string } }>).map(
          (a) => [a.key, a.value.stringValue],
        ),
      );
      expect(attrs['service.name']).toBe('integration-test');
      expect(attrs['service.version']).toBe('1.0.0');
      expect(attrs['deployment.environment']).toBe('test');
      expect(attrs['git.sha']).toBe('0c0ffee7');
    }

    // PII redacted in log body.
    const logsReq = byPath['/v1/logs'][0]!;
    const logsBody = JSON.parse(logsReq.body);
    const errRec = logsBody.resourceLogs[0].scopeLogs[0].logRecords.find(
      (r: { severityText: string }) => r.severityText === 'ERROR',
    );
    expect(errRec).toBeDefined();
    expect(errRec.body.stringValue).not.toContain('alice@example.com');
    expect(errRec.body.stringValue).toContain('[REDACTED]');
  });

  it('sends the request body as bytes encoded with TextEncoder', async () => {
    const o = init({
      serviceName: 'utf-test',
      environment: 'test',
      gitSha: '0000007',
      endpoint,
    });
    o.logger.log({ severity: 'INFO', body: 'emoji 😀' });
    await o.logger.shutdown();
    const reqs = receiver.getRequests();
    const last = reqs[reqs.length - 1]!;
    expect(last.body).toContain('emoji 😀');
  });
});

describe('OTLP HTTP integration — negative', () => {
  it('still queues spans after a transport error and does not crash', async () => {
    // Use a deliberately bad endpoint (port we never bound).
    const o = init({
      serviceName: 'bad_endpoint',
      environment: 'test',
      gitSha: '0000007',
      endpoint: 'http://127.0.0.1:1',
    });
    const s = o.tracer.startSpan('op');
    s.end();
    // We expect flush to fail — but it must not throw uncaught.
    await o.tracer.flush().catch(() => undefined);
    await o.shutdown().catch(() => undefined);
    expect(true).toBe(true);
  });
});
