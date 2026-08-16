## 📜 Planning-context banner

---

> ## ⚠️ Planning context — not a status report
>
> This is the original planning doc for this phase. The **live status of
> every phase** (what's actually shipped today on `master`) lives in
> **[`../../STATUS.md`](../../STATUS.md)**. Do not read this file as a
> status report — read it as the original spec that drove the work.
>
> See **[`../../CONSOLIDATED.md`](../../CONSOLIDATED.md)** for the full
> doc map.

---

# Phase 08 — Live Data & Interactive Charts

> **Phase:** 08 of 22
> **Name:** Live Data & Interactive Charts
> **Stream:** B (Data & motion) — runs in parallel with Phase 06 (Components), Phase 07 (Theming), Phase 09 (Animation), Phase 10 (Prototyping), Phase 11 (3D & media), Phase 12 (AI Copilot), Phase 13 (Agentic)
> **Critical path?** No — runs as a **deepening** track once Phase 05 (Persistence, versioning, branches) lands.
> **Owner:** Stream B tech lead + 4–6 engineers
> **Status:** Not started (phase doc only)

**Intent.** Turn Domio slides from static assets into live, queryable, scenario-aware dashboards. Connect the editor to ten classes of external data sources (Sheets, Excel, Airtable, Notion, Postgres, MySQL, BigQuery, Snowflake, REST, GraphQL) through a single connector framework, run every chart/table/formula through a rate-limited query gateway, evaluate spreadsheet-style formulas in a sandbox, ship the full 14-type chart library with mid-presentation interactivity, and prove on a stage that "the numbers are alive" with cross-chart filtering, what-if sliders, scenario switcher, animations tied to data, threshold alerts, localization, embedded dashboards, freshness SLAs, and credential-isolated viewer access. This is the "killer differentiator" that decouples Domio from PowerPoint and Keynote.

---

## 1. Goals

1. **Author connected decks.** Any chart, table, KPI callout, or formula field in the editor can be bound to one of ten connector types via OAuth or credentialed flows, validated by a ping, and persisted as a reusable `data_source`.
2. **Charts are alive on stage.** In presenter mode and the published viewer, every bound widget can be hovered, drilled, filtered, refreshed on a policy, animated on entry, and re-styled on threshold breach — without leaving the slide.
3. **Spreadsheet-grade computed fields.** A sandboxed formula engine with `A1`-style references, aggregation functions, cross-dataset `LOOKUP`, typed errors, and incremental recompute drives what-if sliders with ≤ 100 ms latency.
4. **Scenario-aware rendering.** Authors define Base / Bull / Bear (or any number of named scenarios); presenters toggle between them and every binding, filter, slider, annotation, and threshold rule swaps to the right snapshot within O(1).
5. **Cross-chart filtering & dashboard behavior inside a slide.** Clicking a region on Chart A filters every chart on the slide that opted in, with a "clear filter" chip and scenario-scoped state.
6. **Secure, viewer-isolated access.** Audience viewers see the chart but never a raw credential; tokens are opaque, single-use for mutations, and short-lived (≤ 5 min); the audit log records every viewer-issued query.

---

## 2. Scope

**Feature numbers in scope (per `feature-list.md`):**

| Feature | Name                                  | Notes                                                                                                                   |
| ------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| #48     | Live data connections                 | Sheets, Excel, Airtable, Notion, Postgres, MySQL, BigQuery, Snowflake, REST, GraphQL                                    |
| #49     | Charts alive during presentation      | Hover, drill, legend toggle, brush zoom                                                                                 |
| #50     | Full chart library                    | 14 types: bar, line, area, pie, scatter, funnel, sankey, treemap, heatmap, waterfall, gauge, radar, candlestick, bullet |
| #51     | Data refresh on stage                 | Eager/lazy/manual/on-interval policy per binding                                                                        |
| #52     | Cross-chart filtering                 | Slide-scoped pub/sub                                                                                                    |
| #53     | What-if sliders                       | 100 ms recompute target                                                                                                 |
| #54     | Formula engine                        | Spreadsheet-style AST, sandboxed                                                                                        |
| #55     | Data tables                           | Sort, paginate, conditional format, sparkline                                                                           |
| #56     | Mock data generator                   | Seeded, distributions, "mock" badge                                                                                     |
| #57     | Scenario switcher                     | Snapshot overlays, DAG inheritance                                                                                      |
| #58     | Number ticker & animated chart builds | Tweened on entry / data change                                                                                          |
| #59     | Data annotations                      | {point, text, author, ts, color}, scenario-scoped                                                                       |
| #60     | Threshold alerts                      | Auto-restyle on breach; provenance chip                                                                                 |
| #61     | Currency / unit localization          | Per-session locale; stored source currency                                                                              |
| #62     | Embedded live dashboards              | Looker, Tableau, PowerBI, Grafana via embed proxy                                                                       |
| #63     | Stale-data indicators                 | Per-binding freshness panel                                                                                             |
| #64     | Per-viewer access control             | Short-lived opaque tokens; vaulted credentials                                                                          |

**Out of scope (deferred to other phases):**

- AI-driven data storytelling (#110), AI chart selection suggestion UI (#123) — Phase 12.
- **MCP** tools `bind_data_source`, `run_scenario`, `simulate_sweep`, `get_data_lineage` (#221–236) — Phase 13. _However_, the contracts and tool surface defined here are reused by Phase 13, so they are designed JSON-Schema-first.
- Agent-writable data layer (write-back, per the "Weaving AI further into what already exists" note in `feature-list.md`) — Phase 13 hookup; the connector framework exposes a `write` capability stub now and is wired later.
- 3D data visualizations (#68) and embedded 3D dashboards — Phase 11.
- License-aware connector marketplace — Phase 19.
- Cross-deck knowledge graph ("which decks cite our NPS?") — Phase 21; the data source registry is the seed node.
- Deck inheritance trees (#212) for scenarios — Phase 21.
- Living-document decks (#206) at scale — Phase 21 (the freshness tracker built here is the substrate).

---

## 3. Dependencies

**Upstream (must be complete):**

- **Phase 02 — Deck schema & scene-graph foundation.** `chart_widget`, `annotation`, `embed_config` rows attach to `slide.elements[]` and inherit the canvas's component addressing (`element_role`).
- **Phase 03 — Canvas editor MVP.** The chart picker, axes-mapping inspector, and "bind to data" affordance are canvas-level UI.
- **Phase 04 — CRDT & presence.** "Who's editing this binding" presence badges (#17 extension) ride on the CRDT awareness channel.
- **Phase 05 — Persistence, versioning, branches.** Every `data_connection`, `data_source`, `query`, `scenario`, `chart_binding`, `annotation`, `threshold_rule`, and `embed_config` row lives under a deck's branch and is included in merge diffs.

**Cross-stream (parallel, must coexist):**

- **Phase 07 — Theming.** Charts consume design tokens (#37); series colors derive from token-resolved palettes (§10.3 of `live-data-charts.md`). Theme swaps invalidate the palette cache, not the bindings.
- **Phase 09 — Animation.** `dataChange` is a registered animation trigger (#88); the timeline engine subscribes to the binding event bus.
- **Phase 06 — Components.** Charts are smart components (#25) with JSON-Schema props, so Phase 06's component contract is the wire format for chart props.

**Downstream (this phase unblocks):**

- **Phase 10 — Prototyping.** Slider state and filter state are variables (#100) and are read from the same store this phase writes to.
- **Phase 14 — Sharing.** The published deck page calls the query gateway through the same viewer-token contract; "share as motion" GIF/MP4 export of an animated chart goes through the Phase 14 export workers once they exist (a phase-08 export variant for charts is implemented locally).
- **Phase 15 — Presenter experience.** "Refresh all" toolbar button (#128) and offline presenter mode (#137) with snapshot fallback are wired on top of the freshness tracker.
- **Phase 16 — Audience participation.** Audience-driven scenario toggles (#148) write through the scenario manager built here.
- **Phase 17 — Analytics.** Per-binding interaction events feed engagement dashboards (#169, #177).
- **Phase 21 — Living documents.** The freshness tracker + state timeline substrate is built here; Phase 21 makes decks "always eager" by default.

---

## 4. Workstreams

The phase splits into five ordered workstreams; each is broken into tasks with files, contracts, tests, and DoD. Tasks within a stream are sequential; streams M2–M4 may run in parallel once M1.1 ships.

### M1 — Connector Framework (foundation, blocks everything else)

#### M1.1 — Adapter interface & registry

- **Files / packages touched:**
  - `contracts/openapi/v1/connector-framework.yaml` — OpenAPI for `discover`, `ping`, `query`, `subscribe`, `invalidate`.
  - `services/connector-framework/src/adapter.ts` — `ConnectorAdapter` interface (idempotent, stateless).
  - `services/connector-framework/src/registry.ts` — versioned adapter registry; pins `connector_ver`.
  - `apps/editor/src/components/data-source/Picker.tsx` — connector picker UI (logos, last-used).
- **Contracts added:** `ConnectorAdapter` (`@domio/contracts/types`), `/v1/connectors/{connector_id}/auth/start|callback|ping|discover` (consumed).
- **Tests written:**
  - Unit: registry resolution honors `connector_ver` pin (10 cases including version-bump).
  - Contract: Pact consumer test for `ping` against the registry.
- **DoD:** A round-trip test connects a sandboxed Google Sheets test account, validates `ping`, lists one dataset, and saves `data_connection` + `data_source` rows. Registry code ≥ 90 % covered.

#### M1.2 — Auth handshakes for all 10 connector types

- **Files / packages touched:**
  - `services/connector-framework/src/oauth/handlers/{google,microsoft,airtable,notion}.ts` — OAuth 2.0 redirect handlers.
  - `services/connector-framework/src/credentials/{postgres,mysql,bigquery,snowflake}.ts` — credential screens.
  - `services/connector-framework/src/credentials/{rest,graphql}.ts` — bearer / API-key / anonymous.
  - `services/connector-framework/src/rds/create-readonly-role.ts` — one-click helper for Postgres/MySQL.
  - `apps/editor/src/components/data-source/AuthScreen.tsx` — consent disclosure UI (PDPA §11.1).
- **Contracts consumed:** OAuth provider configs from env (no secrets in code); credential vault adapter (Phase 01 vault).
- **Tests written:**
  - Unit: each adapter's `auth_start` returns a redirect URL with correct `state` (CSRF token) and `scope`.
  - Unit: `create-readonly-role` emits valid SQL for Postgres 14+ and MySQL 8.
  - Integration: sandbox OAuth handshake end-to-end with a recorded provider stub.
- **DoD:** All 10 connectors pass an authenticated `ping` in CI against sandboxed accounts. Consent disclosure copy mirrors PDPA §11.1 wording. Credentials go to the vault — never to Postgres.

#### M1.3 — Per-adapter `query`, `subscribe`, `invalidate`

- **Files / packages touched:**
  - `services/connector-framework/src/adapters/{sheets,excel,airtable,notion,postgres,mysql,bigquery,snowflake,rest,graphql}.ts`
  - `services/connector-framework/src/canonical/normalize.ts` — adapter → canonical scalar type system.
  - `services/connector-framework/src/pii/shape-detect.ts` — PII shape detection (email, phone, SSN).
  - `services/connector-framework/src/retry/backoff.ts` — exponential backoff + jitter + circuit breaker.
- **Contracts added:** canonical row schema `{columns: [{name, type, semantic_role}], rows: any[]}`.
- **Tests written:**
  - Property-based: `normalize` round-trips 200 random schemas across all 10 connectors.
  - Unit: PII detector flags emails at 99 % recall on a labeled test corpus.
  - Unit: circuit breaker opens after N failures and recovers after cooldown.
- **DoD:** Each adapter has its own integration test fixture (sample data + sandboxed target) and produces canonical rows through `normalize`. Adapter code ≥ 80 % covered.

### M2 — Query Gateway (depends on M1)

#### M2.1 — Token-bucket rate limiting + caching layers

- **Files / packages touched:**
  - `services/query-gateway/src/gateway.ts`
  - `services/query-gateway/src/policies/rate-limit.ts` — token-bucket per `(user, deck, viewer, source)`.
  - `services/query-gateway/src/cache/{lru,redis,snapshot}.ts` — three-tier cache.
  - `services/query-gateway/src/audit/log.ts` — append-only audit log writer.
- **Contracts consumed:** `/v1/queries/{query_id}/execute`, `/v1/datasets/{snapshot_id}/rows`.
- **Contracts added:** rate-limit response (`429 Retry-After`), audit log envelope.
- **Tests written:**
  - Load test (k6): 10 k refreshes / min sustained, p95 latency < 50 ms (cache hit) and < 800 ms (cache miss).
  - Unit: bucket exhaustion falls back to cache and emits a `refresh_throttled` event.
  - Unit: audit log is tamper-evident (signed append-only stream).
- **DoD:** NFR budgets in §3.3 / §3.4 of `live-data-charts.md` hold in CI load tests.

#### M2.2 — Viewer access tokens + credential isolation

- **Files / packages touched:**
  - `services/query-gateway/src/tokens/viewer.ts` — opaque token issuance, ≤ 5 min TTL.
  - `services/query-gateway/src/tokens/single-use.ts` — single-use enforcement for mutating calls.
  - `services/query-gateway/src/authz/acl.ts` — per-deck, per-scenario, per-viewer scope.
- **Contracts consumed:** existing viewer-session token (from Phase 04).
- **Contracts added:** `POST /v1/viewer-tokens` response shape `{token, scope, expires_at, single_use_for}`.
- **Tests written:**
  - Unit: token issuance is bound to `(tenant, deck, scenario, viewer)`.
  - Security: replay attack with a captured token returns 401 after first use.
  - Security: vaulted credential never appears in gateway response bodies (50 fuzzed scenarios).
- **DoD:** Penetration-test playbook for query gateway (`/docs/07-security-planning.md`) signed off by security reviewer.

#### M2.3 — Webhook ingestion + polling fallback

- **Files / packages touched:**
  - `services/query-gateway/src/ingest/webhook.ts` — `POST /v1/ingest/webhook` with HMAC signature verification.
  - `workers/refresh-scheduler/src/index.ts` — polling scheduler keyed by freshness policy.
  - `workers/refresh-scheduler/src/queue.ts` — BullMQ queue with priority (eager > on-interval > lazy).
- **Contracts consumed:** webhook deliveries from Snowflake, Airtable, BigQuery `INFORMATION_SCHEMA`.
- **Contracts added:** webhook signature envelope `X-Domio-Signature`, `X-Domio-Source`.
- **Tests written:**
  - Unit: HMAC verification accepts valid signatures and rejects tampered bodies.
  - Integration: a 24-hour replay of a recorded webhook stream invalidates cache entries correctly.
  - Load test: 10 k refresh requests / min enqueued with no drops.
- **DoD:** Webhook invalidation is idempotent on `(source, event_id)`. Polling-floor (≥ 1 / stale threshold) is configurable per tenant.

### M3 — Formula Engine (parallel to M2; depends on schema package from Phase 02)

#### M3.1 — Spreadsheet AST + parser + sandbox

- **Files / packages touched:**
  - `packages/formula-engine/src/parser/grammar.ts` — `A1`-style + named ranges.
  - `packages/formula-engine/src/parser/ast.ts` — `literal | reference | op | call | range | lookup`.
  - `packages/formula-engine/src/runtime/sandbox.ts` — V8 isolate with caps (16 MB / 50 ms / 2 k frames).
  - `packages/formula-engine/src/runtime/evaluate.ts` — tree-walking evaluator with memoization.
  - `packages/formula-engine/src/runtime/optimize.ts` — constant folding + CSE.
- **Contracts added:** `FormulaAST` JSON schema, `FormulaError` typed errors (`#DIV/0!`, `#REF!`, `#CYCLE!`).
- **Tests written:**
  - Unit: every function (SUMIF, AVERAGEIF, COUNTIF, VLOOKUP, LOOKUP, ABS, IF, AND, OR, NOT, TEXT, DATE, NOW, CONCAT) has ≥ 10 fixture cases.
  - Property-based: same `(inputs, version)` ⇒ same outputs across 1000 randomized runs.
  - Security: sandbox rejects `eval`, `fetch`, `process`, `globalThis` access; rejects infinite loops within 50 ms.
- **DoD:** Engine runs all built-in functions in < 50 ms / invocation; cycles are detected at parse time with a reachable path.

#### M3.2 — Incremental recompute + downstream push-down

- **Files / packages touched:**
  - `packages/formula-engine/src/dag/dependency-graph.ts` — per-deck formula DAG.
  - `packages/formula-engine/src/dag/incremental.ts` — dirty-propagation recompute.
  - `packages/formula-engine/src/pushdown/{bigquery,snowflake,postgres}.ts` — push aggregations to source where possible.
- **Tests written:**
  - Unit: drag a slider → only dependent formula fields re-evaluate (dependency-graph diff).
  - Integration: SUMIF over BigQuery issues `GROUP BY` pushdown (verified by query log capture).
- **DoD:** Slider recompute < 100 ms for ≤ 1 k fields affected; aggregation pushdown verified for at least BigQuery + Snowflake.

### M4 — Chart Rendering Pipeline (parallel to M2/M3; depends on Phase 03 canvas render package)

#### M4.1 — Renderer tri-stack (SVG / Canvas2D / WebGL)

- **Files / packages touched:**
  - `packages/chart-engine/src/render/{svg,canvas2d,webgl}.ts`
  - `packages/chart-engine/src/render/hybrid.ts` — start in SVG, escalate on point count.
  - `packages/chart-engine/src/types/binding-schema.ts` — per-type binding schema (candlestick → OHLC + volume; sankey → source/target/value).
- **Contracts added:** `ChartRenderOptions`, `ChartDataBinding` (consumes Phase 06 JSON-Schema).
- **Tests written:**
  - Unit: switching point thresholds at 1 k / 10 k points fires the right renderer (snapshot of dispatched renderers).
  - Performance: 10 k-point scatter renders at 60 fps on the CI reference machine.
  - Accessibility: every chart passes axe-core scan in CI.
- **DoD:** All 14 chart types render correctly per §F50 ACs. Series colors derive from token-resolved palettes.

#### M4.2 — Interaction layer (hover, tooltip, drill, brush)

- **Files / packages touched:**
  - `packages/chart-engine/src/interaction/tooltip.ts`
  - `packages/chart-engine/src/interaction/drill.ts` — drill hierarchy per binding.
  - `packages/chart-engine/src/interaction/legend.ts`
  - `packages/chart-engine/src/interaction/brush.ts` — brush zoom for time-series.
- **Tests written:**
  - Unit: drill-down respects current scenario and cross-chart filters.
  - Integration: keyboard navigation (Tab / arrows / Enter) reaches every chart control.
- **DoD:** AC-49.1–AC-49.5 pass in Playwright on a representative fixture deck.

#### M4.3 — Data tables + mock data generator + sparkline column

- **Files / packages touched:**
  - `packages/chart-engine/src/table/{sort,paginate,format}.ts`
  - `packages/chart-engine/src/table/conditional-format.ts`
  - `packages/mock-data/src/generator.ts` — seeded distributions.
  - `packages/mock-data/src/correlate.ts` — correlated regions/quarter generators.
- **Contracts added:** mock schema `{fields: [{name, type, distribution}], seed, n}`.
- **Tests written:**
  - Unit: generator is deterministic on a fixed seed (re-runnable fixture).
  - Unit: locale-aware collation (English vs. German) on sort.
- **DoD:** Tables paginate cursors beyond 10 k rows; mock data is opt-in and clearly badged.

### M5 — Cross-cutting Subsystems (depends on M2 + M3 + M4)

#### M5.1 — Scenario manager + DAG + snapshot isolation

- **Files / packages touched:**
  - `services/scenario-manager/src/dag.ts` — scenario DAG with `parent_id`.
  - `services/scenario-manager/src/overlay.ts` — overlays of `dataset_snapshot_refs + formula_constant_overrides + slider_value_overrides + annotation_overrides`.
  - `services/scenario-manager/src/diff.ts` — human-readable + JSON diff.
- **Tests written:**
  - Property-based: scenario invariants (one active scenario; missing binding falls back to default with badge).
  - Integration: switch activates in O(1) for ≤ 64 scenarios × ≤ 200 bindings.
- **DoD:** Scenarios persist with the deck and survive connector renames via stable IDs (AC-54.6).

#### M5.2 — Filter cross-link manager + what-if slider evaluator + threshold alerter

- **Files / packages touched:**
  - `apps/editor/src/components/filters/CrossLink.tsx`
  - `apps/editor/src/components/slider/Evaluator.tsx`
  - `apps/presenter/src/components/threshold/Alerter.tsx`
  - `apps/presenter/src/components/freshness/Tracker.tsx` — freshness panel + per-slide aggregation.
- **Contracts added:** filter event bus `slideScope:publish(key, value)`, threshold breach event.
- **Tests written:**
  - Unit: conflicting filters resolve chart-local > slide-global > scenario-default.
  - E2E: drag slider, chart re-renders within 100 ms (Playwright).
  - Unit: threshold breach re-styles the callout and emits `provenance_chip`.
- **DoD:** AC-52.1–AC-52.6, AC-53.1–AC-53.6, AC-60.1–AC-60.5 pass in staging.

#### M5.3 — Localization service + embed proxy + stale-data tracker

- **Files / packages touched:**
  - `services/localization/src/format.ts` — `(value, source_ccy, source_unit, target_locale, snapshot_id) → string`.
  - `services/localization/src/rates.ts` — exchange-rate snapshot ingestion.
  - `services/embed-proxy/src/{proxy,ssrf-guard}.ts`
  - `workers/freshness-tracker/src/index.ts` — append-only `freshness_record` writer.
  - `apps/editor/src/components/freshness/Panel.tsx`
- **Contracts added:**
  - `GET /v1/embeds/{embed_config_id}/token` — short-lived (≤ 60 s) passthrough token.
  - Embed proxy URL contract with `Content-Security-Policy: frame-ancestors …`.
- **Tests written:**
  - Unit: localization rounds-trip canonical → USD/EUR/BDT with correct formatting.
  - Security: SSRF guard rejects RFC1918 / link-local / loopback / metadata IPs.
  - Integration: stale threshold flags appear in presenter toolbar within 250 ms of expiry.
- **DoD:** AC-61.1–AC-61.5, AC-62.1–AC-62.5, AC-63.1–AC-63.4 pass in staging.

#### M5.4 — Agent-facing contract surface (JSON-Schema-first, hooks for Phase 13)

- **Files / packages touched:**
  - `contracts/openapi/v1/data-lineage.yaml` — `GET /v1/data-lineage/{binding_id}` returns `{source, query, snapshot, lineage, provenance}`.
  - `contracts/json-schema/chart-binding.v1.json` (extends Appendix C).
  - `contracts/json-schema/scenario.v1.json`
  - `contracts/json-schema/annotation.v1.json`
- **Tests written:**
  - Contract tests: every schema is valid JSON-Schema draft 2020-12.
  - Schema-first generation: TypeScript types generated from schemas (no hand-written types for these surfaces).
- **DoD:** Phase 13 can wrap these endpoints as MCP tools without changing the wire format.

---

## 5. Architecture & Data

References: `/docs/04-system-architecture.md` (Connector Framework + Query Gateway live behind `services/`; Chart Renderer is a package), `/docs/05-data-database-design.md` (the 12 tables below are new in this phase, all in the `domio` schema), `/docs/06-technology-stack.md` (Node.js for the gateway; Postgres for control plane; object storage for snapshots; V8 isolate for formulas), `/docs/live-data-charts.md` §4–§6.

**New Postgres tables (tenant-scoped, RLS-enabled):**

```sql
data_connection           -- per-user/team vaulted credentials
data_source               -- a queryable endpoint bound to a connection
query                     -- declarative chart-spec → dataset, with freshness_policy JSONB
dataset_snapshot          -- immutable, content-addressed (hash), object-storage pointer
scenario                  -- named overlays, DAG via parent_id
formula_field             -- spreadsheet AST + version
chart_widget              -- canvas element of type chart/table/callout
chart_binding             -- glue: chart_widget ↔ query (with field_map + listen_to_filters)
annotation                -- pinned text + scenario scope
threshold_rule            -- (measure, comparator, values, severity, style_override)
embed_config              -- {provider, url, sizing, auth_passthrough}
freshness_record          -- append-only tracker
```

Full DDL: `/docs/live-data-charts.md` §5 (`5.1`–`5.12`). Row-level security scopes every table to `tenant_id = current_setting('app.tenant_id')::uuid`.

**New services & packages:**

- `/services/connector-framework/` — adapter registry + 10 connector implementations + PII detector + retry/backoff.
- `/services/query-gateway/` — rate-limit, caching, audit, viewer tokens, webhook ingestion.
- `/services/scenario-manager/` — DAG, overlays, diff.
- `/services/localization/` — stateless number/currency formatter.
- `/services/embed-proxy/` — iframe auth passthrough + SSRF guard.
- `/packages/formula-engine/` — parser, AST, sandboxed runtime, DAG.
- `/packages/chart-engine/` — 14 chart types, tri-stack renderer, tooltip/drill/brush/legend.
- `/packages/mock-data/` — seeded distributions + correlations.
- `/workers/refresh-scheduler/` — BullMQ queue for polling + on-demand refresh.
- `/workers/freshness-tracker/` — append-only tracker + per-binding staleness signals.

**Migrations:**

- `db/migrations/2026Q3/p08_data_plane.sql` — all 12 tables above + RLS policies + check constraints (scenario DAG, threshold_rule.comparator).
- `db/migrations/2026Q3/p08_indexes.sql` — `(binding_id, recorded_at DESC)` on `freshness_record`; `(query_id, created_at DESC)` on `dataset_snapshot`; GIN on `annotation.text` and `formula_field.expression` for search.
- Seed: built-in query freshness policies (`eager`, `lazy`, `manual`, `on_interval`) and 24 threshold-rule templates.

**Contracts produced (versioned `/v1`):**

- OpenAPI: `connector-framework.yaml`, `query-gateway.yaml`, `scenario.yaml`, `embed-proxy.yaml`.
- JSON-Schema: `chart-binding.v1.json`, `scenario.v1.json`, `annotation.v1.json`, `data-lineage.yaml`.
- TypeScript: `@domio/contracts/types` — generated from the above (no hand-written types on these surfaces).

---

## 6. Verification

| Feature             | Test                                                          | Expected result                                                                                                                  | Owner              |
| ------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| #48 AC-48.1–AC-48.6 | Sandbox OAuth handshake + credential screen + ping + discover | All 10 connectors produce a valid `data_connection`; bad creds surface a typed error; ping latency reported before "save"        | M1 lead            |
| #48 schema drift    | Rebind flow when a column disappears                          | Single-click rebind restores the chart; `broken` badge shown                                                                     | M1 lead            |
| #49 AC-49.1–AC-49.5 | Playwright E2E on fixture deck                                | Hover/tooltip/drill/legend/brush work in presenter + viewer; keyboard accessible                                                 | M4 lead            |
| #50 AC-50.1–AC-50.5 | All 14 chart types render with fixture data                   | Each renders correctly at 1 k / 10 k points; binding schema enforced; accessibility palette honored                              | M4 lead            |
| #51 AC-51.1–AC-51.5 | Freshness policy E2E                                          | Eager refresh < 4 s on stage-open (p95); on-interval drift ≤ 1 s; cached fallback when upstream is down                          | M2 lead            |
| #52 AC-52.1–AC-52.6 | Cross-chart filter Playwright                                 | Click region on A → B/C update; clear chip works; scenario switch resets filters                                                 | M5 lead            |
| #53 AC-53.1–AC-53.6 | Slider recompute perf                                         | Drag → chart re-renders ≤ 100 ms (p95) on 1 k affected fields; slider state in state timeline                                    | M3 lead            |
| #54 AC-54.1–AC-54.6 | Formula sandbox                                               | A1 + named ranges + SUMIF + LOOKUP evaluate; cycle detected; locale decimals parse; incremental recompute verified               | M3 lead            |
| #55 AC-55.1–AC-55.6 | Data table fixture                                            | Sort/paginate/cond-format/sparkline all work; CSV export preserves formatting                                                    | M4 lead            |
| #56 AC-56.1–AC-56.5 | Mock data generator                                           | Same seed → same rows; "mock" badge visible in editor + presenter                                                                | M4 lead            |
| #57 AC-57.1–AC-57.6 | Scenario switcher                                             | Toggle swap within 100 ms; cross-chart filters reset per scenario; partial scenario badge                                        | M5 lead            |
| #58 AC-58.1–AC-58.5 | Ticker + chart build animation                                | Number tweens; bars animate from zero; rapid refreshes coalesce; reduced-motion respected                                        | M5 lead            |
| #59 AC-59.1–AC-59.5 | Annotation CRUD                                               | Pin / rebind / search / scenario-scoping all work; write-back hook present (no-op for non-writable sources)                      | M5 lead            |
| #60 AC-60.1–AC-60.5 | Threshold alerter                                             | Breach re-styles callout; provenance chip emitted; floating-point tolerance honored                                              | M5 lead            |
| #61 AC-61.1–AC-61.5 | Localization service                                          | USD/EUR/BDT round-trip; stale exchange-rate badge; compound units handled                                                        | M5 lead            |
| #62 AC-62.1–AC-62.5 | Embed proxy + Looker sandbox                                  | Token issued ≤ 60 s; iframe renders; provider outage falls back to snapshot + stale badge; SSRF blocked                          | M5 lead            |
| #63 AC-63.1–AC-63.4 | Freshness tracker                                             | Per-binding + per-slide + per-deck panel; export footer preserves timestamp                                                      | M2 + M5 leads      |
| #64 AC-64.1–AC-64.5 | Viewer-token security review                                  | Tokens ≤ 5 min; single-use for mutations; no raw credentials traverse gateway; generic error envelope; audit log entry per query | M2 lead + Security |

---

## 7. Risks & Open Decisions

| #       | Risk / decision                                                                                                           | Mitigation                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-08-1  | **Connector churn.** Each SaaS provider evolves its API; adapter maintenance is ongoing.                                  | Pinned `connector_ver`, semantic-versioning the adapter, deprecation policy baked into `connector_framework`.                                           |
| R-08-2  | **Formula sandbox escape.** V8 isolates are powerful; one bug is RCE-class.                                               | Defense in depth: caps (memory / CPU / stack / quota), no I/O, no `eval`, periodic red-team, fuzz with 50 k hostile ASTs in CI.                         |
| R-08-3  | **Mock data crossing into shared decks.** Users accidentally publish mock-bound dashboards.                               | Editor + presenter "mock" badge; block publish-to-public if any binding is mock unless author explicitly confirms.                                      |
| R-08-4  | **GDPR/PDPA compliance for query audit logs.** Even request metadata can be sensitive.                                    | Tenant-scoped log retention; signed append-only; configurable per-tenant TTL (default 90 d) honoring `dataset_snapshot.expires_at`.                     |
| R-08-5  | **Embed proxy SSRF.** Looker/Tableau URLs must never reach internal IPs.                                                  | Strict allow/denylist; resolve at request time; reject `0.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16`, `fc00::/7`, `metadata.google.internal`, AWS IMDS.  |
| R-08-6  | **Threshold rules blo**ating the AST.                                                                                     | Rules declared per chart binding, not per formula field; capped at 64 rules per binding in the inspector.                                               |
| R-08-7  | **Scenario DAG blow-up.** Authors inherit across decks; cycles could emerge.                                              | Detect cycles on insert; surface "scenario cycle" inline; cap parent depth at 8.                                                                        |
| R-08-8  | **Refresh storms during press-the-button demos.**                                                                         | Token-bucket + priority queue (eager > on-interval > lazy) + best-effort cache fallback (NFR §3.3).                                                     |
| R-08-9  | **Localization precision.** Currency as float vs. bigint minor units.                                                     | `decimal` arithmetic server-side; `bigint` minor units at the wire edge; renderer formats with `Intl.NumberFormat`.                                     |
| R-08-10 | **Open decision: agent-writable data layer.** Write-back is hinted in `feature-list.md` but not in Phase 08 scope.        | Adapter interface ships a stub `write(spec)` now (returns `NotImplemented`); Phase 13 wires the first two connectors (Airtable, Sheets) for write-back. |
| R-08-11 | **Open decision: scenario inheritance from a parent deck.** Defer cross-deck scenarios to Phase 21; track as a follow-up. | Today, scenarios are deck-scoped; `parent_id` exists but the cross-deck resolution is a stub.                                                           |

---

## 8. Demo

**Demo title: "Charts that breathe on stage."**

**Pre-demo setup (T-1 day):**

1. Sandbox tenant `acme-co` is pre-loaded with a 14-slide Q3 board deck.
2. Three data sources are connected: a Postgres demo warehouse (`p08_demo_pg`), a Google Sheets script that posts a fresh row every 60 s (`p08_demo_sheet`), and a Looker sandbox dashboard (`p08_demo_looker`).
3. One BigQuery mock compute endpoint (`p08_demo_bq`) drives a what-if slider for "marketing spend → ARR".
4. Three scenarios (`Base`, `Bull`, `Bear`) are baked; each owns its own dataset snapshots.
5. Two threshold rules are wired: `revenue < $1M → red` and `churn > 8 % → amber`.
6. Localization is configured: viewer's locale defaults to USD; toggle to EUR exists.

**Script (15 min):**

1. **Connect.** Open the deck in the editor. Replace one KPI callout binding with `p08_demo_sheet`. Show the "ping" panel: latency 280 ms, 1 k rows. Save.
2. **Map.** Drag a bar chart onto slide 5. Pick `p08_demo_pg` → `orders_by_region`. Confirm the auto-suggest mapping (`region → x`, `gmv → y`). Show the typed binding schema vs. the chart's requirements.
3. **Formula + slider.** Add a formula field `gmv_after_discount = gmv * (1 - discount)` where `discount` is a slider (min 0, max 0.30). Drag the slider to 0.15. The chart re-renders in < 100 ms. _(#53, #54)_
4. **Cross-chart filter.** On slide 7, click `EU` on the bar chart. The map chart and the line chart both update to EU-only. Click "Clear filter". _(#52)_
5. **Scenario switch.** In presenter mode, toggle `Base → Bull`. The KPI callouts, the line chart, and the table on slide 7 all swap datasets in < 100 ms. _(#57)_
6. **Refresh on stage.** Open the presenter toolbar and click "Refresh all". The Google Sheets chart (which a backend cron updated 30 s ago) re-renders within 4 s. _(#51)_
7. **Animated build.** Drag the audience slider; the chart builds from zero with a stager. _(#58)_
8. **Annotation.** Pin an annotation "this dip = server outage, March 3" on the line chart. Switch to Bear case — the annotation is hidden (scenario-scoped). _(#59)_
9. **Threshold.** Show the revenue KPI. Edit the demo SQL to drop revenue below $1M. Refresh. The callout re-styles red, the provenance chip surfaces, and the presenter toolbar shows a "threshold breach" ping. _(#60)_
10. **Localization.** In the viewer URL, append `?locale=fr-FR&ccy=EUR`. Reload. All numbers re-format with `Intl.NumberFormat('fr-FR', {style: 'currency', currency: 'EUR'})`. _(#61)_
11. **Embed.** Drop a Looker embed on slide 12. Click to enter presenter mode. The embed proxy authenticates Looker silently. _(#62)_
12. **Stale badge.** Disconnect the network to `p08_demo_sheet`. Refresh. The chart shows the last cached values with a "Last sync 4 m ago" badge. _(#63)_
13. **Viewer isolation.** Generate a share link in read-only mode. Open it from a separate incognito window. Open DevTools → Network → confirm no `credential_ref`, no bearer token, only the opaque viewer token. _(#64)_
14. **Charts library.** Drop a candlestick (with `OHLC + volume` binding), a sankey (`source/target/value`), a treemap, and a heatmap, all on slide 13. Each renders under their typed binding schema. _(#50)_

**Pass criteria.** Every numbered acceptance criterion above is exercised. A "Demo passed" GitHub check is set when the Playwright suite covering flows 1–14 is green.

---

## 9. Definition of Done

- [ ] Code merged to `main` behind a single feature flag `p08_live_data_charts` (default OFF in prod).
- [ ] All `v1` contracts versioned in `/contracts/openapi/v1/` and `/contracts/json-schema/`; types generated.
- [ ] `pnpm test` green: unit (`@domio/chart-engine`, `@domio/formula-engine`, `@domio/connector-framework`, `@domio/scenario-manager`) ≥ 80 %; integration suites for the 10 connectors green; Playwright `p08-live-data-and-charts.spec.ts` green.
- [ ] Load tests green at NFR budgets (§3.3, §3.4 of `/docs/live-data-charts.md`).
- [ ] Security review signed off: vault isolation, viewer-token model, SSRF guard for embed proxy, formula sandbox, DLP at the gateway.
- [ ] Telemetry in place: counters (`queries.total`, `refresh.throttled_total`, `threshold.breach_total`), histograms (`query.latency_ms`, `sandbox.eval_ms`, `cache.hit_ratio`), `prefers-reduced-motion` propagation (Phase 09 hookup).
- [ ] Migrations applied in dev + staging; revert plan verified.
- [ ] RLS policies enabled on all 12 new tables.
- [ ] Documentation updated: `/docs/live-data-charts.md` cross-linked from this phase; runbook for the connector framework and query gateway in `/docs/runbooks/`.
- [ ] Design partner deck validated end-to-end with a non-Domio user.
- [ ] "Internal demo passed" status granted after demo script runs green in internal environment.
- [ ] Hooks left for downstream phases: state-timeline event (`trigger.fired`) for Phase 21; per-deck interactions events for Phase 17; `bind_data_source` MCP shape (no implementation) for Phase 13.

---

_Document path: `/home/daiyaan2002/Desktop/Projects/domio/docs/development_phases/phase-08-live-data-and-interactive-charts.md`_
_Source docs (unchanged): `feature-list.md`, `pre-development-planning-guide.md`, `live-data-charts.md`, `animation-transitions.md`._
