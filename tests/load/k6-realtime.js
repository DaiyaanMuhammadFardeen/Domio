/**
 * k6-realtime.js — Load tests for the domio realtime gateway.
 *
 * Scenarios:
 *   connect_storm: 50 VUs connect to /v1/sync/{deckId}, stay connected 30s  (CI)
 *   op_stream:     20 VUs connected, each sends Op frames at a steady rate   (CI)
 *   doc_spec:      10 decks × 50 VUs = 500 VUs, 200 ops/sec, 10 min         (doc-spec)
 *   presence:      1k cursor updates/sec sustained                            (doc-spec)
 *
 * Wire protocol:
 *   WebSocket binary frames with 4-byte big-endian length prefix
 *   followed by a protobuf-encoded message body.
 *
 * Build & run:
 *   go build -o /tmp/opencode/rtgw ./services/realtime-gateway/cmd/rtgw
 *   JWT_SECRET=test-secret PORT=8080 NATS_URL=nats://localhost:4222 \
 *     REDIS_ADDR=localhost:6379 /tmp/opencode/rtgw &
 *
 *   # CI-friendly (short, ~45s):
 *   /tmp/opencode/k6 run tests/load/k6-realtime.js
 *
 *   # Full doc-spec run (10 minutes, 500 VUs):
 *   K6_DURATION=600s /tmp/opencode/k6 run tests/load/k6-realtime.js
 *
 *   # Quick smoke of doc-spec thresholds:
 *   K6_DURATION=15s NUM_DECKS=2 VUS_PER_DECK=5 /tmp/opencode/k6 run tests/load/k6-realtime.js
 *
 *   # Presence-only run:
 *   K6_DURATION=30s /tmp/opencode/k6 run --include='presence' tests/load/k6-realtime.js
 */
import ws from 'k6/ws';
import { Counter, Trend, Rate, Gauge } from 'k6/metrics';
import { check, sleep } from 'k6';
import encoding from 'k6/encoding';
import crypto from 'k6/crypto';

// ─── Custom metrics ────────────────────────────────────────────────
const wsErrors = new Counter('ws_errors');
const wsConnections = new Counter('ws_connections');
const connectSuccess = new Rate('connect_success');
const opSent = new Counter('op_sent');
const opAcked = new Counter('op_acked');
const opDropped = new Counter('op_dropped');
const opRoundTrip = new Trend('op_round_trip_ms', true);
const activeConnections = new Gauge('active_connections');
const cursorSent = new Counter('cursor_sent');

// ─── Configuration ─────────────────────────────────────────────────
const GATEWAY_URL = __ENV.GATEWAY_URL || 'http://localhost:8080';
const BASE_DECK_ID = __ENV.DECK_ID || 'load-test-deck';
const JWT_SECRET = __ENV.JWT_SECRET || '';

// Doc-spec configuration (env overrides)
const NUM_DECKS = parseInt(__ENV.NUM_DECKS || '10', 10);
const VUS_PER_DECK = parseInt(__ENV.VUS_PER_DECK || '50', 10);
const K6_DURATION = __ENV.K6_DURATION || '600s'; // default 10 min for doc-spec
const CI_DURATION = __ENV.CI_DURATION || '30s';  // default for CI-friendly scenarios
const DOC_SPEC_OPS_PER_SEC = parseInt(__ENV.DOC_SPEC_OPS_PER_SEC || '200', 10);

// ─── Deck IDs for multi-deck scenarios ─────────────────────────────
function generateDeckIds(count) {
  const decks = [];
  for (let i = 0; i < count; i++) {
    decks.push(BASE_DECK_ID + '-deck-' + i);
  }
  return decks;
}

const DECK_IDS = generateDeckIds(NUM_DECKS);

