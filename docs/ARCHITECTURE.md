# Domio — Architecture

> **Ground truth:** this document is derived from the actual repository state.
> Sources: `pnpm-workspace.yaml`, `turbo.json`, `package.json`, `go.mod`,
> `services/`, `apps/`, `packages/`, `workers/`, `contracts/`, `infrastructure/`,
> `.github/workflows/`, `slo/`, `threat-model/`, `runbooks/`, and the git tag
> history (`phase-18-contracts-v1.0.0`, `phase-19-contracts-v1.0.0`).
> **Last regenerated:** 2026-08-16.

---

## 1. System at a glance

Domio is a polyglot, contract-driven platform that pairs a Figma-grade canvas
with a Canva-scale component library, a Keynote-class authoring surface,
real-time collaboration, and a first-class **Model Context Protocol (MCP)**
agent surface. It is deployed as 84+ independently scalable services plus 11
front-end apps and 23 batch/queue workers, all glued together by committed
Protobuf, OpenAPI, JSON Schema, and GraphQL contracts.

| Dimension               | Count                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| Apps (user-facing)      | **11** (`apps/{admin-console, api, creator-console, dashboard, editor, join-web, landing, magic-link-landing, marketplace-web, presenter, viewer}`) |
| Services (long-running) | **84** (75 TypeScript/Node + several Go gateways, see §6)                                            |
| Workers (batch/queue)   | **23** (cron, queue consumers, async render/transcode, AI eval)                                      |
| Packages (shared libs)  | **38** (canvas, schema, yjs-shared, redact-pii, etc.)                                                |
| Contract protos         | **29** Protobuf files in `contracts/proto/domio/`                                                    |
| OpenAPI specs           | **63** documents under `contracts/openapi/`                                                          |
| JSON Schemas            | **60+** in `contracts/schema/{v1, crdt, merge}/`                                                     |
| MCP tool specs          | **8** tool input/output JSON Schemas in `contracts/mcp/tools/`                                      |
| Architecture Decisions  | **9** accepted ADRs (0001–0008, plus template 0000) in `docs/adr/`                                    |
| Phase tags              | `phase-18-contracts-v1.0.0`, `phase-19-contracts-v1.0.0` (more added by phase completion)            |
| CI workflows            | **30** files in `.github/workflows/` orchestrating lint, typecheck, contracts, unit, integration, e2e, load, chaos, security, leak-scan, build-provenance, axe/a11y, i18n, smoke, deploy |
| Postgres migrations     | **178** SQL files                                                                                    |
| Grafana dashboards      | `phase-15-presenter`, `realtime-gateway`, `phase-17-analytics`                                       |
| SLOs                    | `api-gateway`, `editor`, `postgres`, `realtime-gateway`, `phase-17`, plus `oncall.yaml`              |
| Runbooks                | `runbooks/{chaos, postmortems, service-runbooks, tabletop-tests}`                                    |
| Threat model            | `threat-model/{components, 00-process, 01-definitions}`                                              |

---

## 2. Layered topology

