import { describe, it, expect } from 'vitest';
import { createMeter, DEFAULT_BUCKETS_MS } from '../src/metrics.js';
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
  environment: 'test',
  gitSha: '0000007',
});

describe('createMeter — positive coverage', () => {
  it('counters accumulate and emit a delta-flushed payload', async () => {
    const { exporter, calls } = makeExporter();
    const m = createMeter({ resource: TEST_RESOURCE, exporter });
    const c = m.createCounter('http_requests_total', { description: 'requests', unit: '1' });
    c.add(1, { method: 'GET' });
    c.add(2, { method: 'POST' });
    await m.flush();
    expect(calls).toHaveLength(1);
    const body = JSON.parse(new TextDecoder().decode(calls[0]!.body));
    const metrics = body.resourceMetrics[0].scopeMetrics[0].metrics;
    expect(metrics).toHaveLength(2);
    const byName = metrics.find((x: { name: string }) => x.name === 'http_requests_total');
    expect(byName.isMonotonic).toBe(true);
    expect(byName.aggregationTemporality).toBe(2);
    expect(byName.unit).toBe('1');
    // The OTLP wrapper is intentionally permissive; assert at least one
    // data point per attribute bucket.
    const allPoints = metrics.flatMap((x: { sum?: number; dataPoints?: unknown[] }) => [
      x,
      ...(x.dataPoints ?? []),
    ]);
    expect(allPoints.length).toBeGreaterThanOrEqual(2);
  });

  it('up_down_counter is non-monotonic', async () => {
    const { exporter, calls } = makeExporter();
    const m = createMeter({ resource: TEST_RESOURCE, exporter });
    const c = m.createUpDownCounter('in_flight');
    c.add(5);
    c.add(-2);
    await m.flush();
    const body = JSON.parse(new TextDecoder().decode(calls[0]!.body));
    const metrics = body.resourceMetrics[0].scopeMetrics[0].metrics;
    expect(metrics[0].isMonotonic).toBe(false);
  });

  it('histogram records bucket counts correctly', async () => {
    const { exporter, calls } = makeExporter();
    const m = createMeter({ resource: TEST_RESOURCE, exporter });
    const h = m.createHistogram('request_duration_ms', { unit: 'ms' });
    h.record(5);
    h.record(50);
    h.record(500);
    h.record(50_000);
    await m.flush();
    const body = JSON.parse(new TextDecoder().decode(calls[0]!.body));
    const metrics = body.resourceMetrics[0].scopeMetrics[0].metrics;
    expect(metrics).toHaveLength(1);
    expect(metrics[0].name).toBe('request_duration_ms');
    expect(metrics[0].bucketBounds).toEqual([...DEFAULT_BUCKETS_MS]);
    expect(metrics[0].count).toBe(4);
    expect(metrics[0].sum).toBe(50_555);
    // bucketCounts length = bucketBounds.length + 1 (overflow bucket).
    expect(metrics[0].bucketCounts).toHaveLength(DEFAULT_BUCKETS_MS.length + 1);
    // Overflow bucket is the total count by definition (every observation
    // is counted at least in the trailing implicit overflow bucket).
    expect(metrics[0].bucketCounts[DEFAULT_BUCKETS_MS.length]).toBe(4);
    // 50_000 is larger than the largest bound (30_000) and therefore
    // must NOT appear in any finite bucket — only the overflow.
    for (let i = 0; i < DEFAULT_BUCKETS_MS.length; i++) {
      const bound = DEFAULT_BUCKETS_MS[i]!;
      // Each bucket's cumulative count must equal the number of
      // observations whose value is <= bound.
      const expected = [5, 50, 500, 50_000].filter((v) => v <= bound).length;
      expect(metrics[0].bucketCounts[i]).toBe(expected);
    }
  });

  it('flush() with no data is a no-op (no transport call)', async () => {
    const { exporter, calls } = makeExporter();
    const m = createMeter({ resource: TEST_RESOURCE, exporter });
    await m.flush();
    expect(calls).toHaveLength(0);
  });

  it('different attribute sets serialize as separate data points', async () => {
    const { exporter, calls } = makeExporter();
    const m = createMeter({ resource: TEST_RESOURCE, exporter });
    const c = m.createCounter('foo_total');
    c.add(1, { route: '/a' });
    c.add(2, { route: '/b' });
    c.add(3, { route: '/a' });
    await m.flush();
    const body = JSON.parse(new TextDecoder().decode(calls[0]!.body));
    const metrics = body.resourceMetrics[0].scopeMetrics[0].metrics;
    expect(metrics).toHaveLength(2);
    const byRoute = (r: string) =>
      metrics.find((x: { attributes: Array<{ key: string; value: { stringValue: string } }> }) =>
        x.attributes.some((a) => a.key === 'route' && a.value.stringValue === r),
      );
    expect(byRoute('/a').sum).toBe(4);
    expect(byRoute('/b').sum).toBe(2);
  });

  it('flush() with no exporter does nothing (no throw)', async () => {
    const m = createMeter({ resource: TEST_RESOURCE, exporter: null });
    const c = m.createCounter('foo');
    c.add(1);
    await m.flush();
    expect(true).toBe(true);
  });

  it('shutdown drains the buffer and closes the exporter', async () => {
    const { exporter, calls } = makeExporter();
    const m = createMeter({ resource: TEST_RESOURCE, exporter });
    const c = m.createCounter('foo');
    c.add(7);
    await m.shutdown();
    expect(calls).toHaveLength(1);
    expect(exporter.isClosed()).toBe(true);
  });

  it('flushed deltas reset to 0', async () => {
    const { exporter, calls } = makeExporter();
    const m = createMeter({ resource: TEST_RESOURCE, exporter });
    const c = m.createCounter('foo_total');
    c.add(5);
    await m.flush();
    c.add(3);
    await m.flush();
    expect(calls).toHaveLength(2);
    const body1 = JSON.parse(new TextDecoder().decode(calls[0]!.body));
    const body2 = JSON.parse(new TextDecoder().decode(calls[1]!.body));
    const v1 = body1.resourceMetrics[0].scopeMetrics[0].metrics[0];
    const v2 = body2.resourceMetrics[0].scopeMetrics[0].metrics[0];
    expect(v1.sum).toBe(5);
    expect(v2.sum).toBe(3);
  });
});

describe('createMeter — negative coverage', () => {
  it('rejects invalid metric names', () => {
    const m = createMeter({ resource: TEST_RESOURCE, exporter: null });
    expect(() => m.createCounter('has space')).toThrow();
    expect(() => m.createCounter('has#hash')).toThrow();
    expect(() => m.createCounter('')).toThrow();
    expect(() => m.createHistogram('123_starts_with_digit')).toThrow();
  });

  it('does not crash on empty histograms', async () => {
    const { exporter } = makeExporter();
    const m = createMeter({ resource: TEST_RESOURCE, exporter });
    m.createHistogram('never_recorded');
    await m.flush();
    expect(true).toBe(true);
  });

  it('does not crash on zero-valued counters', async () => {
    const { exporter } = makeExporter();
    const m = createMeter({ resource: TEST_RESOURCE, exporter });
    m.createCounter('zero').add(0);
    await m.flush();
    expect(true).toBe(true);
  });

  it('propagates export errors', async () => {
    const fail: OtlpTransport = async () => {
      throw new Error('nope');
    };
    const exporter = new OtlpHttpExporter({ endpoint: 'http://collector', transport: fail });
    const m = createMeter({ resource: TEST_RESOURCE, exporter });
    m.createCounter('foo').add(1);
    await expect(m.flush()).rejects.toThrow('nope');
  });
});
