#!/usr/bin/env bash
#
# apply.sh — install/refresh the developer-machine mirror config.
#
# Idempotent. Re-running with the same inputs produces the same files. Any
# existing target file is renamed "<name>.bak.<timestamp>" before being
# replaced. Nothing is ever deleted.
#
# Usage:
#   infrastructure/mirrors/apply.sh [--dry-run] [--system] [--help]
#
# By default this writes USER-SCOPE configs:
#   ~/.npmrc, ~/.config/pip/pip.conf, ~/.config/go/env, ~/.docker/daemon.json
#
# --system switches to system-scope writing (requires root). The system-scope
# path is used by the devcontainer post-create step; user-scope is the
# default for developer laptops in Bangladesh.
#
# Required environment variables (with safe defaults — fall back to upstream):
#   MIRROR_NPM_URL    default https://registry.npmjs.org
#   NPM_UPSTREAM      default https://registry.npmjs.org
#   MIRROR_PYPI_URL   default https://pypi.org/simple
#   PYPI_UPSTREAM     default https://pypi.org/simple
#   MIRROR_GO_URL     default https://proxy.golang.org
#   GO_UPSTREAM       default https://proxy.golang.org
#   MIRROR_DOCKER_URL default https://registry-1.docker.io
#   DOCKER_UPSTREAM   default https://registry-1.docker.io
#
# Resolution order for ecosystem selection:
#   $MIRROR_ECOSYSTEMS env var (space separated), or all four if unset.
#
# Exit codes:
#   0  — success (including "nothing to do")
#   1  — validation error
#   2  — write error
#   3  — invalid CLI usage
#
# This script is invoked by tests/mirrors/apply.spec.ts via subprocess, so
# the CLI surface is part of the contract. Do not break it without updating
# the tests.

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" &> /dev/null && pwd)
REPO_ROOT=$(cd -- "${SCRIPT_DIR}/../.." &> /dev/null && pwd)

#---- defaults ----------------------------------------------------------------
DEFAULT_MIRROR_NPM="https://registry.npmjs.org"
DEFAULT_NPM_UPSTREAM="https://registry.npmjs.org"
DEFAULT_MIRROR_PYPI="https://pypi.org/simple"
DEFAULT_PYPI_UPSTREAM="https://pypi.org/simple"
DEFAULT_MIRROR_GO="https://proxy.golang.org"
DEFAULT_GO_UPSTREAM="https://proxy.golang.org"
DEFAULT_MIRROR_DOCKER="https://registry-1.docker.io"
DEFAULT_DOCKER_UPSTREAM="https://registry-1.docker.io"

#---- argument parsing --------------------------------------------------------
DRY_RUN=0
SYSTEM_SCOPE=0
ECOSYSTEMS_OVERRIDE=""
HELP=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --system)
      SYSTEM_SCOPE=1
      shift
      ;;
    --ecosystems)
      ECOSYSTEMS_OVERRIDE="${2:-}"
      shift 2
      ;;
    --help|-h)
      HELP=1
      shift
      ;;
    *)
      echo "apply.sh: unknown argument: $1" >&2
      exit 3
      ;;
  esac
done

if [[ "$HELP" -eq 1 ]]; then
  cat <<'USAGE'
Usage: apply.sh [--dry-run] [--system] [--ecosystems "npm pypi go-modules docker"]

Writes user-scope mirror configs by default. --system switches to system-
scope paths (requires root). --dry-run prints what would be written without
touching the filesystem.

Exit codes: 0 success · 1 validation · 2 write · 3 usage.
USAGE
  exit 0
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "[dry-run] no files will be written"
fi

#---- helpers -----------------------------------------------------------------
ts=$(date +%Y%m%d-%H%M%S)

# Print a message to stderr (always) and an audit line to stdout when not
# dry-running.
log() {
  local level="$1"; shift
  echo "[${level}] $*" >&2
}

