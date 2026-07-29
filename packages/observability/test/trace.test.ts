import { describe, it, expect } from 'vitest';
import { createTracer, generateTraceId, generateSpanId, TracerError } from '../src/trace.js';
import {
  OtlpHttpExporter,
  type OtlpTransport,
  type OtlpTransportRequest,
} from '../src/exporters/otlp-http.js';
import { buildResource } from '../src/resource.js';

function makeExporter() {
  const calls: OtlpTransportRequest[] = [];
  const transport: OtlpTransport = async (req) => {
    calls.push(req);
    return { status: 200, statusText: 'OK', body: '' };
  };
  const exporter = new OtlpHttpExporter({ endpoint: 'http://collector:4318', transport });
  return { exporter, calls };
}

const TEST_RESOURCE = buildResource({
  serviceName: 'test-service',
  serviceVersion: '0.0.0',
  environment: 'test',
  gitSha: '0000007',
});

describe('createTracer — positive coverage', () => {
  it('startSpan returns a span with valid trace/span ids', () => {
    const t = createTracer({ resource: TEST_RESOURCE, exporter: null });
    const s = t.startSpan('GET /decks');
    expect(s.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(s.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(s.name).toBe('GET /decks');
  });

  it('flush() with no spans is a no-op (even with exporter)', async () => {
    const { exporter, calls } = makeExporter();
    const t = createTracer({ resource: TEST_RESOURCE, exporter });
    await t.flush();
    expect(calls).toHaveLength(0);
  });

  it('emits a span on flush() with valid OTLP JSON shape', async () => {
    const { exporter, calls } = makeExporter();
    const t = createTracer({ resource: TEST_RESOURCE, exporter });
    const s = t.startSpan('GET /decks', { attributes: { 'http.method': 'GET' } });
    s.end();
    await t.flush();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('http://collector:4318/v1/traces');
    const body = JSON.parse(new TextDecoder().decode(calls[0]!.body));
    expect(body.resourceSpans).toHaveLength(1);
    const rs = body.resourceSpans[0];
    expect(rs.resource.attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'service.name', value: { stringValue: 'test-service' } }),
      ]),
    );
    expect(rs.scopeSpans[0].spans).toHaveLength(1);
    const span = rs.scopeSpans[0].spans[0];
    expect(span.name).toBe('GET /decks');
    expect(span.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(span.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(span.attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'http.method', value: { stringValue: 'GET' } }),
      ]),
    );
  });

  it('end() is idempotent and flush only sends once', async () => {
    const { exporter, calls } = makeExporter();
    const t = createTracer({ resource: TEST_RESOURCE, exporter });
    const s = t.startSpan('op');
    s.end();
    s.end();
    s.end();
    await t.flush();
    expect(calls).toHaveLength(1);
  });

  it('parent span id is included when provided', async () => {
    const { exporter, calls } = makeExporter();
    const t = createTracer({ resource: TEST_RESOURCE, exporter });
    const parent = t.startSpan('parent');
    parent.end();
    const child = t.startSpan('child', { parent: { traceId: parent.traceId, spanId: parent.spanId } });
    child.end();
    await t.flush();
    const body = JSON.parse(new TextDecoder().decode(calls[0]!.body));
    const spans = body.resourceSpans[0].scopeSpans[0].spans;
    const childSpan = spans.find((x: { name: string }) => x.name === 'child');
    expect(childSpan.parentSpanId).toBe(parent.spanId);
    expect(childSpan.traceId).toBe(parent.traceId);
  });

  it('recordException stamps an event and status=error', async () => {
    const { exporter, calls } = makeExporter();
    const t = createTracer({ resource: TEST_RESOURCE, exporter });
    const s = t.startSpan('op');
    try {
      throw new Error('boom');
    } catch (e) {
      s.recordException(e);
    }
    s.end();
    await t.flush();
    const body = JSON.parse(new TextDecoder().decode(calls[0]!.body));
    const span = body.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.status.code).toBe(2);
    expect(span.events).toHaveLength(1);
    expect(span.events[0].name).toBe('exception');
  });

  it('setStatus(name, msg) sets status code and message', async () => {
    const { exporter, calls } = makeExporter();
    const t = createTracer({ resource: TEST_RESOURCE, exporter });
    const s = t.startSpan('op');
    s.setStatus('error', 'something bad');
    s.end();
    await t.flush();
    const body = JSON.parse(new TextDecoder().decode(calls[0]!.body));
    const span = body.resourceSpans[0].scopeSpans[0].spans[0];
    expect(span.status.code).toBe(2);
    expect(span.status.message).toBe('something bad');
  });

  it('successive flushes drain only newly ended spans', async () => {
    const { exporter, calls } = makeExporter();
    const t = createTracer({ resource: TEST_RESOURCE, exporter });
    const s1 = t.startSpan('s1');
    s1.end();
    await t.flush();
    const s2 = t.startSpan('s2');
    s2.end();
    await t.flush();
    expect(calls).toHaveLength(2);
    const body1 = JSON.parse(new TextDecoder().decode(calls[0]!.body));
    const body2 = JSON.parse(new TextDecoder().decode(calls[1]!.body));
    expect(body1.resourceSpans[0].scopeSpans[0].spans[0].name).toBe('s1');
    expect(body2.resourceSpans[0].scopeSpans[0].spans[0].name).toBe('s2');
  });

  it('flush() with no exporter is a no-op (no throw)', async () => {
    const t = createTracer({ resource: TEST_RESOURCE, exporter: null });
    const s = t.startSpan('op');
    s.end();
    await t.flush();
    expect(true).toBe(true);
  });

  it('shutdown() flushes pending spans and shuts down the exporter', async () => {
    const { exporter, calls } = makeExporter();
    const t = createTracer({ resource: TEST_RESOURCE, exporter });
    const s = t.startSpan('op');
    s.end();
    await t.shutdown();
    expect(calls).toHaveLength(1);
    expect(exporter.isClosed()).toBe(true);
  });
});

