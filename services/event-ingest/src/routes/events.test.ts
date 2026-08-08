/**
 * End-to-end test for POST /v1/events (Phase 17 W1).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { buildApp } from '../server.js';
import { buildHmacVerifier, HMAC_HEADER_NAME, TIMESTAMP_HEADER_NAME, NONCE_HEADER_NAME } from '../hmac.js';
import { buildMemoryNonceCache } from '../nonce.js';
import { buildPiiStripper } from '../pii.js';
import { buildInMemoryKafkaPublisher, buildFailingKafkaPublisher } from '../kafka.js';
import { buildInMemorySpool } from '../spool.js';
import { buildInMemoryNatsBridge } from '../nats_bridge.js';
import { buildInMemoryDlq } from '../dlq.js';
import { buildInMemoryMetrics } from '../metrics/metrics.js';
import { buildPassthroughValidator } from '../validation.js';
import type { IngestDeps } from '../deps.js';
import type { IngestConfig } from '../types.js';
import { loadConfigFromEnv } from '../types.js';

const KEY = '00112233445566778899aabbccddeeff';

function defaultConfig(): IngestConfig {
  return {
    ...loadConfigFromEnv(),
    hmacKeyHex: KEY,
    maxBatchSize: 100,
    maxBatchBytes: 1024 * 64,
    maxClockSkewMs: 60_000,
    nonceTtlMs: 60_000,
    acceptPrivacyModes: ['identified', 'pseudonymous', 'anon_consent'],
    // Use test-only deps via overrides in beforeEach.
  };
}

function buildDeps(overrides: Partial<IngestDeps> = {}): IngestDeps {
  const cfg = defaultConfig();
  return {
    cfg,
    validator: buildPassthroughValidator(),
    pii: buildPiiStripper(),
    hmac: buildHmacVerifier(KEY),
    nonces: buildMemoryNonceCache(),
    publisher: buildInMemoryKafkaPublisher(),
    spool: buildInMemorySpool(),
    nats: buildInMemoryNatsBridge(),
    dlq: buildInMemoryDlq(),
    metrics: buildInMemoryMetrics(),
    nextSeq: (() => {
      let n = 0;
      return () => {
        n += 1;
        return n;
      };
    })(),
    ...overrides,
  };
}

function signedHeaders(rawBody: string, ts: number, nonce: string): HeadersInit {
  const verifier = buildHmacVerifier(KEY);
  const sig = verifier.sign(rawBody, ts, nonce);
  return {
    'content-type': 'application/json',
    [HMAC_HEADER_NAME]: sig,
    [TIMESTAMP_HEADER_NAME]: String(ts),
    [NONCE_HEADER_NAME]: nonce,
  };
}

describe('POST /v1/events', () => {
  let deps: IngestDeps;
  let app: ReturnType<typeof buildApp>;
  beforeEach(async () => {
    deps = buildDeps();
    app = buildApp(deps);
    await deps.nats.start(async () => {
      /* no-op bridge for tests */
    });
  });

  it('accepts a single valid event', async () => {
    const body = JSON.stringify({
      event_id: 'e-1',
      event_name: 'view',
      schema_version: 1,
      ts_ms: Date.now(),
      workspace_id: 'ws-1',
      deck_id: 'deck-1',
      viewer_id_key: 'v-1',
      privacy_mode: 'identified',
      device_class: 'desktop',
      source_app: 'viewer',
      ingest_topic: 'events.ingest.raw',
    });
    const ts = Date.now();
    const nonce = 'abc1234567';
    const res = await app.request('/v1/events', {
      method: 'POST',
      body,
      headers: signedHeaders(body, ts, nonce),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ack: { accepted: number; rejected: number } };
    expect(json.ack.accepted).toBe(1);
    expect(json.ack.rejected).toBe(0);
  });

  it('rejects an invalid signature', async () => {
    const body = '{}';
    const ts = Date.now();
    const res = await app.request('/v1/events', {
      method: 'POST',
      body,
      headers: {
        'content-type': 'application/json',
        [HMAC_HEADER_NAME]: 'sha256=deadbeef',
        [TIMESTAMP_HEADER_NAME]: String(ts),
        [NONCE_HEADER_NAME]: 'nonce1234',
      },
    });
    expect(res.status).toBe(401);
  });

  it('rejects a replay of the same nonce', async () => {
    const body = '{}';
    const ts = Date.now();
    const nonce = 'replay1234';
    const headers = signedHeaders(body, ts, nonce);
    const first = await app.request('/v1/events', { method: 'POST', body, headers });
    expect([200, 202, 400]).toContain(first.status);
    const second = await app.request('/v1/events', { method: 'POST', body, headers });
    expect(second.status).toBe(401);
  });

  it('spools the batch when Kafka is down', async () => {
    const depsFailing = buildDeps({ publisher: buildFailingKafkaPublisher() });
    const appFailing = buildApp(depsFailing);
    await depsFailing.nats.start(async () => {
      /* no-op */
    });
    const body = JSON.stringify({
      event_id: 'e-1',
      event_name: 'view',
      schema_version: 1,
      ts_ms: Date.now(),
      workspace_id: 'ws-1',
      deck_id: 'deck-1',
      viewer_id_key: 'v-1',
      privacy_mode: 'identified',
      device_class: 'desktop',
      source_app: 'viewer',
      ingest_topic: 'events.ingest.raw',
    });
    const ts = Date.now();
    const nonce = 'spool1234';
    const res = await appFailing.request('/v1/events', {
      method: 'POST',
      body,
      headers: signedHeaders(body, ts, nonce),
    });
    expect(res.status).toBe(202);
    const json = (await res.json()) as { ack: { spooled: number } };
    expect(json.ack.spooled).toBe(1);
    expect((await depsFailing.spool.list()).length).toBe(1);
  });

  it('rejects privacy_mode=anon_no_track', async () => {
    const body = JSON.stringify({
      event_id: 'e-1',
      event_name: 'view',
      schema_version: 1,
      ts_ms: Date.now(),
      workspace_id: 'ws-1',
      deck_id: 'deck-1',
      viewer_id_key: 'v-1',
      privacy_mode: 'anon_no_track',
      device_class: 'desktop',
      source_app: 'viewer',
      ingest_topic: 'events.ingest.raw',
    });
    const ts = Date.now();
    const nonce = 'nono1234';
    const res = await app.request('/v1/events', {
      method: 'POST',
      body,
      headers: signedHeaders(body, ts, nonce),
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ack: { accepted: number; rejected: number } };
    expect(json.ack.accepted).toBe(0);
    expect(json.ack.rejected).toBe(1);
  });

  it('returns 413 when the body is too large', async () => {
    const big = 'x'.repeat(70 * 1024);
    const ts = Date.now();
    const nonce = 'big123456';
    const res = await app.request('/v1/events', {
      method: 'POST',
      body: big,
      headers: signedHeaders(big, ts, nonce),
    });
    expect(res.status).toBe(413);
  });
});

describe('GET /healthz', () => {
  it('returns 200', async () => {
    const deps = buildDeps();
    const app = buildApp(deps);
    await deps.nats.start(async () => {
      /* no-op */
    });
    const res = await app.request('/healthz');
    expect(res.status).toBe(200);
  });
});

describe('GET /metrics', () => {
  it('returns Prometheus text format', async () => {
    const deps = buildDeps();
    const app = buildApp(deps);
    await deps.nats.start(async () => {
      /* no-op */
    });
    const res = await app.request('/metrics');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('domio_ingest_events_total');
    expect(text).toContain('domio_ingest_spool_bytes');
  });
});

// Avoid an unused-import warning when the test doesn't use it.
void loadConfigFromEnv;