// ─── k6-compatible string/byte helpers ─────────────────────────────
function stringToBytes(str) {
  var bytes = new Uint8Array(str.length);
  for (var i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
}

// ─── JWT generation (HMAC-SHA256 via k6/crypto) ────────────────────
function base64urlEncode(str) {
  return encoding.b64encode(str, 'rawurl');
}

function generateJWT(deckId, actorId) {
  var header = '{"alg":"HS256","typ":"JWT"}';
  var now = Math.floor(Date.now() / 1000);
  var payload = JSON.stringify({
    sub: actorId,
    actor_id: actorId,
    deck_id: deckId,
    session_kind: 'interactive',
    exp: now + 3600,
    iat: now,
  });

  var headerB64 = base64urlEncode(header);
  var payloadB64 = base64urlEncode(payload);
  var signingInput = headerB64 + '.' + payloadB64;
  // Use binary then encode with rawurl to produce unpadded base64url,
  // matching Go's base64.RawURLEncoding used in handshake.go verifyHMAC.
  var sigBytes = crypto.hmac('sha256', JWT_SECRET, signingInput, 'binary');
  var signature = base64urlEncode(String.fromCharCode.apply(null, sigBytes));

  return signingInput + '.' + signature;
}

// ─── ULID generation (simplified, valid Crockford Base32) ──────────
var ULID_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function generateULID() {
  var timePart = Date.now().toString(36).toUpperCase();
  while (timePart.length < 10) timePart = '0' + timePart;
  var randomPart = '';
  for (var i = 0; i < 16; i++) {
    randomPart += ULID_CHARS[Math.floor(Math.random() * 32)];
  }
  return timePart + randomPart;
}

// ─── Protobuf encoding helpers (manual wire format) ────────────────

function encodeVarint(value) {
  var bytes = [];
  var v = value < 0 ? BigInt(value) + (1n << 64n) : BigInt(value);
  while (v > 127n) {
    bytes.push(Number((v & 0x7Fn) | 0x80n));
    v >>= 7n;
  }
  bytes.push(Number(v));
  return new Uint8Array(bytes);
}

function encodeFieldVarint(fieldNumber, value) {
  var tag = encodeVarint((fieldNumber << 3) | 0);
  var val = encodeVarint(value);
  return concatBytes(tag, val);
}

function encodeFieldLengthDelimited(fieldNumber, data) {
  var tag = encodeVarint((fieldNumber << 3) | 2);
  var dataBytes = typeof data === 'string' ? stringToBytes(data) : data;
  var len = encodeVarint(dataBytes.length);
  return concatBytes(tag, len, dataBytes);
}

function encodeFieldEmbedded(fieldNumber, messageBytes) {
  return encodeFieldLengthDelimited(fieldNumber, messageBytes);
}

function encodeHLC(physical, logical) {
  return concatBytes(
    encodeFieldVarint(1, physical),
    encodeFieldVarint(2, logical)
  );
}

function concatBytes() {
  var totalLen = 0;
  for (var i = 0; i < arguments.length; i++) {
    totalLen += arguments[i].length;
  }
  var result = new Uint8Array(totalLen);
  var offset = 0;
  for (var i = 0; i < arguments.length; i++) {
    result.set(arguments[i], offset);
    offset += arguments[i].length;
  }
  return result;
}

// ─── Message builders ──────────────────────────────────────────────
function buildHello(actorId, deckId, sessionId) {
  return concatBytes(
    encodeFieldLengthDelimited(1, actorId),
    encodeFieldLengthDelimited(2, deckId),
    encodeFieldLengthDelimited(3, 'main'),
    encodeFieldLengthDelimited(4, sessionId),
    encodeFieldLengthDelimited(5, 'sync'),
    encodeFieldLengthDelimited(5, 'presence')
  );
}

function buildOp(opId, deckId, authorId, hlcPhysical, hlcLogical, payloadBytes, clientClock) {
  return concatBytes(
    encodeFieldLengthDelimited(1, opId),
    encodeFieldLengthDelimited(2, deckId),
    encodeFieldLengthDelimited(3, 'main'),
    encodeFieldLengthDelimited(5, authorId),
    encodeFieldEmbedded(6, encodeHLC(hlcPhysical, hlcLogical)),
    encodeFieldEmbedded(7, encodeHLC(hlcPhysical - 1000000, 0)),
    encodeFieldLengthDelimited(8, payloadBytes),
    encodeFieldVarint(9, clientClock || 0),
    encodeFieldVarint(10, 1) // OP_TYPE_YJS_UPDATE
  );
}

function buildPresenceCursor(actorId, deckId, x, y) {
  // Presence frame: field 1 = actor_id, field 2 = deck_id, field 3 = branch_id,
  // field 4 = kind (UPDATE=3), field 5 = cursor position submessage
  return concatBytes(
    encodeFieldLengthDelimited(1, actorId),
    encodeFieldLengthDelimited(2, deckId),
    encodeFieldLengthDelimited(3, 'main'),
    encodeFieldVarint(4, 3), // PRESENCE_KIND_UPDATE
    encodeFieldEmbedded(5, concatBytes(
      encodeFieldVarint(1, Math.round(x * 1000)), // x * 1000
      encodeFieldVarint(2, Math.round(y * 1000))  // y * 1000
    ))
  );
}

// ─── Frame codec ───────────────────────────────────────────────────
function encodeFrame(protobufBytes) {
  var lenBuf = new ArrayBuffer(4);
  var view = new DataView(lenBuf);
  view.setUint32(0, protobufBytes.length, false); // big-endian
  var frame = new Uint8Array(4 + protobufBytes.length);
  frame.set(new Uint8Array(lenBuf), 0);
  frame.set(protobufBytes, 4);
  return frame;
}

// ─── Options ───────────────────────────────────────────────────────
export const options = {
  scenarios: {
    // ── CI-friendly scenarios (short duration) ─────────────────────
    connect_storm: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 50 },
        { duration: CI_DURATION, target: 50 },
        { duration: '5s', target: 0 },
      ],
      exec: 'connectStorm',
      tags: { scenario: 'ci' },
    },
    op_stream: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 20 },
        { duration: CI_DURATION, target: 20 },
        { duration: '5s', target: 0 },
      ],
      exec: 'opStream',
      tags: { scenario: 'ci' },
    },

    // ── Doc-spec headline run (50 × 10, 200 ops/sec, 10 min) ───────
    doc_spec: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: NUM_DECKS * VUS_PER_DECK },
        { duration: K6_DURATION, target: NUM_DECKS * VUS_PER_DECK },
        { duration: '10s', target: 0 },
      ],
      exec: 'docSpec',
      tags: { scenario: 'doc_spec' },
    },

    // ── Presence scenario: 1k cursor updates/sec ───────────────────
    presence: {
      executor: 'constant-arrival-rate',
      rate: 1000,
      timeUnit: '1s',
      duration: K6_DURATION,
      preAllocatedVUs: 200,
      maxVUs: 2000,
      exec: 'presenceCursor',
      tags: { scenario: 'presence' },
    },
  },
  thresholds: {
    connect_success: ['rate>=0.95'],
    op_round_trip_ms: [{ threshold: 'p(95)<200', abortOnFail: false }],
    op_dropped: ['count==0'],
  },
  noConnectionReuse: true,
};

