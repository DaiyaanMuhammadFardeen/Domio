# Domio — Project status

> **Ground truth:** this document is reconstructed from the code on `master`
> (branch head `649d3f7`, 2026-08-14), not from any planning doc.
> **Last regenerated:** 2026-08-16.
>
> For per-phase planning context (spec, DoD, verification), see
> `docs/development_phases/` — each phase doc carries a banner pointing
> here.

---

## 1. Headline numbers (live, from the tree)

| Dimension                | Count                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| Apps                     | **11**                                                                                               |
| Services                 | **84**                                                                                               |
| Workers                  | **23**                                                                                               |
| Packages                 | **38**                                                                                               |
| Protobuf contracts       | **29**                                                                                               |
| OpenAPI specs            | **63**                                                                                               |
| JSON Schemas             | **60+**                                                                                              |
| MCP tool specs           | **8**                                                                                                |
| Postgres migrations      | **178**                                                                                              |
| CI workflows             | **30**                                                                                               |
| ARDs accepted            | **8** (0001–0008)                                                                                     |
| Phase tags on master     | `phase-18-contracts-v1.0.0`, `phase-19-contracts-v1.0.0`                                              |
| Commits on master        | 315                                                                                                  |
| Code volume              | **3,130** TS/TSX, **206** Go, **29** proto, **178** SQL                                              |
| Date range               | 2026-07-29 → 2026-08-14 (≈ 2 weeks of active development)                                             |

---

## 2. Architecture contract rules

- **Polyglot, contract-first.** Go for the realtime gateways (Node's per-WS
  memory footprint is the gating constraint at audience scale).
  TypeScript everywhere else for type sharing with the editor / MCP / SDK.
  Rust / Python are escape hatches per ADR.
- **gRPC internal, OpenAPI external, GraphQL for the dashboard surface,
  MCP for the agent surface.**
- **Generated clients are committed.** No service imports another
  service's source code.

---

## 3. Phase status (live)

Reconstructed from the actual code + tags + recent commits. Phase docs in
`docs/development_phases/` are planning context only and **must not** be
read as a status report — they pre-date the code on `master`.

