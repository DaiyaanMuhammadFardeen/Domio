# Section 4 — Live Data & Interactive Charts (Features 48–64)

> Part of the Domio planning set. Codename **Domio** — a Figma/Canva/Keynote-grade presentation platform with 240+ features. This document covers the "killer differentiator" layer: turning slides from static assets into live, queryable, scenario-aware dashboards that remain accurate on stage and in the room.

---

## Table of Contents

1. [Feature-by-Feature Mapping (48–64)](#1-feature-by-feature-mapping-4864)
2. [UX Flows](#2-ux-flows)
3. [Functional and Non-Functional Requirements](#3-functional-and-non-functional-requirements)
4. [Architecture](#4-architecture)
5. [Data Model (Postgres)](#5-data-model-postgres)
6. [APIs and Contracts](#6-apis-and-contracts)
7. [Security](#7-security)
8. [Performance](#8-performance)
9. [Observability and Testing](#9-observability-and-testing)
10. [Cross-Section Ties](#10-cross-section-ties)

---

## 1. Feature-by-Feature Mapping (48–64)

Each feature is decomposed into: **acceptance criteria**, **behavioral details**, and **edge cases**. Test IDs are stable and reused in QA tracking.

### F48 — Live Data Connections (#48)

**Scope:** Connect Domio charts, tables, and computed fields to external sources of truth.

**Source list (v1):**

- Google Sheets, Excel Online, Airtable, Notion (sheets/databases)
- PostgreSQL, MySQL, BigQuery, Snowflake (databases / warehouses)
- REST APIs (JSON / CSV), GraphQL endpoints

**Acceptance Criteria:**

- **AC-48.1** A user can authenticate against a connector via OAuth 2.0 (Google, Microsoft, Airtable, Notion) or via a credential screen (DBs + REST/GraphQL with API key / basic auth / bearer).
- **AC-48.2** A successful auth creates a `data_connection` row scoped to user/team (never global).
- **AC-48.3** Connection wizard validates the credential by issuing a sample read (`ping` query) and reporting latency / row count before "save" is enabled.
- **AC-48.4** Connection is reusable across multiple data sources (a single Postgres connection can power many `data_source` rows pointing to different schemas/tables).
- **AC-48.5** Re-auth flow: when a token expires (401/403 from upstream), the editor surfaces a non-blocking banner; on stage, viewers see only the last successfully cached data and a stale badge (#63).
- **AC-48.6** Anonymous read-only connectors (for public REST endpoints) require zero credentials and document the CORS posture.

**Behavioral Details:**

- All connectors go through a **Connector Framework** (see §4.1) with a common `Adapter` interface: `discover()`, `ping()`, `query(spec, ctx)`, `subscribe(spec, ctx)`, `invalidate()`.
- Connectors are versioned; pinning a connector version on a connection allows forward compatibility.
- Schema discovery (tables/datasets/fields) is lazy and cached. Field types are normalized to a canonical scalar + measure/dimension taxonomy.

**Edge Cases:**

- **Token leakage:** A user's OAuth refresh token is stored only in the credential vault (see §7.1) — never returned to the client.
- **Read-only DB user:** Encouraged (and enforced via a one-click "create read-only role" helper for Postgres/MySQL).
- **Network captive portals:** Connector setup must work behind typical corporate firewalls; we do not require raw socket access.
- **Schema drift:** If a column disappears upstream, the binding is marked `broken` with a single-click "rebind" flow.
- **deletion of source outside Domio:** A reconciliation job continually checks existence; failures trigger notifications, not silent breakage.

---

### F49 — Charts Alive During the Presentation (#49)

**Scope:** Charts are interactive in presenter mode and in the shared web deck.

**Acceptance Criteria:**

- **AC-49.1** Hover tooltips, brush selection (zoom into a time range), and legend toggle (show/hide series) work in presenter mode and the public viewer.
- **AC-49.2** Drill-down: clicking a bar/point opens a detail view (same chart, deeper granularity) without leaving the slide.
- **AC-49.3** Drill-down respects the current scenario (#57) and cross-chart filters (#52).
- **AC-49.4** Disabled interaction state is explicit — a "static mode" toggle for exports, PDF, and projected immutable surfaces.
- **AC-49.5** All interactions are keyboard accessible (tab to chart, arrow keys to move selection, Enter to drill).

**Behavioral Details:**

- Interaction is driven by the chart rendering pipeline (§4.4) and the **query gateway** (§4.3). Hover/tooltip resolution can be local (already in dataset) or remote (lazy aggregate query).
- Drill-downs are modeled as a **drill hierarchy** bound to the chart, not hard-coded levels.

**Edge Cases:**

- **Empty chart:** Renders a typed empty state with a "no data" reason ("source returned 0 rows for this filter").
- **Sparse data:** Line/area charts gracefully handle gaps (configurable: connect, gap, zero).
- **Single-series with one point:** No interaction-driven errors; legend and tooltip work.

---

### F50 — Full Chart Library (#50)

**Scope:** Bar, line, area, pie, scatter, funnel, sankey, treemap, heatmap, waterfall, gauge, radar, candlestick, bullet.

**Acceptance Criteria:**

- **AC-50.1** All 14 chart types are selectable in the chart picker.
- **AC-50.2** Each chart type has a typed **binding schema** (e.g., candlestick requires OHLC + volume; sankey requires `source`, `target`, `value`).
- **AC-50.3** Each chart type has a default style honoring theme tokens (#37) and can be customized per-instance.
- **AC-50.4** Charts render correctly at >10k points with smooth interactions (see §8.3).
- **AC-50.5** Chart type is not silently lost on rebind — if a binding invalidates required fields, the user is shown a typed warning and the chart type is preserved.

**Behavioral Details:**

- Charts are **smart components** (#25) — every chart exposes a JSON Schema for its props (per #233), enabling agent-driven creation.
- Each chart ships an "AI chart selection" hint (#123) — if a dataset better fits a different chart type, the editor suggests it.

**Edge Cases:**

- **Incompatible type swap:** Switching from pie (1 dimension, 1 measure) to sankey (2 dims, 1 measure) surfaces a binding assistant.
- **Color-blind safety:** Series colors are derived from a colorblind-safe palette when accessibility theming is enabled (#44).

---

### F51 — Data Refresh on Stage (#51)

**Scope:** Numbers shown to the audience are current as of "this morning."

**Acceptance Criteria:**

- **AC-51.1** On entering presenter mode, all bound widgets evaluate freshness and refresh if stale per their policy.
- **AC-51.2** A "refresh now" button in the presenter toolbar triggers an immediate fetch, with a progress indicator that doesn't block the current slide.
- **AC-51.3** Refreshes are budgeted per user/session (§3.3) and gracefully degrade to cached data when budget exhausted.
- **AC-51.4** Refresh outcome is logged into the freshness tracker and is visible in the presenter UI (e.g., "Updated 4s ago").
- **AC-51.5** A configurable **freshness policy** per binding: `eager` (always refresh on stage open), `lazy` (refresh on first view), `manual` (never auto-refresh), `on-interval` (refresh every N seconds).

**Behavioral Details:**

- Polling vs. webhook-driven refresh per source (§3.2).
- Mid-presentation refresh is **non-blocking** — the existing chart stays visible until the new dataset lands, then a transition animation swaps it (#58 ties to animated chart builds).

**Edge Cases:**

- **Source is down:** Cached data is shown with a stale badge; refresh attempts are rate-limited and circuit-broken.
- **Refresh exceeds query budget:** Returns cached; logs the skip; surfaces a presenter-only diagnostic.
- **Clock skew:** Server time is the source of truth for "as of"; client clocks are not trusted.

---

### F52 — Cross-Chart Filtering (#52)

**Scope:** A single click on a chart filters all other charts on the slide (dashboard behavior inside a slide).

**Acceptance Criteria:**

- **AC-52.1** Selecting a region/segment on Chart A applies a dimension filter to Chart B, Chart C, … on the same slide.
- **AC-52.2** Filter is reversible (clear-filter chip) and persistent across slide navigation within the same scenario.
- **AC-52.3** When the active scenario changes (#57), filter state is reset per scenario.
- **AC-52.4** When the active scenario is simulated via sliders (#53), filter is preserved.
- **AC-52.5** A "global filter" chip at the slide level overrides per-chart filters.
- **AC-52.6** In static exports, filter chips are removed visually but the latest filter state is preserved for repro.

**Behavioral Details:**

- Implemented by the **filter cross-link manager** (§4.1, F52) — a lightweight subscription bus scoped to the slide.
- Charts opt-in to receiving filters via a binding config (`listen_to_filters: ["region", "product"]`).

**Edge Cases:**

- **Conflicting filters:** User selects "EU" on Chart A and "US" on Chart B; precedence is chart-local > slide-global > scenario-default.
- **No matching data post-filter:** Empty-state hint per chart.

---

### F53 — What-If Sliders (#53)

**Scope:** Drag a slider during a board meeting, the chart recalculates live.

**Acceptance Criteria:**

- **AC-53.1** A formula field can be bound to a slider input (numeric, range, with min/max/step).
- **AC-53.2** Slider movement triggers formula recompute and chart re-render within 100ms (#NFR-3).
- **AC-53.3** Slider state is captured in scenario datasets (#57) and is replayable via the state timeline (#205).
- **AC-53.4** Slider has a "reset to baseline" affordance.
- **AC-53.5** Sliders can be linked to a variable (#100) for cross-slide synchronization.
- **AC-53.6** Mid-presentation interaction requires opt-in by the presenter (privacy & focus) — disabled by default unless the slide is tagged "interactive."

**Behavioral Details:**

- Driven by the **what-if slider evaluator** (§4.1).
- Evaluation runs on the client (where supported) and on the formula engine server-side for chart-shape verification.

**Edge Cases:**

- **Slider out of range due to formula explosion:** Slider is clamped; user sees a "clamped" tooltip.
- **Combinatorial explosion:** Simulation sweep (#239) is server-side; the UI slider is single-value.

---

### F54 — Formula Engine (#54)

**Scope:** Spreadsheet-style computed fields inside the deck.

**Acceptance Criteria:**

- **AC-54.1** A formula field references columns of any bound dataset using `A1`-style or named ranges.
- **AC-54.2** Supported language: arithmetic, comparisons, logical ops, conditional, text, date, aggregation (`SUMIF`, `AVERAGEIF`, `COUNTIF`, `VLOOKUP`-style), cross-dataset joins via `LOOKUP` against a key.
- **AC-54.3** Formula execution is sandboxed (§8.4) and deterministic — same inputs ⇒ same outputs.
- **AC-54.4** Formula errors are **typed** (e.g., `#DIV/0!`, `#REF!`, `#CYCLE!`) and surface inline with the field.
- **AC-54.5** Editor shows a side panel with step-by-step evaluation (debug mode).
- **AC-54.6** Formulas are versioned with the deck and survive connector renames via stable IDs.

**Behavioral Details:**

- Implemented as a spreadsheet AST (see §4.5) — algebraic optimization, constant folding, dependency tracking.
- Supports **incremental recomputation**: when a slider changes (#53), only the dependent formula fields re-evaluate.

**Edge Cases:**

- **Circular references:** Detected at parse time; user sees a `#CYCLE!` and a reachable cycles view.
- **Locale-separators:** The engine expects `.` for decimals; UI accepts locale input and pre-parses.
- **Huge datasets:** Aggregations are pushed down to the source where possible (BigQuery, Snowflake).

---

### F55 — Data Tables (#55)

**Scope:** Tables with sorting, pagination, conditional formatting, sparklines.

**Acceptance Criteria:**

- **AC-55.1** Sortable columns (single + multi-key with stable tie-break).
- **AC-55.2** Pagination (page size configurable; "show all" with a confirmation gate beyond 10k rows).
- **AC-55.3** Conditional formatting rules: gradient, threshold, icon-set, sparkline.
- **AC-55.4** Sparkline column reuses the chart pipeline (#50) with a compact encoding.
- **AC-55.5** Cells are bound to formula fields (#54) and react to scenarios (#57).
- **AC-55.6** Tables export to CSV/Excel with formatted-preserving options.

**Edge Cases:**

- **10M+ rows:** Server-side pagination with cursor-based streaming; the editor shows aggregate totals only.
- **Sort language:** Collation is locale-aware (#61).

---

### F56 — Mock Data Generator (#56)

**Scope:** Realistic fake data by schema for prototypes and templates.

**Acceptance Criteria:**

- **AC-56.1** Given a schema (column names + types), the generator produces N rows with realistic distributions.
- **AC-56.2** Distributions: uniform, gaussian, lognormal, seasonal, "business-like" (currency, percentage, dates).
- **AC-56.3** Generator is deterministic — a seed produces reproducible rows.
- **AC-56.4** Generator is opt-in per data source and clearly badged "mock" in the editor and presenter UI.
- **AC-56.5** Mock data does not leave the project (no upstream writes).

**Edge Cases:**

- **PII-shaped fields:** Names, emails, phones are generated from a public synthetic list, never from real data.
- **Realistic correlations:** The generator can encode "regions" and "quarter" fields with correlated measures.

---

### F57 — Scenario Switcher (#57)

**Scope:** Toggle "Base / Bull / Bear" and every chart, table, and callout swaps datasets.

**Acceptance Criteria:**

- **AC-57.1** A slide can declare one or more named scenarios; each scenario is a full set of dataset snapshots bound to the chart bindings on the slide.
- **AC-57.2** A scenario switcher UI is present in presenter mode and in the published viewer.
- **AC-57.3** Scenarios are slide-scoped by default; deck-level scenarios can be defined via inheritance.
- **AC-57.4** Scenario state is serializable and recorded in the state timeline (#205).
- **AC-57.5** Cross-chart filters (#52) and slider values (#53) are scoped per scenario.
- **AC-57.6** Voice/gesture triggers (#209, #208) can switch scenarios with a confirmation guard.

**Behavioral Details:**

- The **scenario manager** (§4.1) maintains a scenario DAG. A scenario is a named overlay of dataset snapshots + formula constants + slider values.
- Scenarios enable **simulation mode** (#239) where an agent sweeps the entire space programmatically.

**Edge Cases:**

- **Partial scenarios:** If a scenario is missing a binding, the chart degrades to the default scenario's value with a "scenario-incomplete" badge.
- **Scenario dependency:** Inheriting from a parent deck's scenario is supported but versioned.

---

### F58 — Number Ticker & Animated Chart Builds (#58)

**Scope:** Numbers and charts animate to their real values on entry.

**Acceptance Criteria:**

- **AC-58.1** A number updates with a tween (count-up) when its value changes.
- **AC-58.2** A chart's bars/lines animate from zero (or previous state) to the new values on entry and on data refresh.
- **AC-58.3** Animation is throttled to the renderer's frame budget (§8.3).
- **AC-58.4** Animation respects reduced-motion preference (#93).
- **AC-58.5** Animation is configurable per chart — duration, easing, stagger.

**Behavioral Details:**

- Reuses the animation engine (§6) — chart scrubber hook on `dataChange` event.

**Edge Cases:**

- **Rapid data refreshes:** In-flight tweens are coalesced; the latest value wins.
- **Negative values:** Bar charts animate to negative correctly (axis-aware).

---

### F59 — Data Annotations (#59)

**Scope:** Notes pinned to data points ("this dip = server outage, March 3").

**Acceptance Criteria:**

- **AC-59.1** An annotation is a `{bindable_point, text, author, timestamp, color}` object.
- **AC-59.2** Annotations persist with the dataset snapshot where applicable.
- **AC-59.3** Annotations are scoped per scenario (#57) — an annotation can be "Bull case only."
- **AC-59.4** Annotations are searchable (#124) and visible in the provenance chip (#215).
- **AC-59.5** Annotations are writable back to the source when the source supports it (#48 extension) — agent-writable data layer.

**Edge Cases:**

- **Point disappears on refresh:** Annotation is marked `orphaned` with a one-click "rebind" flow.
- **Permission mismatch:** Some viewers can read annotations, only authors can write.

---

### F60 — Threshold Alerts (#60)

**Scope:** When a KPI crosses a threshold, the slide callout restyles automatically.

**Acceptance Criteria:**

- **AC-60.1** A threshold rule is `{measure, comparator, value(s), severity, style}`.
- **AC-60.2** Rules bind to a chart binding or formula field (#54).
- **AC-60.3** Threshold breaches are visible in the presenter UI (e.g., system tray icon) and optionally push a notification.
- **AC-60.4** Breach triggers a re-style — color, icon, animation chime — and a **provenance chip** (#215).
- **AC-60.5** Threshold rules are subject to scenario overlays (#57).

**Edge Cases:**

- **Floating-point comparison:** Tolerance threshold defined per rule.
- **Animated threshold breach:** Animation respects reduced-motion (#93).

---

### F61 — Currency / Unit Localization (#61)

**Scope:** Present the same deck in USD to one board, EUR to another.

**Acceptance Criteria:**

- **AC-61.1** Each data binding has a stored `source_currency` and `source_unit`.
- **AC-61.2** A presentation locale is set per session (manual or auto-detected from the viewer's profile).
- **AC-61.3** Numbers are converted at render time using an **exchange rate snapshot** (per-deck, per-session, or live).
- **AC-61.4** Both number formatting and currency symbol formatting follow locale.
- **AC-61.5** Original source currency is recoverable from the chart via the provenance chip (#215).

**Behavioral Details:**

- Implemented by the **localization service** (§4.1) — a stateless function applied at render time.
- Exchange rates are themselves a data source (with their own freshness policy).

**Edge Cases:**

- **Currency missing in snapshot:** Use last-known rate with a stale badge.
- **Compound units:** `USD/kWh`, `EUR/MWh` — handled via unit registry.

---

### F62 — Embedded Live Dashboards (#62)

**Scope:** Embed Looker, Tableau, Power BI, Grafana (or any third-party iframe) with auth passthrough.

**Acceptance Criteria:**

- **AC-62.1** An embed config is `{url, provider, sizing, auth_passthrough}`.
- **AC-62.2** Auth passthrough is mediated by the **embed proxy** (§4.1) — Domio issues short-lived tokens that the embed provider exchanges upstream.
- **AC-62.3** Embeds are sandboxed (`Content-Security-Policy: frame-ancestors …`) and never carry raw viewer credentials.
- **AC-62.4** An embed is a first-class component on the canvas; it can be sized, themed, and exported.
- **AC-62.5** Embeds respect the freshness policy (#51) — re-fetch the embed URL on stage-open if configurable.

**Edge Cases:**

- **Provider outage:** Embed falls back to a cached snapshot shown with a stale badge.
- **SSRF:** The proxy rejects embed URLs against internal IPs / localhost.

---

### F63 — Stale-Data Indicators (#63)

**Scope:** Always show when a source was last synced.

**Acceptance Criteria:**

- **AC-63.1** Every chart/table binding has a visible freshness indicator — "Updated 12s ago" / "Last sync: 04:12 UTC".
- **AC-63.2** Stale threshold is configurable per binding (default: 1× the binding's refresh policy).
- **AC-63.3** A "freshness panel" aggregates per-slide and per-deck staleness.
- **AC-63.4** In static exports, the timestamp is preserved as a footer.

**Behavioral Details:**

- Driven by the **freshness tracker** (§4.1) — append-only `freshness_record` rows.

**Edge Cases:**

- **No successful sync ever:** Indicator shows "never" with a high-visibility badge.
- **Clock skew:** Server time is authoritative.

---

### F64 — Per-Viewer Access Control (#64)

**Scope:** Viewers see the chart, never the raw credentials.

**Acceptance Criteria:**

- **AC-64.1** Viewer-side requests never include raw credentials — they pass through the query gateway with a **per-viewer access token** (opaque, short-lived).
- **AC-64.2** Credentials are scoped to the deck author/team and rotate without invalidating existing tokens.
- **AC-64.3** A viewer cannot enumerate other data sources or connections.
- **AC-64.4** An audit log records every viewer-issued query (§7.4).
- **AC-64.5** Permission errors are surfaced generically to viewers ("no access") without leaking connection details.

**Edge Cases:**

- **Token theft:** Tokens are short-lived (≤5 min) and bound to viewer + deck + scenario.
- **Replay attack:** Tokens are single-use for mutating calls; idempotency keys (§4.8) apply.

---

## 2. UX Flows

### 2.1 Connecting a Data Source

```
[+ New Data Source]
       │
       ▼
[Pick a connector]  ── Google Sheets ── Excel Online ── Airtable ── … ── REST ── GraphQL ── Postgres ── BigQuery
       │
       ▼
[Auth handshake]   ── OAuth redirect ── Credential screen ── Anonymous read-only
       │
       ▼
[Ping & discover]  ── Validate read ── List datasets ── Field types
       │
       ▼
[Save as <data_source>]    ── Reusable across slides
```

**Key screens:**

- **Connector picker** with logos, last-used, and "Bring your own" (custom REST/GraphQL).
- **Auth screen** with explicit permission disclosure and consent (mirrors PDPA consent basis, §11.1).
- **Ping result** with latency, row count, and warnings ("this dataset has personal data — flagged for DLP").
- **Save dialog** with explicit name, scope (personal/team), and default freshness policy.

### 2.2 Mapping Fields to Chart Axes

```
[Select chart] → [pick a data source] → [Auto-suggest mapping] → [Confirm/override]
```

- **Auto-suggest** uses the dataset's schema (dimensions vs. measures) and the chart's required binding schema (§F50).
- **Manual override** is per-axis with a "binding assistant" that highlights incompatible types.
- **Formula fields** are added inline from this screen.

### 2.3 Drilling Down Mid-Presentation

```
[Presenter clicks bar] → [Drill hierarchy resolves] → [Same chart, deeper granularity]
       │
       ▼
[Breadcrumb: Region > Country > City] → [Click crumb to pop]
```

- Drill axes are part of the binding config.
- Filter scope is the chart by default; the user can "broadcast" the drill to the slide (#52).

### 2.4 Refreshing Data on Stage

```
[Stage opens] → [Freshness check per binding] → [If stale → refresh] → [Swap on success]
                                                       │
                                                       └── [If fails → cached + stale badge]
```

- The presenter toolbar has a "Refresh all" button; per-chart refresh is in the chart's context menu.

### 2.5 Switching Scenarios

```
[Scenario chip in presenter toolbar] → [Pick Base / Bull / Bear] → [All bindings swap to scenario snapshots]
       │
       ▼
[Slider values reset to scenario baseline] → [Annotations filter to scenario]
```

- In the published viewer, the chip is visible only if the deck author enables it.

### 2.6 Simulating with Sliders

```
[Drag slider] → [Formula engine recomputes] → [Chart re-renders] → [Provenance chip shows "simulated"]
       │
       ▼
[Slider telemetry captured into state timeline] → [Replayer can replay the sweep]
```

- A "pin" toggle prevents the slide from being affected by future scenario changes.

### 2.7 Embedding an External Dashboard

```
[Insert → Embed] → [Pick provider] → [Authorize passthrough] → [Drop URL] → [Configure sizing]
       │
       ▼
[Render iframe] → [Embed proxy authenticates] → [Live dashboard inside slide]
```

- Domio never sees the embed's internal data; only the iframe and the auth passthrough.

---

## 3. Functional and Non-Functional Requirements

### 3.1 Connector Types and Protocols

| Class            | Protocol                    | Auth                         | Examples                    |
| ---------------- | --------------------------- | ---------------------------- | --------------------------- |
| SaaS spreadsheet | HTTPS + OAuth 2.0           | OAuth                        | Google Sheets, Excel Online |
| SaaS database    | HTTPS + OAuth 2.0 / API key | OAuth / API key              | Airtable, Notion            |
| RDBMS            | Wire protocol (TLS)         | User/password, mTLS          | Postgres, MySQL             |
| Warehouse        | Wire protocol (TLS)         | OAuth / Key-pair             | BigQuery, Snowflake         |
| REST             | HTTPS                       | Bearer / API key / Anonymous | Public & private APIs       |
| GraphQL          | HTTPS                       | Bearer / API key             | Public & private APIs       |

All connectors go through the **Connector Framework** (§4.1).

### 3.2 Polling vs. Webhook Refresh

- **Polling** is the default low-touch mode. Each binding schedules a refresh per its freshness policy.
- **Webhook refresh** is supported for connectors that can publish change notifications (e.g., Snowflake streams, Airtable webhooks, BigQuery `INFORMATION_SCHEMA` triggers). The webhook lands at Domio's **subscription/refresh webhook ingestion** endpoint (§6), which writes a `freshness_record` and invalidates relevant caches.
- Polling is used as a **floor** (every binding polls at least once per "stale threshold") so we don't depend on webhooks for correctness.

### 3.3 Query Budgets (NFR)

- **Per-user budget:** 300 connector queries / minute (rolling window).
- **Per-deck budget:** 60 refreshes / minute on stage.
- **Per-source budget:** token-bucket per connector, configurable per tenant.
- **Per-viewer budget:** 30 queries / minute (viewer traffic).
- **Exhaustion behavior:** Best-effort serve from cache; UI shows a "refresh throttled" ribbon.

### 3.4 Live Stage Freshness SLA (NFR)

- **Eager** bindings: refresh completes within 4s of stage-open for ≥95% of stages.
- **Lazy** bindings: refresh completes within 250ms of first view.
- **On-interval** bindings: refresh drift ≤ 1s from scheduled time.
- **Fallback:** if upstream is unreachable, stale cached data is shown within 100ms of stage-open.

### 3.5 Formula Engine Semantics

- **Deterministic** given inputs and version.
- **Sandboxed** (§8.4) — no I/O, no network, no `eval`.
- **Order of operations:** Depths-first, dependency-ordered, with constant folding.
- **Type coercion:** Numeric > string > boolean; missing values are typed `null` and propagate.
- **Locale:** Inputs are pre-parsed to canonical form; outputs are formatted at the edge.

### 3.6 Scenario Dataset Isolation

- Each scenario's dataset snapshots are **immutable** once written — never mutate in place.
- The scenario manager indexes snapshots by `(binding, scenario, version)` and serves the latest at render time.
- **Cross-scenario state** (filters, slider values) is namespaced per scenario.

### 3.7 Currency / Unit Localization

- **Storage:** Values stored in their source currency and unit (canonical).
- **Render:** Converted at the edge via the **localization service** (§4.1).
- **Exchange rates:** Stored as snapshots with their own freshness policy.
- **Precision:** Currency handled as `decimal` (or `bigint` minor units) — never `float`.

### 3.8 Credential Isolation Per Viewer

- **Author/team credentials** live in the vault (§7.1).
- **Viewer access tokens** are issued per session, scoped to deck + scenario.
- **No raw credentials** cross the gateway boundary toward the viewer (§7.2, §64).

### 3.9 Additional NFRs

- **Accessibility:** WCAG 2.2 AA for all chart interactions and data tables.
- **Browser support:** evergreen Chromium/Firefox/Safari; Edge 90+.
- **Offline presenter mode** (#137) ships with a frozen dataset snapshot per binding.
- **Internationalization:** UI in 100+ languages; field labels are localizable.

---

## 4. Architecture

### 4.1 High-Level Component Map

```
 ┌──────────────────────────────────────────────────────────────┐
 │                       Domio Editor / Viewer                   │
 │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
 │  │ Chart         │  │ Table /      │  │ Slider / Filter      │ │
 │  │ Renderer      │  │ Annotation UI│  │ Cross-link Manager   │ │
 │  └──────┬────────┘  └──────┬───────┘  └──────────┬───────────┘ │
 │         │                  │                     │             │
 │         └────────────┬─────┴─────────────────────┘             │
 │                      ▼                                        │
 │            ┌──────────────────────┐                           │
 │            │   Query Gateway      │ (in-process for editor)   │
 │            │   (rate-limit/cache) │                           │
 │            └─────────┬────────────┘                           │
 └──────────────────────┼────────────────────────────────────────┘
                        │ HTTPS / signed requests
                        ▼
 ┌──────────────────────────────────────────────────────────────┐
 │                       Domio Backend                           │
 │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐  │
 │  │ Connector       │  │ Formula Engine  │  │ Scenario     │  │
 │  │ Framework       │  │ (spreadsheet AST)│ │ Manager      │  │
 │  └────────┬────────┘  └────────┬────────┘  └──────┬───────┘  │
 │           │                    │                    │         │
 │  ┌────────▼──────┐ ┌───────────▼─────┐ ┌───────────▼──────┐  │
 │  │ Data Source   │ │ What-If Slider  │ │ Threshold        │  │
 │  │ Registry      │ │ Evaluator       │ │ Alerter          │  │
 │  └───────────────┘ └─────────────────┘ └──────────────────┘  │
 │  ┌────────────────┐ ┌─────────────────┐ ┌─────────────────┐  │
 │  │ Localization   │ │ Embed Proxy     │ │ Freshness       │  │
 │  │ Service        │ │ (auth passthru) │ │ Tracker         │  │
 │  └────────────────┘ └─────────────────┘ └─────────────────┘  │
 │  ┌─────────────────────────────────────────────────────────┐  │
 │  │ Postgres (control plane) + Object Storage (snapshots)  │  │
 │  └─────────────────────────────────────────────────────────┘  │
 └──────────────────────────────────────────────────────────────┘
```

### 4.2 Connector Framework

- **Adapter interface** (idempotent and stateless from the framework's perspective):
  - `discover(connection) -> {datasets: [{name, schema, sample}]}`
  - `ping(connection) -> {latency_ms, ok}`
  - `query(connection, spec, ctx) -> {rows, cursor, stats}`
  - `subscribe(connection, spec, ctx) -> {subscription_id}` (for webhook-capable)
  - `invalidate(connection, cache_keys)`
- **Retry policy:** exponential backoff with jitter; circuit breaker per `(tenant, connector)`.
- **Schema normalization:** All adapters return fields in a canonical scalar type system.
- **PII shape detection:** A first-class concern at the adapter layer — see DLP scanning (§7.3).

### 4.3 Query Gateway

- **Auth:** Verify per-viewer access token (or session for the editor).
- **Rate limiting:** Token-bucket per `(user, deck, viewer, source)`.
- **Caching:** Layered: in-memory LRU (60s) → Redis (per freshness policy) → dataset snapshot (object storage).
- **Audit:** Every query is logged (§7.4).
- **Passthrough:** Authorizes upstream calls using the vaulted credential; never returns the credential to the caller.

### 4.4 Chart Rendering Pipeline

- **SVG** for charts with < 1k points and high typographic fidelity (default).
- **Canvas2D** for charts with 1k–10k points where interaction dominates.
- **WebGL** for charts with > 10k points (heatmaps, scatter clouds) with GPU acceleration.
- **Hybrid:** A chart starts in SVG and switches to Canvas/WebGL as point count climbs.
- **Animation:** Driven by the timeline engine (§6) using `dataChange` and `enter` events.
- **DPR-aware:** Render at device pixel ratio for crisp output on high-DPI displays.

### 4.5 Formula Engine

- **AST:** Parsed from a spreadsheet-flavored grammar. Nodes: `literal`, `reference`, `op`, `call`, `range`, `lookup`.
- **Evaluation:** Tree-walking with a memoization layer keyed by `(input_snapshot_hash, version)`.
- **Optimization:** Constant folding, common-subexpression elimination, ranged aggregation pushing down to source.
- **Sandbox:** V8 isolate (or equivalent) with hard memory + time caps (§8.4).
- **Cycles:** Detected at parse time and reported with a path.

### 4.6 Scenario Manager

- **State:** A scenario is a named tree of overlays. Each overlay has: `{dataset_snapshot_refs, formula_constant_overrides, slider_value_overrides, annotation_overrides}`.
- **Switching:** O(1) — only the active overlay needs to be loaded.
- **Diff:** Two scenarios can be diffed (visualized or API-readable) for review.

### 4.7 Filter Cross-Link Manager

- A **slide-scoped pub/sub** that maps filter events to subscribed bindings.
- Filter keys are typed (`region`, `quarter`, etc.) and bindings opt-in via `listen_to_filters`.
- Conflict resolution: most-recent-wins within the slide; explicit "global" filters override.

### 4.8 What-If Slider Evaluator

- Subscribes to slider change events.
- Computes the affected formula fields and triggers targeted recomputation.
- Records the input → output mapping in the state timeline for replay.

### 4.9 Threshold Alerter

- Subscribes to formula & chart output changes.
- Evaluates threshold rules, emits a typed `threshold_breach` event.
- Emits a visual style change and an optional notification.

### 4.10 Localization Service

- Stateless: `(value, source_currency, source_unit, target_locale, snapshot_id) -> formatted_string`.
- Snapshot-aware: locked rates per session.
- Localized number formatting (`Intl.NumberFormat`) and date formatting.

### 4.11 Embed Proxy

- Terminates the viewer's session, requests a short-lived token from the embed provider (via Domio's vaulted provider credentials), and forwards the iframe URL.
- **CSP-strict**; no SSRF (§7.2).
- Audits every embed load.

### 4.12 Stale-Data Tracker

- Append-only `freshness_record` table.
- A worker computes per-binding staleness signals consumed by the editor UI and by replay.

### 4.13 Data Source Registry

- A catalog of public connectors + tenant-private connectors.
- Versioned; pinned on `data_source` for forward compatibility.

---

## 5. Data Model (Postgres)

All tables are in the `domio` schema. Tenant isolation is enforced by `tenant_id` on every row and a row-level security policy.

```sql
-- 5.1 data_connection: per-user/team credentials (vaulted separately)
CREATE TABLE data_connection (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  owner_id        UUID NOT NULL,             -- user_id
  connector_id    TEXT NOT NULL,             -- 'google_sheets', 'postgres', ...
  connector_ver   TEXT NOT NULL,             -- pinned adapter version
  label           TEXT NOT NULL,
  scope           TEXT NOT NULL CHECK (scope IN ('personal','team')),
  credential_ref  TEXT NOT NULL,             -- vault key — never raw
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, owner_id, connector_id, label)
);
CREATE INDEX ON data_connection (tenant_id);

-- 5.2 data_source: a queryable endpoint bound to a connection
CREATE TABLE data_source (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  connection_id   UUID NOT NULL REFERENCES data_connection(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('sheet','table','view','rest','graphql','custom')),
  query_spec      JSONB NOT NULL,             -- connector-specific spec
  schema_json     JSONB NOT NULL,             -- last seen schema
  pii_class       TEXT NOT NULL DEFAULT 'none' CHECK (pii_class IN ('none','low','medium','high','restricted')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5.3 query: declarative chart-spec → dataset
CREATE TABLE query (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id  UUID NOT NULL REFERENCES data_source(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL,
  name            TEXT NOT NULL,
  query_spec      JSONB NOT NULL,
  freshness_policy JSONB NOT NULL,            -- {type:'eager|lazy|manual|on_interval', interval_seconds?}
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5.4 dataset_snapshot: immutable result of a query
CREATE TABLE dataset_snapshot (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id        UUID NOT NULL REFERENCES query(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL,
  scenario_id     UUID REFERENCES scenario(id) ON DELETE SET NULL,
  hash            TEXT NOT NULL,             -- content hash for dedup
  row_count       BIGINT NOT NULL,
  bytes           BIGINT NOT NULL,
  obj_key         TEXT NOT NULL,             -- object storage pointer
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ
);
CREATE INDEX ON dataset_snapshot (query_id, created_at DESC);

-- 5.5 scenario
CREATE TABLE scenario (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  deck_id         UUID NOT NULL,
  parent_id       UUID REFERENCES scenario(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,             -- 'Base', 'Bull', 'Bear', ...
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5.6 formula_field
CREATE TABLE formula_field (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  deck_id         UUID NOT NULL,
  query_id        UUID REFERENCES query(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  expression      TEXT NOT NULL,
  ast_json        JSONB NOT NULL,             -- pre-parsed AST
  version         INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5.7 chart_widget
CREATE TABLE chart_widget (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  deck_id         UUID NOT NULL,
  slide_id        UUID NOT NULL,
  component_id    UUID NOT NULL,              -- canvas element
  type            TEXT NOT NULL,              -- 'bar', 'line', 'sankey', ...
  props_json      JSONB NOT NULL,             -- chart-specific props
  binding_id      UUID NOT NULL REFERENCES chart_binding(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5.8 chart_binding: glue between a chart and a query/formula
CREATE TABLE chart_binding (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  chart_widget_id UUID NOT NULL REFERENCES chart_widget(id) ON DELETE CASCADE,
  query_id        UUID NOT NULL REFERENCES query(id) ON DELETE RESTRICT,
  field_map       JSONB NOT NULL,             -- chart axis → dataset column
  listen_to_filters TEXT[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5.9 annotation
CREATE TABLE annotation (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  chart_widget_id UUID NOT NULL REFERENCES chart_widget(id) ON DELETE CASCADE,
  scenario_id     UUID REFERENCES scenario(id) ON DELETE CASCADE,
  bindable_point  JSONB NOT NULL,             -- {series, x, y} or {row_index}
  author_id       UUID NOT NULL,
  text            TEXT NOT NULL,
  color           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5.10 threshold_rule
CREATE TABLE threshold_rule (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  chart_widget_id UUID NOT NULL REFERENCES chart_widget(id) ON DELETE CASCADE,
  measure         TEXT NOT NULL,              -- 'revenue', 'churn', ...
  comparator      TEXT NOT NULL CHECK (comparator IN ('lt','lte','gt','gte','eq','between','outside')),
  values          JSONB NOT NULL,             -- numeric or [low, high]
  severity        TEXT NOT NULL CHECK (severity IN ('info','warn','critical')),
  style_override  JSONB NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5.11 embed_config
CREATE TABLE embed_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  component_id    UUID NOT NULL,
  provider        TEXT NOT NULL,              -- 'looker','tableau','powerbi','grafana','custom'
  url             TEXT NOT NULL,
  sizing          JSONB NOT NULL,
  auth_passthrough JSONB NOT NULL,            -- {kind, scopes, credential_ref}
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5.12 freshness_record
CREATE TABLE freshness_record (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL,
  binding_id      UUID NOT NULL REFERENCES chart_binding(id) ON DELETE CASCADE,
  scenario_id     UUID REFERENCES scenario(id) ON DELETE SET NULL,
  snapshot_id     UUID REFERENCES dataset_snapshot(id) ON DELETE SET NULL,
  status          TEXT NOT NULL CHECK (status IN ('ok','stale','error','never')),
  source          TEXT NOT NULL,              -- 'poll','webhook','manual'
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON freshness_record (binding_id, recorded_at DESC);

-- Privacy & isolation
ALTER TABLE data_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_source    ENABLE ROW LEVEL SECURITY;
ALTER TABLE query          ENABLE ROW LEVEL SECURITY;
ALTER TABLE dataset_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario       ENABLE ROW LEVEL SECURITY;
ALTER TABLE formula_field  ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_widget   ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_binding  ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotation     ENABLE ROW LEVEL SECURITY;
ALTER TABLE threshold_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE embed_config   ENABLE ROW LEVEL SECURITY;
ALTER TABLE freshness_record ENABLE ROW LEVEL SECURITY;
-- RLS policies scope SELECT/INSERT/UPDATE/DELETE on tenant_id = current_setting('app.tenant_id')::uuid
```

**Notes:**

- `tenant_id` on every row enforces isolation in a shared DB. For self-hosted, a per-tenant schema is also supported.
- **Vault** stores `credential_ref` — keys reference the secrets manager; raw credentials never live in Postgres.
- **Dataset snapshots** are immutable; TTL is policy-driven.

---

## 6. APIs and Contracts

All public APIs are versioned (`/v1`) and follow a consistent error envelope: `{error: {code, message, details}}`. Idempotency keys are required for any mutating call.

### 6.1 Connector Auth Handshake

```
POST /v1/connectors/{connector_id}/auth/start
  → {redirect_url, state}

GET  /v1/connectors/{connector_id}/auth/callback?code=…&state=…
  → {connection_id, scopes}

POST /v1/connections/{connection_id}/ping
  → {ok, latency_ms, samples}

POST /v1/connections/{connection_id}/discover
  → {datasets: [{name, schema}]}
```

### 6.2 Query Execution

```
POST /v1/queries/{query_id}/execute
  body: {scenario_id?, params?, freshness_policy_override?}
  → {snapshot_id, hash, row_count, stats}

POST /v1/datasets/{snapshot_id}/rows
  body: {limit, cursor, sort?, filter?}
  → {rows, next_cursor}
```

### 6.3 Subscription / Refresh Webhook Ingestion

```
POST /v1/ingest/webhook
  headers: {X-Domio-Signature, X-Domio-Source}
  body: {source, dataset_or_query_id, event}
  → {accepted, freshness_record_id}
```

- All incoming webhooks are signed and verified.
- Idempotent on `(source, event_id)`.

### 6.4 Scenario Toggle

```
POST /v1/decks/{deck_id}/scenes/{scenario_id}/activate
  body: {viewer_id?, persist_to_timeline?}
  → {active_scenario_id, switched_at}
```

- Authorized for the presenter / the deck author / an applicable agent token.

### 6.5 Simulation Sweep

```
POST /v1/decks/{deck_id}/scenes/{scenario_id}/simulate
  body: {sliders: {name: range}, steps: number, parallel: boolean}
  → {sweep_id, results: [{step, values}]}

GET  /v1/sweeps/{sweep_id}
  → {results}
```

- Used by automated agents (#239) for sensitivity analysis.

### 6.6 Annotation CRUD

```
POST   /v1/charts/{chart_widget_id}/annotations
GET    /v1/charts/{chart_widget_id}/annotations?scenario_id=…
PATCH  /v1/annotations/{id}
DELETE /v1/annotations/{id}
```

### 6.7 Dashboard Embed Auth

```
POST /v1/embeds/{embed_config_id}/token
  body: {viewer_id, ttl_seconds}
  → {token, embed_url, expires_at}
```

- Token is short-lived (≤60s).
- The embed_url is a Domio proxy URL that forwards the iframe to the upstream provider using the vaulted credential.

### 6.8 Internal Contracts

- **Connector ↔ Gateway:** `query` returns a stable canonical schema.
- **Gateway ↔ Renderer:** Server-sent events (SSE) for streaming refresh updates; websockets for live filter cross-link.
- **Agent API (per #221–236):** The same endpoints are exposed via MCP; tools are described by JSON Schema (per #233) and discoverable via `list_tools` (per #236).

---

## 7. Security

### 7.1 Credential Vault

- All author/team credentials live in a **vault** (HashiCorp Vault / AWS KMS-backed envelope encryption).
- Postgres stores only `credential_ref` — opaque keys.
- Rotation is supported without invalidating existing viewer tokens.
- Network access to the vault is restricted to the connector framework.

### 7.2 Per-Viewer Access Tokens

- Viewer sessions receive **opaque, short-lived** tokens (≤5 min) scoped to `(tenant_id, deck_id, scenario_id, viewer_id)`.
- Tokens are single-use for **mutating** calls; idempotency keys are required.
- Tokens never carry raw credentials; the gateway uses them to look up the right vaulted credential.
- **No raw credentials traverse the gateway toward the viewer.** (#64)

### 7.3 DLP Scanning of Fetched Data

- Outbound queries pass through a DLP engine that scans results for PII/shape patterns (email, SSN, phone, etc.).
- High-sensitivity matches are routed through a separate pipeline (redaction or block, configurable per tenant).
- DLP runs at the gateway layer (in front of the connector framework) and at the embed proxy.

### 7.4 Audit Log

- Every query (author, agent, viewer) is logged with: `{actor, tenant, deck, query_id, snapshot_id, latency_ms, status, idempotency_key}`.
- Logs are append-only, signed, and tamper-evident.
- Logged to a separate analytics pipeline (#12) for operational visibility.

### 7.5 Signed Embed URLs

- Embed URLs are signed with a short-lived token; signature includes the viewer and the deck scope.
- The embed proxy refuses to serve URLs whose signature is missing, expired, or tampered with.

### 7.6 Short-Lived Auth Passthrough

- For embedded dashboards (#62), the proxy issues a short-lived token to the embed provider on the viewer's behalf.
- The viewer never sees the embed provider's credential; they only see the iframe URL.

### 7.7 Threat Model Highlights

- **SSRF:** The embed proxy rejects URLs routed to internal IPs / metadata endpoints.
- **Credential theft:** Mitigated by vault isolation and short-lived viewer tokens.
- **Data exfiltration:** Mitigated by viewer-scoped tokens and DLP at the gateway.
- **Injection (formula sandbox):** A separate concern; mitigated by the sandbox (§8.4).
- **Replay:** Mitigated by single-use tokens and idempotency keys (§4.8).

### 7.8 Compliance Notes (Bangladesh Context)

- **Consent basis** must be configurable per data source — recorded against `data_source.consent_basis`.
- **Data residency** (§11.2): the connector framework can be configured to use a regional gateway endpoint for tenants with restricted data.
- **Retention:** `dataset_snapshot.expires_at` is enforced by a janitor job; default retention is configurable per connector class.

---

## 8. Performance

### 8.1 Query Timeout Budgets

- **Default query timeout:** 15s.
- **Author-time queries:** 30s.
- **Viewer-side queries:** 5s.
- **Timeout behavior:** Cancel the upstream call, return cached data with a stale badge, and log the timeout.

### 8.2 Refresh Fan-Out Limits

- **Max concurrent refreshes per deck:** 12.
- **Max concurrent refreshes per tenant:** 100.
- **Max concurrent refreshes per source:** 4.
- Excess refreshes are queued (FIFO with priority — eager > on-interval > lazy).

### 8.3 Chart Render Budgets (FPS Targets)

| Chart type                 | Target FPS | Render budget / frame |
| -------------------------- | ---------- | --------------------- |
| Bar / Line / Area / Pie    | 60         | 16ms                  |
| Scatter (≤10k points)      | 60         | 16ms                  |
| Heatmap (≤100k cells)      | 30         | 32ms                  |
| Sankey / Treemap           | 60         | 16ms                  |
| Network graph (3D, #68)    | 60         | 16ms (WebGL)          |
| Scrolling table (10k rows) | 60         | 16ms virtualized      |

### 8.4 Sandboxed JS for Formulas

- Formulas run in a **V8 isolate** (or an equivalent: QuickJS, Wasmtime with QuickJS).
- Hard caps: **memory** (≤16 MB), **CPU time** (≤50 ms / invocation), **stack** (≤2k frames).
- No I/O, no `eval`, no network, no access to global `window`/`process`.
- Quota: ≤10k invocations per isolate lifetime; isolates are recycled.

### 8.5 Aggregation Precompute

- For high-cardinality dimensions, aggregations are precomputed and stored in `dataset_snapshot`.
- For interactive filters, a reduced precompute (top-N + "other") is maintained and lazily expanded.

### 8.6 Caching Layers

- **In-memory LRU** (per service instance): 60s TTL.
- **Redis** (per tenant): respect freshness policy.
- **Object storage** (snapshots): the durable layer.

### 8.7 Connection Pooling

- Per-connector, per-tenant pools with circuit breakers.
- Postgres pools use **PgBouncer** for short-lived connections.

### 8.8 Rendering Optimizations

- **Virtualization** for tables and large lists.
- **OffscreenCanvas** for chart rendering in web workers (#11 GPU acceleration).
- **DPR-aware** rendering for crisp output.

---

## 9. Observability and Testing

### 9.1 Observability

- **Structured logs:** JSON, with `tenant_id`, `deck_id`, `binding_id`, `scenario_id`, `actor_id`, `trace_id`.
- **Metrics:** counters (queries, refreshes, threshold_breaches), histograms (latency, payload size), gauges (cache hit rate, queue depth).
- **Distributed tracing:** OpenTelemetry across the gateway, connector framework, formula engine, and scenario manager.
- **Dashboards:** Per-tenant and per-connector dashboards (latency, error rate, cache hit rate, P95 staleness).
- **Alerting:** Query timeouts > 5% for 5 minutes, circuit breaker open, snapshot retention failures.

### 9.2 Replay Datasets

- Every query execution produces a replayable dataset snapshot (immutable, content-addressed).
- The state timeline (#205) replays the full meeting: filter changes, scenario toggles, slider moves, annotations.
- Replay is a first-class testing artifact — see §9.5.

### 9.3 Scenario Diff Testing

- Two scenarios are diffed at the binding, formula, and snapshot levels.
- Diff is both human-readable (visual) and machine-readable (JSON).
- Useful for review, regression testing, and audit.

### 9.4 Test Pyramid

- **Unit:** Connector adapters, formula engine, scenario manager, embedding proxy.
- **Integration:** Gateway + adapter + Postgres; formula engine + snapshots.
- **Contract:** Pact / OpenAPI consumer tests against the gateway.
- **E2E:** Playwright against the editor and presenter; stage-mode flows.
- **Property-based:** Formula engine (roundtrip and idempotency), scenario switcher (state invariants).
- **Performance:** k6 for the gateway; chart render benchmarks in CI.

### 9.5 Replay-Based Testing

- Recorded sessions are replayed in a sandbox and the resulting rendered output is compared against a golden master.
- Used for the **Presentation state timeline** (#205) and for **automated regression** of stage-mode behavior.

### 9.6 Security Testing

- **SAST** in CI (e.g., Semgrep, CodeQL).
- **DAST** against the staging environment.
- **Dependency scanning** (e.g., Trivy, Snyk).
- **Pen-testing** at major releases.
- **Red-team** playbook for the embed proxy and connector framework.

### 9.7 Load Testing

- Sustained stage-mode load: 1k concurrent presenters, 10k viewers.
- Burst refresh load: 10k refreshes / minute.
- Formula sweep (#239) load: 100k evaluations / minute.

---

## 10. Cross-Section Ties

These ties ensure section 4 (Live Data & Charts) is integrated, not isolated.

### 10.1 Editor Canvas (Section 1)

- Charts are first-class canvas elements (per #4 layers, #8 constraints).
- Drag-and-drop placement, snap-to-grid (#2), and right-click context (#16) apply to chart widgets.
- Multiplayer presence (#17) extends to chart selections and "who's editing this binding."

### 10.2 Components (Section 2)

- Charts are **smart components** (#25) with editable props panels — every chart type exposes a JSON Schema (#233).
- Chart variants (#24) are first-class (e.g., bar "compact" vs. "report").
- Brand-locked templates (#36) can mark chart regions as non-editable.

### 10.3 Theming (Section 3)

- Chart colors, fonts, and radii are derived from design tokens (#37).
- One-click theme re-skin (#38) preserves chart bindings.
- Accessibility-aware palettes (#44) are honored by series coloring.

### 10.4 Animation (Section 6)

- Chart builds (#58) tie into the timeline engine (#85).
- `dataChange` is a registered animation trigger (#88).
- Reduced-motion (#93) is honored by chart tweens.

### 10.5 Prototyping Variables (Section 7)

- Slider state and filter state are **variables** (#100) — read by other slides and components.
- Variables can be bound to prototype inputs (#101), enabling the ROI calculator use case (#102).
- Deep-linkable state (#107) references `(deck, slide, scenario, sliders, filters)`.

### 10.6 AI Data-to-Story (Section 8)

- **Data-to-story** (#110) consumes the same `data_source` and `query` graph.
- AI chart selection (#123) operates on the binding schema.
- Confidence surfacing (#238) is attached to data interpretations, not raw data.

### 10.7 Analytics (Section 12)

- Chart interactions are first-class analytics events (#169).
- A/B testing of chart variants (#173) is supported via the binding version.
- Funnel view (#177) is enriched with "which scenarios did the viewer toggle?"

### 10.8 Agentic Simulation (Section 15/16)

- **Simulation mode** (#239) plugs into the **what-if slider evaluator**; an agent sweeps sliders programmatically.
- **Provenance chips** (#215) are queryable by agents (#294) — the data lineage endpoint resolves `(binding → query → dataset_snapshot → source)`.
- **Agent-writable data layer** (per §"Weaving AI further into what already exists") is implemented via the connector framework's write-back capability (extension of #48).
- **MCP tools** (per #221, #222) include `bind_data_source`, `run_scenario`, `simulate_sweep`, `list_annotations`, and `get_data_lineage` — each described by JSON Schema (per #233).
- **Tool-call transcript** (#227) records every agent-driven data binding, scenario toggle, and annotation.

### 10.9 Living Documents (Section 15)

- A "living deck" (#206) is a presentation whose bindings are **always-on** and whose freshness policy is `eager`.
- The freshness tracker (§4.1) is the backing system for this; the state timeline (#205) preserves the meeting history.

### 10.10 Two-Way Slides (Section 15)

- Two-way sliders (#211) are slider components with a **multi-party state** — the same scenario manager, but with a synchronized state across viewer devices.

### 10.11 Cross-Deck Knowledge Graph (Section 15)

- The data source registry (§4.13) is a node in the cross-deck graph (#219).
- "Find every slide across the company that cites our NPS score" maps to a query against `chart_binding` joined to `formula_field`.

### 10.12 Compliance & Governance (Section 14)

- DLP rules (#195) are enforced at the gateway (§7.3).
- Audit log (#196) ingests the query audit log (§7.4).
- Public API / SDK (#200) exposes the same APIs (§6) for programmatic deck generation, with agent-scoped permissions (#225).

---

## Appendix A — Aggregation & Precompute Strategy

For charts with high-cardinality dimensions or high-volume sources, we precompute the following:

- **Top-N + "other"** at the row level (per binding).
- **Windowed aggregations** (trailing 7d, 30d, 90d) for time-series charts.
- **Cohort segments** for funnel/sankey charts.

Precompute is **scenario-aware** — each scenario has its own precompute snapshots.

## Appendix B — Example Freshness Policy

```json
{
  "type": "on_interval",
  "interval_seconds": 60,
  "jitter_seconds": 5,
  "stale_after_seconds": 180,
  "failure_backoff": {
    "type": "exponential",
    "initial_seconds": 30,
    "max_seconds": 1800,
    "max_attempts": 5
  }
}
```

## Appendix C — Example Chart Binding (JSON Schema fragment)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "domio/chart_binding/v1",
  "type": "object",
  "required": ["query_id", "field_map"],
  "properties": {
    "query_id": { "type": "string", "format": "uuid" },
    "field_map": {
      "type": "object",
      "required": ["x", "y"],
      "properties": {
        "x": { "type": "string" },
        "y": { "type": "string" },
        "series": { "type": "string" },
        "size": { "type": "string" },
        "color": { "type": "string" }
      }
    },
    "listen_to_filters": {
      "type": "array",
      "items": { "type": "string" }
    },
    "drill": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

---

**End of Section 4 — Live Data & Interactive Charts (Features 48–64).**
