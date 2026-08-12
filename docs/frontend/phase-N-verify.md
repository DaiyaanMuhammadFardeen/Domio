# Phase N — Verify & screenshot all surfaces

## Context

After Phases A–M land, every reachable surface across all 11 apps must
work end-to-end with real data. Stub fallbacks must never trigger unless
the backing service is genuinely down.

## Steps

### 1. Bring the stack up

```bash
./bin/up full
podman ps --filter "label=io.podman.compose.project=domio"
```

All 30+ services must be `healthy` after Phase L. The 14 newly-added
services in Phases B and L must appear.

### 2. Smoke

```bash
node tests/beta/smoke.mjs
```

Must stay 59/59 green. Anything that regresses, fix before moving on.

### 3. Editor surfaces (Phase A)

Open each URL and screenshot:

- `http://localhost:3100/` — Phase A: deck list + feature catalogue
- `http://localhost:3100/editor/demo` — demo deck opens
- `http://localhost:3100/editor/demo?panel=props`
- `http://localhost:3100/editor/demo?panel=theme-brand`
- `http://localhost:3100/editor/demo?panel=variables`
- `http://localhost:3100/editor/demo?panel=animations`
- `http://localhost:3100/editor/demo?panel=marketplace`
- `http://localhost:3100/editor/demo?panel=copilot-outline`

### 4. Dashboard surfaces (Phases B, C, D)

- `http://localhost:3000/overview` — KPI tiles with REAL sparkline shapes
- `http://localhost:3000/crm` — adapter table populated from `crm-sync`
- `http://localhost:3000/ab` — experiments table populated from `ab-assignment`
- `http://localhost:3000/team` — rankings + retention populated from
  `team-analytics`
- `http://localhost:3000/heatmap?slide=...` — actual tile grid
- `http://localhost:3000/deck` — deck list (already wired)

### 5. Viewer (Phase F)

- `http://localhost:3001/` — code entry form
- `http://localhost:3001/v/<token>` — shared deck renders with scroll-linked
  animation
- `http://localhost:3001/embed/<token>` — iframe-friendly embed view

### 6. Presenter (Phase G)

- `http://localhost:3002/` — session entry
- `http://localhost:3002/session/demo` — full presenter view
- `http://localhost:3002/session/demo?display=secondary` — QR + audience
- `http://localhost:3002/session/demo/rehearsal` — rehearsal mode
- `http://localhost:3002/session/demo/recap` — recap

### 7. Join-web (Phase H)

- `http://localhost:3003/` — join form
- `http://localhost:3003/join/demo` — live widget stream (empty)
- From presenter (Phase G), trigger a poll → join-web widget switches to poll

### 8. Landing (Phase I)

- `http://localhost:3004/` — marketing home
- `/features`, `/pricing`, `/changelog`

### 9. Magic-link landing (Phase J)

- Generate a guest invite, paste URL → form auto-redeems → guest deck view

### 10. Creator-console (Phase K)

- `http://localhost:3007/` — overview dashboard (no more 404)
- `/listings`, `/analytics`, `/statements`, `/settings`

### 11. Marketplace-web & admin-console (Phase L)

- `http://localhost:3006/` — listings
- `http://localhost:3005/` — admin overview

### 12. Stub fallback honesty

For each dashboard page, stop the backing service and reload. Must show
empty state + "service not reachable" badge, never invented data:

```bash
podman stop domio-crm-sync
# reload /crm, screenshot, then:
podman start domio-crm-sync
```

Repeat for `domio-ab-assignment`, `domio-team-analytics`.

### 13. API gateway coverage (Phase M)

```bash
bash tests/beta/api-coverage.sh
# Must report 0 missing endpoints
```

### 14. Playwright screenshots

Save under `tests/beta/screenshots/`:

```
tests/beta/screenshots/
  editor-home.png ... editor-panel-copilot-outline.png
  dashboard-overview.png ... dashboard-crm-degraded.png
  viewer-home.png viewer-v-token.png viewer-embed-token.png
  presenter-home.png presenter-session-demo.png presenter-secondary.png
  join-home.png join-demo.png
  landing-home.png landing-features.png landing-pricing.png
  magic-link-redeem.png
  creator-overview.png creator-listings.png creator-analytics.png
  admin-overview.png admin-brand-locks.png admin-takedowns.png
  marketplace-home.png marketplace-listing.png
```

### 15. Final E2E demo

Walk through a full user journey:

1. Open `localhost:3004/` (landing).
2. Click "Editor" → `localhost:3100/`.
3. Click "Open demo deck" → editor loads.
4. Click "Share" → copy share link.
5. Open link in incognito → `localhost:3001/v/<token>` → deck renders.
6. Open `localhost:3003/`, type the join code → `/join/<code>` → live widget.
7. Open `localhost:3002/session/demo` → presenter view, trigger a poll.
8. The join-web widget switches to poll → vote → confirmation.
9. Open `localhost:3000/dashboard/overview` → analytics show the
   view_start, vote, etc. as real events.

If that journey works end-to-end, the frontend reach problem is solved.

## Out of scope

- Verifying auth (still off).
- Verifying mobile responsive layouts.
- Verifying the marketplace purchase flow (separate plan).
