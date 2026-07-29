# 06 — Technology Stack

> **Status:** Authoritative for technology selections. Stack changes require an ADR. Vendor evaluations live in `10-project-team-planning.md` §10.10 and are referenced from here.
> **Assumptions — backend is intentionally polyglot:**
> - **Frontend:** Next.js + React (TypeScript) on WebGL2 + WebGPU (with Canvas2D fallback).
> - **State/collab:** Yjs CRDT (sub-documents per slide/theme/binding) over Automerge.
> - **Control plane (HTTP/gRPC API + workflow orchestrators):** TypeScript on Node 22 + Hono.
> - **Realtime gateway (presence, stage fan-out, audience channels):** Go (gorilla/websocket or nhooyr.io/websocket), NATS-backed; managed fallback via Liveblocks/Ably adapter.
> - **CPU-bound workers (video transcode orchestration, glTF/STEP conversion, large deck export, formula sandbox, image processing):** Go or Rust (default Go for breadth, Rust where raw throughput or memory determinism matters).
> - **AI/data workers (model adapters, ingestion pipelines, eval harness, data-to-story):** TypeScript primary; Python allowed for ML/data-science workflows.
> - **DB:** Postgres 16.
> - **Event bus:** NATS JetStream primary; Redpanda optional. Kafka acceptable for self-host.
> - **Search:** OpenSearch primary; Meilisearch acceptable for self-host with smaller scale.
> - **Auth:** OIDC + SAML (SSO); SCIM; passkeys. WorkOS/Auth0 as drop-in identity for hosted tier.
> - **AI orchestration:** Anthropic (primary), OpenAI, Google; model-tiering per task; on-device fallback (Ollama) for dev.
> - **Contract rule:** every polyglot boundary speaks gRPC (internal) or REST+OpenAPI (external). JSON Schema, Protobuf, and AsyncAPI are committed sources of truth. No service imports another service's source code. Generated clients are committed.
> - **Lock-in controls:** object storage abstraction over S3-compatible; AI adapter pattern; search adapter pattern; realtime adapter pattern; event-bus adapter pattern; **realtime gateway language** can be re-implemented in Rust without API changes.
> - **Self-host parity:** Docker Compose profile (single-node) and Helm chart (K8s) ship with first release; npm/pnpm, Go module proxy, and container-image mirrors for BD bandwidth.
> **Owner:** Principal architect.
> **Last reviewed:** 2026-07-29.

---

> **Purpose:** declare the technology choices for the platform, with rationale, alternatives considered, lock-in controls, and self-host/local-first notes.
> **Decision posture:** we choose proven, boring building blocks where possible, with deliberate innovation only where a feature requires it (canvas render, CRDT, MCP, AI orchestration).
> **Cross-references:** `01` (goals), `02` (NFRs), `04` (architecture), `05` (data), `07` (security), `08` (infra), `11` (compliance), `12` (BD context).

---

## 6.0 Stack Overview

