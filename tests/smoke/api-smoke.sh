#!/usr/bin/env bash
# Smoke test for the Phase 0 / 1 control plane API.
# Runs after the API container/server is up on port 8080.

set -euo pipefail

BASE=${API_BASE:-http://localhost:8080}

check() {
  local method=$1 path=$2 expect=$3 body=${4:-}
  local out_file=/tmp/api-smoke.$$.json
  local code
  if [[ -n "$body" ]]; then
    code=$(curl -sS -o "$out_file" -w '%{http_code}' -X "$method" -H 'content-type: application/json' -d "$body" "${BASE}${path}")
  else
    code=$(curl -sS -o "$out_file" -w '%{http_code}' -X "$method" "${BASE}${path}")
  fi
  if [[ "$code" != "$expect" ]]; then
    echo "✗ ${method} ${path} expected ${expect} got ${code}"
    cat "$out_file"
    exit 1
  fi
  echo "✓ ${method} ${path} → ${code}"
  rm -f "$out_file"
}

check GET  /healthz       200
check GET  /readyz        200
check GET  /              200
check GET  /v1/decks/local/local/demo 200
check GET  /v1/decks/%20%20%20/%20/%20 400
check GET  /v1/decks/noorg/notenant/deck/extra 404

echo "All API smoke checks passed."