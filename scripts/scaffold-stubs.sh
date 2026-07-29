#!/usr/bin/env bash
# scaffold-stubs.sh — populate empty Phase 0 stub directories with
# README + tsconfig + package.json so the monorepo structure is complete.
# Idempotent; safe to re-run.

set -euo pipefail

cd "$(dirname "$0")/.."

# (display-name, runtime, phase-owner) per package.
PACKAGES=(
  "canvas|WebGL2/WebGPU renderer|Phase 03"
  "ui|Shared React component library|Phase 06"
  "tokens|Design token TypeScript types|Phase 07"
  "crdt|Yjs CRDT wrapper + sub-docs|Phase 04"
  "chart|Charts engine (SVG/Canvas2D/WebGL)|Phase 08"
  "media-runtime|3D, video, embeds runtime|Phase 11"
  "prototype-runtime|Prototype variables + interactions|Phase 10"
  "formula-engine|Formula evaluator|Phase 08"
  "ai-sdk|AI model adapters|Phase 12"
  "agent-sdk|MCP / agent SDK|Phase 13"
  "analytics-sdk|Telemetry SDK|Phase 01"
  "mcp|MCP types|Phase 13"
  "engine-sdk|Embeddable viewer engine|Phase 14"
)

SERVICES=(
  "realtime-gateway|Go realtime gateway (CRDT presence, stage fan-out, audience)|Phase 04"
  "registry|Component / theme / marketplace registry|Phase 06"
  "theme|Token resolution + theme apply|Phase 07"
  "brand|Brand kits + multi-brand|Phase 07"
  "data|Live data + query gateway|Phase 08"
  "ai-orchestrator|AI orchestration service|Phase 12"
  "mcp-server|MCP server|Phase 13"
  "publish|Sharing + export service|Phase 14"
  "audience|Audience participation service|Phase 16"
  "analytics|Analytics projection service|Phase 17"
  "collab|Comments + workflow service|Phase 18"
  "audit|Append-only audit log|Phase 20"
)

WORKERS=(
  "connectors|External data source adapters|Phase 08"
  "render|Headless renderer|Phase 14"
  "brand-extract|URL → brand kit extractor|Phase 07"
  "theme-pair|Dark/light theme generator|Phase 07"
  "ai-eval|AI evaluation harness|Phase 12"
  "export|Deck export jobs|Phase 14"
  "snapshot|CRDT snapshot worker|Phase 05"
  "op-writer|Durable op ingest worker|Phase 05"
  "analytics-rollup|OLAP rollup worker|Phase 17"
)

write_package() {
  local kind="$1"
  local name="$2"
  local desc="$3"
  local phase="$4"
  local dir="$5"

  if [ ! -d "$dir" ]; then
    mkdir -p "$dir"
  fi

  cat > "$dir/package.json" <<EOF
{
  "name": "@domio/${name}",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "${desc}. Phase 0 stub; ${phase}.",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "eslint src --max-warnings 0",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "clean": "rm -rf dist .turbo coverage"
  },
  "devDependencies": {
    "typescript": "5.7.2",
    "vitest": "2.1.8"
  }
}
EOF

  cat > "$dir/tsconfig.json" <<'EOF'
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "ESNext",
    "moduleResolution": "Bundler"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["dist", "node_modules"]
}
EOF

  if [ ! -f "$dir/src/index.ts" ]; then
    mkdir -p "$dir/src"
    cat > "$dir/src/index.ts" <<EOF
/**
 * Domio ${name} — Phase 0 stub.
 *
 * ${desc}.
 *
 * Real implementation lands in ${phase}.
 */

export {};
EOF
  fi

  cat > "$dir/README.md" <<EOF
# @domio/${name}

> ${desc}.
>
> **Phase 0 stub.** Real implementation lands in ${phase}.

## Owner

TBD — assigned during Phase ${phase%%Phase } kickoff.

## Public API surface

TBD.

## Events emitted / consumed

TBD.

## Database tables owned

TBD.

## Runbook stub

TBD.
EOF
}

for entry in "${PACKAGES[@]}"; do
  IFS='|' read -r name desc phase <<<"$entry"
  write_package "package" "$name" "$desc" "$phase" "packages/${name}"
done

for entry in "${SERVICES[@]}"; do
  IFS='|' read -r name desc phase <<<"$entry"
  write_package "service" "${name}-service" "$desc" "$phase" "services/${name}"
done

for entry in "${WORKERS[@]}"; do
  IFS='|' read -r name desc phase <<<"$entry"
  write_package "worker" "${name}-worker" "$desc" "$phase" "workers/${name}"
done

echo "Stubs scaffolded for ${#PACKAGES[@]} packages, ${#SERVICES[@]} services, ${#WORKERS[@]} workers."