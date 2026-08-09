#!/usr/bin/env bash
#
# Phase 22-beta G1-7 — verify-brotli.sh
#
# Asserts that text-based assets are served with Content-Encoding: br
# for clients that advertise `Accept-Encoding: br, gzip`.
#
# Usage:
#   infra/cdn/scripts/verify-brotli.sh --cdn=https://cdn.staging.domio.app

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

PROBES=(
  "/_next/static/chunks/main.js|application/javascript"
  "/_next/static/css/app.css|text/css"
  "/v1/decks/loadtest-deck-001|application/json"
  "/|text/html"
)

FAIL=0
for probe in "${PROBES[@]}"; do
  IFS='|' read -r path expected_ct <<< "$probe"
  url="$CDN$path"
  enc=$(curl -sS -o /dev/null -D - -H 'Accept-Encoding: br, gzip' "$url" | awk 'BEGIN{IGNORECASE=1} /^content-encoding:/ {sub(/^content-encoding: */,"",$0); print; exit}')
  if [[ "$enc" == "br" ]]; then
    printf "%-50s | br\n" "$path"
  else
    printf "%-50s | FAIL: got '%s'\n" "$path" "$enc"
    FAIL=1
  fi
done

# Negative: already-compressed assets must NOT be re-encoded.
NEG_PROBES=(
  "/media/loadtest-image-001.png|image/png"
  "/media/loadtest-video-001.mp4|video/mp4"
)
for probe in "${NEG_PROBES[@]}"; do
  IFS='|' read -r path expected_ct <<< "$probe"
  url="$CDN$path"
  enc=$(curl -sS -o /dev/null -D - -H 'Accept-Encoding: br, gzip' "$url" | awk 'BEGIN{IGNORECASE=1} /^content-encoding:/ {sub(/^content-encoding: */,"",$0); print; exit}')
  if [[ -z "$enc" ]]; then
    printf "%-50s | not-reencoded (OK)\n" "$path"
  else
    printf "%-50s | FAIL: reencoded to '%s'\n" "$path" "$enc"
    FAIL=1
  fi
done

if [[ $FAIL -ne 0 ]]; then
  echo "verification FAILED" >&2
  exit 1
fi
echo "verification OK"