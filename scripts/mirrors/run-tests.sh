#!/usr/bin/env bash
#
# Run mirror integration tests (tests/mirrors and tests/ci).
#
# These tests live at the repo root but use tsx for TypeScript support and
# shell out to the healthcheck.sh / apply.sh scripts under infrastructure/.
# They share the package-local tsx from packages/mirror-health/node_modules.
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
REPO_ROOT=$(cd -- "${SCRIPT_DIR}/../.." &> /dev/null && pwd)
LOADER="${REPO_ROOT}/packages/mirror-health/node_modules/tsx/dist/loader.cjs"

if [[ ! -f "$LOADER" ]]; then
  echo "tsx loader not found at $LOADER — run 'pnpm install' first" >&2
  exit 2
fi

cd "$REPO_ROOT"
exec node --disable-warning=DEP0205 \
  --import "$LOADER" \
  --test \
  tests/mirrors/*.spec.ts \
  tests/ci/*.spec.ts