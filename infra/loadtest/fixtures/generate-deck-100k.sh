#!/usr/bin/env bash
#
# Generate a 100k deck-id fixture for the `decks_100k.js` load test.
#
# This is a one-shot helper: it produces a deterministic list of 100 000
# deck IDs that the load test reads via k6's `open()` helper. Determinism
# means re-running the load test against the same fixture exercises the
# same read paths.
#
# Usage:
#   ./fixtures/generate-deck-100k.sh > fixtures/deck-100k.json
#
# The generated fixture is intentionally not committed to git (it's
# 100k lines × 36 bytes ≈ 3.5 MB). Add it to .gitignore.

set -euo pipefail

count="${DECK_COUNT:-100000}"
prefix="${DECK_PREFIX:-deck-}"

# 1-based IDs (deck-000001 ... deck-{count}) so sort order is natural.
printf "%s%06d\n" "$prefix" 1
for ((i = 2; i <= count; i++)); do
  printf "%s%06d\n" "$prefix" "$i"
done
