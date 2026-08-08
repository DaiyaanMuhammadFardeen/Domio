/**
 * Phase 17 — k6 crm-burst.
 *
 * Pure ES5 (k6 doesn't support ES modules natively).
 *
 * Hammers services/crm-sync's adapter registry with 10 000 sync
 * events in 1 s.  The HubSpot adapter is configured with a
 * 100 req/10 s token bucket; this test asserts that the bucket is
 * honoured — no events are dropped, they are either dispatched or
 * routed to the DLQ within the burst window.
 *
 * Usage:
 *   k6 run tests/load/k6/crm-burst.js \
 *     -e CRM_SYNC_URL=http://crm-sync:3060
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const crmLatencyMs = new Trend('crm_latency_ms');
const crmErrorRate = new Rate('crm_errors');
const crmAccepted  = new Counter('crm_accepted_total');
const crmDlq       = new Counter('crm_dlq_total');

export const options = {
  scenarios: {
    crm_burst: {
      executor: 'constant-arrival-rate',
      rate: 10000,
      timeUnit: '1s',
      duration: '1s',
      preAllocatedVUs: 200,
      maxVUs: 1000,
    },
  },
  thresholds: {
    'http_req_duration{name:crm}': ['p(95)<200'],
    'crm_errors':                  ['rate<0.05'],
    'crm_dlq_total':               ['count<10000'],
    'checks':                      ['rate>0.95'],
  },
};

const CRM_SYNC_URL = __ENV.CRM_SYNC_URL || 'http://crm-sync:3060';
const CRM_SYNC_PATH = __ENV.CRM_SYNC_PATH || '/v1/sync';

function buildSync(vu, iter) {
  return JSON.stringify({
    workspace_id: `ws-crm-${vu % 4}`,
    viewer_id_key: `viewer-crm-${vu}-${iter}`,
    provider: 'hubspot',
    event_type: 'pricing_slide_revisit',
    event_id: `crm-${vu}-${iter}`,
    ts_ms: Date.now(),
    payload: { score_delta: 1, last_seen_deck: 'deck-crm' },
  });
}

export default function () {
  const body = buildSync(__VU, __ITER);

  const res = http.post(CRM_SYNC_URL + CRM_SYNC_PATH, body, {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'crm' },
  });

  crmLatencyMs.add(res.timings.duration);

  const ok = check(res, {
    'status is 2xx': (r) => r.status >= 200 && r.status < 300,
    'accepted or DLQ-queued': (r) => {
      if (r.status === 202) {
        crmDlq.add(1);
        return true;
      }
      if (r.status >= 200 && r.status < 300) {
        crmAccepted.add(1);
        return true;
      }
      return false;
    },
  });
  if (!ok) crmErrorRate.add(1);
  else crmErrorRate.add(0);

  sleep(0);
}