| Phase                 | What it covered                                                                                          | Status (live)                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **Phase 0**           | Repo, contracts, dev env                                                                                 | **Shipped** (init commit, planning docs as code)                 |
| **Phase 1**           | Observability, CI/CD, infra baseline                                                                     | **Shipped** (Grafana, OTel, SLOs, oncall.yaml, CI workflows)     |
| **Phase 2**           | Deck schema + scene graph (ADR-0004)                                                                     | **Shipped** (`contracts/schema/v1/deck.schema.json`, `scene-graph.schema.json`) |
| **Phase 3**           | Canvas editor MVP                                                                                        | **Shipped** (`apps/editor`, `@domio/canvas`)                     |
| **Phase 4**           | Realtime collab + CRDT                                                                                   | **Shipped** (`@domio/yjs-shared`, `services/realtime-gateway/`, `services/participant-ws-gateway/`, `tests/convergence/`) |
| **Phase 5**           | Persistence, versioning, branches                                                                       | **Shipped** (branch/checkpoint/merge/diff protos, services/registry, services/merge-requests) |
| **Phase 6**           | Components + templates                                                                                   | **Shipped** (component-registry, templates, `component-package-v1.schema.json`) |
| **Phase 7**           | Theming + brand + design tokens                                                                          | **Shipped** (services/theme, services/brand, design-token-v1, brand-extract worker) |
| **Phase 8**           | Live data + interactive charts                                                                           | **Shipped in flight** (connector-framework, scenario-manager, chart-binding schema; some charts marked fixme in e2e) |
| **Phase 9**           | Animation + transition system                                                                            | **Shipped** (keyframes-svc, animation-runtime, easing, magic-move schema) |
| **Phase 10**          | Prototyping + interactivity                                                                              | **Shipped** (prototype-runtime, prototype-recorder, hotspots, branching, conditional rules, calculators) |
| **Phase 11**          | 3D + motion + rich media                                                                                 | **Shipped** (model-asset schema, shader-registry, video-pipeline, ar-sessions, cad-jobs) |
| **Phase 12**          | AI copilot foundation                                                                                    | **Shipped** (ai-orchestrator, ai-adapters, model-adapter package, prompt-registry) |
| **Phase 13**          | Agentic + programmable interfaces (**MCP**)                                                              | **Shipped** (services/mcp-server in Go; 8 MCP tool JSON Schemas; CLAUDE.md-style wiring) |
| **Phase 14**          | Sharing + publishing + deck-as-website                                                                   | **Shipped** (share-api, deep-link-svc, viewer-app, kiosk mode, expiry, signed-link-token) |
| **Phase 15**          | Presenter experience                                                                                     | **Shipped** (apps/presenter, phone-pairing, presenter-session, Grafana phase-15-presenter dashboard) |
| **Phase 16**          | Audience participation                                                                                  | **Shipped** (polls, Q&A, quiz, word-cloud, reactions, nav-vote, sentiment, raise-hand, attendance-logger, feedback-collector, moderation-{blocklist,ml}) |
| **Phase 17**          | Analytics + engagement intelligence                                                                      | **Shipped** (event-ingest, clickhouse-loader, analytics-warehouse, sessionization, viewer-identity, heatmap-generator, ab-{assignment,measurement,statistics}, crm-sync, notification-dispatcher, live-analytics, team-analytics, creator-analytics, benchmark; apps/dashboard with 16 pages; phase-17-analytics Grafana; PagerDuty phase17.yaml; slo/phase-17.md; dashboards/crm/cohorts) |
| **Phase 18**          | Collaboration + workflow                                                                                | **Shipped** — `phase-18-contracts-v1.0.0` tag on master. Comments, approvals, slide-level assignments, suggestion mode, merge-requests, library, library-propagator, guests, calendar, meeting-integration, task-manager, expiry-scanner. |
| **Phase 19**          | Marketplace                                                                                             | **Shipped** — `phase-19-contracts-v1.0.0` tag. apps/marketplace-web, apps/creator-console, marketplace service, marketplace-preview, billing (subscription-billing, refund-processor, payout-executor, fx-rate-cacher, kyc-{poller,rescreen}). |
| **Phase 20**          | Security + enterprise                                                                                   | **Mostly shipped** as Phase 20.5 — see §4. Full Phase 20 enterprise additions deferred. |
| **Phase 20.5**        | Beta security hardening (B1–B6)                                                                          | **Locked + Beta-ready shipped** (permission-engine ABAC, audit, dlp-warn, rate-limit, web-security); **Public-beta rung** needs `SNYK_TOKEN` + `ZAP_AUTH_HEADER` secrets. |
| **Phase 21**          | Novel + frontier features                                                                               | **Mostly shipped** — recording-orchestrator, translation-pipeline, stt/mt/tts-providers. Some frontier features (gaze-guided highlighting, gesture control, kiosk-mgmt, knowledge-graph, cross-deck knowledge graph, podcast-svc, ambient-composer, sensor-svc, listener-svc, broadcast-svc, negotiation-svc, inheritance-svc, provenance-svc, living-svc, timeline-svc) referenced in phase-22-beta are not yet present as services on master — frontier backlog remains. |
| **Phase 22-beta**     | Performance + reliability + GA gate (P21-independent subset)                                              | **Partially shipped** — G1 perf, G2 observability, G3 load & chaos were landed in commit history (commit `efdfccb` G1, `91bbbf2` G2, `aacf983` G3, all 2026-08-09). Subsequent commits (`p22-load.yml`, `chaos.yml`) iterate on it. P22b (P21-dependent subset) is the remaining frontier perf piece and is documented in `docs/p22b/gap-inventory.md`. |
| **Phase 22 (full)**   | GA                                                                                                      | **In planning / partial** — `phase-22-polish-scale-hardening-ga.md` describes the full phase; gates on P22b + full P21. |

### Phases referenced in code but not listed above

- **Phase 17 streaming variants** — `phase17-services-build.yml` workflow +
  `phase17-services-build` job in CI for the analytics-plane services.

---

## 4. The Phase 22-beta gap (`docs/p22b/gap-inventory.md`)

The `p22b/` directory carries a single **`gap-inventory.md`** that
catalogs work deferred from `phase-22-beta` because it depends on
frontier features from Phase 21. The frontier pieces referenced are not
yet shipped as services on master:

