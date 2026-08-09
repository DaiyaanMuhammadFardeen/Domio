/**
 * Phase 22-beta — k6 ingest_timeline.js.
 *
 * Timeline ingest at 10 000 events/second. Each event is a JSON body
 * posted to /v1/events with replay metadata (event_id, session_id,
 * hlc_timestamp, payload).
 *
 * Goals (P22-beta G3.1):
 *   - ingest latency p95 < 50 ms
 *   - ingest success rate >= 99.9%
 *   - backpressure: queue depth stays bounded; no events lost
 *
 * Scale knobs:
 *   - INGEST_URL      (default: http://localhost:8080)
 *   - INGEST_RATE      (default: 10000) — events/sec
 *   - INGEST_DURATION  (default: 60m)
 *
 * Usage:
 *   k6 run infra/loadtest/ingest_timeline.js \
 *     -e INGEST_URL=https://staging.event-ingest.domio.app \
 *     -e INGEST_RATE=10000
 */

import http from 'k6/http';
import { check } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const ingestLatencyMs = new Trend('ingest_latency_ms');
const ingestErrorRate = new Rate('ingest_errors');
const eventsSent = new Counter('events_sent_total');
const eventsAccepted = new Counter('events_accepted_total');

export const options = {
  scenarios: {
    ingest_timeline: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.INGEST_RATE || 10000),
      timeUnit: '1s',
      duration: __ENV.INGEST_DURATION || '60m',
      preAllocatedVUs: 500,
      maxVUs: 2000,
    },
  },
  thresholds: {
    ingest_latency_ms: ['p(95)<50'],
    ingest_errors: ['rate<0.001'],
  },
};

const BASE = __ENV.INGEST_URL || 'http://localhost:8080';
const HEADERS = { 'Content-Type': 'application/json' };

export default function () {
  const event = JSON.stringify({
    event_id: `${__VU}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    session_id: `sess-${__VU % 100}`,
    hlc_timestamp: Date.now() * 1000, // micros
    payload: { kind: 'presence', op: 'heartbeat' },
  });
  eventsSent.add(1);
  const res = http.post(`${BASE}/v1/events`, event, { headers: HEADERS });
  ingestLatencyMs.add(res.timings.duration);
  if (res.status === 202) eventsAccepted.add(1);
  else ingestErrorRate.add(1);
  check(res, { '202 accepted': (r) => r.status === 202 });
}