| Layer | Choice | Backup / alternative |
|---|---|---|
| Frontend framework | Next.js + React (TypeScript) | Remix |
| Canvas / render engine | Custom engine on WebGL2 + WebGPU; Canvas2D fallback | Three.js for 3D helpers; Pixi for 2D |
| State / collaboration | Yjs CRDT, sub-documents per slide/theme/binding | Automerge |
| Layout engine | Yoga (flex) for auto-layout + custom constraint solver | Cassowary |
| Local store | IndexedDB + OPFS for media | SQLite via Wasm |
| Service worker | Workbox | none |
| **Backend — control plane** | TypeScript (Node 22 + Hono) | Go, Java/Spring |
| **Backend — realtime gateway** | Go (gorilla/websocket, NATS-backed) | Elixir/Phoenix, Rust (axum+tokio-tungstenite) |
| **Backend — CPU workers** | Go primary; Rust for hot paths | Rust everywhere, C++ |
| **Backend — AI/data workers** | TypeScript primary; Python for ML/eval | Python everywhere |
| API styles | REST external; GraphQL first-party reads; gRPC internal; MCP agent surface | none |
| Database | Postgres 16 | none (locked-in is fine; community/vendor both available) |
| Object storage | S3-compatible (AWS S3 / MinIO / R2) | any S3 API |
| Cache | Redis / Valkey | Memcached |
| Event bus | NATS JetStream (primary); Redpanda optional | Kafka, RabbitMQ |
| Search | OpenSearch | Meilisearch |
| Analytics OLAP | ClickHouse | DuckDB / Parquet |
| Graph projection | Postgres recursive CTEs for v1; dedicated graph store later | Neo4j (only if scale demands) |
| Workflow / jobs | Temporal | BullMQ (simpler) |
| Realtime | Self-hosted WebSocket gateway (NATS-backed) with managed fallback (Liveblocks/Ably) | LiveKit for low-latency stage |
| Auth | OIDC + SAML (SSO); SCIM; passkeys | Auth0 / WorkOS as drop-in identity for hosted tier |
| AI models | OpenAI, Anthropic, Google; open-weight local adapters | any provider behind adapter |
| Media tools | ffmpeg, gltf-transform, OpenDroneMap-lite | none |
| Sandboxing | iframe sandbox + capability tokens + CSP; gVisor for code blocks; Firecracker for plugins | nsjail |
| Observability | OpenTelemetry → Prometheus + Grafana Tempo + Loki | Honeycomb, Datadog (managed) |
| CI/CD | GitHub Actions + ArgoCD (self-host K8s) | none |
| IaC | Terraform + Helm; Pulumi for apps | none |
| Container runtime | containerd | Docker Engine |
| Monorepo | pnpm workspaces + Turborepo | Nx |

---

## 6.1 Frontend Stack

### 6.1.1 Next.js + React + TypeScript

- **Why:** strong SSR/SEO for viewer pages; mature ecosystem; fits admin, marketplace, docs sites; team familiarity.
- **Trade-offs:** not the leanest for a canvas-heavy editor — we split the editor app into a separate route with its own bundle and render pipeline.
- **Alternatives considered:** Remix (good SSR, smaller ecosystem), SvelteKit (less mature for admin), plain Vite + React Router (chosen path inside editor only).

### 6.1.2 Canvas engine

- **WebGL2 + WebGPU:** WebGPU is preferred where available (Chrome/Edge on Win/macOS, recent Safari); WebGL2 fallback elsewhere.
- **Why custom:** feature set (frames within frames, auto-layout, constraints, 3D, scroll-linked, scrollytelling, plugin composability) is not available in any existing open canvas engine at the breadth we need.
- **Reuse:** Three.js for 3D scenes; PixiJS concepts for 2D; glTF-Pipeline + gltf-transform for asset import.
- **Performance:** a dedicated layout worker produces render commands; the canvas thread only consumes commands and draws.

### 6.1.3 Yjs (CRDT) over Automerge

- **Yjs pros:** memory footprint, runtime perf, awareness protocol, ecosystem (y-websocket, y-indexeddb, y-webrtc).
- **Automerge pros:** cleaner JSON-shaped API, good correctness story.
- **Why Yjs:** for live collaboration with rich text, vector paths, and 10k+ element decks, Yjs is more performant today; Automerge's autosize / memory characteristics risk large-deck regressions. Benchmark reserved in `04` OD-ARCH-05.
- **Sub-document sharding:** we use sub-docs per slide, theme, and binding group so simultaneous large edits don't load the entire deck into one CRDT.

### 6.1.4 Auto-layout

- Yoga for flexbox-compatible layout (auto-layout frames).
- Custom constraint solver for Figma-style pinning.
- Custom bezier curve evaluator for animations.

### 6.1.5 Frontend tooling

- **Bundler:** Vite for the editor app; Next.js for SSR surfaces.
- **Linting/format:** ESLint + Prettier + a custom a11y lint.
- **Testing:** Vitest + Playwright + axe.
- **i18n:** Lingui or FormatJS for ICU MessageFormat.

---

## 6.2 Backend Stack — Polyglot by Tier

Domio's backend is intentionally split across four tiers. The split exists because no single language is the right tool for every workload in this product, and the cost of cross-language contracts is now smaller than the cost of forcing every workload into one language. The hard rule below keeps the polyglot cost bounded.

