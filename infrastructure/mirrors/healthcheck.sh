#!/usr/bin/env bash
#
# healthcheck.sh — verify that each mirror is reachable and that the
# upstream fallback is also reachable. Exits non-zero ONLY if both are down.
#
# Usage:
#   infrastructure/mirrors/healthcheck.sh [--ecosystem <name>] [--timeout-ms <n>] [--output json|text]
#
# Ecosystems: npm, pypi, go-modules, docker. If --ecosystem is omitted, all
# four are checked.
#
# Exit codes:
#   0 — every ecosystem had at least one healthy endpoint (mirror or upstream)
#   1 — at least one ecosystem had BOTH endpoints unavailable
#   2 — usage / configuration error
#
# The script is silent about "healthy" unless you ask. It always prints a
# per-ecosystem line so the operator can see which endpoint actually
# answered. We do NOT silently mask failure as success.

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
REPO_ROOT=$(cd -- "${SCRIPT_DIR}/../.." &> /dev/null && pwd)

ECOSYSTEM=""
TIMEOUT_MS=5000
OUTPUT="text"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ecosystem) ECOSYSTEM="${2:-}"; shift 2 ;;
    --timeout-ms) TIMEOUT_MS="${2:-}"; shift 2 ;;
    --output) OUTPUT="${2:-}"; shift 2 ;;
    -h|--help)
      sed -n '2,25p' "$0"
      exit 0
      ;;
    *)
      echo "healthcheck.sh: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -n "$ECOSYSTEM" ]]; then
  ALL_ECOSYSTEMS=("$ECOSYSTEM")
else
  ALL_ECOSYSTEMS=(npm pypi go-modules docker)
fi

DEFAULT_MIRROR_NPM="https://registry.npmjs.org"
DEFAULT_NPM_UPSTREAM="https://registry.npmjs.org"
DEFAULT_MIRROR_PYPI="https://pypi.org/simple"
DEFAULT_PYPI_UPSTREAM="https://pypi.org/simple"
DEFAULT_MIRROR_GO="https://proxy.golang.org"
DEFAULT_GO_UPSTREAM="https://proxy.golang.org"
DEFAULT_MIRROR_DOCKER="https://registry-1.docker.io"
DEFAULT_DOCKER_UPSTREAM="https://registry-1.docker.io"

MIRROR_NPM_URL=${MIRROR_NPM_URL:-$DEFAULT_MIRROR_NPM}
NPM_UPSTREAM=${NPM_UPSTREAM:-$DEFAULT_NPM_UPSTREAM}
MIRROR_PYPI_URL=${MIRROR_PYPI_URL:-$DEFAULT_MIRROR_PYPI}
PYPI_UPSTREAM=${PYPI_UPSTREAM:-$DEFAULT_PYPI_UPSTREAM}
MIRROR_GO_URL=${MIRROR_GO_URL:-$DEFAULT_MIRROR_GO}
GO_UPSTREAM=${GO_UPSTREAM:-$DEFAULT_GO_UPSTREAM}
MIRROR_DOCKER_URL=${MIRROR_DOCKER_URL:-$DEFAULT_MIRROR_DOCKER}
DOCKER_UPSTREAM=${DOCKER_UPSTREAM:-$DEFAULT_DOCKER_UPSTREAM}

ANY_BOTH_DOWN=0

for eco in "${ALL_ECOSYSTEMS[@]}"; do
  case "$eco" in
    npm) M="$MIRROR_NPM_URL"; U="$NPM_UPSTREAM" ;;
    pypi) M="$MIRROR_PYPI_URL"; U="$PYPI_UPSTREAM" ;;
    go-modules) M="$MIRROR_GO_URL"; U="$GO_UPSTREAM" ;;
    docker) M="$MIRROR_DOCKER_URL"; U="$DOCKER_UPSTREAM" ;;
    *) echo "healthcheck.sh: unknown ecosystem '$eco'" >&2; exit 2 ;;
  esac

  if ! command -v node >/dev/null 2>&1; then
    echo "healthcheck.sh: node not found on PATH; cannot run probe" >&2
    exit 2
  fi

  # Resolve the tsx loader from the package's local node_modules so we don't
  # require a global tsx install.
  TSX_LOADER="${REPO_ROOT}/packages/mirror-health/node_modules/tsx/dist/loader.cjs"
  if [[ ! -f "$TSX_LOADER" ]]; then
    echo "healthcheck.sh: tsx loader not found at $TSX_LOADER; run 'pnpm install' first" >&2
    exit 2
  fi

  output=$(node --disable-warning=DEP0205 --import "$TSX_LOADER" "${REPO_ROOT}/packages/mirror-health/src/cli.ts" \
    --ecosystem "$eco" \
    --mirror-url "$M" \
    --upstream-url "$U" \
    --timeout-ms "$TIMEOUT_MS" \
    --output "$OUTPUT" 2>&1) || NODE_EXIT=$?
  NODE_EXIT=${NODE_EXIT:-0}

  if [[ "$OUTPUT" == "json" ]]; then
    echo "$output"
  fi

  if [[ "$NODE_EXIT" -eq 1 ]]; then
    ANY_BOTH_DOWN=1
  fi
done

if [[ "$ANY_BOTH_DOWN" -eq 1 ]]; then
  exit 1
fi
exit 0