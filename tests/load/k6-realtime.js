/**
 * k6-realtime.js — Load tests for the domio realtime gateway.
 *
 * Scenarios:
 *   connect_storm: 50 VUs connect to /v1/sync/{deckId}, stay connected 30s
 *   op_stream:     20 VUs connected, each sends Op frames at a steady rate
 *
 * Wire protocol:
 *   WebSocket binary frames with 4-byte big-endian length prefix
 *   followed by a protobuf-encoded message body.
 *
 * Build & run:
 *   go build -o /tmp/opencode/rtgw ./services/realtime-gateway/cmd/rtgw
 *   JWT_SECRET=test-secret PORT=8080 NATS_URL=nats://localhost:4222 \
 *     REDIS_ADDR=localhost:6379 /tmp/opencode/rtgw &
 *   /tmp/opencode/k6 run tests/load/k6-realtime.js
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
const opRoundTrip = new Trend('op_round_trip_ms', true);
const activeConnections = new Gauge('active_connections');

// ─── Configuration ─────────────────────────────────────────────────
const GATEWAY_URL = __ENV.GATEWAY_URL || 'http://localhost:8080';
const DECK_ID = __ENV.DECK_ID || 'load-test-deck';
const JWT_SECRET = __ENV.JWT_SECRET || '';

// ─── k6-compatible string/byte helpers ─────────────────────────────
// goja (k6's JS engine) doesn't have TextEncoder/TextDecoder.
// For ASCII/latin-1 strings (JWT headers, JSON), charCodeAt gives the byte.

function stringToBytes(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
}

function bytesToString(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}

// ─── JWT generation (HMAC-SHA256 via k6/crypto) ────────────────────
function base64urlEncode(str) {
  return encoding.b64encode(str, 'rawurl');
}

function generateJWT(deckId, actorId) {
  const header = '{"alg":"HS256","typ":"JWT"}';
  const now = Math.floor(Date.now() / 1000);
  const payload = JSON.stringify({
    sub: actorId,
    actor_id: actorId,
    deck_id: deckId,
    session_kind: 'interactive',
    exp: now + 3600,
    iat: now,
  });

  const headerB64 = base64urlEncode(header);
  const payloadB64 = base64urlEncode(payload);
  const signingInput = headerB64 + '.' + payloadB64;

  // Use k6/crypto for HMAC-SHA256
  const signature = crypto.hmac('sha256', JWT_SECRET, signingInput, 'base64url');

  return signingInput + '.' + signature;
}

// ─── ULID generation (simplified, valid Crockford Base32) ──────────
const ULID_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function generateULID() {
  const timePart = Date.now().toString(36).toUpperCase().padStart(10, '0');
  let randomPart = '';
  for (let i = 0; i < 16; i++) {
    randomPart += ULID_CHARS[Math.floor(Math.random() * 32)];
  }
  return timePart + randomPart;
}

// ─── Protobuf encoding helpers (manual wire format) ────────────────
// Protobuf wire types:
//   0 = varint (int32, int64, uint32, uint64, sint32, sint64, bool, enum)
//   2 = length-delimited (string, bytes, embedded messages, repeated)
//
// Each field: (field_number << 3 | wire_type) as varint, then value.

function encodeVarint(value) {
  const bytes = [];
  let v = value < 0 ? BigInt(value) + (1n << 64n) : BigInt(value);
  while (v > 127n) {
    bytes.push(Number((v & 0x7Fn) | 0x80n));
    v >>= 7n;
  }
  bytes.push(Number(v));
  return new Uint8Array(bytes);
}

function encodeFieldVarint(fieldNumber, value) {
  const tag = encodeVarint((fieldNumber << 3) | 0);
  const val = encodeVarint(value);
  return concatBytes(tag, val);
}

function encodeFieldLengthDelimited(fieldNumber, data) {
  const tag = encodeVarint((fieldNumber << 3) | 2);
  const dataBytes = typeof data === 'string' ? stringToBytes(data) : data;
  const len = encodeVarint(dataBytes.length);
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
  let totalLen = 0;
  for (let i = 0; i < arguments.length; i++) {
    totalLen += arguments[i].length;
  }
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (let i = 0; i < arguments.length; i++) {
    result.set(arguments[i], offset);
    offset += arguments[i].length;
  }
  return result;
}

// ─── Message builders ──────────────────────────────────────────────
function buildHello(actorId, deckId, sessionId) {
  return concatBytes(
    encodeFieldLengthDelimited(1, actorId),      // actor_id
    encodeFieldLengthDelimited(2, deckId),        // deck_id
    encodeFieldLengthDelimited(3, 'main'),        // branch_id
    encodeFieldLengthDelimited(4, sessionId),     // session_id
    encodeFieldLengthDelimited(5, 'sync'),        // capabilities (repeated, one at a time)
    encodeFieldLengthDelimited(5, 'presence')     // capabilities
  );
}

function buildOp(opId, deckId, authorId, hlcPhysical, hlcLogical, payloadBytes) {
  return concatBytes(
    encodeFieldLengthDelimited(1, opId),          // op_id
    encodeFieldLengthDelimited(2, deckId),        // deck_id
    encodeFieldLengthDelimited(3, 'main'),        // branch_id
    encodeFieldLengthDelimited(5, authorId),      // author_id
    encodeFieldEmbedded(6, encodeHLC(hlcPhysical, hlcLogical)),  // hlc
    encodeFieldEmbedded(7, encodeHLC(hlcPhysical - 1000000, 0)), // parent_hlc
    encodeFieldLengthDelimited(8, payloadBytes),  // payload (bytes)
    encodeFieldVarint(9, 1),                      // client_clock
    encodeFieldVarint(10, 1)                      // op_type = OP_TYPE_YJS_UPDATE
  );
}

// ─── Frame codec ───────────────────────────────────────────────────
function encodeFrame(protobufBytes) {
  const lenBuf = new ArrayBuffer(4);
  const view = new DataView(lenBuf);
  view.setUint32(0, protobufBytes.length, false); // big-endian
  const frame = new Uint8Array(4 + protobufBytes.length);
  frame.set(new Uint8Array(lenBuf), 0);
  frame.set(protobufBytes, 4);
  return frame;
}

// ─── Options ───────────────────────────────────────────────────────
export const options = {
  scenarios: {
    connect_storm: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 50 },
        { duration: '30s', target: 50 },
        { duration: '5s', target: 0 },
      ],
      exec: 'connectStorm',
    },
    op_stream: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 20 },
        { duration: '30s', target: 20 },
        { duration: '5s', target: 0 },
      ],
      exec: 'opStream',
    },
  },
  thresholds: {
    connect_success: ['rate>=0.95'],
  },
  noConnectionReuse: true,
};

// ─── Scenario: connect_storm ───────────────────────────────────────
export function connectStorm() {
  const deckId = DECK_ID + '-' + __VU;
  const actorId = 'actor-vu-' + __VU;
  const sessionId = generateULID();
  const url = GATEWAY_URL.replace('http', 'ws') + '/v1/sync/' + deckId;

  let connected = false;

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      connected = true;
      wsConnections.add(1);
      activeConnections.add(1);

      // Send a Hello frame after connecting
      const helloBytes = buildHello(actorId, deckId, sessionId);
      const frame = encodeFrame(helloBytes);
      socket.send(frame);
    });

    socket.on('message', (msg) => {
      // Server may send binary frames or ping/pong
    });

    socket.on('error', (e) => {
      // Only count real errors after successful connection (not expected close events)
      if (connected) {
        wsErrors.add(1);
      }
    });

    socket.on('close', () => {
      activeConnections.add(-1);
    });

    // Keep connection open for 30 seconds
    socket.setTimeout(() => {
      socket.close();
    }, 30000);
  });

  const upgradeOk = res && res.status === 101;
  check(res, {
    'WS upgrade succeeded': (r) => r && r.status === 101,
    'WS connection established': () => connected,
  });

  connectSuccess.add(upgradeOk);
}

// ─── Scenario: op_stream ───────────────────────────────────────────
export function opStream() {
  const deckId = DECK_ID + '-stream';
  const actorId = 'actor-stream-' + __VU;
  const sessionId = generateULID();
  const url = GATEWAY_URL.replace('http', 'ws') + '/v1/sync/' + deckId;

  let connected = false;
  let opsSubmitted = 0;

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', () => {
      connected = true;
      activeConnections.add(1);

      // Send Hello first
      const helloBytes = buildHello(actorId, deckId, sessionId);
      socket.send(encodeFrame(helloBytes));
    });

    socket.on('message', (msg) => {
      // Could be a protobuf response; log for debugging
    });

    socket.on('error', (e) => {
      // Only count real errors after successful connection (not expected close events)
      if (connected) {
        wsErrors.add(1);
      }
    });

    socket.on('close', () => {
      activeConnections.add(-1);
    });

    // Submit ops at a steady rate: 1 per 500ms for 30 seconds = 60 ops
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      if (elapsed > 30000) {
        clearInterval(interval);
        socket.close();
        return;
      }

      const opId = generateULID();
      const hlcPhysical = Date.now() * 1000000; // nanoseconds
      const hlcLogical = opsSubmitted;
      const payload = stringToBytes(
        JSON.stringify({ seq: opsSubmitted, ts: Date.now() })
      );

      const opBytes = buildOp(opId, deckId, actorId, hlcPhysical, hlcLogical, payload);
      const frame = encodeFrame(opBytes);

      const sendStart = Date.now();
      socket.send(frame);
      const sendDuration = Date.now() - sendStart;
      opsSubmitted++;
      opSent.add(1);
      opRoundTrip.add(sendDuration);
    }, 500);

    // Safety: close after 35s
    socket.setTimeout(() => {
      clearInterval(interval);
      socket.close();
    }, 35000);
  });

  const upgradeOk = res && res.status === 101;
  check(res, {
    'WS upgrade succeeded': (r) => r && r.status === 101,
    'WS connected for op stream': () => connected,
    'ops were submitted': () => opsSubmitted > 0,
  });

  connectSuccess.add(upgradeOk);
}

// ─── Summary ───────────────────────────────────────────────────────
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    metrics: {},
  };

  for (const name of Object.keys(data.metrics)) {
    const m = data.metrics[name];
    if (m.values) {
      summary.metrics[name] = m.values;
    }
  }

  return {
    'stdout': JSON.stringify(summary, null, 2),
  };
}