| Referenced (not yet on master) | Required by                          |
| ------------------------------ | ------------------------------------ |
| `timeline-svc`                  | F205 presentation-state timeline     |
| `living-svc`                    | F206 living documents                |
| `sensor-svc`                    | F207 gaze-guided highlighting       |
| `gesture-svc`                   | F208 gesture control                 |
| `listener-svc`                  | F209 voice-triggered slide states / F214 AI meeting listener |
| `broadcast-svc`                 | F213 sub-second co-presenter fan-out |
| `knowledge-graph-svc`           | F219 cross-deck knowledge graph     |
| `negotiation-svc`               | F211 two-way slides                  |
| `inheritance-svc`               | F212 deck inheritance trees          |
| `provenance-svc`                | F215 component provenance            |
| `podcast-svc`                   | F216 deck-to-podcast                 |
| `ambient-composer`              | F210 ambient boardroom mode          |
| `kiosk-mgmt-svc`                | F218 kiosk mode at scale             |

> **Important:** these are not yet present as services. The earlier CV
> summary I wrote referenced them because they were *promised* in
> `phase-22-beta-hardening.md`'s "deferred to P22b" section. The actual
> master does not contain them.

---

## 5. What is reliably shipped (defensible for a CV)

The following are concretely present on `master` today:

### Realtime / collab
- `services/realtime-gateway/` (Go) — presence + WS fan-out
- `services/participant-ws-gateway/` (Go)
- `services/edge-pubsub/`, `services/collab/`
- `packages/yjs-shared` + `yjs@13.6.27` in editor
- `tests/convergence/` — CRDT scenarios

### MCP / agent surface
- `services/mcp-server/` (Go production, TS stub kept for compat)
- `contracts/mcp/` — 8 tool specs + prototyping.tools.json
- `docs/mcp-server.md`

### Analytics plane (Phase 17)
- 14+ services + ClickHouse warehouse + Kafka loader
- `apps/dashboard` with **16** pages: `ab, alerts, benchmarks, cohorts,
  crm, csat, deck/[id], export, funnel, graph, heatmap, heatmap/element,
  kpis, live, overview, sentiment, sessions, sessions/[id], team`
- `slo/phase-17.md`, Grafana `phase-17-analytics.json`, PagerDuty
  `phase17.yaml`

### Security (Phase 20.5)
- ABAC `brandLockRegionsPolicy`, `restrictedDataSharePolicy`
- Audit (`services/audit/`)
- DLP (`packages/dlp-warn/`)
- Rate-limit + circuit breaker (`packages/rate-limit/`)
- Web security (`packages/web-security/`)
- `security.yml` orchestrates SAST/SCA/DAST

### Front-end apps
- 11 apps, Next.js 15.1.3 + React 19.0.0
- `dashboard` is the largest with **16** pages
- `admin-console` has **32** routes
- All apps share `@domio/ui`, `@domio/canvas`, `@domio/schema`,
  `@domio/yjs-shared`, `@domio/web-security`, `@domio/i18n`,
  `@domio/observability`, `@domio/analytics-sdk`

### CI / CD
- **30** GitHub Actions workflows
- Master orchestrator + reusable workflows in `.github/workflows/reusable/`
- CodeQL + Semgrep + Trivy + Snyk + ZAP
- axe, a11y-i18n, smoke, e2e, load (k6), chaos, perf-nightly, tracing-coverage

---

## 6. What I got wrong earlier (and why)

The first time I summarised this project for you, I trusted the README +
docs without checking the code. The README claimed "Phase 17 complete."
The actual code is several phases further (Phase 17 + 18 + 19 + 20.5 +
parts of 22-beta shipped, plus the Phase 13 MCP server). Some frontier
features from Phase 21 referenced in `phase-22-beta-hardening.md` are
not yet present as services on master.

This `STATUS.md` is the only source of truth for "what is shipped" —
do not trust any other doc without re-checking the code.

---

## 7. Where to read more

| Topic                | File                            |
| -------------------- | ------------------------------- |
| Layered topology     | `docs/ARCHITECTURE.md`          |
| Services catalog     | `docs/SERVICES.md`              |
| Apps catalog         | `docs/APPS.md`                  |
| Workers catalog      | `docs/WORKERS.md`               |
| Packages catalog     | `docs/PACKAGES.md`              |
| Contracts catalog    | `docs/CONTRACTS.md`             |
| CI / workflows       | `docs/CI.md`                    |
| Infrastructure       | `docs/INFRASTRUCTURE.md`        |
| Observability + SLOs | `docs/OBSERVABILITY.md`         |
| Security model       | `docs/SECURITY.md`              |
| Front-end apps       | `docs/FRONTEND.md`              |
| Phase planning docs  | `docs/development_phases/`      |
| ADRs                 | `docs/adr/`                     |
