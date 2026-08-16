# Domio

> **A Figma-/Canva-/Keynote-grade presentation platform — local-first,
> real-time collaborative, AI-assisted, polyglot, MCP-enabled.**

Domio is a full-stack presentation platform that combines the design depth
of Figma, the authoring ergonomics of Canva, the storytelling power of
Keynote, and the live experience of a webinar tool — with a first-class
AI copilot, a **first-class Model Context Protocol (MCP) server** for
external agents, and a deck-as-code authoring mode.

---

## Status (live)

> **See [`docs/STATUS.md`](docs/STATUS.md) for the live, code-derived
> status.** This README is a thin overview; the rebuild docs are the
> source of truth.

The codebase on `master` (commit `649d3f7`, 2026-08-14) contains:

- **11** front-end apps (Next.js 15.1.3 + React 19.0.0)
- **84** services (75 TS + Go realtime/participant WS gateways)
- **23** batch/queue workers
- **38** shared workspace packages
- **29** Protobuf contracts, **63** OpenAPI specs, **60+** JSON Schemas,
  a **GraphQL** dashboard surface, **8** MCP tool JSON Schemas
- **178** Postgres migrations, **30** GitHub Actions workflows
- Phase tags on master: `phase-18-contracts-v1.0.0`,
  `phase-19-contracts-v1.0.0`

Shipped (per `docs/STATUS.md`): Phases 0–19 plus Phase 20.5 (beta
security hardening), Phase 22-beta G1/G2/G3 in flight, parts of Phase 21
(recording + translation). Frontier pieces from Phase 21 referenced in
the planning docs are not yet present as services on master — see
`docs/STATUS.md` §4 for the gap list.

---

## Quick start

```bash
# 1. Clone
git clone git@github.com:DaiyaanMuhammadFardeen/Domio.git
cd Domio

# 2a. EITHER — full containerized stack (recommended for public-beta review):
./bin/up                  # infra + services + editor (3100) + dashboard (3000)
./bin/down --volumes      # to reset

# 2b. OR — host-based dev (requires asdf + Node 22.11.0 + pnpm 9.12.3 + Docker):
asdf install
./bin/bootstrap
./bin/dev-up              # infra containers only
./bin/dev                 # editor + API on host, watch mode

# 3. Open
#    Editor:       http://localhost:3100
#    Dashboard:    http://localhost:3000
#    Grafana:      http://localhost:3001  (admin/admin)
#    Jaeger:       http://localhost:16686
#    Prometheus:   http://localhost:9090
#
# See DOCKER.md for the full containerized workflow and profile matrix.
```

---

## Repository structure

