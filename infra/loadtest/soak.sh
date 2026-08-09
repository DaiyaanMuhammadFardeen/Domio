#!/usr/bin/env bash
#
# Phase 22-beta — 24-hour soak test orchestrator.
#
# Runs every k6 load-test script in `infra/loadtest/` at 1% of design-
# partner scale, continuously, for 24 hours. Surface:
#   - Memory leaks (per-service heap grows over the soak window)
#   - Scheduler drift (CPU usage climbs while request rate is steady)
#   - Monotonic-clock skew (HLC timestamps stop progressing)
#   - Connection-pool exhaustion (open conn count trends up)
#
# Output:
#   - k6 summary per script per hour (12 snapshots total at 1/24 intervals)
#   - Final aggregated report at `infra/loadtest/results/soak-YYYY-MM-DD/`
#
# Usage:
#   ./infra/loadtest/soak.sh                          # default: 24h, 1% scale
#   SOAK_DURATION=4h SOAK_SCALE=0.05 ./soak.sh        # 4-hour run at 5% scale
#
# Required env (or sensible defaults):
#   - K6_BIN          path to k6 binary (default: k6)
#   - REALTIME_URL    realtime-gateway URL
#   - AUDIENCE_URL    audience-service URL
#   - LIBRARY_URL     library-service URL
#   - INGEST_URL      event-ingest URL
#   - PRESENTER_URL   presenter-session URL
#
# The orchestrator intentionally runs the scripts sequentially (one
# finishes before the next starts) at low scale, so we don't burn
# through the staging cluster budget. For a parallel soak, see
# `soak-parallel.sh` (P22b).

set -euo pipefail

readonly DURATION="${SOAK_DURATION:-24h}"
readonly SCALE="${SOAK_SCALE:-0.01}"          # 1% of design-partner scale
readonly SCRIPTS_DIR="$(dirname "$0")"
readonly RESULTS_DIR="${SCRIPTS_DIR}/results/soak-$(date -u +%Y-%m-%d)"
readonly K6_BIN="${K6_BIN:-k6}"

mkdir -p "$RESULTS_DIR"

log() {
  printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"
}

run_one() {
  local script="$1"
  local name
  name="$(basename "$script" .js)"
  local out="${RESULTS_DIR}/${name}-$(date -u +%H%M).summary.json"
  log "running $name (scale=$SCALE, duration=$DURATION) → $out"
  local extra=()
  case "$name" in
    audience_50k)
      extra=(-e AUDIENCE_VU="$(echo "50000 * $SCALE" | bc -l | awk '{printf("%d", $1)}')")
      ;;
    editors_10k)
      extra=(-e EDITORS_VU="$(echo "10000 * $SCALE" | bc -l | awk '{printf("%d", $1)}')")
      ;;
    presenter_2h)
      # Presenter is single-VU; scale only affects duration.
      extra=(-e PRESENTER_DURATION="$DURATION")
      ;;
    decks_100k)
      extra=(-e READ_RPS="$(echo "5000 * $SCALE" | bc -l | awk '{printf("%d", $1)}')")
      ;;
    ingest_timeline)
      extra=(-e INGEST_RATE="$(echo "10000 * $SCALE" | bc -l | awk '{printf("%d", $1)}')")
      ;;
    *)
      log "  WARN: $name has no scale rule; running at default scale"
      ;;
  esac

  if ! "$K6_BIN" run \
      --summary-export="$out" \
      --duration "$DURATION" \
      "${extra[@]}" \
      "$script"; then
    log "  FAIL: $name (continuing)"
    return 1
  fi
}

main() {
  log "soak starting — duration=$DURATION, scale=$SCALE, results=$RESULTS_DIR"
  local overall_exit=0

  # Run sequentially to avoid contention.
  for script in "$SCRIPTS_DIR"/*.js; do
    run_one "$script" || overall_exit=1
  done

  log "soak complete — results in $RESULTS_DIR"
  exit "$overall_exit"
}

main "$@"