# validate_url <value> <label>
#
# We accept only http:// and https:// URLs and refuse any URL that contains
# userinfo (username/password), to avoid accidental credential embedding.
validate_url() {
  local value="$1"
  local label="$2"
  if [[ -z "$value" ]]; then
    log error "${label}: empty URL"
    return 1
  fi
  if [[ ! "$value" =~ ^https?:// ]]; then
    log error "${label}: must start with http:// or https:// (got '${value}')"
    return 1
  fi
  # Refuse embedded credentials: scheme://user:pass@host/...
  local rest="${value#*://}"
  if [[ "$rest" == *"@"* ]]; then
    log error "${label}: URL must not embed userinfo (no 'user:pass@' allowed)"
    return 1
  fi
  # Use node for a stricter check that matches the library contract.
  if command -v node >/dev/null 2>&1; then
    local node_check
    if ! node_check=$(node --input-type=module -e "
      import { validateMirrorUrl } from '${REPO_ROOT}/packages/mirror-health/src/url.ts';
      try { validateMirrorUrl(process.argv[1]); process.exit(0); }
      catch (e) { process.stderr.write(e.message); process.exit(1); }
    " "$value" 2>&1); then
      log error "${label}: ${node_check}"
      return 1
    fi
  fi
  return 0
}

# write_atomic <target-path> <content>
#
# Validates that the content does not contain a secret-looking token. Writes
# the file atomically (write to <target>.tmp, then rename). In --dry-run mode
# the write is simulated and reported but not performed.
write_atomic() {
  local target="$1"
  local content="$2"
  # Check active (non-comment) lines for secret material. Documentation is
  # allowed to mention `_authToken` as a warning, but a real assignment with
  # a non-placeholder value is rejected.
  local active
  active=$(printf '%s\n' "$content" | awk '!/^[[:space:]]*#/ { print }')
  if printf '%s\n' "$active" | grep -Eq '(_authToken|_password)[[:space:]]*=[[:space:]]*[A-Za-z0-9_/-]{8,}|AWS_SECRET_ACCESS_KEY[[:space:]]*=[[:space:]]*[A-Za-z0-9_/-]{8,}'; then
    log error "refusing to write ${target}: active content looks like it contains a secret"
    return 2
  fi
  local dir
  dir=$(dirname -- "$target")
  if [[ "$DRY_RUN" -eq 0 ]]; then
    mkdir -p -- "$dir"
    if [[ -e "$target" ]]; then
      local bak="${target}.bak.${ts}"
      mv -- "$target" "$bak"
      log info "backup: ${target} -> ${bak}"
    fi
    local tmp="${target}.tmp.$$"
    printf '%s' "$content" > "$tmp"
    mv -- "$tmp" "$target"
    log info "wrote ${target}"
  else
    log info "[dry-run] would write ${target} ($(printf '%s' "$content" | wc -c) bytes)"
  fi
}

# resolve_target <user-path> <system-path>
#
# Returns the path to write based on scope.
resolve_target() {
  if [[ "$SYSTEM_SCOPE" -eq 1 ]]; then
    printf '%s\n' "$2"
  else
    printf '%s\n' "$1"
  fi
}

# render <template-path> <output-path> <substitutions>
#
# Substitutions is a space-separated list of "KEY=VALUE" pairs. We use a
# simple two-pass sed rather than relying on envsubst, because envsubst is
# not POSIX and may be missing on macOS developer machines.
render() {
  local template="$1"
  local target="$2"
  shift 2
  local content
  content=$(cat -- "$template")
  # Reject active lines (non-comment) that contain a real-secret-shaped
  # literal. Documentation comments mentioning "_authToken" as a warning are
  # allowed.
  local active
  active=$(printf '%s\n' "$content" | awk '!/^[[:space:]]*#/ { print }')
  if printf '%s\n' "$active" | grep -Eq '(_authToken|_password)[[:space:]]*=[[:space:]]*[A-Za-z0-9_/-]{8,}|sk_live_[A-Za-z0-9]{8,}|AKIA[0-9A-Z]{8,}'; then
    log error "template ${template} contains a literal secret-like token; refusing to render"
    return 2
  fi
  for kv in "$@"; do
    local key="${kv%%=*}"
    local val="${kv#*=}"
    # Replace ${KEY} and $KEY. Use awk for portable in-place string replace.
    content=$(printf '%s' "$content" | awk -v k="$key" -v v="$val" '
      {
        while (match($0, "\\$\\{" k "\\}")) {
          $0 = substr($0, 1, RSTART-1) v substr($0, RSTART+RLENGTH)
        }
        print
      }
    ')
  done
  write_atomic "$target" "$content"
}

#---- main loop ---------------------------------------------------------------
ALL_ECOSYSTEMS=(npm pypi go-modules docker)
ECOSYSTEMS=()
if [[ -n "$ECOSYSTEMS_OVERRIDE" ]]; then
  # shellcheck disable=SC2206
  ECOSYSTEMS=($ECOSYSTEMS_OVERRIDE)
else
  ECOSYSTEMS=("${ALL_ECOSYSTEMS[@]}")
fi

if [[ "$SYSTEM_SCOPE" -eq 1 && "$EUID" -ne 0 ]]; then
  log error "--system requires root"
  exit 3
fi

# Determine target paths.
NPM_TARGET=$(resolve_target "${HOME}/.npmrc" "/etc/npmrc")
PIP_TARGET=$(resolve_target "${XDG_CONFIG_HOME:-${HOME}/.config}/pip/pip.conf" "/etc/pip.conf")
GO_TARGET=$(resolve_target "${XDG_CONFIG_HOME:-${HOME}/.config}/go/env" "/etc/profile.d/go-env.sh")
DOCKER_TARGET=$(resolve_target "${HOME}/.docker/daemon.json" "/etc/docker/daemon.json")

# Pull values from env, falling back to defaults.
MIRROR_NPM_URL=${MIRROR_NPM_URL:-$DEFAULT_MIRROR_NPM}
NPM_UPSTREAM=${NPM_UPSTREAM:-$DEFAULT_NPM_UPSTREAM}
MIRROR_PYPI_URL=${MIRROR_PYPI_URL:-$DEFAULT_MIRROR_PYPI}
PYPI_UPSTREAM=${PYPI_UPSTREAM:-$DEFAULT_PYPI_UPSTREAM}
MIRROR_GO_URL=${MIRROR_GO_URL:-$DEFAULT_MIRROR_GO}
GO_UPSTREAM=${GO_UPSTREAM:-$DEFAULT_GO_UPSTREAM}
MIRROR_DOCKER_URL=${MIRROR_DOCKER_URL:-$DEFAULT_MIRROR_DOCKER}
DOCKER_UPSTREAM=${DOCKER_UPSTREAM:-$DEFAULT_DOCKER_UPSTREAM}

# Validate everything up front; bail early on the first failure so we never
# leave the user with a half-applied config.
for eco in "${ECOSYSTEMS[@]}"; do
  case "$eco" in
    npm)
      validate_url "$MIRROR_NPM_URL" "MIRROR_NPM_URL" || exit 1
      validate_url "$NPM_UPSTREAM" "NPM_UPSTREAM" || exit 1
      ;;
    pypi)
      validate_url "$MIRROR_PYPI_URL" "MIRROR_PYPI_URL" || exit 1
      validate_url "$PYPI_UPSTREAM" "PYPI_UPSTREAM" || exit 1
      ;;
    go-modules)
      validate_url "$MIRROR_GO_URL" "MIRROR_GO_URL" || exit 1
      validate_url "$GO_UPSTREAM" "GO_UPSTREAM" || exit 1
      ;;
    docker)
      validate_url "$MIRROR_DOCKER_URL" "MIRROR_DOCKER_URL" || exit 1
      validate_url "$DOCKER_UPSTREAM" "DOCKER_UPSTREAM" || exit 1
      ;;
    *)
      log error "unknown ecosystem: $eco"
      exit 3
      ;;
  esac
