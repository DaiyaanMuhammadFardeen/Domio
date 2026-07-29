# Changelog

All notable changes to this project are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Phase 0 — Repository, contracts, dev environment

#### Added

- Monorepo scaffolding (pnpm workspaces + Turborepo).
- Toolchain pinning via `.tool-versions` (asdf).
- Wire-format contracts:
  - `contracts/proto/domio/v1/common.proto` — `ResourceId`, `Money`, `Error`, `IdempotencyKey`, `AuditActor`.
  - `contracts/proto/domio/v1/health.proto` — `HealthzService`, `ReadinessService`.
  - `contracts/proto/domio/v1/deck.proto` — placeholder deck surface.
  - `contracts/openapi/v1/common.yaml` — health, ready, error, pagination.
  - `contracts/openapi/v1/decks.yaml` — placeholder deck REST surface.
  - `contracts/schema/v1/common.schema.json` — JSON Schema for `ResourceId`, `Money`, `Error`, `AuditActor`.
  - `contracts/schema/v1/deck-placeholder.schema.json` — placeholder.
- Buf-managed Protobuf with `buf format`, `buf lint`, `buf breaking` rules.
- Local infrastructure (docker-compose): Postgres 16, Redis 7, NATS JetStream, MinIO, ClickHouse, OpenSearch, MailHog, Prometheus, Grafana, Jaeger, OTel collector.
- `@domio/common` package — IDs, time, money, errors, idempotency, types.
- `@domio/api` — Hono on Node 22, `/healthz`, `/readyz`, placeholders root + deck.
- `@domio/editor` — Next.js 15 stub.
- `@domio/viewer`, `@domio/presenter`, `@domio/landing` — Next.js stubs.
- Stub packages for every planned capability (canvas, ui, tokens, crdt, chart, media-runtime, prototype-runtime, formula-engine, ai-sdk, agent-sdk, analytics-sdk, mcp, engine-sdk).
- Stub services for every planned long-running server (realtime-gateway, registry, theme, brand, data, ai-orchestrator, mcp-server, publish, audience, analytics, collab, audit).
- Stub workers for every planned batch / queue service (connectors, render, brand-extract, theme-pair, ai-eval, export, snapshot, op-writer, analytics-rollup).
- ESLint flat config (with TypeScript).
- Prettier config and ignore rules.
- Pre-commit hooks (prettier, actionlint, shellcheck, buf, secrets).
- GitHub Actions: contracts, TypeScript matrix, Go, Rust, Python, security, container build.
- GitHub Actions: release workflow.
- GitHub PR template, issue templates (feature, bug).
- `CODEOWNERS` mapping every directory to a team.
- Devcontainer for VS Code.
- Dockerfile for the API (multi-stage, non-root, distroless-friendly).
- Three ADRs:
  - `0001-monorepo` — adopt a single monorepo with polyglot toolchains.
  - `0002-polyglot` — adopt a polyglot backend with a non-negotiable contract rule.
  - `0003-contract-first` — contract-first wire formats with generated clients committed.
- Runbook template + first runbook (RB-001: local dev stack reset).
- `bin/` scripts: `bootstrap`, `dev-up`, `dev-down`, `dev`, `dev-logs`, `db-migrate`, `gen`, `lint`, `test`, `clean`.
- `scripts/scaffold-stubs.sh` — regenerate stub packages/services/workers.
- README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, LICENSE.

#### Notes

- No business logic ships in Phase 0. The next phase (Phase 01) wires
  observability, CI/CD, and the production-grade infra baseline.
- All wire-format contracts are versioned. Backwards-incompatible
  changes require an ADR.

[Unreleased]: https://github.com/DaiyaanMuhammadFardeen/Domio/compare/main...HEAD