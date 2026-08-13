# Phase 00 — Repository, Contracts, and Development Environment

> **Status:** Not started · **Owner:** Platform Foundations Lead + Contracts Lead · **Critical path:** yes · **Parallel stream:** foundation (no parallel tag; precedes all parallel work) · **Phase file:** `phase-00-repo-contracts-dev-env.md`

## 1. Header

Phase 00 establishes the Domio monorepo, the contract-first publishing pipeline (Protobuf/OpenAPI/JSON Schema), the local development environment, and the governance artifacts (ADRs, contribution guide, CODEOWNERS) that every later phase assumes exist. No product code is written in this phase — only the skeleton that lets every service, worker, web app, and package land in a known shape, get type-checked against published contracts, and run locally against a reproducible Docker Compose stack. This is the literal critical path: nothing in P01–P22 can start until the repo, the contracts directory, and `make dev` work end-to-end on a fresh checkout on a Bangladesh-bandwidth connection.

**Tags:** `#critical-path` `#foundation` `#contracts` `#dev-env` `#bandwidth-aware`

## 2. Goals

- A single checkout, on a fresh machine, with `make bootstrap && make dev` brings up Postgres, NATS, MinIO, Valkey, and (optional) OpenSearch, seeds test data, and runs health-checked service stubs reachable from the local web app — measurable by a new contributor succeeding in under 30 minutes on a 4 Mbps Dhaka residential link.
- A versioned `contracts/` directory (Protobuf for service-to-service RPC and events, OpenAPI for HTTP gateways, JSON Schema for document payloads) with a CI-enforced breaking-change gate (Buf, Spectral, ajv) and a published artifact (`contracts-<version>.tar.gz` or container image) consumable by every app and worker in subsequent phases.
- A reusable contract-test harness that any service can plug into, with at least one passing contract test proving end-to-end schema compatibility for the contract stubs introduced by this phase (`common.proto`, `health.yaml`, `error.schema.json`).
- Governance artifacts (`docs/adr/0001-record-architecture-decisions.md`, `CONTRIBUTING.md`, `CODEOWNERS`, `SECURITY.md`) merged and linked from the root `README.md`, so every later PR has an unambiguous review path.
- Observability SDK shells for each runtime (TypeScript/Node, Go, Python) wired to no-op exporters by default with a single env-var switch to OTLP, so P01 can swap in the real collector without rewriting call sites.
- A dependency-mirror configuration (`/infrastructure/mirrors/`) that lets CI and developers in Bangladesh resolve npm, pnpm, Go module, Cargo, PyPI, and Docker base-image downloads through a regional mirror, with a documented fallback to upstream.

## 3. Scope

**In scope (foundational, no product code):**

- Monorepo layout under `/apps` (web, mobile, desktop shells — empty for now), `/services` (directory only — no real services yet, but with a typed service template), `/workers` (directory only), `/packages` (`@domio/contracts-runtime`, `@domio/observability`, `@domio/testkit`, `@domio/ui-tokens` skeletons only), `/contracts`, `/infrastructure`, `/docs`.
- Contracts directory: `contracts/proto/domio/v1/{common,errors,health}.proto`, `contracts/openapi/v1/{health,errors}.yaml`, `contracts/schema/{error,page,envelope}.schema.json`, with `buf.yaml`, `.spectral.yaml`, and `contracts/CHANGELOG.md`.
- Tooling: pnpm workspaces, Turborepo/Nx task graph (decision pending — see §8), Buf, Spectral, ajv, sqlx (Postgres schema migrations as a forward-only file tree under `infrastructure/postgres/migrations/`), `docker-compose.yml` (Postgres 16, NATS 2.10, MinIO RELEASE.2024-x, Valkey 7.x), and `docker-compose.opensearch.yml` as an opt-in profile.
- GitHub Actions skeletons: `.github/workflows/{lint,type,unit,contract,axe,threat-model-diff,schema-migration-lint}.yml` with placeholder jobs that P01 fills in.
- ADR process: `docs/adr/README.md` + `0001-record-architecture-decisions.md` (Michael Nygard template) + one seeded ADR for the monorepo/contracts decision itself.
- Seed data scripts under `infrastructure/postgres/seeds/` that create the `domio` database, the `app` role, and a single `health_check` row consumed by the health probe.
- CODEOWNERS at repo root mapped to four domains: `contracts/`, `infrastructure/`, `apps/web`, `services/*` (default).
- `.devcontainer/devcontainer.json` + `Dockerfile.dev` for Codespaces and local VS Code Remote Containers.
- Bandwidth-aware dependency mirror configuration: `infrastructure/mirrors/{npmrc,goproxy,pip.conf,config.toml}` plus a documented `MIRROR=local|upstream` toggle.

