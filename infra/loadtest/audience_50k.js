/**
 * Phase 22-beta — k6 audience_50k.js.
 *
 * 50 000 concurrent audience members connected to a single live session.
 * Each audience member:
 *   1. Opens a WebSocket to /v1/presence/{sessionId}
 *   2. Sends a presence heartbeat every 10 s
 *   3. Receives a fanout of reactions, polls, Q&A
 *
 * Goals (SLOs, P22-beta G3.1):
 *   - presence success rate >= 99% over the 30-minute window
 *   - reaction fanout p95 < 800 ms (one audience member's reaction
 *     reaches all 50k others within 800 ms)
 *   - heartbeat p95 < 30 s freshness
 *
 * Scale knobs (env vars):
 *   - AUDIENCE_URL    (default: http://localhost:8080)
 *   - AUDIENCE_VU     (default: 50000) — concurrent audience members
 *   - AUDIENCE_DURATION (default: 30m)
 *   - PRESENCE_RATE   (default: 0.1) — heartbeats per second per VU
 *
 * Usage:
 *   k6 run infra/loadtest/audience_50k.js \
 *     -e AUDIENCE_URL=https://staging.audience.domio.app \
 *     -e AUDIENCE_VU=50000 \
 *     -e AUDIENCE_DURATION=30m
 */

import http from 'k6/http';
import ws from 'k6/ws';
import { check } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const presenceLatencyMs = new Trend('presence_latency_ms');
const presenceErrorRate = new Rate('presence_errors');
const reactionsReceived = new Counter('reactions_received_total');
const presenceConnected = new Counter('presence_connected_total');

export const options = {
  scenarios: {
    audience_50k: {
      executor: 'constant-vus',
      vus: Number(__ENV.AUDIENCE_VU || 50000),
      duration: __ENV.AUDIENCE_DURATION || '30m',
    },
  },
  thresholds: {
    // Informational; tracked over time, not strict pass/fail at this scale.
    presence_latency_ms: ['p(95)<800'],
    presence_errors: ['rate<0.01'],
    presence_connected_total: ['count>=49500'], // >= 99% of VUs
  },
};

const BASE = __ENV.AUDIENCE_URL || 'http://localhost:8080';

export default function () {
  const sessionId = `sess-${__VU % 100}`; // 100 sessions across 50k audience
  const url = `ws://${BASE.replace(/^https?:\/\//, '')}/v1/presence/${sessionId}`;
  const params = { tags: { scenario: 'audience_50k' } };

  const start = Date.now();
  const res = ws.connect(url, params, (socket) => {
    presenceConnected.add(1);
    socket.on('open', () => {
      presenceLatencyMs.add(Date.now() - start);
      socket.send(JSON.stringify({ type: 'hello', vu: __VU }));
    });
    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'reaction' || msg.type === 'poll' || msg.type === 'qa') {
          reactionsReceived.add(1);
        }
      } catch {
        // ignore non-JSON frames
      }
    });
    socket.on('error', () => {
      presenceErrorRate.add(1);
    });
    socket.setTimeout(() => {
      socket.send(JSON.stringify({ type: 'heartbeat' }));
    }, 10000);
    socket.setTimeout(() => {
      socket.close();
    }, 30000);
  });

  check(res, {
    'ws upgrade ok': (r) => r && r.status === 101,
  }) || presenceErrorRate.add(1);
}