### 6.2.0 The Contract Rule (non-negotiable)

1. Every polyglot boundary speaks **gRPC** for internal traffic and **REST + OpenAPI** for external traffic.
2. **Protobuf** definitions are committed in `/proto/`. **OpenAPI** is committed in `/openapi/`. **JSON Schema** is committed in `/schema/`.
3. Generated clients for TS, Go, Python, and Rust are **committed** to the monorepo and never re-implemented by hand.
4. **No service imports another service's source code.** Service contracts are the only allowed coupling.
5. Schema changes go through **Buf** breaking-change checks (CI) and are backwards-compatible within a major version.
6. Cross-service feature flags and experiments travel through the same shared event bus (NATS JetStream), not through ad-hoc calls.

This rule is what lets us re-implement the realtime gateway in Rust next year without touching the control plane.

### 6.2.1 Control plane — TypeScript on Node 22 + Hono

- **Scope:** HTTP API, MCP server, gRPC service implementations, workflow orchestrators (Temporal workers in TS), billing, RBAC, audit, collaboration session manager, marketplace, admin.
- **Why TS here:** language parity with the editor, MCP, CLI, SDK, and AI orchestrator; shared types via the monorepo (`packages/schema`); fastest iteration on product surfaces; largest hiring pool in Bangladesh/South Asia; richest AI SDK ecosystem (Anthropic, OpenAI, MCP, Vercel AI SDK, prompt-template libs).
- **Runtime:** Node 22 LTS, Hono for HTTP, `@grpc/grpc-js` for outbound gRPC, Prisma or Drizzle for Postgres access (chosen in §6.3.1.1).
- **Non-goals for the control plane:** no CPU-bound loops longer than ~50ms; no large-deck export rendering; no media transcoding.
- **Alternatives considered:**
  - **Go** — rejected as the primary control plane language because of the type-sharing cost with the editor and MCP surfaces. However, Go is the chosen realtime-gateway language (see §6.2.2), so Go expertise in the org is required regardless.
  - **Java/Spring Boot** — strong for transactional control plane; rejected because of slower iteration on AI features and weaker DX for canvas/CRDT type sharing.
  - **.NET / ASP.NET Core** — strong technically; rejected because of weakest fit with the Bangladesh hiring pool and weakest type-sharing story with the TypeScript editor.
  - **Elixir/Phoenix** — excellent concurrency; rejected because of small AI/SDK ecosystem and smallest hiring pool.
  - **Rust** — too slow for control-plane iteration speed; reserved for CPU workers.
  - **Python/FastAPI** — good for AI; rejected as primary control plane because of weaker static typing and slower runtime.

### 6.2.2 Realtime gateway — Go

- **Scope:** WebSocket gateway for CRDT presence, stage fan-out, audience participation channels, presenter session signaling, parked client retry logic.
- **Why Go here:** the gateway is connection-bound, not CPU-bound. Go's goroutine model gives ~10× lower memory per concurrent connection than Node; sustained fan-out at 25k+ audience participants per session is the canonical Go workload. Strong standard library for HTTP/2, gRPC, and TLS. Same language as our CPU workers reduces hiring scope.
- **Runtime:** Go 1.22+, `gorilla/websocket` or `nhooyr.io/websocket`, `grpc-go`, NATS Go client.
- **Failure modes that justify Go over Node for this tier:**
  - Long-lived tens-of-thousands of WebSocket connections per process with presence + stage signaling.
  - Tight memory budget per process to maximize tenant density per node.
  - The gateway is stateless, so cold-start cost is irrelevant — Go's startup time does not matter.
- **Adapter:** the gateway exposes a `RealtimeAdapter` interface so a managed fallback (Liveblocks/Ably) can be swapped in for hosted tier customers that prefer it. The TS control plane never imports Go code; it only talks gRPC.
- **Alternative considered:** Rust (axum + tokio-tungstenite) is faster still but slower to iterate; kept as an escape hatch in the contract rule.

### 6.2.3 CPU-bound workers — Go primary, Rust for hot paths

