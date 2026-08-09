#!/usr/bin/env bash
#
# Phase 22-beta G1-7 — verify-image-variants.sh
#
# Uploads a test image to the staging CDN and asserts that all
# expected responsive variants are generated, and that the LQIP
# placeholder endpoint responds.
#
# Usage:
#   infra/cdn/scripts/verify-image-variants.sh --cdn=https://cdn.staging.domio.app --token=$CDN_API_TOKEN

set -euo pipefail

CDN=""
TOKEN=""
WIDTHS=(320 640 960 1280 1920 2560)

while [[ $# -gt 0 ]]; do
  case "$1" in
    --cdn=*) CDN="${1#*=}" ;;
    --token=*) TOKEN="${1#*=}" ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

if [[ -z "$CDN" || -z "$TOKEN" ]]; then
  echo "--cdn=<url> and --token=<token> are required" >&2
  exit 2
fi

# Generate a deterministic test image (1x1 PNG).
TMP=$(mktemp -d)
TEST_PNG="$TMP/test.png"
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x00\x03\x00\x01\xc7\x9a\x82\xc6\x00\x00\x00\x00IEND\xaeB`\x82' > "$TEST_PNG"

# Upload to /v1/media and capture the returned id.
upload=$(curl -sS -X POST -H "Authorization: Bearer $TOKEN" -F "file=@$TEST_PNG" "$CDN/v1/media")
media_id=$(echo "$upload" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
if [[ -z "$media_id" ]]; then
  echo "upload failed: $upload" >&2
  exit 1
fi
echo "uploaded media id: $media_id"

FAIL=0
for w in "${WIDTHS[@]}"; do
  status=$(curl -sS -o /dev/null -w "%{http_code}" -H "Accept: image/avif,image/webp,*/*" "$CDN/media/$media_id/$w")
  if [[ "$status" == "200" ]]; then
    printf "width=%-5d | OK\n" "$w"
  else
    printf "width=%-5d | FAIL: status=%s\n" "$w" "$status"
    FAIL=1
  fi
done

# LQIP placeholder.
lqip_status=$(curl -sS -o /dev/null -w "%{http_code}" "$CDN/v1/media/$media_id/lqip")
if [[ "$lqip_status" == "200" ]]; then
  echo "lqip | OK"
else
  echo "lqip | FAIL: status=$lqip_status"
  FAIL=1
fi

# Cleanup.
rm -rf "$TMP"

if [[ $FAIL -ne 0 ]]; then
  echo "verification FAILED" >&2
  exit 1
fi
echo "verification OK"