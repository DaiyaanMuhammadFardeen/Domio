#!/usr/bin/env bash
#
# Run all @domio/mirror-health tests. Suppresses the Node 22 DEP0205
# `module.register()` deprecation warning, which is benign on our end
# (tsx uses the older API).
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
PKG_DIR=$(cd -- "${SCRIPT_DIR}/.." &> /dev/null && pwd)
LOADER="${PKG_DIR}/node_modules/tsx/dist/loader.cjs"

if [[ ! -f "$LOADER" ]]; then
  echo "tsx loader not found at $LOADER — run 'pnpm install' first" >&2
  exit 2
fi

cd "$PKG_DIR"
exec node --disable-warning=DEP0205 \
  --import "$LOADER" \
  --test \
  test/*.spec.ts