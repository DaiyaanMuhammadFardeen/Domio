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