# ADR-2026-008: Brand-lock region model

## Status

`accepted`

## Date

2026-08-02

## Context

Enterprise template decks carry brand constraints: certain slides, elements,
or regions must not be recolored, reworded, moved, or removed by non-owners.
Enforcement must apply to human editors (client), agents (MCP writes to the
registry), and the CRDT write path (server) so nobody can bypass a lock by
choosing a different channel. The phase plan specifies a "brand-locked region
model" and an `ERR_BRAND_LOCK` code.

## Decision

We will model brand locks as **`BrandLockRegion` rows scoped to a deck** with
three axes:

- **Scope**: `slide` | `element` | `region` (a region is a `sceneGraphSelector`
  matching multiple elements, e.g. `[role=logo], [data-brand=footer]`).
- **Strictness**:
  - `strict` — all ops (create/update/delete/move/resize/recolor/rename/
    reorder) blocked unless the op is in `allowedOverrides`.
  - `color-only` — recolor blocked for non-owners; text/layout allowed.
  - `text-only` — text edits blocked for non-owners; color/layout allowed.
- **Owner bypass**: `actorId === ownerUserId` always passes (audited).

Enforcement is a single guard `assertLockAllowed(deps, {deckId, actorId, op,
targets})` (in `src/templates/locks.ts`) used by:

1. the editor's client scene-graph ops (before the op is created),
2. the server CRDT/write path (authoritative, returns `ERR_BRAND_LOCK`, 403),
3. the MCP tool layer (maps to `ERR_BRAND_LOCK`).

Lock create/delete is owner-only and itself audited. Templates ship their
brand regions as manifest metadata, materialized to `brand_lock_region` rows on
install.

## Alternatives considered

- **Locked content as signed, immutable deck segments**: rejected — too rigid;
  per-op strictness and owner override are product requirements.
- **Single global lock per deck**: rejected — cannot express slide/element/region
  granularity or per-axis strictness.
- **Client-only enforcement**: rejected — bypassable by agents and API callers.

## Consequences

- Enforcement lives in one guard, exercised by three channels → one code path
  to test (the DoD matrix: every scope × strictness × op combination).
- Audit rows record every denied/overridden write, giving admins a bypass trail.
- Selector-based regions mean brand rules can be expressed declaratively in
  templates rather than hardcoded per-deck.
