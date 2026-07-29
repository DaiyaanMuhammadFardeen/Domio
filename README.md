# Domio

> **A Figma-/Canva-/Keynote-grade presentation platform — local-first, real-time collaborative, AI-assisted, polyglot.**

Domio is a full-stack presentation platform that combines the design depth of Figma, the authoring ergonomics of Canva, the storytelling power of Keynote, and the live experience of a webinar tool — with first-class AI copilot, programmable agents via MCP, and a deck-as-code authoring mode.

This repository contains the source code, planning docs, and infrastructure for the entire platform.

---

## Status

**Phase 0 — Repository, contracts, dev environment.** This phase bootstraps the monorepo, locks the wire-format contracts, and brings every developer's machine and CI runner to a state where `git clone && ./bin/dev-up && ./bin/dev` brings up a working editor + API + page that says "Domio — phase 0 boot" with `/healthz` green.

The complete platform plan is in [`docs/development_phases/`](docs/development_phases/). The architecture is in [`docs/`](docs/) and the ADRs are in [`docs/adr/`](docs/adr/).

---

## Quick start

```bash
# 1. Clone
git clone git@github.com:DaiyaanMuhammadFardeen/Domio.git
cd Domio

# 2. Install toolchain (one-time, requires asdf)
#    See .tool-versions for the pinned set.
asdf install

# 3. Bootstrap dev environment
./bin/bootstrap

# 4. Bring up local infrastructure (postgres, redis, nats, minio, ...)
./bin/dev-up

# 5. Run the editor + API in watch mode
./bin/dev

# 6. Open
#    Editor:   http://localhost:3000
#    API:      http://localhost:8080
#    Health:   http://localhost:8080/healthz
#    Ready:    http://localhost:8080/readyz
```

---

## Repository structure

```
apps/                   # User-facing surfaces (Next.js, React)
services/               # Long-running servers (control plane, gateways, registries)
workers/                # Short-lived or batch jobs (cron, queue consumers, renders)
packages/               # Shared libraries (schemas, UI, runtime, SDKs)
contracts/              # Wire-format source of truth (Protobuf, OpenAPI, JSON Schema)
infrastructure/         # Terraform, Helm, Dockerfiles, CI definitions
docs/                   # Planning docs (super docs, domain docs, phase docs, ADRs)
scripts/                # Build/dev/release scripts
tools/                  # Internal tooling (generators, linters)
```

See [`docs/04-system-architecture.md`](docs/04-system-architecture.md) for the architectural rationale.

---

## Tech stack

- **Control plane**: TypeScript, Node 22, Hono, modular monolith.
- **Realtime gateway**: Go 1.23, gorilla/websocket, NATS-backed.
- **CPU workers**: Go primary, Rust escape hatch for hot paths.
- **AI / data workers**: TypeScript primary, Python for ML/eval.
- **Server UI**: Next.js 15 (App Router), React 19, Vite.
- **Canvas**: WebGL2 + WebGPU + Canvas2D, custom scene graph.
- **Storage**: PostgreSQL 16, ClickHouse 24, Redis 7, NATS JetStream, S3-compatible.
- **Contracts**: Protobuf (Buf), OpenAPI 3.1, JSON Schema.

The contract rule is **non-negotiable**: every polyglot boundary speaks gRPC internally and REST + OpenAPI externally. Generated clients are committed. No service imports another service's source code.

See [`docs/06-technology-stack.md`](docs/06-technology-stack.md) for the full stack rationale.

---

## Development

- **Branching**: trunk-based; short-lived feature branches.
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/).
- **PRs**: at least 1 code owner review; 2 for security / data migrations / public APIs.
- **Linting**: `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- **Generated code**: re-run with `pnpm gen` after changing `contracts/`.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full guide.

---

## Documentation

| Where | What |
|---|---|
| [`docs/01–12`](docs/) | Super docs — problem, requirements, UX, architecture, data, stack, security, infra, testing, team, legal, Bangladesh. |
| [`docs/<domain>.md`](docs/) | Feature-domain deep dives (one per section of `feature-list.md`). |
| [`docs/development_phases/`](docs/development_phases/) | 23-phase development plan with parallel-stream map. |
| [`docs/adr/`](docs/adr/) | Architecture Decision Records. |
| [`docs/runbooks/`](docs/runbooks/) | Operator runbooks. |

---

## Security

See [`SECURITY.md`](SECURITY.md) for how to report vulnerabilities. Treat all planning docs as **provisional** with regard to the Bangladesh legal landscape — see [`docs/11-legal-compliance-bangladesh.md`](docs/11-legal-compliance-bangladesh.md) before implementing payments, data flows, or residency.

---

## License

[Apache 2.0](LICENSE).

---

## Acknowledgements

This is a from-scratch build. No prior code is reused. All architecture decisions are documented in [`docs/adr/`](docs/adr/).