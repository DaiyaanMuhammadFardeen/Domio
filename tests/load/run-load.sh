#!/usr/bin/env bash
# run-load.sh — Build, start, and run load tests against the realtime gateway.
# Non-interactive: no prompts, no TTY, safe for CI.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
K6_BIN="/tmp/opencode/k6"
RTGW_BIN="/tmp/opencode/rtgw"
PORT="${PORT:-8080}"
PIDFILE="/tmp/rtgw-load-test.pid"

# ─── Go toolchain ──────────────────────────────────────────────────
export PATH="/tmp/opencode/go-sdk/go/bin:$PATH"
export GOTOOLCHAIN=local
export GOFLAGS=-mod=mod

cleanup() {
  echo "[load] Cleaning up..."
  if [ -f "$PIDFILE" ]; then
    kill "$(cat "$PIDFILE")" 2>/dev/null || true
    rm -f "$PIDFILE"
  fi
  # Also kill any lingering rtgw on this port
  kill $(lsof -ti :"$PORT" 2>/dev/null) 2>/dev/null || true
}
trap cleanup EXIT

# ─── Build ──────────────────────────────────────────────────────────
echo "[load] Building realtime gateway..."
cd "$PROJECT_ROOT"
go build -o "$RTGW_BIN" ./services/realtime-gateway/cmd/rtgw
echo "[load] Binary: $RTGW_BIN"

# ─── Start gateway ──────────────────────────────────────────────────
echo "[load] Starting gateway on port $PORT..."
PORT="$PORT" \
NATS_URL="nats://localhost:4222" \
REDIS_ADDR="localhost:6379" \
POSTGRES_URL="" \
JWT_SECRET="test-secret" \
JWT_JWKS_URL="" \
"$RTGW_BIN" &
RTGW_PID=$!
echo "$RTGW_PID" > "$PIDFILE"

# ─── Wait for readiness ────────────────────────────────────────────
echo "[load] Waiting for /readyz..."
MAX_WAIT=30
for i in $(seq 1 "$MAX_WAIT"); do
  if curl -sf "http://localhost:$PORT/readyz" > /dev/null 2>&1; then
    echo "[load] Gateway ready after ${i}s"
    break
  fi
  if [ "$i" -eq "$MAX_WAIT" ]; then
    echo "[load] ERROR: Gateway did not become ready in ${MAX_WAIT}s"
    exit 1
  fi
  sleep 1
done

# ─── Health check ───────────────────────────────────────────────────
echo "[load] /healthz:"
curl -sf "http://localhost:$PORT/healthz" && echo
echo "[load] /readyz:"
curl -sf "http://localhost:$PORT/readyz" && echo
echo "[load] /metrics (first 10 lines):"
curl -sf "http://localhost:$PORT/metrics" | head -10 && echo

# ─── Run k6 load test ──────────────────────────────────────────────
echo ""
echo "[load] Running k6 load test..."
"$K6_BIN" run \
  --env "GATEWAY_URL=http://localhost:$PORT" \
  --env "JWT_SECRET=test-secret" \
  --env "DECK_ID=load-test-deck" \
  "$SCRIPT_DIR/k6-realtime.js"

echo ""
echo "[load] Load test complete."