```
┌─ Clients ─────────────────────────────────────────────────────────────┐
│ Next.js apps (11) ─ editor, viewer, presenter, dashboard,             │
│ marketplace-web, creator-console, admin-console, landing, join-web,   │
│ magic-link-landing, api                                              │
└───────────────────────────────────────────────────────────────────────┘
                                  │ HTTPS / WSS
┌─ Edge ────────────────────────────────────────────────────────────────┐
│ API gateway, Realtime Gateway (Go), Participant WS Gateway (Go),     │
│ MCP gateway (TS), Edge PubSub, Embed proxy, Deep link svc           │
└───────────────────────────────────────────────────────────────────────┘
                                  │ gRPC / NATS JetStream / Kafka
┌─ Control plane + Feature services (75 TS) ───────────────────────────┐
│ control-plane, registry, collab, annotation-engine, brand, theme,    │
│ component-registry, lint, font, license, library, suggestions,      │
│ merge-requests, share-api, share-vcs, expiry, guests, …              │
│ audience/presenter/participant session, poll/qa/quiz/word-cloud/     │
│ reaction/nav-vote/sentiment/raise-hand/feedback engines, recording-  │
│ orchestrator, attendance-logger, moderation-{blocklist,ml},         │
│ event-ingest, clickhouse-loader, analytics-warehouse, sessionization,│
│ heatmap-generator, ab-{assignment,measurement,statistics},           │
│ crm-sync, notification-dispatcher, live-analytics, team-analytics,   │
│ creator-analytics, benchmark, viewer-identity, …                    │
│ ai-orchestrator + ai-adapters, mcp-server                            │
│ export-pipeline, asset-api, thumbnail, shader-registry,              │
│ latex-render, code-sandbox, keyframes-svc, video-pipeline,           │
│ translation-pipeline, stt/mt/tts-providers, ar-sessions,             │
│ cad-jobs, prototype-runtime, prototype-recorder, timeline-api,       │
│ permission-engine, audit, marketplace, marketplace-preview, …        │
└───────────────────────────────────────────────────────────────────────┘
                                  │
┌─ Workers (23, batch / queue) ────────────────────────────────────────┐
│ ai-eval, brand-extract, theme-pair, sync, data-analysis,             │
│ ingest-docs, accessibility-audit, refresh-scheduler, freshness-      │
│ tracker, export-render, session-archiver, handout-generator,        │
│ scorm-packager, moderation-flagger, expiry-scanner,                  │
│ library-propagator, diff-engine, subscription-billing,               │
│ refund-processor, payout-executor, fx-rate-cacher, kyc-poller,       │
│ kyc-rescreen                                                       │
└───────────────────────────────────────────────────────────────────────┘
                                  │
┌─ Data + infra ───────────────────────────────────────────────────────┐
│ Postgres 16 (control plane, 178 migrations)                         │
│ ClickHouse 24 (analytics warehouse)                                  │
│ Redis 7 / Valkey (cache, sessions)                                  │
│ NATS JetStream (event bus)                                          │
│ Kafka (analytics ingestion)                                         │
│ S3-compatible object store (assets, render artifacts)               │
│ OpenSearch (search), MinIO (S3 dev), MailHog (dev mail)              │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 3. The contract rule (ADR-0002, ADR-0003)

Every polyglot boundary speaks:

- **gRPC** for internal service-to-service traffic
- **REST + OpenAPI 3.1** for external traffic
- **JSON Schema** for component props, deck documents, and CRDT types
- **GraphQL** for the dashboard surface (`contracts/graphql/v1/analytics.graphql`)
- **MCP (JSON-RPC 2.0)** for the agent surface (`contracts/mcp/`)

Wire contracts are committed under `contracts/` and generated clients are
checked in. CI enforces format (`buf format`), lint (`buf lint`), and
backward-compatibility (`buf breaking`). Schema migration lint runs as a
standalone workflow (`schema-migration-lint.yml`).

**No service imports another service's source code.** Service contracts are
the only allowed coupling.

---

## 4. The deck schema (ADR-0004)

`contracts/schema/v1/deck.schema.json` is the canonical structured document
schema. It is the source of truth for:

- The visual canvas (via the scene graph: `scene-graph.schema.json`)
- The CRDT log (`crdt-op.schema.json`, `presence-state.schema.json`)
- The MCP agent surface (semantic element addressing)
- Deck-as-code / YAML mode
- The renderer and export pipeline

Component prop schemas use **JSON Schema 2020-12** (ADR-0005), making them
agent-fillable via structured tool calling.

---

## 5. Collaboration & CRDT

`packages/yjs-shared` + `yjs@13.6.27` in the editor. CRDT op schemas and
presence schemas live in `contracts/schema/`. The `tests/convergence/`
directory contains Yjs scenarios for presence and merge correctness. The
Go realtime-gateway and the TS services consume and emit ops through the
shared protocol (`packages/protocol`).

---

## 6. Polyglot runtime split

| Tier                  | Language         | Frameworks                                       |
| --------------------- | ---------------- | ------------------------------------------------ |
| Apps (web)            | TypeScript 5.7.2 | Next.js 15.1.3 (App Router), React 19.0.0, Vite, Tailwind 3.4 |
| Control plane + most services | TypeScript 5.7.2 | Node 22.11.0, Hono, Turbo monorepo               |
| Realtime gateway      | Go 1.25 (per `go.mod`) | gorilla/websocket, NATS JetStream, OTel         |
| Participant WS gateway| Go               | same stack                                       |
| CPU / hot-path workers| Go (Rust escape hatch per ADR) | axum, prost                          |
| AI eval / ML          | Python 3.12.8    | uv + Pydantic                                    |
| Contracts / schemas   | Buf 1.34 + protoc 25.3 | Format/lint/break in CI                     |

> Note: most services are TS; the Go tier is concentrated in
> `services/realtime-gateway/` and `services/participant-ws-gateway/`. Per
> `go.mod` the shared Go module is `github.com/domio/platform` and pulls in
> ClickHouse, NATS, pgx, redis-go, kafka-go, OpenTelemetry, gRPC, and
> zap.

---

## 7. Front-end apps

All web apps share the same Next.js 15.1.3 + React 19.0.0 + TypeScript 5.7.2
stack. Tailwind 3.4 is the styling layer across editor / dashboard /
marketplace-web / creator-console / admin-console.

| App                  | Purpose                                                | Notable routes                                                          |
| -------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------- |
| `editor`             | Figma-grade canvas + deck authoring                     | `/editor/[id]`, `/search`                                               |
| `viewer`             | Public deck viewer (kiosk, demo, scroll, web embeds)    | `/[deckId]`, `/demo`, `/kiosk`                                          |
| `presenter`          | Presenter mode (live, paired, parking lot)              | `/pair`, `/session`                                                     |
| `dashboard`          | Analytics workspace                                    | `/ab`, `/alerts`, `/benchmarks`, `/cohorts`, `/crm`, `/csat`, `/deck/[id]`, `/export`, `/funnel`, `/graph`, `/heatmap`, `/heatmap/element`, `/kpis`, `/live`, `/overview`, `/sentiment`, `/sessions`, `/sessions/[id]`, `/team` (16 dashboard pages) |
| `marketplace-web`    | Public template/component marketplace                  | `/checkout`, `/creators`, `/library`, `/listing`, `/search`, `/sellers`, `/theme` |
| `creator-console`    | Creator-side listing management                        | `/analytics`, `/listings`, `/onboarding`, `/payouts`, `/reviews`, `/settings`, `/statements` |
| `admin-console`      | Enterprise / platform admin (32 routes)                | `/legal-hold`, `/sso`, `/api-keys`, `/audit`, `/billing`, `/brand-locks`, `/change-feed`, `/component-sdk`, `/custom-domains`, `/dlp`, `/webhooks`, `/trust`, `/agent-handoff`, `/api-explorer`, `/takedowns`, `/payouts`, `/plugins`, `/rendering`, `/residency`, `/retention`, … |
| `landing`            | Marketing site                                         | `/`                                                                     |
| `magic-link-landing` | Email/magic-link landing pages                         |                                                                         |
| `join-web`           | Audience QR-join                                       |                                                                         |
| `api`                | HTTP/gRPC server entrypoint                            |                                                                         |

---

## 8. CI orchestrator (`.github/workflows/ci.yml`)

`ci.yml` is the master orchestrator. It calls reusable workflows for each
category:

- **static** — `contract.yml`, `type.yml`, `lint.yml`
- **unit + integration** — `unit.yml`, `integration.yml`
- **execution** — `smoke.yml`, `external-e2e.yml`, `editor-e2e.yml`
- **a11y** — `a11y-i18n.yml`, `axe.yml`
- **ops** — `chaos.yml`, `p22-load.yml`, `load.yml`, `perf-nightly.yml`
- **security** — `security.yml`, `leak-scan.yml`, `threat-model-diff.yml`, `tracing-coverage.yml`, `build-provenance.yml`
- **deploy / release** — `deploy.yml`, `release.yml`, `publish.yml`, `dashboard-build.yml`
- **schema** — `schema-validate.yml`, `schema-migration-lint.yml`
- **gate** — `public-beta-gate.yml`, `phase17-services-build.yml`

See `docs/CI.md` for the full per-workflow purpose table.

---

## 9. Where to read more

| Topic              | File                              |
| ------------------ | --------------------------------- |
| Service catalog    | `docs/SERVICES.md`                |
| App catalog        | `docs/APPS.md`                    |
| Worker catalog     | `docs/WORKERS.md`                 |
| Package catalog    | `docs/PACKAGES.md`                |
| Contracts          | `docs/CONTRACTS.md`               |
| CI                 | `docs/CI.md`                      |
| Infrastructure     | `docs/INFRASTRUCTURE.md`          |
| Observability/SLOs | `docs/OBSERVABILITY.md`           |
| Security model     | `docs/SECURITY.md`                |
| Status (live)      | `docs/STATUS.md`                  |
| ADRs (historical)  | `docs/adr/`                       |
| Phase plans        | `docs/development_phases/`        |