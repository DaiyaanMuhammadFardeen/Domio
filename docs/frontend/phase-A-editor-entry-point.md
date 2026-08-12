# Phase A — Editor entry point

## Context

`apps/editor/src/app/page.tsx` is still the "Phase 0 stub" with boot-check text. The
real editor (`apps/editor/src/components/EditorRoot.tsx`, 145 source files under
`apps/editor/src/panels/`, `copilot/`, `marketplace/`, `theme-brand/`, etc.) is
only reachable by hand-typing a URL like `/editor/<some-id>`. A user opening the
editor app sees no deck list, no project picker, and no link into the editor
itself. They assume nothing was built.

After this phase the editor root URL (`http://localhost:3100/`) renders:
1. A real deck list (fetched from the control plane, with a graceful fallback).
2. An "Open demo deck" shortcut.
3. A feature catalogue: one card per editor panel that exists today, each linking
   to `/editor/demo?panel=<name>` so the panel opens on mount.

## Files to change

- **`apps/editor/src/app/page.tsx`** — full rewrite as a server component. Fetches
  the deck list, renders a catalogue. Adds a header with the workspace id.
- **`apps/editor/src/app/editor/[id]/page.tsx`** — read `?panel=...` from
  `searchParams` and pass it down to `EditorRoot` as an `initialPanel` prop.
- **`apps/editor/src/components/EditorRoot.tsx`** — accept `initialPanel?: string`
  prop and seed the panel store / initial state with it.
- **`apps/editor/src/lib/deck-list.ts`** (new) — `fetchDeckList(workspaceId)`
  wrapper around `apps/api` at `/v1/decks?workspace_id=…`. Falls back to a bundled
  fixture if the API is down. Returns `DeckSummary[]`.

## Deck list

`fetchDeckList(workspaceId)` hits `${NEXT_PUBLIC_API_URL ?? 'http://localhost:3010'}/v1/decks?workspace_id=<id>`.
On 200, parses `{ decks: [{ id, title, thumbnail?, updatedAt }] }`. On any error,
returns a single synthetic entry: `{ id: 'demo', title: 'Demo deck', thumbnail: null, updatedAt: null }`
so the "Open demo deck" button is always present. The API URL is read from
`NEXT_PUBLIC_API_URL` env var (already common across apps; see `apps/dashboard`).

## Feature catalogue

Hardcoded list rendered as a grid. Each entry maps to a panel id the editor
already understands. The mapping mirrors what `apps/editor/src/panels/index.ts`
exposes (verify the exact id set during implementation by reading that file).

| Label                     | panel id              |
| ------------------------- | --------------------- |
| Layers                    | `layers`              |
| History                   | `history`             |
| Insert                    | `insert`              |
| Props                     | `props`               |
| Theme & brand             | `theme-brand`         |
| Variables                 | `variables`           |
| Animations                | `animations`          |
| Connections / hotspots    | `connections`         |
| Marketplace               | `marketplace`         |
| Library                   | `library`             |
| Stickers                  | `stickers`            |
| Data sources              | `data-source`         |
| Filters                   | `filters`             |
| Scenarios                 | `scenarios`           |
| Quiz                      | `quiz`                |
| Media                     | `media`               |
| Leaderboard               | `leaderboard`         |
| Sequence inspector        | `sequence-inspector`  |
| NL patch                  | `nl-patch`            |
| Deck diff                 | `deck-diff`           |
| Deep links                | `deep-links`          |
| License dashboard         | `license-dashboard`   |
| Recording                 | `recording`           |
| State inspector           | `state-inspector`     |
| Outline approval (copilot)| `copilot-outline`     |
| Audit trail               | `audit-trail`         |

Cards link to `/editor/demo?panel=<id>`. The editor must NOT 404 on unknown
panel ids — unknown ids are simply ignored and the default panel set opens.

## Verification

1. Open `http://localhost:3100/` — must show a deck list and feature catalogue,
   not the Phase 0 stub.
2. Click "Open demo deck" → routes to `/editor/demo` and renders `EditorRoot`.
3. Click any feature card → routes to `/editor/demo?panel=<id>` and that panel
   opens on mount.
4. With the API down (`podman stop domio-api`), reload `/` — must still render
   the catalogue + the demo button (graceful fallback).

## Risk / out of scope

- Does NOT touch `EditorRoot.tsx` behavior beyond accepting the new prop.
- Does NOT add auth or workspace switching yet — that's a separate phase.
- Does NOT touch the other 9 apps (viewer, presenter, landing, …).