```
apps/                   # User-facing surfaces (Next.js, React)
services/               # Long-running servers (control plane, gateways, registries)
workers/                # Short-lived or batch jobs (cron, queue consumers, renders)
packages/               # Shared libraries (schemas, UI, runtime, SDKs)
contracts/              # Wire-format source of truth (Protobuf, OpenAPI, JSON Schema, MCP)
infrastructure/         # Terraform, Helm, Dockerfiles, ArgoCD, Grafana, PagerDuty
docs/                   # Live rebuild docs + per-phase planning context + ADRs
slo/                    # SLOs + alert rules
runbooks/               # Operational playbooks + postmortems + chaos drills
threat-model/           # Per-component threat models
scripts/                # Build/dev/release scripts
tools/                  # Internal tooling (generators, linters, i18n-check)
tests/                  # Cross-cutting test suites (convergence, e2e, load, security)
gen/                    # Generated clients (committed, per the contract rule)
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the architectural
rationale.

---

## Tech stack

- **Control plane**: TypeScript 5.7.2, Node 22.11.0, Hono, modular monolith.
- **Realtime gateways**: Go (`services/realtime-gateway/`,
  `services/participant-ws-gateway/`) on gorilla/websocket + NATS JetStream.
- **CPU workers**: Go primary; Rust 1.82.0 escape hatch for hot paths.
- **AI / data workers**: TypeScript primary; Python 3.12.8 for ML/eval.
- **Server UI**: Next.js 15.1.3 (App Router), React 19.0.0, Vite.
- **Canvas**: WebGL2 + WebGPU + Canvas2D, custom scene graph.
- **Storage**: PostgreSQL 16, ClickHouse 24, Redis 7 / Valkey, NATS JetStream,
  Kafka, S3-compatible (MinIO dev).
- **Search**: OpenSearch.
- **Contracts**: Protobuf (Buf 1.34), OpenAPI 3.1 (Spectral), JSON Schema
  (AJV), GraphQL (dashboard), MCP (agent surface — JSON-RPC 2.0).

The contract rule is **non-negotiable** (ADR-0002, ADR-0003): every
polyglot boundary speaks gRPC internally and REST + OpenAPI externally.
Generated clients are committed. No service imports another service's
source code.

See [`docs/CONTRACTS.md`](docs/CONTRACTS.md) and
[`docs/CI.md`](docs/CI.md) for the full picture.

---

## The MCP server (the "agents can drive this" layer)

`services/mcp-server/` (Go, production per Phase 13 M1) exposes the deck
engine as an MCP server. Eight tool specs are committed in
`contracts/mcp/tools/`:

- `lint_deck`, `semantic_search`, `accessibility_audit`,
  `check_freshness`, `get_claim_confidence`, `get_provenance`, plus the
  prototyping tool catalog (`prototyping.tools.json`).

External agents (Claude, GPT, custom) can drive the platform with
granular, scoped permission: create decks, edit slides, bind data sources,
apply themes, read structured deck state, render slides to images, and
export.

See [`docs/CONTRACTS.md` §6](docs/CONTRACTS.md) and the service's
`README.md`.

---

## Development

- **Branching**: trunk-based; short-lived feature branches.
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/).
- **PRs**: at least 1 code owner review; 2 for security / data
  migrations / public APIs.
- **Linting**: `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- **Generated code**: re-run with `pnpm gen` after changing `contracts/`.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full guide.

---

## Documentation map

| If you want to…                            | Read                                             |
| ------------------------------------------ | ------------------------------------------------ |
| Live status (what's shipped)               | [`docs/STATUS.md`](docs/STATUS.md)               |
| Architecture / polyglot / contract rule    | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)   |
| Service catalog (84 services)              | [`docs/SERVICES.md`](docs/SERVICES.md)           |
| App catalog (11 apps)                      | [`docs/APPS.md`](docs/APPS.md)                   |
| Worker catalog (23 workers)                | [`docs/WORKERS.md`](docs/WORKERS.md)             |
| Package catalog (38 packages)              | [`docs/PACKAGES.md`](docs/PACKAGES.md)           |
| Wire formats                               | [`docs/CONTRACTS.md`](docs/CONTRACTS.md)         |
| CI workflows (30)                          | [`docs/CI.md`](docs/CI.md)                       |
| Infrastructure / Terraform / Helm          | [`docs/INFRASTRUCTURE.md`](docs/INFRASTRUCTURE.md) |
| SLOs / dashboards / PagerDuty              | [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md) |
| Security / threat model / ABAC / DLP       | [`docs/SECURITY.md`](docs/SECURITY.md)           |
| Front-end apps                             | [`docs/FRONTEND.md`](docs/FRONTEND.md)           |
| Full doc map                               | [`docs/CONSOLIDATED.md`](docs/CONSOLIDATED.md)   |
| ADRs (immutable)                           | [`docs/adr/`](docs/adr/)                         |
| Per-phase planning context (legacy)        | [`docs/development_phases/`](docs/development_phases/) |
| Archived pre-rebuild docs                  | [`docs/archive/pre-rebuild/`](docs/archive/pre-rebuild/) |

---

## Security

See [`SECURITY.md`](SECURITY.md) for how to report vulnerabilities.

---

## License

[Apache 2.0](LICENSE).