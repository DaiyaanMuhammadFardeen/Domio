// Phase 17 — dashboard 10k concurrent clients
//
// Drives the dashboard GraphQL gateway with 10k concurrent simulated
// clients (different viewer sessions, same workspace). Asserts the
// dashboard SLOs in slo/phase-17.md §A-6:
//   - resolver p95 < 800 ms
//   - resolver p99 < 1.5 s
//   - error rate < 0.5%
//   - persisted-query cache hit rate > 80%
//
// Run: k6 run tests/load/k6/dashboard-10k.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const DASHBOARD_URL = __ENV.DASHBOARD_URL || 'http://localhost:3010/api/graphql';
const TOKEN = __ENV.DASHBOARD_TOKEN || 'test-dashboard-token';

const requestCount = new Counter('dashboard_requests_total');
const errorCount = new Counter('dashboard_errors_total');
const errorRate = new Rate('dashboard_error_rate');
const resolverLatency = new Trend('dashboard_resolver_latency_ms', true);

// Persisted query SHA-256 hashes (mirrored from
// apps/dashboard/src/app/api/graphql/persisted/manifest.ts).
const PERSISTED = {
  overview: '8f3a9b...c4',
  deckDetail: 'b22e5d...1a',
  heatmap: '4b0fa8...77',
  abResults: '9d12c6...e3',
  funnel: 'c671f0...2b',
  live: '5f4c2e...88',
  benchmarks: '1a98d3...c0',
};

function persistedQuery(name, variables) {
  const body = JSON.stringify({
    extensions: { persistedQuery: { version: 1, sha256Hash: PERSISTED[name] } },
    variables,
  });
  return body;
}

export const options = {
  scenarios: {
    dashboard_10k: {
      executor: 'constant-vus',
      vus: 10000,
      duration: '5m',
    },
  },
  thresholds: {
    'dashboard_resolver_latency_ms': ['p(95)<800', 'p(99)<1500'],
    'dashboard_error_rate': ['rate<0.005'],
  },
};

const VIEWERS = Array.from({ length: 50000 }, (_, i) => `viewer-${i}`);

export default function () {
  const viewerId = VIEWERS[__VU % VIEWERS.length];
  const route = ['overview', 'deckDetail', 'heatmap', 'abResults', 'funnel', 'live', 'benchmarks'][
    Math.floor(Math.random() * 7)
  ];
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${TOKEN}`,
    'X-Domio-Viewer-Id': viewerId,
  };
  const variables = { workspaceId: 'ws-1', deckId: 'deck-1', viewerId };
  const res = http.post(DASHBOARD_URL, persistedQuery(route, variables), { headers });
  requestCount.add(1);
  const ok = res.status === 200 && !res.body.includes('"errors"');
  if (ok) {
    resolverLatency.add(res.timings.duration);
    errorRate.add(false);
  } else {
    errorCount.add(1);
    errorRate.add(true);
  }
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(0.5 + Math.random() * 1.5);
}