- **Scope:** video transcode orchestration, glTF/STEP conversion, large-deck export rendering (server-side frame composition), formula sandbox host (QuickJS bindings), image processing, font subsetting, PDF/PPTX generation at scale, AI inference preprocessing.
- **Default language:** **Go**. Same as the gateway so the team has one systems-language toolchain.
- **Escape hatch:** **Rust** when a worker needs raw throughput or memory determinism (e.g., a future 4K video processor at 60 FPS, or a glTF converter that must hold a 2 GB mesh in memory predictably). Rust workers are allowed but require an ADR and a budget for the additional hire/freelance cost.
- **Banned:** doing CPU-bound loops longer than 100 ms in the control plane (Node). Move to a worker.

### 6.2.4 AI/data workers — TypeScript primary, Python allowed

- **Scope:** model adapters, prompt-template registry, ingestion pipelines (PDF/DOCX/Notion), data-to-story analysis, eval harness, semantic index builders.
- **Default language:** **TypeScript** for parity with the AI orchestrator and the rest of the product.
- **When Python is allowed:** eval harnesses, dataset preparation, and any worker that needs pandas/numpy/scikit-learn/torch. Python workers live in their own service, talk to the rest via gRPC, and never reach into Postgres directly — they go through the control plane.
- **Banned:** hard-coding provider SDK calls outside the adapter pattern. Every model call goes through `packages/ai-adapters`.

### 6.2.6 Workflow / queues

- **Temporal** for long-running workflows (publish, large exports, batch AI, connector setup). Temporal workers run in the control plane (TS) and dispatch CPU-bound steps to Go/Rust workers via gRPC.
- **BullMQ on Redis** for short-lived jobs.
- **NATS JetStream** as the durable event bus.

### 6.2.7 Realtime gateway — Go (see §6.2.2)

- **Self-hosted:** NATS-backed WebSocket gateway written in Go, with edge nodes.
- **Managed fallback option:** Liveblocks or Ably, abstracted behind a `RealtimeAdapter`.
- **Stage fan-out:** at scale (>5k audience per session), WebRTC SFU (LiveKit) for low-latency stage; or one-way SSE for non-interactive viewers.

### 6.2.8 Connector workers — TypeScript

- TypeScript workers; each source has its own adapter interface; secrets pulled from Vault at run time; per-tenant concurrency quotas.
- Credential rotation is supported via Vault leases.
- **Connector runtime is not in the hot path of stage fan-out**, so Node is acceptable here. If a specific connector (e.g., BigQuery streaming, Snowflake high-throughput) needs it, that worker is moved to Go.

---

## 6.3 Data Stores (selection rationale)

### 6.3.1 Postgres 16

- **Why:** strict consistency, mature, JSONB + GIN, RLS, partitioning, logical replication, ecosystem.
- **Lock-in controls:** schema migrations are reversible; data export is full SQL + JSON; no PG-specific features required beyond JSONB and partial/GIN indexes (which exist in any major fork).
- **Alternatives:** MySQL (weaker JSONB and partitioning), CockroachDB (overkill early), SQLite (great for self-host single-node read paths; used as cache).

### 6.3.2 S3-compatible object storage

- **Choices:** AWS S3 / Cloudflare R2 / MinIO (self-host).
- **Lock-in controls:** SDK abstracts bucket, multipart, presigned URLs; data export is portable.

### 6.3.3 Redis / Valkey

- **Use:** ephemeral state, presence, idempotency, rate-limit counters.
- **Lock-in controls:** none — most replacements work.

### 6.3.4 ClickHouse

- **Why:** analytics at scale with low storage cost and high compression.
- **Lock-in controls:** column-oriented SQL, easy to migrate to Parquet + DuckDB.

### 6.3.5 OpenSearch

- **Why:** full-text + vector (knn) in one engine.
- **Alternatives:** Meilisearch (lighter, less vector maturity), pgvector (lower ops, lower scale).

### 6.3.6 Graph projection

- **Initial:** Postgres recursive CTEs + a `knowledge_edges` table.
- **Later (if scale demands):** Neo4j or Memgraph with a CDC pipeline from Postgres.

### 6.3.7 NATS JetStream vs Redpanda vs Kafka

