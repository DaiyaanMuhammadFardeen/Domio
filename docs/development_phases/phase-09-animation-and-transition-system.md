# Phase 09 — Animation & Transition System

> **Phase:** 09 of 22
> **Name:** Animation & Transition System
> **Stream:** B (Data & motion) — runs in parallel with Phase 08 (Live Data & Charts), Phase 06/07 (Ecosystem), Phase 10/11 (Interactive media), Phase 12/13 (AI & agents)
> **Critical path?** No — runs as a **deepening** track once Phase 05 lands. (The timeline engine, however, is reused heavily by surface phases 14, 15, 21 and by Phase 08's `on_data_change` trigger resolver.)
> **Owner:** Stream B tech lead + 4–6 engineers
> **Status:** Not started (phase doc only)

**Intent.** Author and play animations natively inside Domio — a keyframe-based timeline editor per element, magic-move auto-tweening of matched elements between slides, an entrance/exit/emphasis preset library with physics-based easing, per-element triggers (click/hover/enter/data-change/timer), staggered reveals, scroll-linked animations for the web-published deck, GPU-accelerated slide transitions (morph, push, fade, 3D flip, cube, portal, cover, reveal), a built-in easing library plus a custom Bezier editor, automatic respect for OS reduced-motion preferences, animation copy/paste between elements and slides, and a server-side export pipeline for GIF/MP4/WebM. The result: slides that move with intent, animations that are deterministic across devices, and an accessibility default that never silently downgrades motion.

---

## 1. Goals

1. **Timeline-grade authoring.** Every element on a slide owns zero or more tracks (`transform`, `opacity`, `fill`, etc.); the timeline panel supports keyframe add/retime/re-ease, marker scrubbing, undo/redo, and per-track `start_offset_ms` delays, all backed by a debounced server-side store.
2. **Magic-move that just works.** For any ordered slide pair with `element_role`-matched elements, the engine auto-tweens position/size/rotation/opacity/style within ≤ 50 ms (warm cache) and exposes a "magic-move inspector" for overrides and ambiguity.
3. **Triggers that earn their keep.** Every animation declares one trigger — `on_click | on_enter | on_hover | on_data_change | on_timer` — and the trigger resolver is observable (recorded in the state timeline per #205).
4. **Reduced motion is the default.** OS `prefers-reduced-motion` is honored automatically, re-evaluated on `change` events, and overridable per-deck (`follow_os | always_reduced | always_full`); the deck never silently downgrades a user who explicitly opted out.
5. **Built-in easing + custom Bezier.** A curated curve library plus a Bezier editor with monotonicity enforcement and a 256-entry LUT cache; spring/physics presets are deterministic across frame rates via a fixed-step solver.
6. **Export the motion.** Any animated slide exports to GIF, MP4, or WebM with a budgeted wall time per format and resolution, watermarked for free tier, rate-limited per workspace.

---

## 2. Scope

**Feature numbers in scope (per `feature-list.md`):**

| Feature | Name                                     | Notes                                                            |
| ------- | ---------------------------------------- | ---------------------------------------------------------------- |
| #85     | Timeline-based animation editor          | Tracks, keyframes, easing curves, delays, undo                   |
| #86     | Magic move between slides                | Element-role matching, transform tween                           |
| #87     | Entrance/exit/emphasis presets           | 24+ presets, JSON-defined, hot-reloadable                        |
| #88     | Per-element animation triggers           | `on_click`, `on_enter`, `on_hover`, `on_data_change`, `on_timer` |
| #89     | Staggered list/grid reveals              | `forward / reverse / center-out / random`                        |
| #90     | Scroll-linked animations                 | Web-shared deck only, ≤ 32 / screen                              |
| #91     | Slide transitions                        | 8+ built-ins, magic-move-aware, GPU-accelerated                  |
| #92     | Animation curve library + custom Bezier  | Monotonicity enforced; LUT cache                                 |
| #93     | Reduced-motion mode                      | OS preference + per-deck override                                |
| #94     | Animation copy/paste                     | `Cmd/Ctrl+C`, `Cmd/Ctrl+Alt+C` for easing-only                   |
| #95     | GIF/MP4/WebM export of animated slide(s) | Server pipeline, watermarked for free tier                       |

**Out of scope (deferred):**

- **3D animation authoring** — camera keyframes between slides, exploded views, physics sandbox (#67, #69, #71) → Phase 11. The transition engine here uses transform/opacity exclusively for transitions; `morph` is the only exception (and only animates 2D geometry attributes).
- **Lottie/Rive state-machine authoring** (#79) → Phase 11 (import-only here).
- **AI-generated animations** (#112, #121) → Phase 12. The timeline data model is exposed via JSON Schema here so Phase 12 can wrap it.
- **Code-block + runnable snippet animations** (#82) → Phase 11.
- **MCP server exposure of animation tools** (#221, #222) → Phase 13. _However_, the timeline / transition / easing JSON Schemas are emitted as JSON Schema 2020-12 here so Phase 13 can read them.
- **Custom transitions authored in WebGL** → Phase 21 if at all.
- **Voice/gesture-triggered animations** → Phase 21 (touched on with the trigger API remaining stable).
- **Voice-triggered slide states** (#209) and AI rehearsal coach playback integration (#117) — Phase 21.

---

## 3. Dependencies

**Upstream (must be complete):**

- **Phase 02 — Deck schema & scene-graph foundation.** Every animation row hangs off a `(deck, slide, element)` triple; the `element_role` ("title", "kpi.revenue") field is the magic-move key, and is defined by Phase 02's element schema.
- **Phase 03 — Canvas editor MVP.** The timeline panel docks beneath the canvas and shares its selection model.
- **Phase 04 — CRDT.** Multiplayer presence ("Sarah is editing track `transform.x` on `chart[revenue]`) rides the CRDT awareness channel.
- **Phase 05 — Persistence, versioning, branches.** Animations, transitions, magic-move pairs, reduced-motion settings, and export jobs are branch-scoped; slide reordering (#129) invalidates affected `transitions` and cached `magic_move_pairs`.

**Cross-stream (parallel, must coexist):**

- **Phase 06 — Components.** Smart-component slots need to expose animation-friendly prop types (e.g., `is_animated: boolean`, allowed trigger kinds).
- **Phase 07 — Theming.** A keyframe on `fill.color` stores a token reference (`token://brand.primary`), not a literal, so theme swaps re-tint the animation in real time.
- **Phase 08 — Live Data & Charts.** `on_data_change` is implemented as a subscription on the binding event bus; chart ticker animations (#58) read their easing curve from this timeline engine.

**Downstream (this phase unblocks):**

- **Phase 10 — Prototyping.** Click hotspots (#96), branching navigation (#97), and component states (#99) reuse the trigger resolver; a click consumed by a hotspot advances navigation; an animation only fires if not consumed.
- **Phase 14 — Sharing.** The shared web deck mounts the same `TimelineEngine`; scroll-linked animations (#90) play only in scroll mode (#156) and can be suppressed per-link (#158). "Video export of full deck" (#163) shares this phase's per-slide export pipeline.
- **Phase 15 — Presenter experience.** Animations play identically in presenter view; live annotation tools (#128) overlay the canvas without disturbing animation; on-the-fly slide reorder (#129) invalidates relevant `magic_move_pairs`.
- **Phase 17 — Analytics.** `trigger.fired` events feed per-viewer, per-slide analytics; reduced-motion rates are reported as a metric.
- **Phase 21 — Living documents.** The presentation state timeline (#205) records every `trigger.fired`, magic-move computation, and reduced-motion switch for replay; novel-tier animation features build on this substrate.

---

## 4. Workstreams

The phase splits into six ordered workstreams. Streams M2–M4 may run in parallel once M1.1 (timeline schema + CRUD) ships.

### M1 — Timeline Data Plane (foundation, blocks everything else)

#### M1.1 — Timeline / track / keyframe / trigger schema + CRUD

- **Files / packages touched:**
  - `db/migrations/2026Q3/p09_animation.sql` — `timelines`, `tracks`, `keyframes`, `triggers`, `easing_curves` (built-in + user), `transitions`, `magic_move_pairs`, `reduced_motion_settings`, `export_jobs` (full DDL per `/docs/animation-transitions.md` §5).
  - `db/migrations/2026Q3/p09_animation_indexes.sql` — `idx_timelines_deck_slide`, `idx_tracks_timeline`, `(track_id, time_ms) UNIQUE`, `gin(animation_presets.tags)`.
  - `services/timeline-api/src/{routes,handlers}.ts` — REST endpoints per §6.1–6.4.
  - `packages/schema/src/animation/` — generated TS types from JSON Schemas.
- **Contracts produced:**
  - `contracts/openapi/v1/animation.yaml`
  - `contracts/json-schema/timeline.v1.json`
  - `contracts/json-schema/track.v1.json`
  - `contracts/json-schema/keyframes.v1.json`
  - `contracts/json-schema/triggers.v1.json`
  - `contracts/json-schema/transition.v1.json`
  - `contracts/json-schema/easing.v1.json`
- **Tests written:**
  - Migration test: each DDL block applies and reverts cleanly on a fresh DB; RLS policies enforce tenant scope.
  - Contract tests: every endpoint validates request body against the JSON Schema (Ajv) and returns 400/422 on mismatch.
  - Unit: optimistic-lock conflict returns 409 with current `etag`.
- **DoD:** All endpoints listed in `/docs/animation-transitions.md` §6.1–6.6 are live; tests green; types generated.

#### M1.2 — Easing curves: built-in seed + custom Bezier/spring/physics + LUT cache

- **Files / packages touched:**
  - `packages/easing/src/{linear, cubic, spring, physics, step}.ts` — built-in evaluator.
  - `packages/easing/src/lut-builder.ts` — 256-entry LUT precompute (Newton-Raphson fixed-step).
  - `packages/easing/src/lut-cache.ts` — 1024-entry LRU.
  - `services/timeline-api/src/handlers/easing-curves.ts` — workspace-scoped CRUD.
  - `db/seeds/2026Q3/easing-curves.sql` — seed material curves, easings.net variants, named springs (`wobbly`, `snappy`, `gentle`).
- **Contracts produced:** `GET/POST /v1/workspaces/{workspace_id}/easing-curves`.
- **Tests written:**
  - Unit: monotonicity enforcement — Bezier handles with `x1 ≤ x2` invalid curve rejected.
  - Unit: spring solver determinism over 10 000 randomized `(mass, stiffness, damping)` within allowed bounds.
  - Unit: LUT values clamped to `[-0.25, 1.25]`; out-of-bounds clamped at runtime.
- **DoD:** Built-in curves hot-reload in dev; user curves have stable IDs; LUT cached on first use, evicted on LRU pressure.

#### M1.3 — Animation preset library (24+ presets, hot-reloadable)

- **Files / packages touched:**
  - `assets/animation-presets/v1/*.json` — 8 entrance, 8 exit, 8 emphasis presets.
  - `services/timeline-api/src/handlers/animation-presets.ts`
  - `db/seeds/2026Q3/animation-presets.sql`
- **Contracts produced:** `GET /v1/workspaces/{workspace_id}/animation-presets?category=&tag=`.
- **Tests written:**
  - Unit: a preset applied to an element without the required property is rejected with an inline error naming the missing property.
  - Unit: preset applied to last-slide's `on_enter` is silently converted to `on_click`.
  - Unit: hot-reload picked up by the editor within 5 s of file change (dev mode).
- **DoD:** 24 presets ship at launch; preset definitions are pure JSON; tags GIN-indexed for `?tag=` discovery.

### M2 — Client-Side Timeline Engine + Editor UI

#### M2.1 — `TimelineEngine` singleton + per-frame rAF loop + reduced-motion flag

- **Files / packages touched:**
  - `apps/editor/src/animation/TimelineEngine.ts` — singleton per editor session; debounced writes at 250 ms.
  - `apps/editor/src/animation/EasingEvaluator.ts`
  - `apps/editor/src/animation/ReducedMotion.ts` — listens to `matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', ...)`.
  - `apps/editor/src/animation/Subscriber.ts` — `subscribe(listener)` for canvas interpolated values.
  - `apps/editor/src/components/timeline/Panel.tsx` — Docked timeline panel.
  - `apps/editor/src/components/timeline/Inspector.tsx` — Per-track inspector (easing chip, delay, trigger dropdown).
- **Contracts consumed:** REST endpoints from M1.1.
- **Tests written:**
  - Unit: engine debounces writes at 250 ms with a leading-edge first write.
  - Unit: reduced-motion flag flips on `change` event and clamps active tracks.
  - Unit: web-worker offload engages when keyframe `value` is large (paths, gradients).
- **DoD:** AC-85.1–AC-85.5 pass in Playwright. ≥ 50 fps with 16 simultaneous elements on the CI reference machine.

#### M2.2 — Custom Bezier editor (two-handle UI + LUT precompute)

- **Files / packages touched:**
  - `apps/editor/src/components/easing/BezierEditor.tsx`
  - `apps/editor/src/components/easing/PreviewSwatch.tsx` — 200×200 swatch at 30 fps.
  - `packages/easing/src/bezier-validate.ts` — rejects degenerate (`x1 == x2 == 0`) and non-monotonic handles.
- **Tests written:**
  - Unit: dragging a handle outside `(0,1)` in `x` snaps back; `y` allowed to overshoot.
  - Unit: 256-entry LUT precompute finishes < 5 ms on the CI machine.
- **DoD:** AC-92.1–AC-92.3 pass; preview swatch visible at all times.

#### M2.3 — Trigger resolver (on_click | on_enter | on_hover | on_data_change | on_timer) + sequence/stagger

- **Files / packages touched:**
  - `apps/editor/src/animation/TriggerResolver.ts`
  - `apps/editor/src/animation/Stagger.ts` — `forward | reverse | center-out | random`.
  - `apps/editor/src/animation/datachange-bus.ts` — subscribes to Phase 08 binding event bus.
  - `apps/editor/src/components/timeline/TriggerPicker.tsx`
- **Tests written:**
  - Unit: `on_data_change` resolves to a registered `dataChange` event with matching `(source_id, field_path)`.
  - Unit: `on_timer` with negative `offset_ms` rejected.
  - Unit: stagger on a single element is a no-op; ordering only changes `start_offset_ms`, never `z-order`.
- **DoD:** AC-88.1–AC-88.4 and AC-89.1–AC-89.2 pass.

#### M2.4 — Slide transition inspector + 8 built-in transitions (GPU-accelerated where possible)

- **Files / packages touched:**
  - `apps/editor/src/components/transitions/Inspector.tsx`
  - `apps/editor/src/animation/transitions/{fade,push,3d-flip,cube,portal,cover,reveal}.ts` — each a pure function `(fromSlide, toSlide, options) → renderPlan`.
  - `apps/editor/src/animation/transitions/morph.ts` — magic-move aware (consumes M3.1 diff).
  - `apps/editor/src/components/transitions/Preview.tsx` — 1-second preview button.
- **Tests written:**
  - Unit: `morph` consumes the `magic_move_pair.pairs` from §M3 and emits a per-element tween plan.
  - Unit: `cube` and `3d-flip` auto-inject `perspective: 1200px` on the slide root if absent.
  - Visual snapshot: 8 transitions played between two fixture slides recorded as Playwright snapshots.
- **DoD:** AC-91.1–AC-91.3 pass; transitions use transform/opacity exclusively except `morph` (geometry) and `portal` (`clip-path`).

### M3 — Magic-Move Diff Engine + Copy/Paste (parallel to M2 once M1.1 lands)

#### M3.1 — Magic-move compute service (shape + style + role similarity)

- **Files / packages touched:**
  - `services/magic-move/src/{compute, candidate, score, resolve}.ts`
  - `services/magic-move/src/cache.ts` — 24 h persisted, invalidated by triggers on `slides.updated_at`.
  - `workers/magic-move/src/index.ts` — BullMQ worker that processes recompute jobs.
- **Contracts produced:** `POST /v1/decks/{deck_id}/magic-move` (per §6.3 of `animation-transitions.md`).
- **Tests written:**
  - Unit: similarity scoring against a 20-pair hand-scored fixture; agreement ≥ 95 %.
  - Performance: cold compute ≤ 250 ms p95; warm cache ≤ 50 ms p95; 4 concurrent jobs per workspace.
  - Unit: ties within 0.05 similarity flag the lower-similarity match yellow for disambiguation.
- **DoD:** AC-86.1–AC-86.4 pass; cache invalidates on either slide's edit; ≤ 50 MB resident per compute.

#### M3.2 — Magic-move inspector UI (pairs panel + per-element override + debug JSON)

- **Files / packages touched:**
  - `apps/editor/src/components/transitions/MagicMoveInspector.tsx`
  - `apps/editor/src/components/transitions/DebugOverlay.tsx` — colored outlines + JSON download.
- **Tests written:**
  - E2E: override a pair to disable it; transition ignores the disabled element and cross-fades it.
  - E2E: download debug JSON; verify file contents hash-equal a known fixture.
- **DoD:** AC-86.2 + AC-86.4 pass.

#### M3.3 — Animation copy/paste + easing copy/paste

- **Files / packages touched:**
  - `apps/editor/src/animation/clipboard.ts` — Cmd/Ctrl+C / Cmd/Ctrl+V graph copy.
  - `apps/editor/src/animation/paste-rebind.ts` — drop incompatible tracks; rebind `on_data_change` triggers with confirmation.
  - `apps/editor/src/components/animation/CopyStyle.tsx` — Cmd/Ctrl+Alt+C easing-only copy.
- **Tests written:**
  - Unit: incompatible track dropped silently with "X tracks skipped" toast.
  - Security: read-only / brand-locked region (#36) refuses paste with an inline error.
  - E2E: cross-slide paste preserves keyframe times relative to slide enter.
- **DoD:** AC-94.1–AC-94.3 pass.

#### M3.4 — Scroll-linked animation binding (transform + scroll_y at passive 60 Hz)

- **Files / packages touched:**
  - `apps/web-viewer/src/animation/scroll-linked.ts` — passive scroll listener; `Float32Array` shared with renderer.
  - `apps/web-viewer/src/animation/scroll-budget.ts` — cap at 32 simultaneous; emit overflow warning.
- **Tests written:**
  - ESLint rule: forbids layout-triggering APIs (`offsetTop`, `getBoundingClientRect`) inside scroll handlers.
  - Performance: 32 scroll-linked properties, ≤ 1 ms / frame.
  - Unit: a scroll-linked animation depending on another scroll-linked animation is rejected.
- **DoD:** AC-90.1–AC-90.3 pass. Scroll-linked timelines coexist with on-enter; "scroll replaces enter" toggle available per property.

### M4 — Reduced-Motion + Cross-Surface Telemetry

#### M4.1 — Reduced-motion settings API + runtime enforcement

- **Files / packages touched:**
  - `services/timeline-api/src/handlers/reduced-motion.ts` — `GET/PUT /v1/decks/{deck_id}/reduced-motion`.
  - `apps/web-viewer/src/animation/reduced-motion-runtime.ts` — clamps durations, disables particles, collapses scroll-linked to end-state.
  - `apps/editor/src/components/deck/ReducedMotionPanel.tsx`
  - `apps/web-viewer/src/animation/propagate.ts` — emits `reduced_motion_observed` and `reduced_motion_overridden` to telemetry.
- **Contracts produced:** `GET/PUT /v1/decks/{deck_id}/reduced-motion` (consumed by Phase 14 sharing for link-level override).
- **Tests written:**
  - Unit: `matchMedia('change')` flips the flag and re-runs on the next slide transition.
  - Unit: `follow_os` is the default; `always_full` ignores the OS preference.
  - Unit: reduced mode collapsed scroll-linked tracks emit a single `set_value` at 100 % progress.
- **DoD:** AC-93.1–AC-93.3 pass in Playwright; reduced-motion events appended to the state timeline.

### M5 — Export Pipeline (server, depends on M1 + M2)

#### M5.1 — Export worker (headless Chromium + ffmpeg/gifenc stitching)

- **Files / packages touched:**
  - `services/export-pipeline/src/{job, render, encode}.ts`
  - `workers/export-render/src/index.ts` — pool consumer (BullMQ); per-tier concurrency (free=1, pro=3, enterprise=10).
  - `services/export-pipeline/src/storage.ts` — 7-day signed URL.
  - `services/export-pipeline/src/clipboard.ts` — `POST /v1/decks/{deck_id}/exports`, `GET /v1/exports/{job_id}` (per §6.7 of `animation-transitions.md`).
  - `db/migrations/2026Q3/p09_export_jobs.sql` — `export_jobs` table.
- **Contracts produced:** `POST /v1/decks/{deck_id}/exports`, `GET /v1/exports/{job_id}`.
- **Tests written:**
  - Performance: 10 s / 720 p MP4 wall ≤ 30 s; 6 s / 480 p GIF ≤ 12 s; 50-slide job ≤ 25 min.
  - Determinism: two runs of the same deck are byte-identical for the first 600 frames (CI gate).
  - Security: SSRF guard rejects RFC1918 / loopback URLs inside embedded iframes (#81, #62).
- **DoD:** AC-95.1–AC-95.4 pass; rate limits per `live-data-charts.md` §7.2 in effect; watermark for free tier.

#### M5.2 — Export UI (share → motion)

- **Files / packages touched:**
  - `apps/editor/src/components/share/ExportMotionDialog.tsx` — format, resolution, loop, watermark toggles.
  - `apps/editor/src/components/share/ExportHistory.tsx` — workspace exports list.
- **Tests written:**
  - E2E: slide with broken data binding shows red banner and refuses to submit.
  - E2E: job progress visible; download link appears within NFR-3 budget.
- **DoD:** Demo flow (§8) export steps complete under NFR-3 budgets.

### M6 — Cross-Cutting Concerns

#### M6.1 — Observability (structured logs + metrics + tracing)

- **Files / packages touched:**
  - `services/timeline-api/src/observability/{log,metrics}.ts` — emits events per `/docs/animation-transitions.md` §9.1.
  - `workers/export-render/src/tracing.ts` — OpenTelemetry spans for `export.job → render.slide → encode.video`.
  - `services/magic-move/src/tracing.ts` — spans for `magic_move.compute → candidate_pairs.enumerate → similarity.score → match.resolve`.
- **Tests written:**
  - Unit: every emitted event has the documented JSON shape (schema-fixture test).
  - Dashboard smoke test: a histogram and a counter appear in the Grafana JSON model after deploy.
- **DoD:** Metrics listed in §9.2 of `animation-transitions.md` are live; alerts wired for the four NFR thresholds.

#### M6.2 — Security review (rate limits, abuse prevention, SSRF, content checks)

- **Files / packages touched:**
  - `services/timeline-api/src/authz/acl.ts` — per-deck authorization; brand-locked regions refuse PATCH 403.
  - `services/export-pipeline/src/abuse.ts` — bot-detect middleware + DLP gate.
  - `services/export-pipeline/src/ssrf-guard.ts` — reject RFC1918 / link-local / loopback / cloud-metadata.
- **Tests written:**
  - Negative paths: 429 includes `Retry-After` and `X-RateLimit-Remaining`.
  - Negative paths: DLP-flagged deck export returns 403 with explanation.
  - Negative paths: 50-slide-cap surfaces inline warning.
- **DoD:** Security reviewer signs off on `/docs/07-security-planning.md` checklist for this phase.

---

## 5. Architecture & Data

References: `/docs/04-system-architecture.md` (services under `/services/`, packages under `/packages/`, client modules under `/apps/`), `/docs/05-data-database-design.md` (9 new tables below, all in the `domio` schema; tenant isolation via `tenant_id` + RLS), `/docs/06-technology-stack.md` (Node.js / TypeScript for services and packages; PostgreSQL; headless Chromium + `ffmpeg` for export; OpenTelemetry), `/docs/animation-transitions.md` §4–§5.

**New Postgres tables:**

```sql
timelines               -- per animated element: duration_ms, loop, play_count, start_offset_ms, tracks/triggers JSONB
tracks                  -- flattened mirror of timelines.tracks for analytics
keyframes               -- flattened mirror of tracks.keyframes
easing_curves           -- built-in + workspace-scoped user curves; lut BYTEA + lut_version
animation_presets       -- bundled + workspace customizations (entrance/exit/emphasis)
triggers                -- flattened mirror of timelines.triggers
transitions             -- per (from_slide, to_slide) pair with magic-move flags
magic_move_pairs        -- cached diffs, invalidated on either slide's edit
reduced_motion_settings -- per-deck mode and clamp limits
export_jobs             -- GIF/MP4/WebM export queue
```

Full DDL: `/docs/animation-transitions.md` §5.1 (`timelines`, `tracks`, `keyframes`, `easing_curves`, `animation_presets`, `triggers`, `transitions`, `magic_move_pairs`, `reduced_motion_settings`, `export_jobs`). RLS policies enforce tenant isolation.

**New services & packages:**

- `/services/timeline-api/` — REST endpoints (per §6.1–§6.7), reduced-motion settings, easing curves, presets.
- `/services/magic-move/` — diff engine + cache + score resolver; a worker (`/workers/magic-move/`) handles recompute jobs.
- `/services/export-pipeline/` — job submission + storage; `/workers/export-render/` — render pool.
- `/packages/easing/` — pure-function evaluators (linear / cubic_bezier / spring / physics / step) + LUT builder + LRU cache.
- `/packages/animation-runtime/` (named here as the "client timeline runtime") — `TimelineEngine`, `TriggerResolver`, `Stagger`, `ReducedMotion`, `ScrollLinked`.
- `/apps/editor/src/animation/...` — engine, inspector UI, panel, transition inspector, magic-move inspector, copy/paste.
- `/apps/web-viewer/src/animation/...` — web-shared runtime + scroll-linked renderer.
- `/apps/presenter/src/animation/...` — presenter-mode runtime consuming the same engine.
- `/assets/animation-presets/v1/*.json` — 24 preset definitions, JSON-only.
- `/contracts/openapi/v1/animation.yaml`, `/contracts/json-schema/{timeline,track,keyframes,triggers,transition,easing}.v1.json` — schema-first.

**Migrations:**

- `db/migrations/2026Q3/p09_animation.sql` — all 10 tables + RLS policies + check constraints.
- `db/migrations/2026Q3/p09_animation_indexes.sql` — `idx_timelines_deck_slide`, `idx_tracks_timeline`, `(track_id, time_ms) UNIQUE`, `gin(animation_presets.tags)`.
- `db/seeds/2026Q3/easing-curves.sql` — material/easings.net variants + named springs (`wobbly`, `snappy`, `gentle`).
- `db/seeds/2026Q3/animation-presets.sql` — 24 built-in presets.
- `db/migrations/2026Q3/p09_reduced_motion.sql` — `reduced_motion_settings` + per-deck default (`mode = 'follow_os'`, `max_transition_ms = 100`, `disable_particles = TRUE`, `collapse_scroll_linked = TRUE`, `instant_tickers = TRUE`).

**Contracts produced (versioned `/v1`):**

- OpenAPI: `animation.yaml` (timeline CRUD, magic-move, transitions, easing curves, presets, reduced-motion, exports).
- JSON-Schema: `timeline.v1.json`, `track.v1.json`, `keyframes.v1.json`, `triggers.v1.json`, `transition.v1.json`, `easing.v1.json`, `reduced_motion.v1.json`.
- TypeScript: `@domio/contracts/types/animation/*` — generated.

---

## 6. Verification

| Feature             | Test                                                                              | Expected result                                                                                                       | Owner   |
| ------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------- |
| #85 AC-85.1–AC-85.5 | Timeline panel E2E: select element, add two keyframes, scrub, undo                | Scrubbing is stable ≥ 50 fps; `K` drops a snap-to-playhead keyframe; undo returns to a single keyframe                | M2 lead |
| #86 AC-86.1–AC-86.4 | Magic-move across 200-element slides A/B                                          | Cold compute ≤ 250 ms p95; warm cache ≤ 50 ms; ambiguous matches flagged yellow; per-element override disables a pair | M3 lead |
| #87 AC-87.1–AC-87.3 | 24 presets applied to 24 element types                                            | Each preset produces editable keyframes; physics easing plays identically on two machines                             | M1 lead |
| #88 AC-88.1–AC-88.4 | Trigger dropdown + `on_data_change` integration with Phase 08 stub                | Each trigger fires correctly; sequence/stagger produces uniform offsets; `on_hover` suppressed in scroll-mode viewer  | M2 lead |
| #89 AC-89.1–AC-89.2 | Stagger direction `forward / reverse / center-out / random` on a 10-element group | Direction only reorders offsets; z-order preserved; single-element no-op                                              | M2 lead |
| #90 AC-90.1–AC-90.3 | 32 scroll-linked properties in scroll-mode viewer                                 | 60 Hz scroll; ≤ 1 ms / frame; cap emits inline warning above 32                                                       | M3 lead |
| #91 AC-91.1–AC-91.3 | 8 transitions on adjacent fixture slides, snapshot diff                           | All GPU-accelerated except `morph` and `portal`; preview button plays 1-second clip                                   | M2 lead |
| #92 AC-92.1–AC-92.3 | Bezier editor + precomputed LUT                                                   | Non-monotonic handles snap back; LUT clamps `[-0.25, 1.25]`; preview swatch animates at 30 fps                        | M1 lead |
| #93 AC-93.1–AC-93.3 | OS preference flipped + per-deck override                                         | Mode switches on `change` event; `always_full` ignores OS; reduced-mode events appended to state timeline             | M4 lead |
| #94 AC-94.1–AC-94.3 | Copy/paste animation across compatible and incompatible elements                  | Incompatible tracks dropped with toast; cross-slide paste preserves timings; brand-locked region refuses paste        | M3 lead |
| #95 AC-95.1–AC-95.4 | GIF/MP4 export of 6-second animated fixture                                       | Budgets met (480 p/15 fps GIF ≤ 12 s; 720 p MP4 ≤ 30 s); watermark on free tier; DLP-flagged deck export refused      | M5 lead |

**Performance benchmarks (CI gates):**

- 64 active tracks at 60 fps on a reference headless browser.
- Magic-move cold compute ≤ 250 ms (p95) on 200-element slides.
- GIF at 480 p/15 fps/6 s ≤ 12 s; MP4 at 720 p/30 fps/10 s ≤ 30 s.
- 600-frame deterministic run is byte-identical across two CI machines.

---

## 7. Risks & Open Decisions

| #       | Risk / decision                                                                                                                                     | Mitigation                                                                                                                                                                                                |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-09-1  | **Bezier / spring edge-case values break determinism.** A user-defined curve overshoots into negative progress.                                     | LUT clamp `[-0.25, 1.25]`; values outside the range trigger a 422 with "pick a built-in"; spring solver bounds enforced in the API (`mass ∈ [0.1, 10]`, `stiffness ∈ [10, 1000]`, `damping ∈ [1, 200]`).  |
| R-09-2  | **`morph` performance for many elements.** Geometry-attribute animation is heavier than transform.                                                  | Magic-move pairs are capped at 64 elements per transition; beyond that, the engine falls back to cross-fade.                                                                                              |
| R-09-3  | **Export SSRF via embedded iframes.** A slide that contains a live iframe bound to an internal URL could exfiltrate during render.                  | The export renderer is a sandboxed Chromium with network blocked to `RFC1918`, `link-local`, `loopback`, and cloud-metadata endpoints; iframes that fail to render are recorded with a placeholder frame. |
| R-09-4  | **GIF encoder determinism.** Two runs must produce the same GIF for the same input.                                                                 | Fixed-step encoder + identical input frames; CI runs a byte-level comparison over 600 frames.                                                                                                             |
| R-09-5  | **Reduced-motion overrides silently downgrade.** A user with `always_full` should never get reduced motion.                                         | Mode read from deck settings on each session start and on every `change` event; never inferred from `no-preference`.                                                                                      |
| R-09-6  | **Trigger overload.** `on_data_change` firing every second replays an animation every second — distracting.                                         | Per-binding trigger throttle (debounce 250 ms) and a per-slide cap on simultaneous triggers firing (16).                                                                                                  |
| R-09-7  | **Hot-reload of presets in prod.** A misconfigured preset could ship to live users.                                                                 | Hot-reload is dev-only; production bundles presets at build time and addresses them by stable ID.                                                                                                         |
| R-09-8  | **Export queue starvation.** A single 50-slide enterprise export blocks the pool.                                                                   | Per-tenant concurrency cap (10), priority for paid tiers, FIFO otherwise; `queue_depth` alert at 50.                                                                                                      |
| R-09-9  | **Open: scroll-linked + `always_reduced` interaction.** When reduced motion is forced, scroll-linked should collapse to end-state at full progress. | Default behavior is collapse; manual toggle per workspace (`collapse_scroll_linked BOOLEAN` in `reduced_motion_settings`).                                                                                |
| R-09-10 | **Open: `prefers-reduced-motion` telemetry aggregation.** Per-phase we want to know how many viewers experienced reduced motion.                    | Emit `reduced_motion.viewer_count` gauge per deck (already specced in §9.2); analytics dashboards in Phase 17.                                                                                            |
| R-09-11 | **Open: voice-triggered slide state (#209) and gesture control (#208).**                                                                            | Trigger API remains stable; Phase 21 wraps it with speech-recognition.                                                                                                                                    |

---

## 8. Demo

**Demo title: "Slides that move."**

**Pre-demo setup (T-1 day):**

1. Sandbox tenant `domio-design` with a 12-slide product deck.
2. Slide 1 has `unlock-screen` recorded; slide 2 has `app-home`. `unlock-screen.title → app-home.title` shares `element_role = "hero_title"`.
3. Slide 4 holds a 14-bar chart with stagger (`forward`, 80 ms).
4. Slide 5 has a `<button>` element with `on_click` reveal + typewriter entrance.
5. Slide 6 has a scroll-linked timeline bound to `transform.x` (in scroll-mode).
6. 8 transitions wired between consecutive slides: `push → fade → morph → cube → portal → cover → reveal → 3d-flip`.
7. Reduced-motion is `follow_os` on the deck; the demo operator toggles OS preference mid-demo.
8. Export worker queue is empty; one MP4 export is staged at 720 p / 10 s.

**Script (12 min):**

1. **Open timeline.** Select the `<button>`. Add a `transform.x` track; press `K` at `t = 0`, then move playhead to `t = 800 ms`, press `K` again, choose `ease-out-cubic`. Scrub — interpolation is smooth at ≥ 50 fps. _(#85)_
2. **Trigger reveal.** Set trigger to `on_click`. In presenter mode, click the button — animation fires. _(#88)_
3. **Stagger.** Multi-select the 14 bars and apply "stagger 80 ms (forward)". Hit "play" — bars reveal in sequence. Switch direction to `center-out`. _(#89)_
4. **Custom Bezier.** Open the easing chip, draw a Bezier curve with overshoot. Preview swatch animates 30 fps at the new curve. LUT precomputes in < 5 ms. _(#92)_
5. **Magic move.** Navigate to the slide 1 → 2 transition inspector. Toggle "Magic move". The diff resolves: `unlock-screen.hero_title → app-home.hero_title` at similarity 0.94 (green dot). Play the transition — `hero_title` tweens position, size, and color across slides. _(#86)_
6. **Presets.** Open the preset library. Apply `ken-burns zoom` to the hero image; `type-on typewriter` to the subtitle. Inspect the resulting tracks — they are editable keyframes, not a black-box. _(#87)_
7. **Slide transitions.** Cycle through `push → fade → morph → cube → portal → cover → reveal → 3d-flip` on the deck by clicking between slides. Each plays within its 1-second preview. _(#91)_
8. **Reduced motion.** The operator flips `prefers-reduced-motion: reduce` in the OS. On the next transition, animations collapse to ≤ 100 ms cross-fades. State timeline records `reduced_motion_observed: true`. Operator flips back; full motion returns. _(#93)_
9. **Copy/paste.** Copy `hero_title`'s animation. Paste onto `subtitle`. Incompatible `font_size` track is silently dropped with a toast saying "1 track skipped". _(#94)_
10. **Scroll-linked.** Switch to the published viewer in scroll mode. Scroll past slide 6 — `transform.x` interpolates against scroll progress, no forced reflow (DevTools shows zero layout). _(#90)_
11. **Export.** Click "Share → Export motion". Pick slide 5, MP4, 720 p, watermark off. The job completes within 30 s and the download link is presented. _(#95)_
12. **Determinism sanity.** Export the same slide again. The two MP4s hash-equal for the first 600 frames (CI gate).

**Pass criteria.** All 11 acceptance groups (#85–#95) are exercised. A "Demo passed" GitHub check is set when the Playwright suite covering flows 1–12 is green and the CI performance gates (§6 above) succeed.

---

## 9. Definition of Done

- [ ] Code merged to `main` behind a single feature flag `p09_animation_transitions` (default OFF in prod).
- [ ] All 7 contracts versioned in `/contracts/openapi/v1/animation.yaml` and `/contracts/json-schema/*.v1.json`; TS types generated.
- [ ] `pnpm test` green: unit (`@domio/easing`, `@domio/animation-runtime`, `@domio/magic-move`) ≥ 80 %; integration suites for the timeline API and export worker green; Playwright `p09-animation-and-transitions.spec.ts` green.
- [ ] Performance CI gates green: 64 active tracks @ 60 fps; magic-move cold ≤ 250 ms p95 on 200-element slides; export budgets per §6.
- [ ] Determinism CI gate green: 600-frame byte-identical run between two machines.
- [ ] Security review signed off: rate limits per `animation-transitions.md` §7.2; SSRF guard for the export worker; brand-locked region refuses mutation PATCH/POST 403.
- [ ] Telemetry in place: counters, histograms, gauges per §9.2; alerts for the four NFR thresholds.
- [ ] Migrations applied in dev + staging; revert plan verified.
- [ ] RLS policies enabled on the new tables; `reduced_motion_settings` row seeded per deck.
- [ ] Documentation updated: `/docs/animation-transitions.md` cross-linked from this phase; runbook for the magic-move compute service and export worker; preset library reference page.
- [ ] Design partner deck validated end-to-end with a non-Domio user.
- [ ] "Internal demo passed" status granted after the demo script runs green.
- [ ] Hooks left for downstream phases: `reduced_motion_settings` exposed for Phase 14 link-level override; `POST /v1/decks/{id}/exports` is the contract Phase 14 wraps; trigger event stream is the substrate Phase 17 analytics consumes; `trigger.fired` event stream is the substrate Phase 21 state timeline consumes.

---

_Document path: `/home/daiyaan2002/Desktop/Projects/domio/docs/development_phases/phase-09-animation-and-transition-system.md`_
_Source docs (unchanged): `feature-list.md`, `pre-development-planning-guide.md`, `animation-transitions.md`, `live-data-charts.md`._
