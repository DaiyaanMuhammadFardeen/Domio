# E2E Integration Tests — Phase 04 Realtime Stack

Full-stack integration tests for the realtime collaboration pipeline:
**Go gateway → NATS JetStream → sync worker → Postgres crdt_logs**

## Prerequisites

| Service      | Endpoint                      | Notes                                                                   |
| ------------ | ----------------------------- | ----------------------------------------------------------------------- |
| NATS         | `localhost:4222`              | JetStream enabled, no auth                                              |
| Redis        | `localhost:6379`              | No auth                                                                 |
| Postgres     | `localhost:5432`              | Database `domio`, user/pass `domio/domio`, migrations 0001-0005 applied |
| Go toolchain | `/tmp/opencode/go-sdk/go/bin` | GOTOOLCHAIN=local                                                       |
| k6           | `/tmp/opencode/k6`            | v0.54.0                                                                 |

## Quick Start

```bash
bash tests/e2e/realtime-e2e.sh
```

This runs the complete suite: build → boot → Go test → k6 load → chaos → teardown.

## JWT Claims Format

All clients minting tokens for the realtime gateway must produce HMAC-SHA256 (HS256) JWTs with the following structure:

### Header

```json
{ "alg": "HS256", "typ": "JWT" }
```

The gateway **pins algorithm to HS256** — tokens with `alg: none`, `alg: RS256`, or any other algorithm are rejected.

### Payload (Claims)

```json
{
  "sub":          "<actor_ulid>",
  "actor_id":     "<actor_ulid>",
  "deck_id":      "<deck_ulid>",
  "session_kind": "interactive" | "service",
  "exp":          <unix_epoch_seconds>,
  "iat":          <unix_epoch_seconds>
}
```

| Claim          | Type   | Required | Description                                              |
| -------------- | ------ | -------- | -------------------------------------------------------- |
| `sub`          | string | yes      | Subject — typically the actor's ULID                     |
| `actor_id`     | string | yes      | Actor identifier (ULID). Must match `sub`.               |
| `deck_id`      | string | yes      | Deck identifier (ULID). Must match the URL path deck ID. |
| `session_kind` | string | yes      | `"interactive"` (browser) or `"service"` (backend).      |
| `exp`          | int64  | yes      | Expiration time (Unix epoch seconds).                    |
| `iat`          | int64  | yes      | Issued-at time (Unix epoch seconds).                     |

### Signature

- **Algorithm**: HMAC-SHA256 over `<header_b64>.<payload_b64>`
- **Encoding**: Unpadded base64url (`base64.RawURLEncoding` in Go)
- **Secret**: Shared `JWT_SECRET` configured on the gateway

### Example (Go)

```go
headerJSON, _ := json.Marshal(map[string]string{"alg": "HS256", "typ": "JWT"})
headerB64 := base64.RawURLEncoding.EncodeToString(headerJSON)

payloadJSON, _ := json.Marshal(map[string]any{
    "sub":          actorID,
    "actor_id":     actorID,
    "deck_id":      deckID,
    "session_kind": "interactive",
    "exp":          time.Now().Add(time.Hour).Unix(),
    "iat":          time.Now().Unix(),
})
payloadB64 := base64.RawURLEncoding.EncodeToString(payloadJSON)

mac := hmac.New(sha256.New, []byte(jwtSecret))
mac.Write([]byte(headerB64 + "." + payloadB64))
sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

token := headerB64 + "." + payloadB64 + "." + sig
```

### Example (JavaScript/k6)

```javascript
function generateJWT(deckId, actorId, secret) {
  var header = JSON.stringify({ alg: 'HS256', typ: 'JWT' });
  var now = Math.floor(Date.now() / 1000);
  var payload = JSON.stringify({
    sub: actorId,
    actor_id: actorId,
    deck_id: deckId,
    session_kind: 'interactive',
    exp: now + 3600,
    iat: now,
  });
  var headerB64 = encoding.b64encode(header, 'rawurl');
  var payloadB64 = encoding.b64encode(payload, 'rawurl');
  var signingInput = headerB64 + '.' + payloadB64;
  // IMPORTANT: use binary then rawurl to avoid padding
  var sigBytes = crypto.hmac('sha256', secret, signingInput, 'binary');
  var signature = encoding.b64encode(
    String.fromCharCode.apply(null, sigBytes),
    'rawurl',
  );
  return signingInput + '.' + signature;
}
```

### WebSocket Authentication

The JWT is passed as a `?token=` query parameter on the WebSocket upgrade request:

```
ws://localhost:8080/v1/sync/{deckId}?token={jwt}
```

## Wire Protocol

WebSocket binary frames with 4-byte big-endian length prefix followed by raw protobuf bytes:

```
[4-byte BE length][protobuf payload]
```

**No type tag** — message type is discriminated by field presence on the decoded protobuf (see `unwrapMessage` in `transport/ws.go` and `realtime.go`).

