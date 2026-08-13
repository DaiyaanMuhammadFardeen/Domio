#!/usr/bin/env bash
# Smoke test for the Domio control plane API.
#
# Boots after the API is running on $API_BASE (default http://localhost:8080).
#
# Splits checks into three layers:
#   - Positive — happy-path HTTP 200 responses on each documented endpoint.
#   - Negative — bad-input HTTP error responses (404 for unknown routes,
#                405 for wrong methods, malformed paths).
#   - Performance — sanity-check p95 latency on the healthz hot path.
#
# Exits non-zero if any check fails.
#
# Used by .github/workflows/smoke.yml.

set -euo pipefail

BASE=${API_BASE:-http://localhost:8080}

# ── helpers ────────────────────────────────────────────────────────────
pass=0; fail=0
check() {
  local name=$1 method=$2 path=$3 expect=$4 body=${5:-}
  local out_file=/tmp/api-smoke.$$.json
  local code
  if [[ -n "$body" ]]; then
    code=$(curl -sS -o "$out_file" -w '%{http_code}' -X "$method" -H 'content-type: application/json' -d "$body" "${BASE}${path}")
  else
    code=$(curl -sS -o "$out_file" -w '%{http_code}' -X "$method" "${BASE}${path}")
  fi
  if [[ "$code" == "$expect" ]]; then
    printf '  \033[32m✓\033[0m %-50s %3s %s\n' "$name" "$code" "$method $path"
    pass=$((pass+1))
  else
    printf '  \033[31m✗\033[0m %-50s expected %s got %s — body: %s\n' "$name" "$expect" "$code" "$(cat "$out_file")"
    fail=$((fail+1))
  fi
  rm -f "$out_file"
}

echo "── positive smoke (expect 200) ────────────────────────────────"
check "healthz"           GET  /healthz                                       200
check "readyz"            GET  /readyz                                        200
check "root"              GET  /                                              200
check "deck demo"         GET  /v1/decks/local/local/demo                     200
check "annotations root"  GET  /v1/annotations                                 200
check "permissions root"  GET  /v1/permissions                                 200
check "tasks root"        GET  /v1/tasks                                       200
check "users me"          GET  /v1/users/me                                    200
check "comments root"     GET  /v1/comments                                    200

echo
echo "── negative smoke (expect 4xx) ────────────────────────────────"
# Unknown route → 404
check "404 unknown route"     GET    /v1/nonexistent                            404
check "404 deep unknown"      GET    /v1/some/nested/missing/path               404
# Wrong method on a route that only supports one verb → 405
check "405 wrong method"      POST   /healthz                                   405
check "405 delete readyz"     DELETE /readyz                                    405
# Malformed JSON body on a POST → 400
check "400 bad JSON"          POST   /v1/permissions/grants                     400  '{"this is": not valid json'

echo
echo "── performance sanity (avg < 100ms over 20 reqs on /healthz) ──"
total_ms=0
max_ms=0
for i in $(seq 1 20); do
  t=$(curl -sS -o /dev/null -w '%{time_total}' "${BASE}/healthz" 2>/dev/null || echo "0")
  ms=$(awk -v t="$t" 'BEGIN{printf "%d", t*1000}')
  total_ms=$((total_ms + ms))
  [[ $ms -gt $max_ms ]] && max_ms=$ms
done
avg_ms=$((total_ms / 20))
echo "  avg=${avg_ms}ms  max=${max_ms}ms  (20 requests)"

echo
echo "── summary ─────────────────────────────────────────────────────"
echo "  passed: $pass"
echo "  failed: $fail"
if [[ $fail -gt 0 ]]; then
  exit 1
fi
if [[ $avg_ms -gt 100 ]]; then
  echo "Performance budget exceeded (${avg_ms}ms > 100ms target)" >&2
  exit 1
fi
echo "All API smoke checks passed."