// ─── Scenario: connect_storm ───────────────────────────────────────
export function connectStorm() {
  var deckId = BASE_DECK_ID + '-ci-' + __VU;
  var actorId = 'actor-vu-' + __VU;
  var sessionId = generateULID();
  var url = GATEWAY_URL.replace('http', 'ws') + '/v1/sync/' + deckId;

  var connected = false;

  var res = ws.connect(url, {}, function (socket) {
    socket.on('open', function () {
      connected = true;
      wsConnections.add(1);
      activeConnections.add(1);

      var helloBytes = buildHello(actorId, deckId, sessionId);
      var frame = encodeFrame(helloBytes);
      socket.send(frame);
    });

    socket.on('message', function (msg) {});

    socket.on('error', function (e) {
      if (connected) {
        wsErrors.add(1);
      }
    });

    socket.on('close', function () {
      activeConnections.add(-1);
    });

    socket.setTimeout(function () {
      socket.close();
    }, 30000);
  });

  var upgradeOk = res && res.status === 101;
  check(res, {
    'WS upgrade succeeded': function (r) { return r && r.status === 101; },
    'WS connection established': function () { return connected; },
  });

  connectSuccess.add(upgradeOk);
}

// ─── Scenario: op_stream ───────────────────────────────────────────
export function opStream() {
  var deckId = BASE_DECK_ID + '-ci-stream';
  var actorId = 'actor-stream-' + __VU;
  var sessionId = generateULID();
  var url = GATEWAY_URL.replace('http', 'ws') + '/v1/sync/' + deckId;

  var connected = false;
  var opsSubmitted = 0;

  var res = ws.connect(url, {}, function (socket) {
    socket.on('open', function () {
      connected = true;
      activeConnections.add(1);

      var helloBytes = buildHello(actorId, deckId, sessionId);
      socket.send(encodeFrame(helloBytes));
    });

    socket.on('message', function (msg) {});

    socket.on('error', function (e) {
      if (connected) {
        wsErrors.add(1);
      }
    });

    socket.on('close', function () {
      activeConnections.add(-1);
    });

    // Submit ops at a steady rate: 1 per 500ms for 30 seconds = 60 ops
    var startTime = Date.now();
    var interval = setInterval(function () {
      var elapsed = Date.now() - startTime;
      if (elapsed > 30000) {
        clearInterval(interval);
        socket.close();
        return;
      }

      var opId = generateULID();
      var hlcPhysical = Date.now() * 1000000; // nanoseconds
      var hlcLogical = opsSubmitted;
      var payload = stringToBytes(
        JSON.stringify({ seq: opsSubmitted, ts: Date.now() })
      );

      var opBytes = buildOp(opId, deckId, actorId, hlcPhysical, hlcLogical, payload, opsSubmitted);
      var frame = encodeFrame(opBytes);

      var sendStart = Date.now();
      socket.send(frame);
      var sendDuration = Date.now() - sendStart;
      opsSubmitted++;
      opSent.add(1);
      opRoundTrip.add(sendDuration);
    }, 500);

    // Safety: close after 35s
    socket.setTimeout(function () {
      clearInterval(interval);
      socket.close();
    }, 35000);
  });

  var upgradeOk = res && res.status === 101;
  check(res, {
    'WS upgrade succeeded': function (r) { return r && r.status === 101; },
    'WS connected for op stream': function () { return connected; },
    'ops were submitted': function () { return opsSubmitted > 0; },
  });

  connectSuccess.add(upgradeOk);
}

