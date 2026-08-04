# Changelog

All notable changes to this project are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Phase 9 — Animation & transition system

#### Added

- **Easing library (`packages/easing`).** Pure-TS, fully deterministic
  easing evaluators (linear, step, cubic-Bézier via Newton-Raphson with
  degenerate fallbacks, spring via fixed 120 Hz sub-step solver with
  `wobbly`/`snappy`/`gentle` presets, physics gravity/throw/bounce);
  `validateBezier` rejecting degenerate/non-monotonic/out-of-range handles;
  256-entry LUT builder (<5 ms) + 1024-entry LRU cache. **47 tests.**
- **Animation runtime (`packages/animation-runtime`).** Client timeline
  engine (tracks, keyframes, interpolation of numbers/colors/strings,
  loop/playCount/startOffset, debounced writes, worker-offload hook,
  headless `tickManually`); trigger resolver (`on_click`/`on_enter`/
  `on_hover`/`on_data_change`/`on_timer` with 250 ms debounce + 16-trigger
  cap, negative timer offset rejected); stagger (forward/reverse/
  center-out/random, offsets only); reduced-motion guard (`follow_os`/
  `always_reduced`/`always_full`, duration clamp, particle/scroll collapse);
  scroll-linked bindings (32 cap, dependency rejection). **77 tests incl.
  a 64-track @ 60 fps perf smoke.**
- **Timeline API (`services/timeline-api`).** Hono service: timeline/track/
  keyframe/trigger CRUD with optimistic-lock (etag → 409), easing-curve
  CRUD with business-rule validation (non-monotonic Bézier, spring bounds),
  animation-preset CRUD with `applyPreset` (required-property check +
  last-slide `on_enter`→`on_click` conversion), transition CRUD, reduced-
  motion get/put (default `follow_os`). **33 tests.**
- **Magic-move (`services/magic-move` + `workers/magic-move`).** Job CRUD
  + worker-facing claim/complete/fail; compute worker with poll loop and
  graceful shutdown. **19 tests.**
- **Export pipeline (`services/export-pipeline` + `workers/export-render`).**
  Job lifecycle (queued→rendering→encoding→ready) with budget enforcement
  (GIF ≤ 12 s, video ≤ 30 s); GIF encoder via gifenc with a minimal
  GIF89a LZW fallback; ffmpeg shell-out for MP4/WebM (graceful
  `{ unsupported: true }` when absent); SSRF guard (loopback, RFC1918,
  link-local, cloud metadata, non-HTTPS); render worker with graceful
  shutdown. **54 tests.**
- **Viewer animation runtime (`apps/viewer/src/animation`).** Scroll-linked
  resolver (easing, bucket cache, cap, dependency chain), reduced-motion
  guard factory, playback engine over `TimelineEngine`, 8-kind transition
  resolver (fade/slide/wipe/zoom/flip/bubble/cube/shutter) with motion-heavy
  classification; interactive demo page wiring all four modules. **87 tests.**
- **Canvas ops (`packages/canvas`).** `TimelineOp`, `TransitionOp`,
  `MagicMoveOp`, `ReducedMotionOp` (deep-clone + inverse-swap factories,
  apply/revert, `applyOp` wiring) storing to
  `props['x-domio:timeline']` / `slide['x-domio:transition']` /
  `element.element_role` / `deck['x-domio:reduced-motion']`. **188 tests.**
- **Editor UI (`apps/editor`).** Animations left tab with timeline panel
  (add/configure timelines, tracks, keyframes, play/scrub), easing picker +
  custom Bézier editor, trigger picker, per-slide transition inspector,
  magic-move role inspector, copy/paste animations, reduced-motion policy
  panel, export dialog; all committed via the new ops through the
  HistoryEngine (undo/redo safe). **189 tests + 9-test Playwright e2e.**
- **Scene-graph `element_role`.** Optional `element_role` field added to all
  layer types (contract-first: schema → generated types → validator test).
- **Contracts + migrations.** 7 JSON schemas (timeline, easing-curve,
  animation-preset, reduced-motion, magic-move, transition, animation-export)
  + 5 OpenAPI yamls (animation, magic-move, export-pipeline); migrations
  `0023_phase09_animation` (10 tables + RLS) and
  `0024_phase09_animation_indexes_seed` (indexes + easing curves + 24
  presets), verified against live Postgres via the docker-gated harness
  (7/7).