describe('createTracer — negative coverage', () => {
  it('rejects invalid parent spanId', () => {
    const t = createTracer({ resource: TEST_RESOURCE, exporter: null });
    expect(() =>
      t.startSpan('child', { parent: { traceId: 'aa'.repeat(16), spanId: 'bad' } }),
    ).toThrow(TracerError);
  });

  it('generateTraceId / generateSpanId produce valid hex of the right length', () => {
    for (let i = 0; i < 50; i++) {
      const t = generateTraceId();
      const s = generateSpanId();
      expect(t).toHaveLength(32);
      expect(s).toHaveLength(16);
      expect(t).toMatch(/^[0-9a-f]+$/);
      expect(s).toMatch(/^[0-9a-f]+$/);
    }
  });

  it('uses the provided RNG when generating ids', () => {
    let n = 0;
    const rng = () => {
      n += 1;
      return 0;
    };
    const t = generateTraceId(rng);
    expect(t).toHaveLength(32);
    expect(t).toMatch(/^0+$/);
    expect(n).toBeGreaterThan(0);
  });

  it('empty span name is accepted (caller can decide)', () => {
    const t = createTracer({ resource: TEST_RESOURCE, exporter: null });
    const s = t.startSpan('');
    expect(s.name).toBe('');
  });

  it('setting an attribute on an ended span still works (does not throw)', () => {
    const t = createTracer({ resource: TEST_RESOURCE, exporter: null });
    const s = t.startSpan('op');
    s.end();
    s.setAttribute('late', 'value');
    expect(s).toBeDefined();
  });

  it('export errors propagate from the transport', async () => {
    const fail: OtlpTransport = async () => {
      throw new Error('boom');
    };
    const exporter = new OtlpHttpExporter({ endpoint: 'http://collector', transport: fail });
    const t = createTracer({ resource: TEST_RESOURCE, exporter });
    const s = t.startSpan('op');
    s.end();
    await expect(t.flush()).rejects.toThrow('boom');
  });
});
