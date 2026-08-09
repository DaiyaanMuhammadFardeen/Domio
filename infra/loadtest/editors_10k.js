/**
 * Phase 22-beta — k6 editors_10k.js.
 *
 * 10 000 concurrent editors collaborating on a single deck.
 * Each editor:
 *   1. Opens a CRDT sync WebSocket
 *   2. Submits one Yjs op every 200 ms
 *   3. Receives acks and presence
 *
 * Goals (P22-beta G3.1):
 *   - convergence: every editor sees the merged state within 5 s p95
 *   - merge success rate >= 99%
 *   - op round-trip p95 < 500 ms
 *
 * Scale knobs (env vars):
 *   - REALTIME_URL    (default: http://localhost:8080)
 *   - EDITORS_VU      (default: 10000)
 *   - EDITORS_DURATION (default: 30m)
 *   - DECK_ID         (default: deck-loadtest-001)
 *
 * Usage:
 *   k6 run infra/loadtest/editors_10k.js \
 *     -e REALTIME_URL=https://staging.realtime.domio.app \
 *     -e EDITORS_VU=10000 \
 *     -e EDITORS_DURATION=30m
 */

import ws from 'k6/ws';
import { check } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const opRoundTripMs = new Trend('op_round_trip_ms');
const mergeErrorRate = new Rate('merge_errors');
const opsSent = new Counter('ops_sent_total');
const opsAcked = new Counter('ops_acked_total');

export const options = {
  scenarios: {
    editors_10k: {
      executor: 'constant-vus',
      vus: Number(__ENV.EDITORS_VU || 10000),
      duration: __ENV.EDITORS_DURATION || '30m',
    },
  },
  thresholds: {
    op_round_trip_ms: ['p(95)<500'],
    merge_errors: ['rate<0.01'],
  },
};

const BASE = __ENV.REALTIME_URL || 'http://localhost:8080';
const DECK_ID = __ENV.DECK_ID || 'deck-loadtest-001';

export default function () {
  const url = `ws://${BASE.replace(/^https?:\/\//, '')}/v1/sync/${DECK_ID}`;
  const params = { tags: { scenario: 'editors_10k' } };

  const res = ws.connect(url, params, (socket) => {
    let pendingOps = 0;

    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'hello', vu: __VU, deck: DECK_ID }));
    });
    socket.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        if (msg.type === 'OpAck') {
          opsAcked.add(1);
          opRoundTripMs.add(Date.now() - msg.sentAt);
          pendingOps = Math.max(0, pendingOps - 1);
        }
      } catch {
        // ignore
      }
    });
    socket.on('error', () => {
      mergeErrorRate.add(1);
    });

    // Submit 5 ops/sec; back off if backlog grows.
    socket.setInterval(() => {
      if (pendingOps > 50) return; // simple client-side backpressure
      const sentAt = Date.now();
      socket.send(JSON.stringify({
        type: 'Op',
        op_id: `${__VU}-${sentAt}-${Math.random().toString(36).slice(2, 10)}`,
        sentAt,
        payload: { kind: 'insert', pos: __VU, text: 'x' },
      }));
      opsSent.add(1);
      pendingOps += 1;
    }, 200);

    socket.setTimeout(() => socket.close(), 30000);
  });

  check(res, { 'ws upgrade ok': (r) => r && r.status === 101 });
}
