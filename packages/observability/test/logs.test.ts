import { describe, it, expect, beforeAll } from 'vitest';
import { createLogger } from '../src/logs.js';
import {
  OtlpHttpExporter,
  type OtlpTransport,
  type OtlpTransportRequest,
} from '../src/exporters/otlp-http.js';
import { buildResource } from '../src/resource.js';
import { ensureRedactor } from '../src/redaction.js';

beforeAll(async () => {
  // The redaction adapter resolves the workspace `@domio/redact-pii`
  // package lazily so it never blocks log/metric emission. Tests
  // must await the resolution once before asserting on PII markers.
  await ensureRedactor();
});

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

describe('createLogger — positive coverage', () => {
  it('emits logs to /v1/logs with the right OTLP shape', async () => {
    const { exporter, calls } = makeExporter();
    const l = createLogger({ resource: TEST_RESOURCE, exporter });
    l.log({ severity: 'INFO', body: 'hello world', attributes: { req_id: 'r1' } });
    l.log({ severity: 'ERROR', body: 'oops' });
    await l.flush();
    expect(calls).toHaveLength(1);
    const body = JSON.parse(new TextDecoder().decode(calls[0]!.body));
    const records = body.resourceLogs[0].scopeLogs[0].logRecords;
    expect(records).toHaveLength(2);
    expect(records[0].body).toEqual({ stringValue: 'hello world' });
    expect(records[0].severityText).toBe('INFO');
    expect(records[0].severityNumber).toBe(9);
    expect(records[1].severityText).toBe('ERROR');
    expect(records[1].severityNumber).toBe(17);
    // Resource attributes are attached
    const attrs = body.resourceLogs[0].resource.attributes;
    expect(attrs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'service.name', value: { stringValue: 'test-service' } }),
      ]),
    );
  });

  it('defaultAttributes are merged into every record', async () => {
    const { exporter, calls } = makeExporter();
    const l = createLogger({
      resource: TEST_RESOURCE,
      exporter,
      defaultAttributes: { 'service.version': '0.1.0' },
    });
    l.log({ severity: 'DEBUG', body: 'x' });
    await l.flush();
    const body = JSON.parse(new TextDecoder().decode(calls[0]!.body));
    const attrs = body.resourceLogs[0].scopeLogs[0].logRecords[0].attributes;
    expect(attrs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'service.version', value: { stringValue: '0.1.0' } }),
      ]),
    );
  });

  it('child logger inherits resource + parent attrs', async () => {
    const { exporter, calls } = makeExporter();
    const l = createLogger({
      resource: TEST_RESOURCE,
      exporter,
      defaultAttributes: { app: 'web' },
    });
    const child = l.child({ component: 'editor' });
    child.log({ severity: 'INFO', body: 'paint' });
    await child.flush();
    const body = JSON.parse(new TextDecoder().decode(calls[0]!.body));
    const attrs = body.resourceLogs[0].scopeLogs[0].logRecords[0].attributes;
    const map = Object.fromEntries(
      attrs.map((a: { key: string; value: { stringValue: string } }) => [
        a.key,
        a.value.stringValue,
      ]),
    );
    expect(map['app']).toBe('web');
    expect(map['component']).toBe('editor');
  });

  it('flush() with no records is a no-op', async () => {
    const { exporter, calls } = makeExporter();
    const l = createLogger({ resource: TEST_RESOURCE, exporter });
    await l.flush();
    expect(calls).toHaveLength(0);
  });

  it('PII in log body is redacted before export', async () => {
    const { exporter, calls } = makeExporter();
    const l = createLogger({ resource: TEST_RESOURCE, exporter });
    l.log({ severity: 'INFO', body: 'contact alice@example.com for details' });
    await l.flush();
    const body = JSON.parse(new TextDecoder().decode(calls[0]!.body));
    const record = body.resourceLogs[0].scopeLogs[0].logRecords[0];
    expect(record.body.stringValue).not.toContain('alice@example.com');
    // redact-pii uses structured markers like `[redacted:email]` so the
    // redaction category is preserved for downstream dashboards.
    expect(record.body.stringValue).toMatch(/\[redacted:/);
  });

  it('PII in attributes is redacted before export', async () => {
    const { exporter, calls } = makeExporter();
    const l = createLogger({ resource: TEST_RESOURCE, exporter });
    l.log({
      severity: 'INFO',
      body: 'login',
      attributes: { user_email: 'a@b.com', 'tenant.id': 'org_1' },
    });
    await l.flush();
    const body = JSON.parse(new TextDecoder().decode(calls[0]!.body));
    const attrs = body.resourceLogs[0].scopeLogs[0].logRecords[0].attributes;
    const map = Object.fromEntries(
      attrs.map((a: { key: string; value: { stringValue: string } }) => [
        a.key,
        a.value.stringValue,
      ]),
    );
    // Emails in attribute values are redacted with a `[redacted:...]`
    // marker; the exact category depends on the key/value matchers.
    expect(map['user_email']).toMatch(/\[redacted:/);
    expect(map['tenant.id']).toBe('org_1');
  });

  it('flush() with no exporter is a no-op (does not throw)', async () => {
    const l = createLogger({ resource: TEST_RESOURCE, exporter: null });
    l.log({ severity: 'INFO', body: 'hi' });
    await l.flush();
    expect(true).toBe(true);
  });

  it('shutdown drains the buffer and closes the exporter', async () => {
    const { exporter, calls } = makeExporter();
    const l = createLogger({ resource: TEST_RESOURCE, exporter });
    l.log({ severity: 'INFO', body: 'final' });
    await l.shutdown();
    expect(calls).toHaveLength(1);
    expect(exporter.isClosed()).toBe(true);
  });

  it('all severities serialize to the right OTLP number', async () => {
    const { exporter, calls } = makeExporter();
    const l = createLogger({ resource: TEST_RESOURCE, exporter });
    const cases: Array<['TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL', number]> = [
      ['TRACE', 1],
      ['DEBUG', 5],
      ['INFO', 9],
      ['WARN', 13],
      ['ERROR', 17],
      ['FATAL', 21],
    ];
    for (const [s] of cases) {
      l.log({ severity: s, body: `${s} message` });
    }
    await l.flush();
    const body = JSON.parse(new TextDecoder().decode(calls[0]!.body));
    const records = body.resourceLogs[0].scopeLogs[0].logRecords;
    for (let i = 0; i < cases.length; i++) {
      expect(records[i].severityNumber).toBe(cases[i]![1]);
    }
  });
});

describe('createLogger — negative coverage', () => {
  it('flush() with exporter=null does not crash on bad input', async () => {
    const l = createLogger({ resource: TEST_RESOURCE, exporter: null });
    await l.flush();
    expect(true).toBe(true);
  });

  it('propagates transport errors on flush', async () => {
    const fail: OtlpTransport = async () => {
      throw new Error('500');
    };
    const exporter = new OtlpHttpExporter({ endpoint: 'http://collector', transport: fail });
    const l = createLogger({ resource: TEST_RESOURCE, exporter });
    l.log({ severity: 'ERROR', body: 'oh' });
    await expect(l.flush()).rejects.toThrow('500');
  });

  it('does not crash when the body is empty', async () => {
    const { exporter, calls } = makeExporter();
    const l = createLogger({ resource: TEST_RESOURCE, exporter });
    l.log({ severity: 'INFO', body: '' });
    await l.flush();
    expect(calls).toHaveLength(1);
  });

  it('shutdown is idempotent', async () => {
    const { exporter } = makeExporter();
    const l = createLogger({ resource: TEST_RESOURCE, exporter });
    await l.shutdown();
    await l.shutdown();
    await l.shutdown();
    expect(exporter.isClosed()).toBe(true);
  });
});
