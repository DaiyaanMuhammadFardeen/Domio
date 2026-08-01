# ADR-0004: Phase 02 — canonical structured deck document schema (v1)

## Status

`accepted`

## Date

2026-07-30

## Context

Phase 01 closed with a placeholder `contracts/schema/v1/deck-placeholder.schema.json`
that only modelled the deck summary (title, status, schema_version). Every
downstream phase — canvas editor (P03), CRDT sync (P04), persistence (P05),
components (P06), theming (P07), live data (P08), animation (P09), prototype
(P10), AI copilot (P12), and agentic surfaces (P13) — either reads from the
deck schema or writes to it. P02 must therefore commit a versioned, validated,
persisted, addressable representation of a deck before any canvas pixels exist.

The schema must coexist with the Phase 01 primitives in
`contracts/schema/v1/common.schema.json` (ResourceId, Timestamp, Money,
Error, AuditActor) and must be machine-checkable by the existing AJV
CI guardrail.

## Decision

We adopt the following shape for the canonical Domio `DeckDocument`:

- **Versioning.** The `schemaVersion` field is **semver** (`1.0.0` for this
  freeze). A major bump is required for any breaking change; additive
  fields can land in minor bumps.
- **Identity.** Deck, slide, and element IDs are 26-character
  Crockford-base32 ULIDs. Slide and element IDs are unique within their
  parent (deck or slide).
- **Scene graph.** The `Element` is a discriminated union over
  `frame`, `group`, `autoLayout`, `text`, `image`, `vector`, `boolean`,
  keyed by the `type` field. Each layer kind has the Phase 02 reserved
  schema slots for auto-layout, constraints, component instances,
  data bindings, animations, and prototype variables.
- **Semantic addresses.** Elements carry a `semanticId`; combined with
  the slide's `semanticId` the address grammar
  `slide[<semanticId>][.<role>[<semanticId>]]*` is single-pass parseable.
- **Persistence shape.** `decks`, `deck_versions`, `deck_schemas`, `slides`,
  `elements`, `element_overrides`, `component_instances`, `token_sets`,
  `themes`, `brand_kits` are introduced in
  `infrastructure/postgres/migrations/0003_deck_schema.up.sql` with the
  indexes, RLS policies, and tenancy context described in §5.2.2 and
  §5.2.3 of `docs/05-data-database-design.md`.
- **Authoring surface.** Editors, viewers, the MCP gateway, and the CLI
  consume only `@domio/sdk`. The package re-exports `@domio/schema`,
  ships the `ClientDocumentLoader` (`packages/sdk-ts/src/loader.ts`) and
  the `AutosaveQueue` plumbing stub (`packages/sdk-ts/src/autosave-queue.ts`).
- **Control-plane hydration.** `services/control-plane/src/deck/loader.ts`
  is the **only** path to persistence; it runs the structural validator,
  applies lazy schema migration, and enforces optimistic-locking via
  `current_revision`.

## Alternatives considered

- **Single mega-schema without discriminated union.** Rejected: it makes
  the runtime impossible to type-check; AI copilot (P12) cannot generate
  call args safely.
- **Use Protobuf as the primary deck document.** Rejected: schema
  introspection for the canvas editor and viewer must be JSON-native
  per `docs/06-technology-stack.md` §6.4. Protobuf remains the
  RPC surface.
- **Component master/runtime in P02.** Rejected: per the phase scope
  the *slot* for `componentInstanceId` and `overrides` is defined
  here, but the master/runtime lands in P06.
- **Yjs CRDT substrate in P02.** Rejected: per the phase scope the
  schema is JSONB now; CRDT semantics land in P04.

## Consequences

- Every later phase reads from or writes to this schema. A wrong
  decision here re-plays through every later migration.
- The `DocumentLoader` and `ClientDocumentLoader` must evolve together;
  the contract tests in `packages/sdk-ts` and
  `services/control-plane` will catch drift.
- A bump of the major version forces a migration to be added to the
  `MigrationRegistry` before consumers can upgrade.
- `$extensions` on `DeckDocument` reserves space for downstream phases
  (CRDT extensions in P04).

## Security / privacy

- All `decks`-rooted tables are RLS-protected by `tenant_id =
  current_setting('app.tenant_id', true)` with a `app.bypass_rls` escape
  hatch for the migration runner and admin tooling.
- `version` / `revision` are immutable and surfaced via `current_revision`
  so the editor and viewer cannot overwrite each other.
- `versioning` is required for `idempotency-key`-style saves in P04/P05.

## Data migration / rollback

- `infrastructure/postgres/migrations/0003_deck_schema.down.sql` drops
  the tables in reverse-dependency order. Both up and down migrations
  are idempotent.
- `DeckLoader.save` rejects documents with `schemaVersion` other than
  `DECK_SCHEMA_VERSION` unless `ignoreVersion: true` is passed (used by
  the loader to accept migrated documents).

## Verification

- `ajv compile --spec=draft2020 -c ajv-formats --strict=true` against
  every `contracts/schema/v1/*.schema.json` in CI.
- `ajv validate` against `fixtures/example-deck.json`.
- `pnpm --filter @domio/schema test` and `pnpm --filter @domio/schema
  typecheck` in CI.
- `pnpm --filter @domio/sdk test` and `pnpm --filter @domio/sdk
  typecheck` in CI.
- `pnpm --filter @domio/control-plane test` and `pnpm --filter
  @domio/control-plane typecheck` in CI.
- `VITEST_WORKSPACE=1 pnpm exec vitest run fixtures/__tests__` exercises
  the example fixture end-to-end through `validate` and `migrate`.

## Owners

- Schema lead — `DECK_SCHEMA_VERSION` freeze.
- Editor lead — `DocumentLoader.load/save` semantics.
- Data platform lead — RLS + index strategy.
- Principal architect — ADR approval.

## Cross-references

- `docs/development_phases/phase-02-deck-schema-scene-graph.md` — full
  phase specification.
- `docs/05-data-database-design.md` §5.2.2 / §5.2.3 — data model
  ground truth.
- `docs/04-system-architecture.md` §4.4 / §4.6.2 — module + REST contract.
- ADR-0003 (contract-first) — JSON Schema is the source of truth.
- `contracts/schema/v1/{deck,scene-graph,common}.schema.json` — frozen
  contracts.
- `infrastructure/postgres/migrations/0003_deck_schema.up.sql` /
  `0003_deck_schema.down.sql` — reversible migration.
- `packages/schema`, `packages/sdk-ts`, `services/control-plane` —
  code that implements this decision.