### Phase 8 — Live data & interactive charts

#### Added

- **Formula engine (`packages/formula-engine`).** Recursive-descent parser
  (lexer → AST) for spreadsheet-style formulas; ~50 built-in functions
  (aggregation, logical, text, date, lookup, math) with typed error codes
  (`#DIV/0!`, `#REF!`, `#CYCLE!`, `#NAME?`, …); dependency DAG with
  cycle detection reporting the reachable path; incremental recompute
  (slider drags re-evaluate only dependents); constant folding + CSE;
  sandboxed evaluator with host-access rejection (`eval`, `Function`,
  `globalThis`, `process`, `fetch`, …) and step/recursion/runtime caps —
  no `eval`, no I/O. **288 tests.**
- **Chart engine (`packages/chart`).** 14 chart types (bar, line, area,
  pie, scatter, funnel, sankey, treemap, heatmap, waterfall, gauge,
  radar, candlestick, bullet) rendered as SVG with a tri-stack renderer
  interface and hybrid escalation thresholds (1k / 10k points);
  per-type binding schemas + `validateBinding`; interaction layer
  (hit-test, drill, legend toggle, brush zoom); data-table ops
  (sort, paginate >10k with cursor, locale-aware format,
  conditional format, sparkline). **84 tests.**
- **Mock data generator (`packages/mock-data`).** Seeded deterministic
  generator (uniform/normal/lognormal/poisson/categorical/date/currency)
  with correlated region/quarter demos. **26 tests.**
- **Connector framework (`services/connector-framework`).** Versioned
  adapter registry (pin/deprecation); canonical column/row normalization
  with semantic roles; PII shape detection (email/phone/SSN) reusing
  `@domio/redact-pii`; exponential backoff + jitter + circuit breaker;
  auth flow handlers for Google/Microsoft/Airtable/Notion (state + scope,
  CSRF); credential validation for Postgres/MySQL/BigQuery/Snowflake +
  REST/GraphQL (bearer/API-key/anonymous); `create-readonly-role` SQL for
  Postgres 14+ and MySQL 8; 10 adapters (sheets, excel, airtable, notion,
  postgres, mysql, bigquery, snowflake, rest, graphql) on an injectable
  transport with recorded-provider fixtures (real Postgres adapter is
  docker-gated). **126 tests.**
- **Query gateway (`services/query-gateway`).** Token-bucket rate limiter
  (burst + refill), 3-tier cache with single-flight stampede prevention,
  ACL (deny-by-default), HMAC webhook ingestion with idempotent dedup,
  single-use viewer tokens with TTL + scope, append-only tamper-evident
  audit log. **33 tests.**
- **Refresh scheduler (`workers/refresh-scheduler`).** Drift-tracked
  `on_interval` ticking (≤1s) + `eager` triggers; writes
  `dataset_snapshot` + `freshness_record` (ok/error). **14 tests.**
- **Scenario manager (`services/scenario-manager`).** Scenario DAG
  (parent chains, cycle detection with reachable path, depth cap 8),
  overlay merge (parent-first, child-wins) + diff, CRUD + REST. **28 tests.**
- **Localization (`services/localization`).** Intl number/currency/percent/
  date formatting + collation (en/de/bn), fixed-point Decimal arithmetic
  (no float drift), FX rate ingestion + as-of conversion. **32 tests.**
- **Embed proxy (`services/embed-proxy`).** SSRF guard (loopback, RFC1918,
  link-local, cloud metadata, DNS re-check), single-use TTL embed tokens,
  authenticated forwarding. **61 tests.**
- **Freshness tracker (`workers/freshness-tracker`).** Append-only
  freshness records (ok/stale/error/never), staleness math with grace
  period, graceful shutdown. **25 tests.**
- **Contracts.** JSON Schemas `chart-binding-v1`, `scenario-v1`,
  `annotation-v1`, `query-v1`, `threshold-rule-v1`, `mock-data-v1`;
  OpenAPI `connector-framework.yaml`, `query-gateway.yaml`, `scenario.yaml`,
  `localization.yaml`, `embed-proxy.yaml`, `freshness-tracker.yaml`.
