# Load Tests — Realtime Gateway

## Overview

k6 load tests exercising the domio realtime gateway over WebSocket.
Tests the `GET /v1/sync/{deckId}` endpoint with length-prefixed protobuf framing.

## Prerequisites

- **Gateway binary**: `go build -o /tmp/opencode/rtgw ./services/realtime-gateway/cmd/rtgw`
- **Infrastructure**: NATS on `localhost:4222`, Redis on `localhost:6379`
- **k6**: `/tmp/opencode/k6` (v0.54.0)

## Quick Start

```bash
# Option 1: use the helper script (builds + starts + runs)
./tests/load/run-load.sh

# Option 2: manual
# Terminal 1: start gateway
JWT_SECRET=test-secret PORT=8080 \
  NATS_URL=nats://localhost:4222 \
  REDIS_ADDR=localhost:6379 \
  /tmp/opencode/rtgw

# Terminal 2: run load test
/tmp/opencode/k6 run tests/load/k6-realtime.js
```

## Scenarios

### `connect_storm`
- **50 virtual users** connect to `/v1/sync/{deckId}` via WebSocket
- Each connection sends a protobuf-encoded `Hello` frame
- Connections held open for 30 seconds
- Validates: HTTP 101 upgrade, connection stability, no disconnects

### `op_stream`
- **20 virtual users** connect and submit `Op` frames at 1 per 500ms
- Each `Op` contains: valid ULID `op_id`, HLC timestamp, deck/author IDs, Yjs payload
- Measures: send success rate, connection stability under load

## Wire Protocol

All WebSocket frames use **length-prefixed protobuf framing**:
- 4-byte big-endian length prefix
- Followed by protobuf-encoded message body

Message types: `Hello`, `Op`, `Welcome`, `OpAck`, `Presence`, `Error` (see `contracts/proto/domio/realtime/v1/realtime.proto`).

## Metrics

| Metric | Description |
|--------|-------------|
| `ws_errors` | WebSocket error count (target: < 1% rate) |
| `connect_success` | Connection success rate (target: >= 95%) |
| `op_round_trip_ms` | Op send latency (target: p95 < 500ms) |
| `ws_connections` | Total successful connections |
| `op_sent` | Total ops submitted |
| `active_connections` | Concurrent active connections |

## JWT Authentication

The k6 script generates HS256-signed JWTs matching the gateway's `JWT_SECRET`.
Claims include `actor_id`, `deck_id`, `session_kind`, and expiry.

## Known Limitations

1. **No Welcome assertion**: The current gateway router accepts WebSocket upgrades
   but does not send a `Welcome` frame or run the `ReadPump`. The connect storm
   test validates that the upgrade succeeds (HTTP 101) and the connection stays
   open (pings from the write pump keep it alive).

2. **No OpAck round-trip**: Since the router does not start a `ReadPump`, client
   `Op` frames are buffered but not processed. The op_stream test measures send
   success and connection stability, not true round-trip acknowledgment latency.

3. **Thresholds are informational**: `op_round_trip_ms` measures send completion
   time (near-zero since there's no actual ack). When the router adds ReadPump
   support, these thresholds will measure real end-to-end latency.

## Results (k6 v0.54.0)

```
connect_storm: 50 VUs, 30s sustained
  connect_success: 100% (281,869 / 281,869)
  ws_connecting p95: 16.6ms

op_stream: 20 VUs, 30s sustained, 1 op/500ms
  op_sent: 2,360
  op_round_trip_ms p95: <1ms (send-only, no ack expected)

Overall: 281,869 iterations, 563,738 checks (99.99% pass rate)
```

## Future Improvements

- Test against a gateway with full `ReadPump` + handshake for real Welcome/OpAck
- Add presence endpoint load tests (`/v1/presence/{deckId}`)
- Test JWT validation under load (expired tokens, tenant mismatch)
- Ramp-up patterns that test graceful degradation at connection limits