done

# Apply per ecosystem.
for eco in "${ECOSYSTEMS[@]}"; do
  case "$eco" in
    npm)
      render "${SCRIPT_DIR}/registry/npm/.npmrc.example" "$NPM_TARGET" \
        "MIRROR_NPM_URL=$MIRROR_NPM_URL" \
        "NPM_UPSTREAM=$NPM_UPSTREAM"
      ;;
    pypi)
      render "${SCRIPT_DIR}/registry/pypi/pip.conf.example" "$PIP_TARGET" \
        "MIRROR_PYPI_URL=$MIRROR_PYPI_URL" \
        "PYPI_UPSTREAM=$PYPI_UPSTREAM"
      ;;
    go-modules)
      render "${SCRIPT_DIR}/registry/go-modules/go.env.example" "$GO_TARGET" \
        "MIRROR_GO_URL=$MIRROR_GO_URL" \
        "GO_UPSTREAM=$GO_UPSTREAM"
      ;;
    docker)
      render "${SCRIPT_DIR}/registry/docker/daemon.json.example" "$DOCKER_TARGET" \
        "MIRROR_DOCKER_URL=$MIRROR_DOCKER_URL" \
        "DOCKER_UPSTREAM=$DOCKER_UPSTREAM"
      ;;
  esac
done

log info "apply.sh complete (dry-run=${DRY_RUN}, scope=$([[ $SYSTEM_SCOPE -eq 1 ]] && echo system || echo user))"
exit 0