- **Migrations.** `0021_phase08_data_plane` (12 tables + RLS via
  `current_setting('app.tenant_id')`) and `0022_phase08_live_data_indexes_seed`
  (indexes + 4 freshness policies + 24 threshold-rule templates).
- **Canvas ops (`packages/canvas`).** `DataBindingOp` / `ThresholdOp` —
  bindings and threshold rules persist on the layer via
  `props['x-domio:binding']` / `props['x-domio:thresholds']` with
  deep-cloned inverse for undo. **10 tests.**
- **Prop engine (`packages/schema-prop`).** Real `data-binding` and
  `thresholds` control kinds (previously a placeholder). **8 tests.**
- **Editor live-data UI (`apps/editor`).** Data Sources tab (demo
  datasets + add/refresh/remove), live-chart inserts (14 types via
  `domio.live-*` catalog), bind-to-data inspector with field mapping and
  validation, threshold rules panel, scenario switcher dropdown,
  freshness status, stage-view toggle. **153 tests (26 files)** +
  e2e smoke `e2e/p08-live-charts.spec.ts` (insert → bind → threshold →
  scenario). **242 tests** in `@domio/components`.
- **Handoff doc:** `docs/handoff/P07-to-P08.md`.

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

### Phase 6 — Components & Templates ecosystem

#### Added

- **Component ecosystem core (sub-phase 1):** `component` scene-graph kind + validation;
  `@domio/schema-prop` JSON-Schema 2020-12 prop engine (Fast-Check tested);
  `@domio/components` curated catalog (25 components incl. `domio.icon`); `PropEditOp`/
  `VariantChangeOp` CRDT ops; `ElementSvg` renderer upgrade; Magic UI chrome
  (Tailwind + `motion`, adapted `MagicCard` + `Marquee`); Insert → Components panel,
  schema-driven PropsPanel, promote dialog, My Library, Stickers, Icon picker.
- **Registry service (`services/registry`, Hono):** content-addressed bundle store with
  SHA-256 hash verification, signed URLs (5-min TTL), catalog (publish/get/search/deprecate),
  variant resolution (instance > matrix > master), version pins (track-latest/pin-version/
  pin-range/workspace-managed), install round-trip, license module (compact JWS grant/verify,
  30-day offline grace, seats, revocation), team libraries (append-only event log, idempotent
  replay, policy modes, HMAC webhooks), marketplace (listing lifecycle state machine, reviews +
  moderation pipeline, append-only revenue-share ledger, read-side search), templates (install
  engine with binding-path placeholders, section templates, brand-lock enforcement in 3
  strictness modes, SVG poster/preview renderer), media (icon ingest + trigram/dhash search +
  recolor, Unsplash/Pexels stock providers, Lottie validation/sanitization + GIF budget,
  sticker packs), workers (library-sync, license-signer, payout-ledger-writer, review-moderator,
  template-preview-renderer, icon-importer, cdn-signer), HTTP transport (7 route groups) and
  MCP tool surface (13 tools + agent audit trail). **542 tests, 84% line coverage.**
- **Contracts + data:** `component-package-v1` and `marketplace-listing-v1` JSON schemas,
  7 protos (component_registry, marketplace, license, library_sync, templates, locks,
  mcp_components), migrations 0011–0016 (catalog, libraries, marketplace+license+ledger,
  templates+brand-locks, icons, blobs+audit) — apply/rollback verified against Postgres;
  ADRs 0005–0008 (prop schema, bundle store, license, brand locks).
- **Editor flows (sub-phase 2):** promote-to-component with prop inference, detach-from-
  component, version pinning + update/unavailable badges, sticker packs, icon picker with
  recolor, i18n (en/bn/es/fr/de/ja/zh-CN), axe-core a11y gates, Playwright E2E smoke.
- **Fixed pre-existing editor build blockers:** `next.config.mjs` webpack `extensionAlias`
  for `.js`→`.ts` workspace imports; split `loadContracts` into `@domio/schema/contracts`
  subpath so the schema barrel is client-bundle safe.


#### Fixed

