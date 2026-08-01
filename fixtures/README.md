# Fixtures

This directory holds the canonical Domio fixtures used by Phase 02 onward.

## `example-deck.json`

- Single tenant/workspace.
- Two slides: one 16:9 (`intro`) and one 9:16 (`metrics`).
- Three frames (`cover`, `primary_kpi`, plus the implicit slide-level frames).
- Ten layers across the slides (`frame`, `text`, `image`, `vector`,
  `group`, `autoLayout`, `boolean`).
- One `AutoLayoutSpec` (`metric_stack`).
- One `ComponentInstance` (`primary_kpi` with `overrides`).
- Semantic addresses assigned to every element so the `DocumentLoader`
  can resolve them via `addressOf(doc, { slideIndex, elementIndex })`.

Used by:

- `fixtures/__tests__/example-deck.test.ts` — round-trips the deck through
  `validate()` and `migrate()`.
- `docs/editor-canvas.md` — canonical demo deck.