- **NATS JetStream:** lightweight, self-host friendly, easy multi-region, no ZK; sufficient for most events.
- **Redpanda:** Kafka API, no ZK, single binary, faster.
- **Kafka:** heavy ops; familiar.
- **Decision:** NATS JetStream for primary; Redpanda considered for very-high-volume analytics events.

---

## 6.4 Contracts — The Only Allowed Coupling

The contract rule (§6.2.0) means every cross-tier boundary is described by a committed artifact, and every service consumes its dependencies through generated clients. There is no shared business-logic library across language boundaries.

- **Protobuf** in `/contracts/proto` is the source of truth for **internal gRPC** calls between services (control plane ↔ realtime gateway, control plane ↔ workers).
- **OpenAPI** in `/contracts/openapi` is the source of truth for **external REST** and **public SDK** generation (TS, Python, Go, Ruby). First-party web/editor apps may use the generated TS client.
- **JSON Schema** in `/contracts/schema` is the source of truth for the **deck schema**, **component prop schemas**, **AI tool args**, and **MCP resources**. These are referenced from both OpenAPI and Protobuf.
- **AsyncAPI** in `/contracts/asyncapi` describes event topics and payloads.
- **Buf** enforces breaking-change detection in CI; OpenAPI is linted with Spectral; JSON Schema is linted with a custom rule set.
- **Generated clients are committed** (`packages/sdk-ts`, `services/*/gen/`) — never re-implemented by hand.
- **Schema evolution** is backwards-compatible within a major version. Breaking changes require a major bump, an ADR, and a documented migration window.

---

## 6.5 AI Stack