- Editor `HistoryEngine` was recreated per deck state via
  `useMemo([deck])`, silently wiping undo/redo history after every op;
  now constructed once.
- Pre-existing ESLint `consistent-type-imports` violations across
  editor sync files.

### Phase 7 — Theming, Brand & Design Tokens

#### Added

- **Design token substrate (`@domio/tokens`, `@domio/theme`).** Typed token
  schema (color, typography, spacing, radius, shadow, motion, content,
  border); pure-function sRGB ↔ OKLCH conversions; WCAG 2 contrast and
  APCA Lc helpers; alias-cycle detection; referrer finder; theme-diff
  computation; inheritance chain inspection.
- **Theme service (`services/theme`).** Token / theme / override CRUD;
  transactional theme apply with audit; published theme versions are
  immutable. **32 tests.**
- **Brand service (`services/brand`).** Brand-kit CRUD with logos,
  palettes, type system, imagery rules; immutable published form;
  sub-brand DAG with cycle detection; multi-brand contexts;
  URL-driven extraction job record with `attribution` block and
  mandatory `extractionAttestation`. **41 tests.**
- **Font service (`services/font`).** `.woff2/.woff/.otf/.ttf/.ttc`
  upload with SHA-256 dedup, license-status inference
  (`permissive | restricted | unknown`), glyph-coverage reporting per
  Unicode block, anti-piracy heuristic gating (score ≥ 0.8 throws
  `FontLicenseBlockedError`). **21 tests.**
- **Style lint service (`services/lint`).** Two-pass engine; rules for
  off-brand color (BLOCK), off-brand font (WARN), off-token spacing
  (INFO), low contrast (BLOCK via WCAG), alias loops (BLOCK); structured
  `fixProposal` payloads (replacementToken, deltaE, old/new values)
  for one-click apply. **18 tests.**
- **Dark/light pair worker (`workers/theme-pair`).** OKLCH lightness
  remap, chroma compensation (Helmholtz-Kohlrausch), hue preservation
  ±10°, gamutmapping, grey fallback for low-chroma colors. **7 tests.**
- **Brand extraction worker (`workers/brand-extract`).** URL → brand
  kit with attribution block; color/font/logo/attribution helpers;
  `color.brand.*` token-ID suggestion. **8 tests.**
- **Accessibility audit worker (`workers/accessibility-audit`).** WCAG
  (AA 4.5:1 / AA-Large 3:1 / AAA 7:1), APCA (Lc ≥ 60),
  Brettel/Vienot/Mollon dichromacy matrices, ≥ 30° OKLCH palette
  suggestion; decorative tokens never block. **12 tests.**
- **Marketplace preview service (`services/marketplace-preview`).**
  Listing lifecycle (`draft | published | archived`) with canonical
  SHA-256 content-hash verification on install; license-bundle
  enforcement (restricted assets require admin override); a11y
  certification gate; opt-in buyer sample reviews; install always
  materializes a brand-kit draft and never auto-applies to existing
  decks. **18 tests.**
- **Brand-aware MCP tools (`services/mcp-server/src/brand-tools.ts`).**
  `apply_theme`, `token.audit_a11y`, `theme.suggest_palette` with
  brand-context scope enforcement (`BRAND_SCOPE_VIOLATION` when an
  agent scoped to Brand A touches Brand B). **9 tests.**
- **Editor Theme & Brand panel (`apps/editor`).** Left-side panel
  providing theme picker, brand-kit picker, dark/light scheme toggle,
  per-slide palette override, and a11y audit affordance; persists
  through the autosave facade
  (`theme.applied`, `theme.override_set`, `theme.color_scheme_changed`,
  `brand.context_changed`). **7 new tests; editor 122/122 passing.**
- **Handoff doc:** `docs/handoff/P06-to-P07.md` documents the P06 →
  P07 contracts, surfaces, metrics, and deferred-by-design items.
- **Contracts:** `design-token-v1`, `brand-kit-v1`, `font-asset-v1`
  schemas; `theme.proto`, `brand.proto`, `font.proto`, `lint.proto`;
  `theme.yaml`, `brand.yaml`, `font.yaml`, `lint.yaml`.

[Unreleased]: https://github.com/DaiyaanMuhammadFardeen/Domio/compare/main...HEAD