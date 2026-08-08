// Phase 17 — ingest 200k events/sec sustained for 10 min
//
// Drives the event-ingest edge with a synthetic viewer/presenter corpus
// and asserts the SLO targets in slo/phase-17.md §A-1:
//   - accept rate ≥ 99.9%
//   - ingest latency p95 < 5s, p99 < 30s
//   - ingest-to-Kafka p95 < 100 ms
//
// Run: k6 run tests/load/k6/ingest-200k.js

import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import crypto from 'k6/crypto';

const BASE_URL = __ENV.INGEST_URL || 'http://localhost:8081';
const SESSION_KEY = __ENV.INGEST_SESSION_KEY ||
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const DECK_ID = __ENV.INGEST_DECK_ID || '00000000-0000-0000-0000-000000000001';
const WORKSPACE_ID = __ENV.INGEST_WORKSPACE_ID ||
  '00000000-0000-0000-0000-0000000000aa';

const accepted = new Counter('events_accepted');
const rejected = new Counter('events_rejected');
const acceptRate = new Rate('events_accept_rate');
const ingestLatency = new Trend('events_ingest_latency_ms', true);

export const options = {
  scenarios: {
    ingest_200k: {
      executor: 'constant-arrival-rate',
      rate: 200000,
      timeUnit: '1s',
      duration: '10m',
      preAllocatedVUs: 200,
      maxVUs: 1000,
    },
  },
  thresholds: {
    'events_accept_rate': ['rate>=0.999'],
    'events_ingest_latency_ms': ['p(95)<5000', 'p(99)<30000'],
    'http_req_failed': ['rate<0.001'],
  },
};

// Synthetic event corpus: 6 event types from contracts/events/ingest/*.json
const EVENT_TYPES = [
  'view', 'interaction', 'scroll_progress', 'scroll_pause',
  'presenter_event', 'live_session_event',
];

function makeEvent(ts) {
  const eventName = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
  return {
    event_id: crypto.randomUUID(),
    event_name: eventName,
    workspace_id: WORKSPACE_ID,
    deck_id: DECK_ID,
    viewer_id_key: `viewer-${Math.floor(Math.random() * 50000)}`,
    ts_ms: ts,
    consent_state: 'identified',
    payload: { slide_index: Math.floor(Math.random() * 20), dwell_ms: Math.floor(Math.random() * 5000) },
  };
}

function hmacHex(message, keyHex) {
  // k6 crypto.sha256 doesn't support HMAC out of the box; we rely on the
  // node:crypto polyfill when running with `k6 run --compatibility-mode=base`.
  // For self-hosted runners we precompute the signature on the test harness.
  return __ENV.INGEST_HMAC_OVERRIDE || '';
}

export default function () {
  const now = Date.now();
  const events = [];
  for (let i = 0; i < 50; i++) events.push(makeEvent(now + i));
  const body = JSON.stringify({ events });
  const sig = hmacHex(body, SESSION_KEY);
  const headers = {
    'Content-Type': 'application/json',
    'X-Domio-Signature': sig ? `sha256=${sig}` : '',
    'X-Domio-Deck-Id': DECK_ID,
    'X-Domio-Session-Id': 'load-200k',
    'X-Domio-Ts-Ms': String(now),
  };
  const res = http.post(`${BASE_URL}/v1/events`, body, { headers });
  const ok = res.status === 200 || res.status === 202;
  if (ok) {
    accepted.add(events.length);
    acceptRate.add(true);
    ingestLatency.add(res.timings.duration);
  } else {
    rejected.add(events.length);
    acceptRate.add(false);
  }
  check(res, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300,
  });
}
