/**
 * Phase 17 — k6 ingest-200k.
 *
 * Pure ES5 (k6 doesn't support ES modules natively).
 *
 * Drives services/event-ingest at /v1/events with 50 VUs x 4 000
 * events/sec/VU for 5 s (approx 200 k events).  Asserts:
 *   * p95 latency < 50 ms
 *   * error rate < 1 %
 *
 * Usage:
 *   k6 run tests/load/k6/ingest-200k.js \
 *     -e INGEST_URL=http://event-ingest:3020
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const ingestLatencyMs = new Trend('ingest_latency_ms');
const ingestErrorRate = new Rate('ingest_errors');

export const options = {
  scenarios: {
    ingest_200k: {
      executor: 'constant-arrival-rate',
      rate: 200000,
      timeUnit: '1s',
      duration: '5s',
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  thresholds: {
    'http_req_duration{name:ingest}': ['p(95)<50'],
    ingest_errors: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

const INGEST_URL = __ENV.INGEST_URL || 'http://event-ingest:3020';
const INGEST_PATH = __ENV.INGEST_PATH || '/v1/events';

function buildEvent(vu, iter) {
  return JSON.stringify({
    event_id: `e-${vu}-${iter}`,
    event_name: 'view',
    schema_version: 1,
    ts_ms: Date.now(),
    workspace_id: `ws-load-${vu % 10}`,
    deck_id: `deck-load-${vu % 10}`,
    slide_id: `slide-load-${iter % 20}`,
    viewer_id_key: `viewer-load-${vu}-${iter}`,
    session_id_key: `sess-load-${vu}`,
    privacy_mode: 'identified',
    device_class: 'desktop',
    source_app: 'load-test',
  });
}

export default function () {
  const payload = buildEvent(__VU, __ITER);

  const res = http.post(INGEST_URL + INGEST_PATH, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'ingest' },
  });

  ingestLatencyMs.add(res.timings.duration);
  const ok = check(res, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300,
    'response time < 50ms': (r) => r.timings.duration < 50,
  });
  if (!ok) ingestErrorRate.add(1);
  else ingestErrorRate.add(0);

  sleep(0);
}