- **Model adapters:** OpenAI, Anthropic, Google, plus an open-weight adapter (Ollama or vLLM) for self-host and sensitive deployments.
- **Orchestration:** in-house orchestrator wraps model calls with:
  - schema-validated tool calls;
  - prompt-injection detection (#229/#234/extension);
  - redaction of secrets in context;
  - citation enforcement (#109);
  - confidence scoring (#238).
- **Streaming** via server-sent events or WebSocket for live UX.
- **Caching:** exact prompt + context-hash cache; semantic cache for layout proposals.
- **Cost controls:** per-tenant token budget, per-feature budget, model-tier choice per task.
- **Local:** an "AI in this workspace only" mode that disables outbound calls.

---

## 6.6 Media & 3D Tooling

- **ffmpeg** for transcode, trim, captions extraction.
- **gltf-transform** for GLB optimization and Draco/Meshopt compression.
- **OpenDroneMap-lite** or similar for CAD → glTF in self-host; managed service optional.
- **Texture compression:** KTX2 + Basis Universal.
- **Captions:** Whisper (self-host) or provider API.

---

## 6.7 Sandboxing

- **iframe sandbox + CSP** for live embeds (#81) and code blocks (#82).
- **gVisor** for server-side code execution if needed (default: deny; opt-in for enterprise).
- **Firecracker microVMs** for plugins that demand OS-level access (rare; required to opt-in for security review).
- **Plugin SDK** enforces capability tokens; no plugin reads cookies or tokens beyond granted scopes.

---

## 6.8 Identity

- **OIDC + SAML** for SSO.
- **SCIM** for provisioning.
- **Passkeys (WebAuthn)** for end-user auth.
- **Session cookies:** HttpOnly, Secure, SameSite=Lax.
- **Token lifetimes:** short-lived access (5m), long-lived refresh (30d), revocable.
- **Drop-in option:** WorkOS or Auth0 for hosted tier to accelerate enterprise onboarding; the same internal `IdentityAdapter` is implemented for both.

---

## 6.9 Observability

- **OpenTelemetry** SDKs across all services; OTLP exporter.
- **Prometheus** for metrics, **Tempo** for traces, **Loki** for logs.
- **Sentry** for frontend error tracking.
- **Synthetic checks** at 1-minute cadence on critical paths.

---

## 6.10 CI/CD

- **GitHub Actions** for build, test, scan.
- **ArgoCD** for GitOps deployment to K8s (self-host and managed K8s).
- **Branch protection:** required checks (lint, type, unit, contract, axe, threat-model diff, schema migration lint).
- **Deployment:** blue/green with progressive canary; auto-rollback on SLO regression.

---

## 6.11 SDKs and CLIs

- **TS SDK** generated from OpenAPI; first-class for the editor, MCP client, and the control plane itself.
- **Go SDK** generated from OpenAPI; first-class for the realtime gateway, CPU workers, and the `deckctl` CLI.
- **Python SDK** for data/ML workflows and eval harnesses.
- **Ruby SDK** generated from OpenAPI for marketplace integrations.
- **deckctl** CLI written in Go (single binary, easy distribution, no Node runtime requirement on CI hosts); supports `deckctl deploy --from-yaml`, `deckctl mcp`, `deckctl lint`, `deckctl diff`.
- **deckctl plugins** for editor integrations.
- **MCP server** as a TypeScript binary distribution (`domio-mcp`) and a hosted gateway.

---

## 6.12 Monorepo, Dependency Policy

### 6.12.1 Monorepo structure (polyglot)

```
/apps
  /web                Next.js app
  /editor             Editor app (Vite)
  /marketplace        Marketplace portal
  /admin              Admin console
  /docs               Docs site
  /mcp-gateway        MCP server (TS)
/services
  /control-plane      TS + Hono (HTTP + gRPC server)
  /realtime-gateway   Go (NATS-backed WebSocket)
  /workflow           TS + Temporal workers
  /identity           TS (OIDC, SAML, SCIM, passkeys)
/workers
  /render             Go (primary) / Rust (hot path)
  /media              Go (ffmpeg orchestration, gltf-transform)
  /connectors         TS (per-source adapters)
  /ai                 TS (primary) / Python (ML/eval)
  /analytics-ingest   TS
  /search-indexer     TS
  /export             Go (PDF/PPTX/GIF/Video at scale)
/packages
  /schema             Deck schema, JSON Schemas (TS source-of-truth)
  /canvas             Canvas renderer
  /yjs-shared         CRDT helpers
  /tokens             Design tokens
  /ui                 Shared UI primitives
  /sdk-ts             TypeScript SDK
  /sdk-go             Go SDK
  /sdk-py             Python SDK
  /cli                deckctl (Go single-binary CLI preferred for distribution)
/contracts
  /proto              Protobuf (committed source-of-truth)
  /openapi            OpenAPI (committed source-of-truth)
  /schema             JSON Schema (deck, component props, AI tool args)
/infrastructure
  /terraform
  /helm
  /docker
/docs
  /super-docs
  /domain-docs
```

### 6.12.2 Dependency policy

- **Lockfiles committed.**
- **Renovate/Dependabot** with weekly batches and security PRs within 24h.
- **SCA in CI** (Snyk/Trivy/GitHub Advisory).
- **License check:** allow MIT, Apache-2.0, BSD-2/3, ISC, MPL-2.0, LGPL (with note). Disallow AGPL without legal review (or only for runtime-isolated dependencies).
- **Banned:** any package without a maintained release in >24 months (allowlist exceptions for crypto/auth libs).
- **Versioning:** semantic; no breaking changes in minor/patch; breaking requires major + changelog.

---

## 6.13 Lock-in Controls Summary

| Choice | Lock-in risk | Control |
|---|---|---|
| Postgres | low | reversible migrations + portable SQL |
| S3 API | low | abstraction layer |
| OpenSearch | medium | vector fallback to pgvector |
| ClickHouse | medium | column store, export to Parquet/DuckDB |
| NATS | low | Kafka API alternative (Redpanda) |
| Yjs | medium | exportable CRDT log + reconstructed schema |
| OpenAI/Anthropic | medium | adapter pattern; local open-weight option |
| Next.js | medium | editor split out; viewer pages can move to any Node SSR |
| Temporal | medium | BullMQ option for simple flows |
| WorkOS/Auth0 (managed) | medium | drop-in behind internal adapter |
| **TypeScript control plane** | medium | gRPC + OpenAPI contracts; control plane logic re-implementable in Go/Java without API change |
| **Go realtime gateway** | low | gRPC contract; re-implementable in Rust/Elixir without API change |
| **Go CPU workers** | low | gRPC contract; re-implementable in Rust without API change |
| **Rust hot-path workers (if added)** | medium | ADR required; bounded scope |

---

## 6.14 Self-Host / Local-First Options

- **Docker Compose** single-node profile: Postgres, object storage (MinIO), NATS, OpenSearch (optional), control plane (TS), realtime gateway (Go), workers (Go/TS). Suitable for SMB and regulated industries.
- **Kubernetes** reference architecture: Helm chart with sane defaults; one Deployment per language-tier so each can scale independently.
- **Local development:** a single command brings up the stack; deterministic seeds.
- **Mirror configuration for Bangladesh bandwidth:** `pnpm` mirror, `GOPROXY` mirror, container registry mirror, NPM mirror. Documented in `12-bangladesh-development-context.md` §12.6.
- **AI in self-host:** open-weight adapter (Ollama / vLLM) bundled; cloud provider optional.
- **Offline editor mode:** already in feature list (#21, #137). Engine is the same; sync optional.
- **Data export:** documented and tested.

---

## 6.15 Decisions Log

| ID | Decision | Rationale | Alternative considered |
|---|---|---|---|
| D-STK-01 | **Polyglot backend** with TS control plane, Go realtime gateway, Go/Rust CPU workers, TS/Python AI workers. Hard contract rule: gRPC + OpenAPI + committed generated clients; no service imports another's source code. | Each tier uses the language best suited to its workload; type sharing preserved via Protobuf/JSON Schema; escape hatches preserved per tier | Monolithic TS backend — rejected because of memory/perf cost in realtime and CPU workers; pure-Go backend — rejected because of type-sharing cost with editor and MCP |
| D-STK-02 | Yjs over Automerge | Performance today | Automerge — benchmark fallback |
| D-STK-03 | Postgres | Standard, strong | MySQL — weaker JSONB |
| D-STK-04 | NATS JetStream as primary bus | Lightweight, self-host friendly | Kafka — heavier ops |
| D-STK-05 | ClickHouse for analytics | Best perf/cost | Druid — heavier |
| D-STK-06 | OpenSearch for search + vector | One engine | Meilisearch + pgvector — split |
| D-STK-07 | Temporal for long workflows | Mature, durable | BullMQ — used for short jobs |
| D-STK-08 | Self-host realtime gateway in Go | Cost, control, low memory per connection | Managed-only — risk and cost; Node realtime — rejected for memory/perf at scale |
| D-STK-09 | Custom canvas engine | Required feature breadth | Three.js + DOM — insufficient |
| D-STK-10 | Multi-provider AI adapters | Vendor resilience | Single provider — fragile |
| D-STK-11 | TypeScript on Node 22 + Hono for control plane | Type sharing with editor/MCP/CLI/SDK; iteration speed; BD hiring pool | Go, Java/Spring, .NET, Elixir, Rust, Python — see §6.2.1 |
| D-STK-12 | Go for realtime gateway | ~10× lower memory per WebSocket; canonical Go workload | Elixir, Rust — kept as escape hatches |
| D-STK-13 | Go primary, Rust escape hatch, for CPU workers | Go keeps systems-language toolchain count to one; Rust reserved for raw throughput/memory determinism via ADR | Rust everywhere — too slow to iterate; Node — too slow for CPU loops |

---

## 6.16 Open Decisions

| ID | Decision | Owner |
|---|---|---|
| OD-STK-01 | WebGPU-only when available vs parallel WebGL2 always. | Editor lead |
| OD-STK-02 | Managed realtime (Liveblocks/Ably) vs self-hosted Go gateway at first public beta. | SRE |
| OD-STK-03 | Passkey default-on vs opt-in. | Security |
| OD-STK-04 | Yjs vs Automerge final benchmark threshold. | Editor lead |
| OD-STK-05 | Self-host single-node default user/role: admin or self-service? | Self-host lead |
| OD-STK-06 | ORM for the control plane: Prisma vs Drizzle vs raw SQL/pg. | Control-plane lead |
| OD-STK-07 | When to introduce the first Rust CPU worker (deferred until profile data justifies). | Platform lead |
| OD-STK-08 | When to add Python as the default AI worker language for ML workflows. | AI lead |

---

_End of 06-technology-stack.md._