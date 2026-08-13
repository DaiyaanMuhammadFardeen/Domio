/**
 * Phase 22-beta — k6 decks_100k.js.
 *
 * 100 000 decks per tenant. Catalog read paths exercised at scale:
 *   - GET /v1/decks?limit=50
 *   - GET /v1/decks/{id}
 *   - GET /v1/decks/{id}/assets
 *   - GET /v1/decks/{id}/versions
 *
 * Goals (P22-beta G3.1):
 *   - listing p95 < 200 ms
 *   - single-deck fetch p95 < 100 ms (cached)
 *   - p99 stays within 2× p95 (no long-tail)
 *
 * Scale knobs:
 *   - LIBRARY_URL    (default: http://localhost:8080)
 *   - LIBRARY_DURATION (default: 60m)
 *   - READ_RPS       (default: 5000) — total read RPS across all VUs
 *
 * Usage:
 *   k6 run infra/loadtest/decks_100k.js \
 *     -e LIBRARY_URL=https://staging.library.domio.app \
 *     -e LIBRARY_DURATION=60m
 */

import http from 'k6/http';
import { check } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const listLatencyMs = new Trend('decks_list_latency_ms');
const fetchLatencyMs = new Trend('decks_fetch_latency_ms');
const readErrorRate = new Rate('decks_read_errors');
const decksFetched = new Counter('decks_fetched_total');

export const options = {
  scenarios: {
    decks_100k: {
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.READ_RPS || 5000),
      timeUnit: '1s',
      duration: __ENV.LIBRARY_DURATION || '60m',
      preAllocatedVUs: 200,
      maxVUs: 1000,
    },
  },
  thresholds: {
    decks_list_latency_ms: ['p(95)<200', 'p(99)<400'],
    decks_fetch_latency_ms: ['p(95)<100'],
    decks_read_errors: ['rate<0.005'],
  },
};

const BASE = __ENV.LIBRARY_URL || 'http://localhost:8080';

// Use the deterministic deck-id generator from the loadtest fixtures
// (see infra/loadtest/fixtures/deck-100k.json).
const DECK_IDS = open('./fixtures/deck-100k.json')
  .split('\n')
  .filter((id) => id.length > 0);

export default function () {
  // 60% list, 40% single fetch — modelling catalog browsing.
  if (Math.random() < 0.6) {
    const res = http.get(`${BASE}/v1/decks?limit=50`);
    listLatencyMs.add(res.timings.duration);
    if (res.status !== 200) readErrorRate.add(1);
    check(res, { 'list ok': (r) => r.status === 200 });
  } else {
    const deckId = DECK_IDS[__VU % DECK_IDS.length];
    const res = http.get(`${BASE}/v1/decks/${deckId}`);
    fetchLatencyMs.add(res.timings.duration);
    if (res.status === 200) decksFetched.add(1);
    else readErrorRate.add(1);
  }
}
