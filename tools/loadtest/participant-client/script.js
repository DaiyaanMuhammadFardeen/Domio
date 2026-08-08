// Phase 16 W1 — k6 load test for the participant WS gateway.
//
// 10 000 concurrent WS connections over 60 minutes, exercising the
// full join round-trip:
//
//   1. GET /v1/audience/sessions/{code}/stats   (REST handshake metadata)
//   2. WS  /v1/audience/ws?session_code=...&workspace_id=...   (handshake)
//   3. Send a "hello" envelope
//   4. Send 1 poll_vote per minute
//   5. Send 1 "heartbeat" per 30s
//
// SLO assertions:
//   * join open p95 < 2500 ms
//   * hello→welcome p95 < 500 ms
//   * poll_vote round-trip p95 < 1000 ms
//   * (no) message drop > 0.5% of sends
//
// Run with: k6 run --out json=results.json script.js
//
// Required env:
//   TARGET_URL   (default: http://localhost:8090)
//   SESSION_CODE (default: ABCD-1234)
//   WORKSPACE_ID (default: ws-loadtest)

import http from 'k6/http';
import ws from 'k6/ws';
import { check } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const TargetUrl = __ENV.TARGET_URL || 'http://localhost:8090';
const SessionCode = __ENV.SESSION_CODE || 'ABCD-1234';
const WorkspaceId = __ENV.WORKSPACE_ID || 'ws-loadtest';

const wsOpenMs = new Trend('audience_ws_open_ms', true);
const helloMs = new Trend('audience_hello_ms', true);
const pollMs = new Trend('audience_poll_vote_ms', true);
const msgsDropped = new Counter('audience_messages_dropped');
const sendErrors = new Rate('audience_send_errors');

export const options = {
  scenarios: {
    audience_join: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 2_000 },
        { duration: '4m', target: 10_000 },
        { duration: '50m', target: 10_000 },
        { duration: '4m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    audience_ws_open_ms: ['p(95)<2500'],
    audience_hello_ms: ['p(95)<500'],
    audience_poll_vote_ms: ['p(95)<1000'],
    audience_send_errors: ['rate<0.005'],
  },
};

export default function () {
  const url = `${TargetUrl.replace(/^http/, 'ws')}/v1/audience/ws?session_code=${SessionCode}&workspace_id=${WorkspaceId}`;
  const t0 = Date.now();
  const res = ws.connect(url, null, (socket) => {
    socket.on('open', () => {
      wsOpenMs.add(Date.now() - t0);
      const helloAt = Date.now();
      socket.send(JSON.stringify({
        kind: 'hello',
        session_code: SessionCode,
        workspace_id: WorkspaceId,
        participant_id: `p-${randomString(8)}`,
        display_name: `vu-${__VU}`,
        locale: 'en-US',
        ts_ms: Date.now(),
        idempotency_key: randomString(16),
      }));
      socket.on('message', (msg) => {
        try {
          const env = JSON.parse(msg);
          if (env.kind === 'welcome') {
            helloMs.add(Date.now() - helloAt);
          } else if (env.kind === 'poll_vote_ack') {
            pollMs.add(Date.now() - pollAt);
          }
        } catch {
          msgsDropped.add(1);
        }
      });
    });

    socket.on('error', () => {
      sendErrors.add(1);
    });

    let pollAt = 0;
    socket.setInterval(() => {
      pollAt = Date.now();
      socket.send(JSON.stringify({
        kind: 'poll_vote',
        poll_id: `poll-${randomString(6)}`,
        option_id: 'yes',
        session_code: SessionCode,
        participant_id: `p-${__VU}`,
        ts_ms: Date.now(),
        idempotency_key: randomString(16),
      }));
    }, 60_000);

    socket.setTimeout(() => {
      socket.send(JSON.stringify({
        kind: 'heartbeat',
        session_code: SessionCode,
        participant_id: `p-${__VU}`,
        ts_ms: Date.now(),
        idempotency_key: randomString(16),
      }));
    }, 30_000);

    socket.setTimeout(() => {
      socket.close();
    }, 55 * 60 * 1000);
  });
  check(res, { 'connected': (r) => r && r.status === 101 });
}