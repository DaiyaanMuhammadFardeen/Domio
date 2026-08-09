#!/usr/bin/env bash
#
# Phase 22-beta G1-7 — verify-headers.sh
#
# Hits the staging CDN for one representative URL per asset class
# from `docs/08-infrastructure-devops.md` §8.17.1 and asserts
# the expected `Cache-Control` + `Surrogate-Key` / `Cache-Tag` pair.
#
# Usage:
#   infra/cdn/scripts/verify-headers.sh --cdn=https://cdn.staging.domio.app
#
# Exit codes:
#   0 — all asset classes verified
#   1 — at least one asset class returned unexpected headers
#   2 — bad arguments

set -euo pipefail

CDN=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cdn=*) CDN="${1#*=}" ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

if [[ -z "$CDN" ]]; then
  echo "--cdn=<url> is required" >&2
  exit 2
fi

# asset_class|path|expected Cache-Control|expected Surrogate-Key substring
PROBES=(
  "static-js|/_next/static/chunks/main.js|public, max-age=31536000, immutable|static-js"
  "static-css|/_next/static/css/app.css|public, max-age=31536000, immutable|static-css"
  "html|/|public, max-age=0, must-revalidate|html"
  "deck-read|/v1/decks/loadtest-deck-001|public, max-age=30, stale-while-revalidate=120|deck-loadtest-deck-001"
  "deck-list|/v1/decks|public, max-age=15, s-maxage=60|deck-list"
  "share|/v1/share/loadtest-token-001|public, max-age=60, s-maxage=300|share-loadtest-token-001"
  "media|/media/loadtest-media-001|public, max-age=86400, s-maxage=604800|media-loadtest-media-001"
  "media-video|/media/video/loadtest-video-001|public, max-age=86400, s-maxage=2592000|media-loadtest-video-001"
  "thumb|/v1/thumbnails/loadtest-deck-001|public, max-age=300, s-maxage=86400|thumb-loadtest-deck-001"
  "avatar|/v1/users/loadtest-user-001/avatar|public, max-age=3600, s-maxage=86400|avatar-loadtest-user-001"
  "ai-image|/v1/ai/loadtest-run-001/image|public, max-age=86400, immutable|ai-image-loadtest-run-001"
  "realtime|/v1/realtime|no-store|"
  "auth|/v1/auth/session|no-store, private|"
)

FAIL=0
for probe in "${PROBES[@]}"; do
  IFS='|' read -r cls path expected_cc expected_key <<< "$probe"
  url="$CDN$path"
  out=$(curl -sS -o /dev/null -D - "$url" || true)
  cc=$(echo "$out" | awk 'BEGIN{IGNORECASE=1} /^cache-control:/ {sub(/^cache-control: */,"",$0); print; exit}')
  sk=$(echo "$out" | awk 'BEGIN{IGNORECASE=1} /^surrogate-key:/ {sub(/^surrogate-key: */,"",$0); print; exit}')
  if [[ -z "$sk" ]]; then
    sk=$(echo "$out" | awk 'BEGIN{IGNORECASE=1} /^cache-tag:/ {sub(/^cache-tag: */,"",$0); print; exit}')
  fi
  ok_cc="OK"
  ok_sk="OK"
  if [[ "$cc" != *"$expected_cc"* ]]; then
    ok_cc="FAIL: got '$cc' expected '$expected_cc'"
    FAIL=1
  fi
  if [[ -n "$expected_key" ]] && [[ "$sk" != *"$expected_key"* ]]; then
    ok_sk="FAIL: got '$sk' expected '$expected_key'"
    FAIL=1
  fi
  printf "%-12s | cc=%s | sk=%s\n" "$cls" "$ok_cc" "$ok_sk"
done

if [[ $FAIL -ne 0 ]]; then
  echo "verification FAILED" >&2
  exit 1
fi
echo "verification OK"
