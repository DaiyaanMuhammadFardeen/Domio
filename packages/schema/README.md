# @domio/schema

> Phase 02 source of truth for the canonical structured deck document.

Owns:

- `contracts/schema/v1/deck.schema.json` — top-level `DeckDocument`.
- `contracts/schema/v1/scene-graph.schema.json` — `Element`, `Transform`, styles,
  auto-layout, constraints, animations, component instances, data bindings.
- `contracts/schema/v1/common.schema.json` — `ULID`, `SemanticAddress`, `Color`,
  `Length`, `Duration` (alongside the Phase 0 primitives).

Re-exports:

- `DECK_SCHEMA_VERSION` (`1.0.0`) and `parseVersion` / `SEMVER_COMPATIBLE`.
- Generated TypeScript types (`DeckDocument`, `Slide`, `Element`, …).
- `validate(doc)`, `migrate(doc)`, `addressOf(doc, target)`, `DefaultAddressResolver`.
- `MigrationRegistry` for plugging in future schema migrations.
- `loadContracts()` — returns the JSON Schema skeleton from `contracts/schema/v1/`.

Run `pnpm --filter @domio/schema test` to validate the schema package.