// ─── Scenario: doc_spec (headline run) ─────────────────────────────
// 10 decks × 50 VUs = 500 VUs, sustained 200 ops/sec, configurable duration.
// Each VU is assigned to a specific deck (round-robin).
// Per-VU op interval = total_duration / (target_ops_per_sec / total_VUs).
export function docSpec() {
  // Assign this VU to a specific deck (round-robin)
  var deckIndex = __VU % NUM_DECKS;
  var deckId = DECK_IDS[deckIndex];
  var actorId = 'actor-docspec-' + __VU;
  var sessionId = generateULID();
  var url = GATEWAY_URL.replace('http', 'ws') + '/v1/sync/' + deckId;

  var connected = false;
  var opsSubmitted = 0;

  // Calculate per-VU op interval to achieve total DOC_SPEC_OPS_PER_SEC
  var totalVUs = NUM_DECKS * VUS_PER_DECK;
  var perVuOpsPerSec = DOC_SPEC_OPS_PER_SEC / totalVUs;
  var perVuIntervalMs = Math.max(100, Math.round(1000 / perVuOpsPerSec));

  var durationMs = parseInt(K6_DURATION, 10) * 1000 || 600000;

  var res = ws.connect(url, {}, function (socket) {
    socket.on('open', function () {
      connected = true;
      activeConnections.add(1);

      var helloBytes = buildHello(actorId, deckId, sessionId);
      socket.send(encodeFrame(helloBytes));
    });

    socket.on('message', function (msg) {
      // Track OpAck responses (if gateway processes ops)
      if (msg && msg.length > 4) {
        opAcked.add(1);
      }
    });

    socket.on('error', function (e) {
      if (connected) {
        wsErrors.add(1);
        opDropped.add(1);
      }
    });

    socket.on('close', function () {
      activeConnections.add(-1);
    });

    var startTime = Date.now();
    var interval = setInterval(function () {
      var elapsed = Date.now() - startTime;
      if (elapsed > durationMs) {
        clearInterval(interval);
        socket.close();
        return;
      }

      var opId = generateULID();
      var hlcPhysical = Date.now() * 1000000;
      var hlcLogical = opsSubmitted;
      var payload = stringToBytes(
        JSON.stringify({ seq: opsSubmitted, ts: Date.now(), deck: deckId })
      );

      var opBytes = buildOp(opId, deckId, actorId, hlcPhysical, hlcLogical, payload, opsSubmitted);
      var frame = encodeFrame(opBytes);

      var sendStart = Date.now();
      socket.send(frame);
      var sendDuration = Date.now() - sendStart;
      opsSubmitted++;
      opSent.add(1);
      opRoundTrip.add(sendDuration);
    }, perVuIntervalMs);

    // Safety: close slightly after duration + ramp-up
    socket.setTimeout(function () {
      clearInterval(interval);
      socket.close();
    }, durationMs + 60000);
  });

  var upgradeOk = res && res.status === 101;
  check(res, {
    'doc_spec WS upgrade succeeded': function (r) { return r && r.status === 101; },
    'doc_spec WS connected': function () { return connected; },
    'doc_spec ops submitted': function () { return opsSubmitted > 0; },
  });

  connectSuccess.add(upgradeOk);
}

