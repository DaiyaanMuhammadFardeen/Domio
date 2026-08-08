// Phase 16 W5 — k6 1000-participant demo load test.
//
// Smaller version of the production 10k/60m script. Runs against a
// local docker stack — joins the session, casts poll votes, sends a
// reaction, then exits.
//
// Run: k6 run script.js
//
// Env:
//   TARGET_URL    (default: http://localhost:8090)
//   SESSION_CODE  (default: ABCD-1234)
//   WORKSPACE_ID  (default: ws-demo)
//   DURATION      (default: 5m)

import http from 'k6/http';
import ws from 'k6/ws';
import { check } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const TargetUrl = __ENV.TARGET_URL || 'http://localhost:8090';
const SessionCode = __ENV.SESSION_CODE || 'ABCD-1234';
const WorkspaceId = __ENV.WORKSPACE_ID || 'ws-demo';
const Duration = __ENV.DURATION || '5m';

const wsOpenMs = new Trend('audience_ws_open_ms', true);
const helloMs = new Trend('audience_hello_ms', true);
const pollMs = new Trend('audience_poll_vote_ms', true);
const msgsDropped = new Counter('audience_messages_dropped');
const sendErrors = new Rate('audience_send_errors');

export const options = {
  scenarios: {
    audience_join_1k: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 500 },
        { duration: '1m', target: 1_000 },
        { duration: '2m', target: 1_000 },
        { duration: '30s', target: 0 },
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
    let pollAt = 0;
    socket.on('open', () => {
      wsOpenMs.add(Date.now() - t0);
      const helloAt = Date.now();
      const participant_id = `p-${randomString(8)}`;
      socket.send(JSON.stringify({
        kind: 'hello',
        session_code: SessionCode,
        workspace_id: WorkspaceId,
        participant_id,
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
            // After welcome, send a vote and a reaction.
            pollAt = Date.now();
            socket.send(JSON.stringify({
              kind: 'poll_vote',
              poll_id: `poll-${randomString(6)}`,
              option_id: 'yes',
              session_code: SessionCode,
              participant_id,
              ts_ms: Date.now(),
              idempotency_key: randomString(16),
            }));
            socket.send(JSON.stringify({
              kind: 'reaction',
              session_code: SessionCode,
              participant_id,
              slide_id: `slide-${randomString(4)}`,
              emoji: '👏',
              ts_ms: Date.now(),
              idempotency_key: randomString(16),
            }));
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

    socket.setTimeout(() => {
      socket.close();
    }, 60 * 1000);
  });
  check(res, { 'connected': (r) => r && r.status === 101 });
}