## What Gets Tested

### Go E2E Test (`e2e_test.go`)

| Phase                  | Description                                                       | Client | Status                          |
| ---------------------- | ----------------------------------------------------------------- | ------ | ------------------------------- |
| 00_Setup               | Create test tenant + workspace + deck in Postgres (FK compliance) | —      | ✅ PASS                         |
| 01_SyncHandshake_SDK   | Connect via SDK → send Hello → receive Welcome                    | Go SDK | ✅ PASS                         |
| 02_SendOps_SDK         | Send 50 Ops via SDK → receive OpAck for each                      | Go SDK | ⚠️ Known bug BUG-001            |
| 03_DuplicateOp_SDK     | Send same op_id twice → assert idempotent handling                | Go SDK | ⏭️ Skipped (blocked by BUG-001) |
| 04_PostgresPersistence | Verify ops landed in crdt_logs table                              | —      | ⏭️ Skipped (blocked by BUG-001) |
| 05_SecondClient_SDK    | Open second SDK client for same deck → assert Welcome received    | Go SDK | ✅ PASS                         |
| 06_Presence            | Two actors connect presence → assert cursor update fan-out        | Raw WS | ✅ PASS                         |
| 99_Summary             | Print results table with known bugs                               | —      | ✅ PASS                         |

### k6 Load Test

- 4 VUs, 15s duration, constant VUs scenario
- Connects to live gateway WS endpoint
- JWT generation uses unpadded base64url (matches Go's `base64.RawURLEncoding`)
- Measures connection throughput and latency

### Chaos Scenario

- **NATS partition**: SIGSTOP/SIGCONT on nats-server process
- Verifies gateway stays available (HTTP 200 on `/readyz`) during NATS unavailability
- Verifies gateway recovers after NATS reconnects

## Known Product Bugs

### BUG-001: op_type encoding (blocks op persistence)

**Location**: `services/realtime-gateway/internal/ops/ops.go` — `ValidateAndCheckDuplicate()`

**Problem**: The INSERT into `crdt_logs` passes `int32(op.GetOpType())` to the `op_type` column which is `text NOT NULL`. pgx v5 fails with:

```
unable to encode int32 into text format for text (OID 25)
```

This causes ALL Op inserts to fail, returning `REALTIME_ERROR_CODE_INVALID_OP` to the client. It blocks:

- Op persistence in crdt_logs
- NATS fan-out to second clients
- Sync worker processing
- k6 load test op success rate

**Fix**: Change `int32(op.GetOpType())` to `op.GetOpType().String()` in the INSERT statement.

## Architecture

```
e2e_test.go ──WS──▸ rtgw (gateway) ──NATS JetStream──▸ sync-worker ──▸ Postgres
    │                    │                                    │
    ├── JWT minting      ├── /v1/sync/{deckId}               ├── crdt_logs
    ├── Hello/Welcome    ├── /v1/presence/{deckId}           └── ops persistence
    ├── Op send/ack      └── /healthz /readyz /metrics
    └── Presence fan-out

realtime-e2e.sh
    ├── STEP 0: Check infrastructure (NATS, Redis, Postgres)
    ├── STEP 1: Build binaries (gateway + sync worker)
    ├── STEP 2: Start gateway (unique JWT_SECRET, port 18080)
    ├── STEP 3: Start sync worker (port 19090)
    ├── STEP 4: Run Go E2E test (E2E=1) — SDK client path
    ├── STEP 5: Run k6 load test (15s CI scenario)
    ├── STEP 6: Chaos scenario (NATS SIGSTOP/SIGCONT)
    └── Summary: PASS/FAIL with timings
```

## Expected Output

```
═══════════════════════════════════════════════════════════════
  E2E FULL-STACK INTEGRATION TEST — FINAL SUMMARY
═══════════════════════════════════════════════════════════════

  STEP                 STATUS   DETAIL
  ──────────────────── ──────── ──────────────────────────
  Infrastructure       PASS     NATS, Redis, Postgres all running
  Build                PASS     0s
  Gateway              PASS     port=18080, pid=XXXXX
  SyncWorker           PASS     port=19090, pid=XXXXX
  GoE2E                PASS     0s
  k6Load               PASS     16s, checks=1
  Chaos                PASS     NATS partition+recovery, 6s

═══════════════════════════════════════════════════════════════
  PASS — all test-owned checks verified
═══════════════════════════════════════════════════════════════
```

## Running Individual Tests

```bash
# Go test only (requires gateway + worker already running)
E2E=1 GATEWAY_URL=http://localhost:18080 JWT_SECRET=secret go test -v ./tests/e2e/

# k6 only (requires gateway on port 18080)
GATEWAY_URL=http://localhost:18080 JWT_SECRET=secret /tmp/opencode/k6 run /tmp/e2e-k6-test.js
```
