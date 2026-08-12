# Phase E — Verify & screenshot

## Context

After Phases A–D land, every reachable surface in the editor + dashboard must
work end-to-end with real data, and the stub fallbacks must never trigger
unless the backing service is genuinely down.

## Steps

### 1. Bring the stack up

```bash
./bin/up full
podman ps --filter "label=io.podman.compose.project=domio"
```

All 20 services must be `healthy`. The 6 new ones (crm-sync, ab-assignment,
ab-measurement, ab-statistics, team-analytics, live-analytics) added in Phase B
must appear.

### 2. Smoke

```bash
node tests/beta/smoke.mjs
```

Must stay 59/59 green. If anything regresses, fix it before moving on.

### 3. Editor surfaces (Phase A)

Open each URL and screenshot:

- `http://localhost:3100/` — Phase A: deck list + feature catalogue
- `http://localhost:3100/editor/demo` — demo deck opens
- `http://localhost:3100/editor/demo?panel=props` — props panel opens on mount
- `http://localhost:3100/editor/demo?panel=theme-brand`
- `http://localhost:3100/editor/demo?panel=variables`
- `http://localhost:3100/editor/demo?panel=animations`
- `http://localhost:3100/editor/demo?panel=marketplace`
- `http://localhost:3100/editor/demo?panel=copilot-outline`

Each must render without console errors.

### 4. Dashboard surfaces (Phases B, C, D)

- `http://localhost:3000/overview` — KPI tiles with REAL sparkline shapes
  (no longer the synthetic uniform ramp)
- `http://localhost:3000/crm` — adapter table populated from `crm-sync`
- `http://localhost:3000/ab` — experiments table populated from `ab-assignment`
- `http://localhost:3000/team` — rankings + retention populated from
  `team-analytics`
- `http://localhost:3000/heatmap?slide=...` — actual tile grid when there's
  scroll data, honest empty state when there isn't
- `http://localhost:3000/deck` — deck list (already wired in earlier work)

### 5. Stub fallback honesty (Phase D)

For each dashboard page above, stop the backing service and reload. Must show
empty state + "service not reachable" badge, never invented data.

```bash
podman stop domio-crm-sync
# reload /crm, screenshot, then:
podman start domio-crm-sync
```

Repeat for `domio-ab-assignment`, `domio-team-analytics`.

### 6. Playwright screenshots

Save under `tests/beta/screenshots/`:

```
tests/beta/screenshots/
  editor-home.png
  editor-demo.png
  editor-panel-props.png
  editor-panel-theme-brand.png
  editor-panel-variables.png
  editor-panel-animations.png
  editor-panel-marketplace.png
  editor-panel-copilot-outline.png
  dashboard-overview.png
  dashboard-crm.png
  dashboard-ab.png
  dashboard-team.png
  dashboard-heatmap.png
  dashboard-deck.png
  dashboard-crm-degraded.png
  dashboard-ab-degraded.png
  dashboard-team-degraded.png
```

Use `tests/beta/capture.mjs` (or write a new Playwright script). Eyeball each.

## Out of scope

- Verifying the other 9 apps (viewer, presenter, landing, …).
- Verifying auth — these surfaces are still open. Auth is a separate phase.
- Verifying mobile responsive layouts.
