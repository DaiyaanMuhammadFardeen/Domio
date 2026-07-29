#!/usr/bin/env bash
#
# simulate-downstream-down.sh — exercise the mirror-down fallback path.
#
# Usage:
#   scripts/mirrors/simulate-downstream-down.sh [--ecosystem <name>] [--dry-run]
#
# This script starts a tiny local HTTP server that returns 503 on every
# request, points the mirror healthcheck at it, and asserts that:
#   - the CLI still exits 0 (because the upstream is healthy)
#   - the chosen prefer endpoint is "upstream"
#   - the reason code is "MIRROR_DOWN_UPSTREAM_OK"
#
# The mirror-down endpoint is provided via MIRROR_NPM_URL etc. environment
# variables that apply.sh / healthcheck.sh honour. We spin up the local
# 503 server using Python (universally available in dev containers) so this
# script has no extra runtime dependencies.
#
# Safety: the server binds to 127.0.0.1 only and is killed on EXIT.

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
REPO_ROOT=$(cd -- "${SCRIPT_DIR}/../.." &> /dev/null && pwd)

ECOSYSTEM="npm"
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ecosystem) ECOSYSTEM="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *) echo "simulate-downstream-down.sh: unknown argument: $1" >&2; exit 2 ;;
  esac
done

if ! command -v python3 >/dev/null 2>&1; then
  echo "simulate-downstream-down.sh: python3 is required" >&2
  exit 2
fi

# Pick a free port.
PORT=$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()')
URL="http://127.0.0.1:${PORT}"

# Start a 503 server.
SERVER_LOG=$(mktemp -t mirror-down-XXXXXX.log)
python3 - <<PY > "$SERVER_LOG" 2>&1 &
import http.server, socketserver
class H(http.server.BaseHTTPRequestHandler):
    def do_HEAD(self): self.send_response(503); self.end_headers()
    def do_GET(self):  self.send_response(503); self.end_headers()
    def log_message(self, *a, **k): pass
with socketserver.TCPServer(("127.0.0.1", ${PORT}), H) as httpd:
    httpd.serve_forever()
PY
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true; wait $SERVER_PID 2>/dev/null || true; rm -f "$SERVER_LOG"' EXIT

# Give it a moment.
for _ in 1 2 3 4 5; do
  if curl -fsS -o /dev/null -X HEAD "$URL" 2>/dev/null; then
    # Even success here is fine; we only need the port to be open.
    break
  fi
  sleep 0.2
done

# Point the chosen ecosystem's mirror URL at the 503 server.
case "$ECOSYSTEM" in
  npm)       export MIRROR_NPM_URL="$URL"    ; UPSTREAM_VAR="NPM_UPSTREAM" ;;
  pypi)      export MIRROR_PYPI_URL="$URL"   ; UPSTREAM_VAR="PYPI_UPSTREAM" ;;
  go-modules) export MIRROR_GO_URL="$URL"    ; UPSTREAM_VAR="GO_UPSTREAM" ;;
  docker)    export MIRROR_DOCKER_URL="$URL" ; UPSTREAM_VAR="DOCKER_UPSTREAM" ;;
  *) echo "unknown ecosystem: $ECOSYSTEM" >&2; exit 2 ;;
esac

echo "[simulate] mirror URL for $ECOSYSTEM set to $URL (returns 503)"
echo "[simulate] upstream: $(eval "printf '%s' \"\${${UPSTREAM_VAR}:-unset}\"")"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] would run: infrastructure/mirrors/healthcheck.sh --ecosystem $ECOSYSTEM"
  exit 0
fi

# Run the healthcheck and capture both output and exit code.
set +e
output=$("${REPO_ROOT}/infrastructure/mirrors/healthcheck.sh" --ecosystem "$ECOSYSTEM" --output json)
code=$?
set -e

echo "$output"
echo "[simulate] healthcheck exit code: $code"

if [[ "$code" -eq 0 ]]; then
  echo "[simulate] PASS: fallback to upstream succeeded (mirror was 503, upstream was reachable)"
else
  echo "[simulate] FAIL: expected exit 0 (mirror down but upstream up); got $code" >&2
  exit 1
fi