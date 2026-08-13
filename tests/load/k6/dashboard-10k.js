/**
 * Phase 17 — k6 dashboard-10k.
 *
 * Pure ES5 (k6 doesn't support ES modules natively).
 *
 * Drives apps/dashboard's GraphQL gateway at /api/graphql with the
 * OverviewKPI persisted query from 10 000 concurrent clients for 30 s.
 * Asserts:
 *   * p95 latency < 800 ms
 *   * error rate < 1 %
 *
 * Usage:
 *   k6 run tests/load/k6/dashboard-10k.js \
 *     -e DASHBOARD_URL=http://localhost:3003
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const dashboardLatencyMs = new Trend('dashboard_latency_ms');
const dashboardErrorRate = new Rate('dashboard_errors');

const OVERVIEW_KPI_PERSISTED_QUERY_SHA =
  'a4f9b6c8d2e1f3a7b5c9d8e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f900';

// VUs default to 10k for the reference scenario, but CI runners
// (single 7 GB / 2 CPU GitHub-hosted ubuntu-24.04) can sustain only
// a few hundred concurrent users before the Next.js server runs
// out of memory. CI workflows pass K6_VUS=200 to keep this
// scenario hermetic while preserving the SLO thresholds.
const VUS = parseInt(__ENV.K6_VUS || '10000', 10);
const VUS_MAX = VUS + Math.floor(VUS * 0.1);

export const options = {
  scenarios: {
    dashboard_10k: {
      executor: 'constant-vus',
      vus: VUS,
      duration: '30s',
      gracefulStop: '5s',
    },
  },
  thresholds: {
    'http_req_duration{name:graphql}': ['p(95)<800'],
    dashboard_errors: ['rate<0.01'],
    checks: ['rate>0.99'],
    vus: [`value<${VUS_MAX}`],
  },
};

// DASHBOARD_URL may be either a base URL (http://host:port) or a
// full URL including the GraphQL path (http://host:port/api/graphql).
// GRAPHQL_PATH is appended only when DASHBOARD_URL doesn't already
// include a path component.
const RAW_DASHBOARD_URL = __ENV.DASHBOARD_URL || 'http://localhost:3003';
const GRAPHQL_PATH = __ENV.GRAPHQL_PATH || '/api/graphql';
const DASHBOARD_URL = (() => {
  try {
    const u = new URL(RAW_DASHBOARD_URL);
    if (u.pathname && u.pathname !== '/' && u.pathname !== '') {
      return RAW_DASHBOARD_URL;
    }
  } catch (_e) {
    // fall through to concatenation
  }
  return RAW_DASHBOARD_URL.replace(/\/+$/, '') + GRAPHQL_PATH;
})();

export default function () {
  const body = JSON.stringify({
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: OVERVIEW_KPI_PERSISTED_QUERY_SHA,
      },
    },
  });

  const res = http.post(DASHBOARD_URL, body, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'graphql' },
  });

  dashboardLatencyMs.add(res.timings.duration);
  const ok = check(res, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300,
    'no GraphQL errors': (r) => {
      if (r.status !== 200) return true;
      try {
        const json = r.json();
        return !json.errors || json.errors.length === 0;
      } catch (_e) {
        return false;
      }
    },
    'response time < 800ms': (r) => r.timings.duration < 800,
  });
  if (!ok) dashboardErrorRate.add(1);
  else dashboardErrorRate.add(0);

  sleep(0);
}
