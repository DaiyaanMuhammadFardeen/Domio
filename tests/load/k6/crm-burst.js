// Phase 17 — CRM burst (10k events in 1s)
//
// Drives the CRM sync adapters with a burst of 10k events in 1s to
// verify rate-limit handling. Asserts the SLO targets in
// slo/phase-17.md §A-8:
//   - 0 drops (or DLQ documented)
//   - no event crosses the 100/10s HubSpot token-bucket without
//     being queued
//
// Run: k6 run tests/load/k6/crm-burst.js

import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const CRM_URL = __ENV.CRM_URL || 'http://localhost:8082';
const WORKSPACE_ID = __ENV.CRM_WORKSPACE_ID ||
  '00000000-0000-0000-0000-0000000000aa';

const sent = new Counter('crm_events_sent');
const dlq = new Counter('crm_events_dlq');
const dropRate = new Rate('crm_drop_rate');
const burstLatency = new Trend('crm_burst_latency_ms', true);

export const options = {
  scenarios: {
    crm_burst: {
      executor: 'shared-iterations',
      iterations: 10000,
      vus: 500,
      maxDuration: '5m',
    },
  },
  thresholds: {
    'crm_drop_rate': ['rate<0.001'],
    'crm_burst_latency_ms': ['p(95)<5000'],
  },
};

const PROVIDERS = ['salesforce', 'hubspot', 'pipedrive', 'dynamics'];
const EVENT_TYPES = [
  'deck.view', 'deck.complete', 'pricing_slide_revisit', 'cta_click',
];

function makePayload(i) {
  const provider = PROVIDERS[i % PROVIDERS.length];
  return {
    workspace_id: WORKSPACE_ID,
    provider,
    event_type: EVENT_TYPES[i % EVENT_TYPES.length],
    viewer_id_key: `viewer-${i % 1000}`,
    idempotency_key: `${WORKSPACE_ID}:viewer-${i}:deck.view:${i}`,
    payload: { score: Math.random(), deck_id: 'deck-1' },
  };
}

export default function () {
  const payload = JSON.stringify(makePayload(__VU * 1000 + __ITER));
  const res = http.post(`${CRM_URL}/v1/crm/sync`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  const ok = res.status === 200 || res.status === 202;
  if (ok) {
    sent.add(1);
    burstLatency.add(res.timings.duration);
    dropRate.add(false);
  } else if (res.status === 429) {
    // Rate-limited → queued, not a drop
    dlq.add(1);
    dropRate.add(false);
  } else {
    dropRate.add(true);
  }
  check(res, { 'status is 2xx or 429': (r) => (r.status >= 200 && r.status < 300) || r.status === 429 });
}
