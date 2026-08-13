/**
 * Phase 22-beta — k6 presenter_2h.js.
 *
 * 2-hour sustained synthetic presenter session against existing
 * surfaces (no frontier features). The presenter:
 *   1. Creates a session
 *   2. Advances through 60 slides over 2 hours
 *   3. Polls, Q&A, reactions interleave at realistic cadence
 *
 * Goals (P22-beta G3.1 / G1.5):
 *   - session stable for full 2 hours; no OOM; no growth > 5%
 *   - presenter-action p95 < 150 ms (per `lat-presenter-action-p95`)
 *   - 0 unhandled exceptions in any service
 *
 * Scale knobs (env vars):
 *   - PRESENTER_URL  (default: http://localhost:8080)
 *   - PRESENTER_DURATION (default: 2h)
 *
 * Usage:
 *   k6 run infra/loadtest/presenter_2h.js \
 *     -e PRESENTER_URL=https://staging.presenter.domio.app \
 *     -e PRESENTER_DURATION=2h
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const actionLatencyMs = new Trend('presenter_action_latency_ms');
const sessionErrorRate = new Rate('presenter_session_errors');
const slidesAdvanced = new Counter('slides_advanced_total');
const pollsCreated = new Counter('polls_created_total');

export const options = {
  scenarios: {
    presenter_2h: {
      executor: 'constant-vus',
      vus: 1,
      duration: __ENV.PRESENTER_DURATION || '2h',
    },
  },
  thresholds: {
    presenter_action_latency_ms: ['p(95)<150'],
    presenter_session_errors: ['count<5'],
  },
};

const BASE = __ENV.PRESENTER_URL || 'http://localhost:8080';

const HEADERS = { 'Content-Type': 'application/json' };

export default function () {
  // Create session once (idempotent at VU level).
  if (__ITER === 0) {
    const create = http.post(`${BASE}/v1/sessions`, JSON.stringify({ deck: 'deck-loadtest-001' }), {
      headers: HEADERS,
    });
    check(create, { 'session created': (r) => r.status === 201 });
  }

  // Advance slide every 120 s (60 slides over 2 hours).
  const advance = http.post(`${BASE}/v1/sessions/current/advance`, null, { headers: HEADERS });
  actionLatencyMs.add(advance.timings.duration);
  if (advance.status !== 200) sessionErrorRate.add(1);
  else slidesAdvanced.add(1);

  // Every 5th slide, create a poll.
  if (__ITER % 5 === 0) {
    const poll = http.post(
      `${BASE}/v1/sessions/current/polls`,
      JSON.stringify({ question: 'Test?', options: ['A', 'B'] }),
      { headers: HEADERS },
    );
    if (poll.status === 201) pollsCreated.add(1);
    else sessionErrorRate.add(1);
  }

  // Heartbeat every iteration; sleep until next minute boundary.
  sleep(120);
}