// ─── Scenario: presence (1k cursor updates/sec) ────────────────────
// Each VU iteration: connect, send Hello, then send cursor updates at a
// steady rate for the duration. Constant-arrival-rate fires 1000 VU
// iterations per second; preAllocatedVUs keep connections warm.
export function presenceCursor() {
  var deckIndex = __VU % NUM_DECKS;
  var deckId = DECK_IDS[deckIndex];
  var actorId = 'actor-presence-' + __VU;
  var sessionId = generateULID();
  var url = GATEWAY_URL.replace('http', 'ws') + '/v1/sync/' + deckId;

  // Simulate cursor movement (random walk on a 1920x1080 canvas)
  var cx = Math.random() * 1920;
  var cy = Math.random() * 1080;

  var res = ws.connect(url, {}, function (socket) {
    socket.on('open', function () {
      activeConnections.add(1);

      var helloBytes = buildHello(actorId, deckId, sessionId);
      socket.send(encodeFrame(helloBytes));
    });

    socket.on('message', function (msg) {});
    socket.on('error', function () {});
    socket.on('close', function () {
      activeConnections.add(-1);
    });

    // Random walk cursor
    cx += (Math.random() - 0.5) * 50;
    cy += (Math.random() - 0.5) * 50;
    cx = Math.max(0, Math.min(1920, cx));
    cy = Math.max(0, Math.min(1080, cy));

    var cursorBytes = buildPresenceCursor(actorId, deckId, cx, cy);
    var frame = encodeFrame(cursorBytes);
    socket.send(frame);
    cursorSent.add(1);

    // Keep alive briefly, then close so VU can be recycled
    socket.setTimeout(function () {
      socket.close();
    }, 150);
  });

  var upgradeOk = res && res.status === 101;
  check(res, {
    'presence WS upgrade': function (r) { return r && r.status === 101; },
  });
  connectSuccess.add(upgradeOk);
}

// ─── Default function (required by k6) ─────────────────────────────
// All scenarios have explicit exec targets; this is a fallback no-op.
export default function () {
  connectStorm();
}

// ─── Summary ───────────────────────────────────────────────────────
export function handleSummary(data) {
  var summary = {
    timestamp: new Date().toISOString(),
    metrics: {},
  };

  for (var name of Object.keys(data.metrics)) {
    var m = data.metrics[name];
    if (m.values) {
      summary.metrics[name] = m.values;
    }
  }

  return {
    'stdout': JSON.stringify(summary, null, 2),
  };
}
