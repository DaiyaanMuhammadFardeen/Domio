# Phase 02 — Deck schema & scene-graph foundation

> **Phase number:** 02
> **Name:** Deck schema & scene-graph foundation
> **Owners:** Editor lead (primary), Data platform lead (Postgres/schema), Principal architect (contract approval)
> **Critical path:** **yes** (foundation for P03, P04, P05, and every later domain)
> **Parallel stream:** Foundation (P00–P05); no parallel offset — this phase blocks P03 directly
> **Status:** Not started

## 1. Intent

Establish the canonical structured deck schema as the single source of truth for every later phase (visual canvas, deck-as-code YAML, MCP tools, renderer, viewer, export, analytics, AI). Phase 02 freezes the schema shape, commits the JSON Schema files and the TypeScript-typed schema package, lands the first Postgres migration that persists decks, and proves that a deck can be authored as data — hydrated by a `DocumentLoader` — before any canvas pixels exist. This is the most load-bearing foundation in the project: every later phase either reads from this schema or writes to it. A wrong decision here re-plays through every later migration.

---

## 2. Goals

1. A **versioned JSON Schema** for a `DeckDocument` (`contracts/schema/deck.schema.json`) that fully describes slides, frames, layers, transforms, styles, constraints, component instances, data bindings, animations, prototype variables, and references to external assets. Versioned from day one; breaking changes require a major bump.
2. A **scene-graph model** that supports infinite canvas (#1): 16:9 / 4:3 / 9:16 / ultrawide / LED-wall custom ratios coexist on the same workspace; multiple slide frames; nested frames; layers parented to frames; groups; constraints; auto-layout containers.
3. **`packages/schema` (TypeScript)** is the source of truth in code. Generated types are exported as `packages/sdk-ts` so the editor, control plane, MCP gateway, and SDK all consume the same definitions. No duplicate type definitions across packages.
4. **Postgres `decks` + `deck_schemas` + `slides` + `elements` + `element_overrides`** are created in the first migration (`0002_deck_schema.sql`), with the canonical structured deck JSONB persisted per revision. Indexes support layers-panel queries (`type`, `locked`, `parent_id`, `semantic_id`) and scene JSONB GIN for search.
5. **Schema validation in CI:** every PR runs the published `deck.schema.json` against the fixture set; the editor and MCP gateway reject malformed documents before persistence; migrations are bidirectional.
6. A **`DocumentLoader`** (`packages/sdk-ts/src/loader.ts` + `services/control-plane/src/deck/loader.ts`) hydrates a `DeckDocument` for both the editor and the viewer, applying lazy schema migration, resolving semantic element addresses (`slide[3].chart[revenue_by_region]`), and emitting typed events. One example fixture (`fixtures/example-deck.json`) demonstrates a complete deck with two slides, three frames, ten layers, one auto-layout container, and one component instance.

## 3. Scope

**In scope (feature numbers):**

- **#1** — Infinite canvas workspace with multiple slide aspect ratios (data model only; rendering lands in P03).
- **#22** — Autosave every keystroke: only the **plumbing** (deferred-write queue, durable queue stub, no transport yet). The actual server push, CRDT integration, and remote sync land in P04/P05.

**Explicit out of scope (deferred):**

- **#2–#21** — All editor interactions and rendering: drag-drop, guides, layers panel UI, multi-select, frames UI, auto-layout runtime, vector pen, rulers, zoom, undo/redo, keyboard, paste styles, eyedropper, menus, multiplayer cursors, branch/merge, checkpoints, offline CRDT. These are P03 (single-user editor) and P04 (CRDT sync).
- **#6 (CRDT)** — The Yjs/Automerge CRDT substrate and the op log. P02 defines the schema in JSONB; P04 layers CRDT semantics on top.
- **Auto-layout solver** (#7) and **constraint solver** (#8) — the _schema fields_ for these are defined here (`AutoLayoutSpec`, `LayerConstraints`); the runtime solver lands in P03.
- **Vector pen boolean ops** (#9) — the _schema fields_ are defined; the boolean engine is P03.
- **Component master/runtime** (#23–#36) — only the _schema slot_ for `componentInstanceId` and `overrides` is defined. The components module lands in P06.
- **Themes / design tokens** (#37–#47) — only `styleTokens` and `themeId` references are defined. The theming engine lands in P07.
- **Live data bindings** (#48–#64) — only the `binding` slot on `Element` is defined; connector and refresh logic is P08.
- **Animation timelines** (#85–#95) — only the `animation` slot on `Element` is defined; runtime is P09.
- **Prototype variables / interactions** (#96–#107) — only schema slots; runtime is P10.
- **Rendering** — no WebGL/WebGPU/Canvas2D code in P02. Phase 03 owns the renderer.

## 4. Dependencies

**Upstream (must be complete before P02):**

- **Phase 00 — Repository, contracts, dev environment.** P02 assumes monorepo skeleton, `/contracts`, `/packages`, `/services` directories exist; CI runs; OpenTelemetry, Spectral, and Buf are configured; OpenAPI + Protobuf + JSON Schema all live in `/contracts`.
- **Phase 01 — Observability, CI/CD, infra baseline.** P02 assumes Postgres 16 is provisioned (per `docs/06-technology-stack.md` §6.3.1) with the tenant/workspace skeleton; CI runs lint, type, unit, and contract checks on PR; JSON Schema lint rule is active.

**Downstream (this phase unblocks):**

- **Phase 03 — Canvas editor MVP** consumes `packages/schema` for every layer, transform, and style type. The `DocumentLoader` is the single hydration path for the editor's `Yjs` local replica in P03.
- **Phase 04 — CRDT sync** layers Yjs over the schema defined here.
- **Phase 05 — Persistence, versioning, branches** consumes `deck_schemas` (immutable per revision), `deck_versions`, and the schema-versioning machinery.
- **Phase 06 — Components** consumes the `componentInstance` slot, `element_overrides`, and the `ComponentInstance` table seeded by P02.
- **Phase 07 — Theming** consumes `style_tokens`, `themes`, `brand_kits`, and the `themeId` reference on `Deck`.
- **Phase 08 — Live data** consumes `data_bindings`, `data_sources`, `data_snapshots`, `formula_cells`, `scenarios`.
- **Phase 12 — AI copilot** consumes `packages/schema` for MCP tool args and "function-calling-ready" component props (#233).
- **Phase 13 — Agentic** consumes `packages/schema` for `MCP` tool surface (#221–#224) and semantic element addresses (#226).

## 5. Workstreams

P02 has five workstreams. Each task lists files/packages touched, contracts added or consumed, tests written, and Definition of Done for the task.

### WS-A — Schema design and JSON Schema files (3 tasks)

**A.1 — Schema review board + freeze the `DeckDocument` shape.**

- Files touched: `contracts/schema/deck.schema.json`, `contracts/schema/scene-graph.schema.json`, `contracts/schema/common.schema.json`, `docs/adr/ADR-SCHEMA-01-deck-document.md`.
- Contracts added: `deck.schema.json` v1.0.0; `scene-graph.schema.json` v1.0.0; `common.schema.json` v1.0.0 (`SemanticAddress`, `Transform`, `Color`, `Length`, `Duration`).
- Tests written: schema review board walkthrough; architectural decision captured in ADR.
- DoD: ADR merged; three JSON Schema files exist and pass `ajv` compile; `schema_review_board_signoff.md` is checked into the PR.

**A.2 — Define `Layer`, `FrameLayer`, `Slide`, `AutoLayoutSpec`, `LayerConstraints`, `ComponentInstance`, `DataBinding`, `Animation`, `PrototypeVariable`.**

- Files touched: `contracts/schema/deck.schema.json`, `contracts/schema/scene-graph.schema.json`.
- Contracts added: `Layer`, `FrameLayer`, `GroupLayer`, `TextLayer`, `ImageLayer`, `VectorLayer`, `BooleanShapeLayer`, `Slide`, `Deck`, `AutoLayoutSpec`, `LayerConstraints`, `ComponentInstance`, `DataBinding`, `Animation`, `PrototypeVariable`, `SceneNode` discriminators.
- Tests written: `tests/schema/layer-discriminator.test.ts` (every `Layer.type` discriminator is exclusive); `tests/schema/required-fields.test.ts` (required fields have type-safe defaults).
- DoD: all layer types compile; discriminator tags are exclusive; examples in `fixtures/` validate.

**A.3 — Define `SemanticAddress` (`slide[N].<role>[name]`) and add address validation.**

- Files touched: `contracts/schema/common.schema.json`.
- Contracts added: `SemanticAddress` regex `^[a-zA-Z_][a-zA-Z0-9_]*(\[[a-zA-Z0-9_-]+\])*$`; `AddressResolver` interface in `packages/schema/src/address.ts`.
- Tests written: `packages/schema/__tests__/address.test.ts` with 50+ cases (positive, negative, collision, deep nesting).
- DoD: address grammar is single-pass parseable; collisions are reported deterministically.

### WS-B — `packages/schema` TypeScript source of truth (4 tasks)

**B.1 — Bootstrap `packages/schema` workspace.**

- Files touched: `packages/schema/package.json`, `packages/schema/tsconfig.json`, `packages/schema/src/index.ts`, `packages/schema/src/version.ts`.
- Contracts consumed: `deck.schema.json`, `scene-graph.schema.json`, `common.schema.json` from A.1–A.3.
- Tests written: `packages/schema/__tests__/version.test.ts`.
- DoD: `pnpm --filter @domio/schema build` succeeds; `@domio/schema` exports `DECK_SCHEMA_VERSION`, `SEMVER_COMPATIBLE`.

**B.2 — Generate typed TypeScript from JSON Schema using `json-schema-to-typescript`.**

- Files touched: `packages/schema/src/generated/deck.ts`, `packages/schema/src/generated/scene-graph.ts`, `packages/schema/src/generated/common.ts`, `packages/schema/scripts/generate.ts`.
- Contracts consumed: A.1–A.3 JSON Schemas.
- Tests written: `packages/schema/__tests__/generated-types-roundtrip.test.ts` (any fixture serializes → deserializes to the same TypeScript type).
- DoD: generated types are committed; `pnpm generate` reproduces them byte-identically (CI fails on drift).

**B.3 — Implement `validate(document)`, `migrate(document, fromVersion, toVersion)`, `addressOf(document, path)`.**

- Files touched: `packages/schema/src/validate.ts`, `packages/schema/src/migrate.ts`, `packages/schema/src/address.ts`, `packages/schema/src/registry.ts`.
- Contracts added: `DeckSchemaValidator` interface; `SchemaMigration` interface; `MigrationRegistry`.
- Tests written: `packages/schema/__tests__/validate.test.ts` (rejects malformed, accepts fixtures); `packages/schema/__tests__/migrate.test.ts` (round-trip N ↔ N+1, idempotent).
- DoD: validate and migrate pass for v1.0.0 → v1.1.0 → v1.0.0; registry supports registering future migrations without code changes to consumers.

**B.4 — Export `packages/schema` and re-export from `packages/sdk-ts`.**

- Files touched: `packages/schema/src/index.ts`, `packages/sdk-ts/src/index.ts`, `packages/sdk-ts/package.json`.
- Contracts added: `@domio/schema` (workspace-internal); `@domio/sdk` re-exports `DeckDocument`, `Slide`, `Element`, `Address`, `validate`, `migrate`, `addressOf`.
- Tests written: `packages/sdk-ts/__tests__/re-export.test.ts` (importing from `@domio/sdk` is identical to importing from `@domio/schema`).
- DoD: editor, control plane, MCP gateway, and CLI all import from `@domio/sdk` only; no direct `@domio/schema` imports outside the workspace boundary.

### WS-C — First migration + Postgres tables (3 tasks)

**C.1 — Migration `0002_deck_schema.sql`.**

- Files touched: `services/control-plane/migrations/0002_deck_schema.sql`, `services/control-plane/migrations/0002_deck_schema.down.sql`.
- Contracts consumed: `docs/05-data-database-design.md` §5.2.2 (`decks`, `deck_versions`, `slides`), §5.2.3 (`elements`, `element_overrides`, `deck_schemas`, `component_instances`, `token_sets`, `themes`, `brand_kits`).
- Tests written: `services/control-plane/migrations/__tests__/0002.test.ts` (forward migration applies clean; rollback restores prior schema; idempotent re-run on existing DB is a no-op).
- DoD: migration applies on a fresh Postgres 16 instance in CI; down-migration restores prior state; RLS policies are in place per `docs/05-data-database-design.md` §5.4.

**C.2 — Index strategy.**

- Files touched: `services/control-plane/migrations/0002_deck_schema.sql` (index section).
- Indexes added: `decks(workspace_id, updated_at desc) where deleted_at is null`; `elements(slide_id, semantic_id) unique`; `elements(slide_id)`; `elements(parent_id)`; `elements(type)`; `deck_schemas(deck_id, revision)` PK; `slides(deck_id, position) unique`; GIN on `elements.props` (`jsonb_path_ops`); partial GIN on `elements(transform)` for layered search.
- Tests written: `services/control-plane/__tests__/index-usage.test.ts` (EXPLAIN shows index usage for layers-panel queries).
- DoD: `EXPLAIN ANALYZE` on the layers-panel query and the `addressOf` query both use indexes; no sequential scans on tables expected to exceed 10k rows.

**C.3 — RLS policies and tenant context.**

- Files touched: `services/control-plane/migrations/0002_deck_schema.sql` (RLS section).
- Policies added: `decks`, `slides`, `elements`, `element_overrides`, `deck_schemas`, `component_instances`, `token_sets`, `themes`, `brand_kits` are all RLS-protected by `tenant_id = current_setting('app.tenant_id')`; workspace-scoped tables join through `workspaces.tenant_id`.
- Tests written: `services/control-plane/__tests__/rls.test.ts` (cross-tenant read returns zero rows; same-tenant read works; privileged role bypasses).
- DoD: cross-tenant access denied in tests; CI runs the RLS test on every migration.

### WS-D — `DocumentLoader` (3 tasks)

**D.1 — `DocumentLoader.load(deckId)` in the control plane.**

- Files touched: `services/control-plane/src/deck/loader.ts`, `services/control-plane/src/deck/repository.ts`.
- Contracts consumed: `DeckDocument`, `Slide`, `Element` from `@domio/sdk`.
- Tests written: `services/control-plane/__tests__/loader.test.ts` (loads example fixture, returns typed `DeckDocument`; missing deck returns `DeckNotFound`; tenant mismatch returns `TenantMismatch`).
- DoD: `DocumentLoader.load` is the only entry point for the editor and viewer; it returns a `DeckDocument` with all `slides`, `elements`, and resolved `componentInstanceId`s resolved to their master; runs lazy schema migration on read.

**D.2 — `DocumentLoader.save(deckId, doc, expectedRevision)` with optimistic locking.**

- Files touched: `services/control-plane/src/deck/loader.ts`, `services/control-plane/src/deck/repository.ts`.
- Contracts added: `save()` returns `{ revision: number; warnings: ValidationWarning[] }`; rejects on revision mismatch with `REVISION_CONFLICT` per `docs/04-system-architecture.md` §4.6.2; validates via `@domio/sdk` `validate()`.
- Tests written: `services/control-plane/__tests__/save.test.ts` (concurrent saves serialize correctly via `current_revision` optimistic lock; invalid schema returns 422 with the schema path; out-of-memory size returns 413).
- DoD: `save` is atomic; concurrent saves produce deterministic last-writer-wins at the `current_revision` level (CRDT semantics land in P04).

**D.3 — Client-side loader stub (`packages/sdk-ts/src/loader.ts`).**

- Files touched: `packages/sdk-ts/src/loader.ts`, `packages/sdk-ts/src/index.ts`.
- Contracts added: `ClientDocumentLoader` interface; `fetchDeck()` returns `DeckDocument`; `saveDeck(doc, expectedRevision)` POSTs to `/v1/decks/{id}/schema`.
- Tests written: `packages/sdk-ts/__tests__/client-loader.test.ts` (fetch returns typed doc; save includes idempotency key; revision mismatch is surfaced).
- DoD: editor and viewer both use `ClientDocumentLoader`; control plane's `DocumentLoader` is the only path to persistence.

### WS-E — Example fixture and CI guardrails (3 tasks)

**E.1 — Example deck fixture.**

- Files touched: `fixtures/example-deck.json`, `fixtures/README.md`.
- Contents: a single tenant/workspace; one deck; two slides (16:9 + 9:16); three frames; ten layers (mix of `FrameLayer`, `TextLayer`, `ImageLayer`, `VectorLayer`, `GroupLayer`); one auto-layout container; one `ComponentInstance` with overrides; semantic addresses on every element.
- Tests written: `fixtures/__tests__/example-deck.test.ts` (loads, validates against `deck.schema.json`, addresses all elements by role, all fixtures round-trip through `migrate`).
- DoD: fixture validates against v1.0.0 schema and migrates cleanly to v1.1.0 (when v1.1.0 is introduced later); example is referenced in `/docs/editor-canvas.md` as the canonical demo deck.

**E.2 — CI validation pipeline.**

- Files touched: `.github/workflows/schema-validate.yml`, `tools/scripts/validate-fixtures.ts`.
- CI checks: every PR runs `ajv` against `contracts/schema/**/*.json`; every fixture validates; `json-schema-to-typescript` generation is byte-identical to committed types (`pnpm generate --check`); Spectral lint on `deck.schema.json`.
- Tests written: `tools/scripts/__tests__/validate-fixtures.test.ts` (rejects a malformed fixture; passes on fixtures).
- DoD: CI blocks merge if any fixture fails validation or if generated types drift from committed types.

**E.3 — Autosave plumbing stub (deferred write queue).**

- Files touched: `packages/sdk-ts/src/autosave-queue.ts`, `packages/sdk-ts/src/index.ts`.
- Scope: an in-memory `AutosaveQueue` that debounces edits within a 16 ms window, persists to IndexedDB via `idb` wrapper, and exposes `flush()` and `pendingCount()`. **No server push yet** — that's P04/P05.
- Tests written: `packages/sdk-ts/__tests__/autosave-queue.test.ts` (debounce window; replay after crash; quota handling).
- DoD: queue survives page reload via IndexedDB; pending count is exposed for the UI status indicator; `flush()` is idempotent.

## 6. Architecture & data

### 6.1 New tables

Per `docs/05-data-database-design.md` §5.2.2 and §5.2.3, the following tables are introduced in `services/control-plane/migrations/0002_deck_schema.sql`:

- `decks` — top-level deck container; `id`, `workspace_id`, `project_id`, `title`, `slug`, `schema_version`, `current_revision`, `branch` (default `'main'`), `thumbnail_url`, `settings`, `brand_kit_id`, `legal_hold_id`, `owner_id`, `created_at`, `updated_at`, `deleted_at`.
- `deck_versions` — immutable append-only; `(deck_id, revision)` PK; `parent_revision`, `schema_version`, `change_summary`, `author_id`, `crdt_log_id`, `created_at`.
- `slides` — one row per slide; `id`, `deck_id`, `position`, `schema_version`, `thumbnail_url`, `created_at`, `updated_at`.
- `elements` — per-slide canvas nodes; `id`, `slide_id`, `semantic_id` (stable for addressing; e.g., `chart_revenue_by_region`), `type`, `parent_id`, `z`, `transform` JSONB, `props` JSONB, `binding` JSONB, `component_instance_id`, `locked_by`, `created_at`, `updated_at`. Unique on `(slide_id, semantic_id)`.
- `element_overrides` — per-instance prop overrides for component instances.
- `deck_schemas` — immutable canonical JSONB serialization per `(deck_id, revision)`. Includes `schema` JSONB, `checksum`, `byte_size`. The authoritative durable form.
- `component_instances` — links an element to its master component.
- `token_sets`, `themes`, `brand_kits` — defined as schemas here, populated in P07.

### 6.2 New services and modules

- `services/control-plane/src/deck/` — the `Deck & Schema` module per `docs/04-system-architecture.md` §4.4. Owns `loader.ts`, `repository.ts`, `validation.ts`, `migrations.ts`. Publishes events `deck.*`, `slide.*`, `element.*` (subscribers land in P04/P05; the outbox table is added in P04).
- `packages/schema` — TypeScript workspace; source of truth in code.
- `packages/sdk-ts` — generated types + `ClientDocumentLoader`.

### 6.3 New contracts

- `contracts/schema/deck.schema.json` v1.0.0 — `DeckDocument`, `Slide`, `DeckSettings`.
- `contracts/schema/scene-graph.schema.json` v1.0.0 — `Element` (discriminated union), `Transform`, `Style`, `AutoLayoutSpec`, `LayerConstraints`, `Animation`, `PrototypeVariable`, `ComponentInstance`, `DataBinding`.
- `contracts/schema/common.schema.json` v1.0.0 — `SemanticAddress`, `Color`, `Length`, `Duration`, `ULID`.
- `contracts/openapi/v1/decks.yaml` — `POST /v1/decks/{id}/schema` (the `DocumentLoader.save` endpoint), `GET /v1/decks/{id}` returning `DeckDocument` (projection from `deck_schemas` + `slides` + `elements` joined).

### 6.4 Migrations

- `0002_deck_schema.sql` and `0002_deck_schema.down.sql` (reversible).
- RLS policies applied per `docs/05-data-database-design.md` §5.4.
- Indexes per §C.2 above.

### 6.5 Cross-references to master docs

- **Architectural invariants** — `docs/04-system-architecture.md` §4.0 (`The canonical structured deck schema is versioned and validated before persistence`); module ownership per §4.4 (`Deck & Schema` module); REST contracts per §4.6.2 (`POST /v1/decks/{deckId}/commands` will use `target: "slide[3].chart[revenue_by_region]"`).
- **Data model** — `docs/05-data-database-design.md` §5.2.2, §5.2.3; JSONB schema versioning §5.3; multi-tenancy §5.4.
- **Technology stack** — `docs/06-technology-stack.md` §6.1.3 (Yjs CRDT for P04+); §6.3.1 (Postgres 16 with JSONB + GIN); §6.4 (JSON Schema in `/contracts/schema` is the source of truth).
- **Editor canvas** — `docs/editor-canvas.md` §1 (Feature 1 infinite canvas), §5 (data model — JSONB scene graph), §6 (REST surface `GET /decks/:deckId/slides/:slideId` returns the full slide scene graph; `PATCH /slides/:id` produces an op), §3.4 (autosave semantics).

## 7. Verification

| #   | Feature                    | Test                                                                              | Expected result                                                                            | Owner         |
| --- | -------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------- |
| 1   | #1                         | `tests/schema/infinite-canvas.test.ts` — multiple aspect ratios on one deck       | Fixture with 16:9 + 9:16 + ultrawide + custom W:H validates                                | Schema lead   |
| 2   | #1                         | `services/control-plane/__tests__/loader.test.ts` — load multi-ratio deck         | Returns `DeckDocument` with mixed aspect slides; no data loss                              | Schema lead   |
| 3   | Schema versioning          | `packages/schema/__tests__/migrate.test.ts` — round-trip v1.0.0 → v1.1.0 → v1.0.0 | Idempotent migration; checksum preserved                                                   | Schema lead   |
| 4   | #22 (stub)                 | `packages/sdk-ts/__tests__/autosave-queue.test.ts` — debounce + IndexedDB         | Queue flushes within 16 ms window; survives reload                                         | Editor lead   |
| 5   | #22 (stub)                 | `packages/sdk-ts/__tests__/autosave-queue.test.ts` — quota exceeded               | Returns graceful error; pending count visible                                              | Editor lead   |
| 6   | Semantic addressing (#226) | `packages/schema/__tests__/address.test.ts` — 50+ cases                           | All valid addresses resolve; all invalid rejected                                          | Schema lead   |
| 7   | `DocumentLoader`           | `services/control-plane/__tests__/loader.test.ts` — load example fixture          | Returns typed `DeckDocument`; addresses resolve                                            | Editor lead   |
| 8   | `DocumentLoader.save`      | `services/control-plane/__tests__/save.test.ts` — concurrent saves                | One succeeds, other returns `REVISION_CONFLICT`                                            | Data platform |
| 9   | RLS                        | `services/control-plane/__tests__/rls.test.ts` — cross-tenant                     | Returns zero rows; same-tenant works                                                       | Security      |
| 10  | CI guardrail               | `pnpm generate --check`                                                           | Passes; fails on drift                                                                     | Devx          |
| 11  | CI guardrail               | `ajv` on `contracts/schema/**/*.json` and fixtures                                | Passes on fixture set; rejects malformed fixtures                                          | Devx          |
| 12  | Migration                  | `services/control-plane/migrations/__tests__/0002.test.ts`                        | Forward + down migrations succeed; idempotent re-run                                       | Data platform |
| 13  | Indexes                    | `services/control-plane/__tests__/index-usage.test.ts`                            | Layers-panel query uses GIN; no seq scan on >10k rows                                      | Data platform |
| 14  | Components slot            | `tests/schema/component-instance.test.ts`                                         | `Element` with `component_instance_id` and `element_overrides` validates; resolved at load | Schema lead   |
| 15  | Theme slot                 | `tests/schema/theme-ref.test.ts`                                                  | `Deck.brand_kit_id`, `Element.style_tokens` validate                                       | Schema lead   |

## 8. Risks & open decisions

| Risk                                                                          | Impact              | Mitigation                                                                                                                                                         |
| ----------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Schema wrong** — every later phase re-plays migration                       | Catastrophic        | Schema review board (3 reviewers: principal architect, editor lead, data platform lead) before freeze; ADR required; demo the fixture end-to-end before P03 starts |
| **Semantic address collisions** — two elements with the same `role[name]`     | Mid                 | Registry warns on collision at `save` time; rules documented in `docs/editor-canvas.md` §1; runtime uniqueness is per-slide                                        |
| **JSONB size** — large decks exceed Postgres TOAST limits                     | High                | Threshold at 16 MB → chunked columns (`scene_chunk_0..N`) lazily; documented in `docs/05-data-database-design.md` §5.5; tests on 5k-layer decks                    |
| **Generated types drift**                                                     | Mid                 | `pnpm generate --check` blocks CI; types are committed (not generated on build)                                                                                    |
| **Migration is irreversible in production**                                   | High                | Down-migration tested on production-sized data; bidirectional guarantee is a P02 DoD gate                                                                          |
| **CRDT layering in P04** may require additional schema fields                 | Low                 | Reserve `$extensions` JSONB on every major node type; documented in ADR                                                                                            |
| **Multi-region residency** — does `deck_schemas` need per-region replication? | Low (decide in P14) | Default to single-region for v1; flagged for P14 review                                                                                                            |

**Open decisions to resolve during P02:**

- OD-DATA-03 (already open in `docs/05-data-database-design.md` §5.14): inline `deck_schemas.schema` JSONB vs. object-storage pointer with metadata. **Recommendation for P02:** inline JSONB (simpler, fewer round-trips); revisit in P14 if >100 MB decks emerge.
- OD-ARCH-06 (`docs/04-system-architecture.md` §4.16): ORM choice (Prisma vs. Drizzle vs. raw SQL/pg). **Recommendation for P02:** raw SQL with `pg` for migrations, Drizzle for query building — keeps migrations explicit and lets the schema be the source of truth.
- New: should `SemanticAddress` allow regex matching (e.g., `slide[*].chart[revenue_*]`)? **Recommendation:** v1.0.0 supports exact addressing only; bulk addressing is an MCP layer (#226, #223) concern; defer to P12.

## 9. Demo script (internal environment)

**Pre-reqs:**

- Local stack up (`pnpm stack:up`); Postgres 16 with migration `0002_deck_schema` applied; example fixture loaded.
- Open `http://localhost:3000/admin/fixtures/example-deck` (admin viewer route).

**Demo flow (≤ 10 minutes):**

1. **Open example deck in viewer.** Walk through the JSON tree: 2 slides, 3 frames, 10 layers. Show that every layer has a `semantic_id` and a derived `SemanticAddress` displayed next to it.
2. **Edit `semantic_id`** on the "Revenue Chart" element to `quarterly_revenue`. Re-save. Verify the address resolves via the SDK's `addressOf(doc, 'slide[0].chart[quarterly_revenue]')`.
3. **Trigger a malformed edit** via the admin console: set `transform.w` to `"foo"` (string). Click save. Show the 422 response with the JSON Schema path `transform.w must be number`.
4. **Show CI guardrails** — open a PR that introduces a fixture with a missing required field. Show CI failing on `ajv` validation. Revert; CI passes.
5. **Show `DocumentLoader.load` round-trip** — `node -e "import('./packages/sdk-ts').then(m => m.fetchDeck('example').then(console.log))"` prints the typed `DeckDocument`.
6. **Show RLS** — open two browser sessions as different tenants; each sees only their own deck; attempt cross-tenant access via `curl` returns 403.
7. **Show schema versioning** — bump `DECK_SCHEMA_VERSION` to `1.1.0` (additive only); `migrate()` upgrades the example deck; downgrade restores it identically.
8. **Show autosave stub** — open browser console; type into the demo editor; show `pendingCount` decrements as the queue flushes to IndexedDB; reload the page; show the queued ops replay.

**Demo pass criterion:** all eight steps complete without manual fix-up; the demo deck round-trips through the schema and the `DocumentLoader` deterministically.

## 10. Definition of Done

- [ ] All five workstreams (WS-A through WS-E) closed with their per-task DoDs met.
- [ ] `contracts/schema/{deck,scene-graph,common}.schema.json` v1.0.0 merged; ADR merged; schema review board sign-off captured.
- [ ] `packages/schema` and `packages/sdk-ts` build cleanly; generated types committed and byte-identical to `pnpm generate`.
- [ ] Migration `0002_deck_schema.sql` + `down.sql` applied on CI's fresh Postgres; RLS policies enforced; all 15 verification-matrix tests green.
- [ ] `services/control-plane/src/deck/loader.ts` is the only path to deck persistence; `DocumentLoader.load` and `DocumentLoader.save` both have ≥ 90% line coverage.
- [ ] `fixtures/example-deck.json` validates and round-trips; referenced from `docs/editor-canvas.md` as the canonical demo deck.
- [ ] CI: `ajv`, `pnpm generate --check`, Spectral lint, RLS test all green on the merge commit.
- [ ] OpenTelemetry spans emitted for `document.load`, `document.save`, `schema.validate`, `schema.migrate` (consumed by Phase 01 observability baseline).
- [ ] Telemetry: `schema_validate_duration_ms` histogram, `schema_migrate_duration_ms` histogram, `document_save_revision_conflict_total` counter — all wired to Prometheus via the Phase 01 SDK.
- [ ] Docs updated: `docs/editor-canvas.md` §5 cross-references the schema files; `docs/05-data-database-design.md` §5.2.2/§5.2.3 cross-reference `0002_deck_schema.sql`; `docs/development_phases/phase-graph.md` updated to reflect P02 → P03 unblock.
- [ ] Security gate per `docs/07-security-planning.md` (RLS check, no PII in logs, idempotency on `save`) passed.
- [ ] Internal demo passed (status: "Internal demo passed" per `docs/development_phases/README.md` legend).