**Out of scope (deferred to later phases):**

- Any product feature from `feature-list.md` (everything from #1 onward stays deferred to P02+). The phase is explicitly "no product code yet."
- Real CI/CD runners wired to cloud providers, real secrets backend (Vault/SSM) — P01.
- Real OTel collector, Grafana, Tempo, Loki, ArgoCD, Terraform — P01.
- Web app rendering (canvas, scene-graph, components) — P02/P03.
- Database tables beyond the smallest possible `health_check` row needed to validate the migration toolchain.
- Auth, billing, AI, live data, presentation, sharing, marketplace — all explicitly not in this phase.
- Production-grade staging/prod environments — only `dev` and (in P01) `staging` will exist.
- Production-ready container images for end-user distribution — base images only, multi-stage Dockerfiles for service skeletons are P01.

## 4. Dependencies

**Upstream phases:** none. Phase 00 is the root of the dependency graph (per `phase-graph.md`). It consumes only the static planning artifacts already committed under `/docs/` and `/pre-development-planning-guide.md`.

**Downstream phases unblocked by P00:**

- **P01 (Observability, CI/CD, infra baseline)** — uses the contract stubs, the SDK shells, the migration toolchain, the GitHub Actions skeletons, the Docker Compose files, and the `CODEOWNERS` to wire real CI, OTel pipelines, Terraform, Helm, ArgoCD, the on-call skeleton, the SLO catalog stub, and the dependency-mirror active routing.
- **P02 (Deck schema & scene-graph foundation)** — extends `contracts/schema/` with `deck.schema.json` and `scene-graph.schema.json`, adds `packages/schema` and `packages/scene-graph`, and seeds `infrastructure/postgres/migrations/` with the first real domain tables (`decks`, `slides`, `revisions`). Consumes the JSON Schema tooling and the OpenAPI service template from P00.
- **P03 (Canvas editor MVP)** — relies on the `apps/web` skeleton from P00 to host the editor.
- **P04 (CRDT & presence)** — publishes `contracts/proto/domio/v1/collab.proto`, using the Buf toolchain and the contract-test harness established here.
- **P05 (Persistence, versioning, branches)** — publishes REST/gRPC contracts under `contracts/openapi/v1/` and `contracts/proto/domio/v1/`, tested against the harness from P00.
- **P20 (Security, governance, enterprise)** — consumes the threat-model-diff workflow, the SECURITY.md baseline, the CODEOWNERS routing for `contracts/` and `infrastructure/`, and the secrets management scaffolding.
- **All phases P06–P22** depend on P00 transitively through P02/P05/P20 and through the shared packages (`@domio/contracts-runtime`, `@domio/observability`, `@domio/testkit`).

## 5. Workstreams

### Stream A — Monorepo bootstrap and tooling

- **A.1 Repo init and workspace root** _(files: `.gitignore`, `.editorconfig`, `.gitattributes`, `.npmrc`, `.nvmrc`, `pnpm-workspace.yaml`, `turbo.json` or `nx.json` (TBD per §8), root `package.json`)_

  - Files touched: repo root only.
  - Contracts added/consumed: none.
  - Tests written: `pnpm-workspace.yaml` is fixture-validated by a unit test under `tests/repo/workspace.spec.ts` that asserts each declared workspace path exists.
  - DoD: `pnpm install` succeeds on a clean machine against the mirror; `pnpm -r --filter './packages/*' run typecheck` exits 0 against empty `packages/*/src/index.ts` shims.

- **A.2 Apps/services/workers/packages skeletons** _(files: `apps/web/{package.json,tsconfig.json,src/main.tsx}`, `apps/mobile/.gitkeep`, `apps/desktop/.gitkeep`, `services/template/{README.md,service.yaml}`, `workers/.gitkeep`, `packages/contracts-runtime/{package.json,tsconfig.json,src/index.ts}`, `packages/observability/{package.json,tsconfig.json,src/index.ts}` one each for Node/Go/Python variants)_

  - Files touched: 4 new top-level workspace directories.
  - Contracts added/consumed: consume `contracts/proto/domio/v1/common.proto` in `packages/contracts-runtime/src/index.ts`.
  - Tests written: `packages/contracts-runtime/test/runtime.spec.ts` (round-trips `common.v1.UUID` and verifies buf-generated TS compiles); `packages/observability/test/noop.spec.ts` (verifies SDK initializes with no-op exporter and does not throw).
  - DoD: each skeleton has a CI green badge; `pnpm -r build` produces distributable artifacts for the three runtime SDKs.

- **A.3 Tooling configs** _(files: `.eslintrc.cjs`, `.prettierrc`, `tsconfig.base.json`, `pyproject.toml`, `go.mod` for the `contracts/tools` helper module, `Makefile`, `mise.toml` or `.tool-versions`, `renovate.json`)_
  - Files touched: repo root.
  - Contracts added/consumed: none directly; lint rules pin contract artifact checksums via `engines` and Renovate schedules weekly dep updates.
  - Tests written: a snapshot test under `tests/tooling/lint-config.spec.ts` asserts all listed config files exist and parse.
  - DoD: `make lint`, `make typecheck`, `make test` all exit 0 on a clean checkout against the skeletons.

### Stream B — Contracts directory and tooling

- **B.1 Proto + Buf layout** _(files: `buf.yaml`, `buf.gen.yaml`, `contracts/proto/domio/v1/common.proto` (UUID v4/v7 wrapper, timestamp, page token, locale), `contracts/proto/domio/v1/errors.proto` (error envelope, error codes enum), `contracts/proto/domio/v1/health.proto` (HealthCheck, HealthCheckRequest, HealthCheckResponse))_

  - Files touched: new `contracts/proto/domio/v1/` tree.
  - Contracts added: 3 proto files committed under `contracts/proto/domio/v1/`.
  - Tests written: `tests/contracts/proto/buf-breaking.spec.ts` uses `@bufbuild/buf-migrate` and `buf breaking --against .git#branch=main` — must exit 0; `tests/contracts/proto/buf-lint.spec.ts` enforces `ENUM_ZERO_VALUE_SUFFIX`, `ENUM_VALUE_UPPER_SNAKE_CASE`, `PACKAGE_DIRECTORY_MATCH`, `RPC_REQUEST_STANDARD_NAME`, `RPC_RESPONSE_STANDARD_NAME`, `RPC_REQUEST_RESPONSE_UNIQUE`.
  - DoD: `buf lint contracts/proto` and `buf breaking contracts/proto --against .git#branch=main` both pass in CI.

- **B.2 OpenAPI + Spectral layout** _(files: `contracts/openapi/v1/health.yaml`, `contracts/openapi/v1/errors.yaml`, `.spectral.yaml`, `contracts/openapi/.gitignore` excluding generated `node_modules/`)_

  - Files touched: new `contracts/openapi/v1/` tree.
  - Contracts added: 2 OpenAPI 3.1 files.
  - Tests written: `tests/contracts/openapi/spectral.spec.ts` runs `spectral lint contracts/openapi/v1/*.yaml` and asserts zero errors, with custom ruleset enforcing `info-contact-required`, `operation-operationId`, `oas3-api-servers`, `operation-success-response`, `no-eval-in-markdown`.
  - DoD: `spectral lint` passes; `spectral oas contracts/openapi/v1/health.yaml` produces a valid document; a generated TS client under `packages/contracts-runtime/src/openapi/health.ts` round-trips a `GET /v1/health` response.

- **B.3 JSON Schema layout** _(files: `contracts/schema/error.schema.json`, `contracts/schema/page.schema.json`, `contracts/schema/envelope.schema.json`, plus `contracts/schema/test/cases/_.json` for ajv fixture-based tests)\*

  - Files touched: new `contracts/schema/` tree.
  - Contracts added: 3 JSON Schema 2020-12 files.
  - Tests written: `tests/contracts/schema/ajv.spec.ts` runs ajv with `strict: true`, `allErrors: true`, `Ajv2019`-style drafts (using `ajv/dist/2020`), validates each schema against positive and negative fixtures committed under `contracts/schema/test/cases/`.
  - DoD: ajv exits 0 across all fixtures; CI job posts a coverage matrix of which fixtures are exercised.

- **B.4 Contract artifact publishing** _(files: `contracts/CHANGELOG.md`, `contracts/VERSION`, `contracts/scripts/publish.sh`, `.github/workflows/contract-publish.yml` skeleton that P01 finishes)_

  - Files touched: `contracts/` plus a CI skeleton.
  - Contracts added/consumed: consumes every artifact produced by B.1–B.3.
  - Tests written: a hermetic test under `tests/contracts/publish.spec.ts` runs `contracts/scripts/publish.sh --dry-run` and asserts the artifact tarball contains every `*.proto`, `*.yaml`, `*.schema.json`, plus generated TS/Go/Python bindings.
  - DoD: `make contracts:publish-dry-run` succeeds locally; CI job is a skeleton that triggers on tag push `contract-v*.*.*`.

- **B.5 Contract-test harness** _(files: `packages/contracts-runtime/src/testkit/{consumer,provider,compliance}.ts`, `apps/web/test/contracts/health.spec.ts` consumer probe, `services/template/test/contracts/health.spec.ts` provider probe)_
  - Files touched: `packages/contracts-runtime/` and one consumer/provider probe each.
  - Contracts added/consumed: consumes `contracts/openapi/v1/health.yaml` end-to-end.
  - Tests written: `consumer.spec.ts` uses Pact-style verification against a Pact broker running in Compose (`pact-broker` image); `provider.spec.ts` uses Pact's `Verifications.Provider` against the running web app's `/v1/health` endpoint.
  - DoD: harness runs in CI against the Compose stack; one contract test (`GET /v1/health`) passes end-to-end; the harness README documents how subsequent services will plug in.

### Stream C — Docker Compose local dev stack

- **C.1 Core services compose** _(files: `docker-compose.yml`, `infrastructure/postgres/init/00-extensions.sql`, `infrastructure/postgres/init/01-roles.sql`, `infrastructure/postgres/seeds/00-health-check.sql`, `infrastructure/postgres/migrations/0001_health_check.up.sql`/`down.sql`, `infrastructure/nats/nats.conf`, `infrastructure/minio/policy.json`, `infrastructure/valkey/valkey.conf`)_

  - Files touched: `infrastructure/postgres/`, `infrastructure/nats/`, `infrastructure/minio/`, `infrastructure/valkey/`.
  - Contracts added/consumed: none directly; the seeded `health_check` row is consumed by the `services/template` health probe.
  - Tests written: `tests/infrastructure/compose-up.spec.ts` runs `docker compose up -d` then executes `psql` and `nats` checks via short-lived container scripts; tears down with `docker compose down -v`. Asserts all 4 services report healthy within 90 s.
  - DoD: `make dev` brings all four services up clean on a fresh Docker daemon; `make dev-down` removes them; seed data is idempotent.

- **C.2 OpenSearch profile (opt-in)** _(files: `docker-compose.opensearch.yml`, `infrastructure/opensearch/opensearch.yml`)_

  - Files touched: opt-in profile.
  - Contracts added/consumed: none.
  - Tests written: `tests/infrastructure/opensearch.spec.ts` runs `docker compose --profile search up -d` and asserts the OpenSearch dashboard responds on `:9200`.
  - DoD: documented as opt-in (`COMPOSE_PROFILES=search make dev`); CI job tagged `infrastructure-search` runs weekly.

- **C.3 Bandwidth-aware dependency mirrors** _(files: `infrastructure/mirrors/{npmrc,goproxy,pip.conf,cargo-config.toml}` template, `infrastructure/mirrors/README.md`)_
  - Files touched: new `infrastructure/mirrors/` tree.
  - Contracts added/consumed: none.
  - Tests written: `tests/infrastructure/mirrors.spec.ts` validates each config file's syntax (TOML/YAML/INI parses) and includes a "fallback to upstream" simulation test that points `MIRROR=upstream` and asserts the upstream URL is reachable from CI.
  - DoD: documented under `infrastructure/mirrors/README.md`; `MIRROR=local` produces a config that point to the regional mirror registry planned in P01.

### Stream D — Dev environment, contribution, and ADR

- **D.1 `.devcontainer/`** _(files: `.devcontainer/devcontainer.json`, `Dockerfile.dev`, `.devcontainer/post-create.sh`)_

  - Files touched: `.devcontainer/`.
  - Contracts added/consumed: none.
  - Tests written: post-create script's `make bootstrap && make dev-up && make smoke` invocation is captured under `tests/devcontainer/post-create.spec.ts` and runs in CI's Linux runner with a mocked Docker Compose driver.
  - DoD: devcontainer builds in Codespaces; `make smoke` exits 0 within 5 minutes; documented in `README.md` under "Getting Started".

- **D.2 `CONTRIBUTING.md`, `CODEOWNERS`, `SECURITY.md`** _(files: `CONTRIBUTING.md`, `CODEOWNERS`, `SECURITY.md`, `README.md` updated with badges and a top-level "How to contribute" pointer)_

  - Files touched: repo root + `README.md`.
  - Contracts added/consumed: none.
  - Tests written: `tests/repo/governance.spec.ts` asserts each required section heading exists (Semantic Versioning policy, branch protection rules, security disclosure email, codeowner mapping for the four domains).
  - DoD: CODEOWNERS resolves at least one owner per `/contracts`, `/infrastructure`, `/apps/web`, `/services`; `CONTRIBUTING.md` references the ADR process and the contract-test harness.

- **D.3 ADR process and seed ADR** _(files: `docs/adr/README.md` (template + numbering policy), `docs/adr/0001-monorepo-and-contracts.md`, `docs/adr/0002-adr-process.md`)_

  - Files touched: `docs/adr/`.
  - Contracts added/consumed: none.
  - Tests written: `tests/adr/specfrontmatter.spec.ts` asserts every ADR under `docs/adr/*.md` begins with valid `<!-- markdownlint-disable -->` metadata including Status, Date, Deciders, Context, Decision, Consequences.
  - DoD: ADR 0001 captures the monorepo layout choice, the contract-first policy, the CI breaking-change gate, and the bandwidth-mirror default; ADR 0002 documents the process itself; CI job `adr-lint` fails on missing frontmatter.

- **D.4 Make-driven developer workflow** _(files: `Makefile`, `scripts/bootstrap.sh`, `scripts/dev-up.sh`, `scripts/dev-down.sh`, `scripts/smoke.sh`)_
  - Files touched: `Makefile`, `scripts/`.
  - Contracts added/consumed: none.
  - Tests written: a shell-spec test under `tests/makefile/spec.sh` runs each target on a clean checkout and asserts expected exit codes + log markers.
  - DoD: `make bootstrap && make dev-up && make smoke && make dev-down` is fully reproducible on a Mac/Linux dev machine with Docker installed and produces a 1-line success summary.

### Stream E — Observability SDK shells (no real backend yet)

- **E.1 TypeScript observability shell** _(files: `packages/observability/src/{trace,metrics,logs,context}.ts`, `packages/observability/src/exporters/{noop,otlp-http}.ts` (no-op only, OTLP HTTP stubbed), `packages/observability/test/observability.spec.ts`)_

  - Files touched: `packages/observability/`.
  - Contracts added/consumed: none.
  - Tests written: `observability.spec.ts` asserts the no-op exporter is selected when `OTEL_EXPORTER_OTLP_ENDPOINT` is unset, and that the OTLP HTTP exporter throws a clear "phase 01 not configured" error if set without a collector URL (the real wiring is P01).
  - DoD: SDK exports named functions `startSpan`, `recordMetric`, `emitLog`, `withContext`; default no-op behavior verified in CI.

- **E.2 Go observability shell** _(files: `packages/observability-go/{go.mod,observe.go,noop.go}`, `packages/observability-go/observe_test.go`)_

  - Files touched: new Go module mirroring the TS shape.
  - Contracts added/consumed: none.
  - Tests written: `observe_test.go` asserts the no-op path and the documented "phase 01 not configured" error path.
  - DoD: `go test ./...` passes.

- **E.3 Python observability shell** _(files: `packages/observability-py/{pyproject.toml,domio_obs/__init__.py,noop.py}`, `packages/observability-py/tests/test_obs.py`)_
  - Files touched: new Python package mirroring the TS shape.
  - Contracts added/consumed: none.
  - Tests written: `test_obs.py` mirrors the TS test in Python.
  - DoD: `pytest packages/observability-py` passes.

### Cross-cutting: test infrastructure

- **X.1 Test kit and CI gating** _(files: `packages/testkit/src/{factories,migrations,smoke}.ts`, `.github/workflows/{lint,type,unit,contract,axe,threat-model-diff,schema-migration-lint}.yml` as skeletons)_
  - Files touched: `packages/testkit/` plus CI skeletons.
  - Contracts added/consumed: consumes every contract under `contracts/` via the testkit's Pact/buf/ajv drivers.
  - Tests written: `packages/testkit/test/testkit.spec.ts` exposes a `describeContract` helper that's then exercised by the consumer/provider probes in B.5.
  - DoD: the seven CI workflows are present, parseable, and use pinned action SHAs; P01 fills in their job bodies.

## 6. Architecture & data

### New directories and key files

```
/apps/web/{package.json,tsconfig.json,src/main.tsx}             # skeleton Next.js or Vite app, picks one in §8
/apps/mobile/.gitkeep
/apps/desktop/.gitkeep
/services/template/{README.md,service.yaml,Dockerfile,main.ts}  # typed Go or Node template; decision in §8
/workers/.gitkeep
/packages/contracts-runtime/{package.json,src/index.ts,...}
/packages/observability/{package.json,src/{trace,metrics,logs,context,exporters/noop,exporters/otlp-http}.ts}
/packages/observability-go/{go.mod,observe.go,noop.go}
/packages/observability-py/{pyproject.toml,domio_obs/__init__.py}
/packages/testkit/{package.json,src/{factories,migrations,smoke}.ts}
/contracts/
  buf.yaml
  buf.gen.yaml
  CHANGELOG.md
  VERSION
  proto/domio/v1/{common,errors,health}.proto
  openapi/v1/{health,errors}.yaml
  openapi/.spectral.yaml
  schema/{error,page,envelope}.schema.json
  schema/test/cases/*.json
  scripts/publish.sh
infrastructure/
  postgres/{init,seeds,migrations}/
  nats/nats.conf
  minio/policy.json
  valkey/valkey.conf
  opensearch/opensearch.yml
  mirrors/{npmrc,goproxy,pip.conf,cargo-config.toml,README.md}
  docker-compose.yml
  docker-compose.opensearch.yml
infrastructure/postgres/migrations/0001_health_check.{up,down}.sql
docs/adr/{README.md,0001-monorepo-and-contracts.md,0002-adr-process.md}
.devcontainer/{devcontainer.json,Dockerfile.dev,post-create.sh}
.github/workflows/{lint,type,unit,contract,axe,threat-model-diff,schema-migration-lint,adr-lint}.yml
Makefile
scripts/{bootstrap.sh,dev-up.sh,dev-down.sh,smoke.sh}
CONTRIBUTING.md
CODEOWNERS
SECURITY.md
```

### Contracts added (precise list)

- `contracts/proto/domio/v1/common.proto` — `UUID`, `Timestamp`, `PageToken`, `Locale`, `Money`, `Color`. (None of these attach to a feature number yet — they are infrastructure primitives.)
- `contracts/proto/domio/v1/errors.proto` — `ErrorCode` enum (`UNKNOWN`, `INVALID_ARGUMENT`, `NOT_FOUND`, `CONFLICT`, `INTERNAL`, `UNAVAILABLE`, `DEADLINE_EXCEEDED`, `UNAUTHENTICATED`, `PERMISSION_DENIED`), `Error` message, `Error_RetryInfo`, top-level `Error` payload envelope.
- `contracts/proto/domio/v1/health.proto` — `HealthCheckRequest { service: string }`, `HealthCheckResponse { status: ServingStatus, version: string, build_sha: string }`, `ServingStatus { UNKNOWN, SERVING, NOT_SERVING, SERVICE_UNKNOWN }`, plus `Watch` RPC scaffolded (returns `stream HealthCheckResponse`).
- `contracts/openapi/v1/health.yaml` — `GET /v1/health` returning 200 with the JSON equivalent of `HealthCheckResponse`.
- `contracts/openapi/v1/errors.yaml` — reusable `Problem` (RFC 9457) and `ProblemExtension` schemas referenced by every later OpenAPI document.
- `contracts/schema/error.schema.json` — JSON Schema 2020-12 form of `errors.proto`.
- `contracts/schema/page.schema.json` — generic pagination envelope `{ items: [], next_token: string }`.
- `contracts/schema/envelope.schema.json` — generic API response envelope `{ data, error, meta }`.

### Database

A single forward-only migration: `infrastructure/postgres/migrations/0001_health_check.up.sql` creates the `health_check` table used by the `services/template` probe. No domain tables yet. Migration tooling chosen via §8 (sqlx-cli vs. Atlas vs. Liquibase — defaults to sqlx-cli for Go-native ergonomics).

### Services and modules introduced

- `services/template` — typed service skeleton that owns the `GET /v1/health` and `grpc.health.v1.Health.Check` endpoints. No product logic. Purpose is to give subsequent phases a worked example of "how a Domio service is structured."
- `apps/web` — empty browser shell that loads, shows a "Domio P00 ready" badge, calls `/v1/health`, and renders OK/not-OK. (No actual editor — that's P03.)
- Three observability SDK shells (TS / Go / Python) as listed above.

### Reference to master docs

- Architecture: `/docs/04-system-architecture.md` — this phase implements the monorepo and contract-first sections; tracks the service template and SDK shells.
- Data/database: `/docs/05-data-database-design.md` — only the migration toolchain section (forward-only, versioned, idempotent seeds) is exercised here; domain tables land in P02/P05.
- Technology stack: `/docs/06-technology-stack.md` — pins the runtime versions (Node 22 LTS, Go 1.23, Python 3.12, Postgres 16, NATS 2.10, Valkey 7.x, MinIO RELEASE.2024-x).
- Security planning: `/docs/07-security-planning.md` — establishes `SECURITY.md` disclosure policy and the `threat-model-diff` placeholder CI workflow.
- Infrastructure/DevOps: `/docs/08-infrastructure-devops.md` — defines the dev environment layout that P01 extends to staging/prod.
- Bangladesh context: `/docs/12-bangladesh-development-context.md` — the bandwidth-mirror configuration is a direct response to §12.1.

## 7. Verification

| Feature / acceptance item                       | Test (file / command)                                                                        | Expected result                                                                                   | Owner                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------- |
| Fresh checkout succeeds on 4 Mbps link          | `tests/devcontainer/post-create.spec.ts` (timed)                                             | `make bootstrap && make dev-up && make smoke && make dev-down` exits 0 within 30 min wall clock   | Platform Foundations |
| Service template serves `/v1/health` JSON       | `tests/infrastructure/smoke.sh` + Pact consumer in B.5                                       | 200, body matches `contracts/openapi/v1/health.yaml`                                              | Contracts Lead       |
| Service template serves gRPC `Health.Check`     | `packages/contracts-runtime/test/health-grpc.spec.ts`                                        | `SERVING`; gRPC trailer empty                                                                     | Contracts Lead       |
| Proto breaking-change gate holds                | `.github/workflows/contract.yml` job `buf-breaking`                                          | `buf breaking --against .git#branch=main` exits 0; intentional break in a feature branch fails CI | Contracts Lead       |
| Spectral lint clean                             | `.github/workflows/contract.yml` job `spectral-lint`                                         | `spectral lint contracts/openapi/v1/*.yaml` exits 0                                               | Contracts Lead       |
| ajv strict-pass on JSON Schema fixtures         | `tests/contracts/schema/ajv.spec.ts`                                                         | All fixtures classify as valid/invalid correctly                                                  | Contracts Lead       |
| Contract-test harness works                     | `apps/web/test/contracts/health.spec.ts` + `services/template/test/contracts/health.spec.ts` | Pact publish + verification succeed against docker-compose stack                                  | Contracts Lead       |
| Postgres migration applies forward & rolls back | `tests/infrastructure/migrate.spec.ts`                                                       | `sqlx migrate run` and `sqlx migrate revert` both exit 0                                          | Platform Foundations |
| Docker Compose stack comes up clean             | `tests/infrastructure/compose-up.spec.ts`                                                    | 4 services `healthy`, `:5432`, `:4222`, `:9000`, `:6379` reachable                                | Platform Foundations |
| OpenSearch opt-in profile works                 | `tests/infrastructure/opensearch.spec.ts`                                                    | `:9200` returns cluster health `green`                                                            | Platform Foundations |
| Bandwidth-mirror config parses and routes       | `tests/infrastructure/mirrors.spec.ts`                                                       | `MIRROR=local` & `MIRROR=upstream` both parse; CI reaches upstream                                | Platform Foundations |
| Observability SDK shells compile & run no-op    | per-runtime tests in E.1–E.3                                                                 | All three SDKs import, init, and produce no network calls by default                              | Platform Foundations |
| ADR process and seed ADR exist                  | `tests/adr/specfrontmatter.spec.ts` + `adr-lint` GitHub Action                               | Required frontmatter present; ADR 0001 captures the contract decision                             | Platform Foundations |
| `CODEOWNERS` valid and complete                 | `tests/repo/governance.spec.ts`                                                              | At least one owner per `/contracts`, `/infrastructure`, `/apps/web`, `/services`                  | Eng Productivity     |
| `make smoke` green from `main`                  | GitHub Actions `smoke.yml`                                                                   | Single green check; logs show `domio P00 smoke: ok`                                               | Platform Foundations |
| Threat-model-diff placeholder exists            | `.github/workflows/threat-model-diff.yml` lint                                               | Workflow parses; runs against an empty `threat-model/` with a positive acknowledgment             | Security Lead        |
| Schema-migration-lint placeholder exists        | `.github/workflows/schema-migration-lint.yml`                                                | Workflow parses; on the single migration in this phase it passes                                  | Platform Foundations |

## 8. Risks & open decisions

- **Turborepo vs. Nx vs. pnpm-only task graph.** Open decision: leaning Turborepo for smaller dev surface and faster cold start, but Nx's incremental computation is appealing for the contract-test harness. **Mitigation:** prototype both in week 1, decide in week 2 via a 1-page ADR addendum to `0001`.
- **Web app framework (Next.js vs. Vite + TanStack Router).** Open decision: P03 needs SSR for the editor's shareable URLs (feature #155–168), so Next.js is the safer default, but Vite + a separate SSR worker keeps the editor bundle smaller. **Mitigation:** ship the `apps/web` skeleton with Next.js in P00 because it's the path of least surprise for P03–P19; revisit only if P03 hits rendering perf cliffs.
- **Migration toolchain (sqlx-cli vs. Atlas).** Leaning sqlx-cli for Rust-grade migration discipline and Go-native ergonomics, but Atlas's schema-as-code is tempting. **Mitigation:** default to sqlx-cli because Go is already in the toolchain; Atlas considered in P05 when versioning (#20) lands and schema diffs become important.
- **Service template language (Go vs. Node/TypeScript).** Go is faster and easier to deploy but TypeScript keeps the surface uniform with the web app. **Mitigation:** ship a TS `services/template` initially (matches the dominant type-check surface); revisit when P01 needs gRPC-heavy workers.
- **CI runner location under Bangladesh bandwidth.** GitHub-hosted runners are fine for build/test, but image pulls from Docker Hub are slow on Bangladeshi uplinks. **Mitigation:** the bandwidth-mirror config is in scope here; the active mirror registry is wired in P01. Document a "first-run will be slow" warning in `README.md`.
- **Pact broker persistence.** The contract-test harness uses an embedded in-memory broker for development, but CI needs a persistent broker. **Mitigation:** run the broker as a service container in GitHub Actions with a per-build cache key; defer durable hosting to P01.
- **Defining "done" for contract stubs.** Three proto files plus two OpenAPI files plus three JSON Schemas is the minimum needed to prove the harness works. Risk that downstream phases want different RPC patterns. **Mitigation:** explicitly mark every primitive in `common.proto` as a "stability: stable" annotation; ADR 0001 commits to a one-cycle deprecation policy on any later addition.
- **OpenSearch cost in CI.** OpenSearch is heavy and slow to start. **Mitigation:** optional profile only; CI job weekly, not on every PR.
- **Renovate aggressiveness on Bandwidth-mirror URLs.** Risk of CI drift when upstream changes. **Mitigation:** Renovate is configured to update mirror URLs only as a manual PR until P01, then becomes weekly.

## 9. Demo

The internal demo proves Phase 00 is shippable. Time-box: 20 minutes.

1. **Pre-demo setup (5 min prior):** Confluence page with a one-screen demo script is opened on the projector; a fresh Codespace is launched.
2. **Step 1 — Cold-start a fresh checkout (3 min).** Show `git clean -fdx`, `git clone`, `cd domio`, `make bootstrap`. Call out the dependency-mirror log lines that show a single regional mirror is being hit. Target wall-clock: under 4 minutes on a Dhaka 4 Mbps link.
3. **Step 2 — Bring up the local stack (4 min).** Run `make dev-up`. Show the Compose table: `postgres-1`, `nats-1`, `minio-1`, `valkey-1`, all `healthy`. Show a side terminal running `psql -h localhost -U app -d domio -c "select * from health_check"` returning the seeded row.
4. **Step 3 — Web app skeleton + health (3 min).** Open `http://localhost:3000` (Next.js) and show the "Domio P00 ready" badge with a green dot from `/v1/health`. Click the badge; show the JSON payload and the matching OpenAPI doc side-by-side. **Pass criterion:** the JSON matches the OpenAPI shape byte-for-byte.
5. **Step 4 — Contract breaking-change gate (3 min).** Open a feature branch, change `common.proto`'s `UUID` field number from `1` to `99`. Push. Show GitHub Actions bot: red X on `buf-breaking`. Revert the change. Show green again. **Pass criterion:** the gate fires on a real PR.
6. **Step 5 — ADR + governance (3 min).** Open `docs/adr/0001-monorepo-and-contracts.md` in the rendered docs site. Read the "Decision" section aloud. Show `CODEOWNERS` and `SECURITY.md`. **Pass criterion:** codeowners resolve under each section.
7. **Step 6 — Smoke + tear-down (2 min).** Run `make smoke` (single green) then `make dev-down`. Show the volume cleanup log.
8. **Pass/fail signal at 18 min:** "Phase 00 demo pass" stamp by Platform Foundations Lead and Contracts Lead.

## 10. Definition of Done

- All Stream A–E tasks in §5 merged to `main`, each behind its own PR with its test added to the CI matrix.
- `contracts/CHANGELOG.md` and `contracts/VERSION` bumped to `0.1.0` with all proto/OpenAPI/JSON Schema files listed.
- All seven `.github/workflows/*.yml` skeletons merged, each of which must `parse` in CI; the `contract.yml` workflow is fully green.
- `make bootstrap && make dev-up && make smoke && make dev-down` is reproducible on Mac/Linux (Ubuntu 22.04+) and on a fresh Codespace, with logs captured in `tests/devcontainer/repro.log` and committed for audit.
- `SECURITY.md`, `CONTRIBUTING.md`, `CODEOWNERS`, `docs/adr/0001-*.md`, `docs/adr/0002-*.md` merged and linked from `README.md`.
- All three observability SDKs (`packages/observability`, `packages/observability-go`, `packages/observability-py`) built and tested green in CI.
- Contract-test harness publishes one passing Pact (the `/v1/health` consumer/provider pair) and the harness README is published under `packages/contracts-runtime/README.md`.
- The `services/template` skeleton (TypeScript or Go) builds, exposes `/v1/health` and gRPC `Health.Check`, and is referenced from the master architecture doc `/docs/04-system-architecture.md`.
- Postgres migration `0001_health_check.{up,down}.sql` applies and reverts cleanly.
- Dependency mirror configs are committed under `infrastructure/mirrors/` with `MIRROR=local|upstream` documented.
- Internal demo passed per §9 with the lead's stamp.
- Telemetry hooks (no-op path) are imported by all three SDKs, ready for P01's OTLP switch — no network calls verified in CI.
- `docs/development_phases/phase-00-repo-contracts-dev-env.md` is published (this file) and cross-linked from `docs/development_phases/README.md`.
