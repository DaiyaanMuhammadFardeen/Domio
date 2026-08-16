## 📜 Planning-context banner

---

> ## ⚠️ Planning context — not a status report
>
> This is the original planning doc for this phase. The **live status of
> every phase** (what's actually shipped today on `master`) lives in
> **[`../../STATUS.md`](../../STATUS.md)**. Do not read this file as a
> status report — read it as the original spec that drove the work.
>
> See **[`../../CONSOLIDATED.md`](../../CONSOLIDATED.md)** for the full
> doc map.

---

# Phase 03 — Canvas editor — minimum viable editor

> **Phase number:** 03
> **Name:** Canvas editor — minimum viable editor (MVE)
> **Owners:** Editor lead (primary), Canvas renderer lead, Frontend infra lead, UX lead
> **Critical path:** **yes** (blocks P04 real-time collab and P05 persistence/versioning)
> **Parallel stream:** Foundation (P00–P05); no parallel offset — this phase consumes P02 directly
> **Status:** Not started

## 1. Intent

Ship a single-user, keyboard-first, GPU-accelerated canvas editor that proves the Figma-grade editing surface on top of the schema defined in P02. By the end of P03 a designer can: open a deck from `DocumentLoader`, see all slides as frames on an infinite canvas, place and transform layers, multi-select, group, lock, hide, reorder in the layers panel, align to guides, draw with a pen, zoom from 2 % to 6400 %, undo/redo through a visual timeline, run every action via Cmd+K, copy and paste styles, eyedrop colors, right-click for context, and have every keystroke autosaved to a durable queue. No multiplayer, no CRDT, no branches, no collaboration transport — those land in P04/P05. The output is the smallest demoable editor that exercises every interaction in the editor canvas doc except the collaboration subset.

---

## 2. Goals

1. **Boot a Next.js shell with an editor route served from a separate Vite bundle** (`/apps/web` for SSR viewer/admin + `/apps/editor` for the editor route on Vite). The editor bundle ships the canvas renderer, input pipeline, scene graph, history engine, and React-free UI panels. The viewer route can render any deck JSON the editor produces.
2. **Render the infinite canvas with WebGL2 + WebGPU (Canvas2D fallback)** at 60 FPS for 100 layers and ≥ 30 FPS for 5,000 layers on a 2019-era MacBook Pro, per `docs/editor-canvas.md` §1 Feature 11. World coordinates are float64 with a camera-relative origin offset so distant frames don't lose precision.
3. **Land every editor interaction for features #2 through #16, #18, and the editor half of #22.** This includes drag/drop with snap, smart guides, multi-select, group/ungroup, lock/hide, layers panel with reorder, frames, vector pen (without booleans), rulers/guides, zoom 2–6400 %, unlimited undo/redo with visual timeline, keyboard-first + Cmd+K palette, copy/paste styles + format painter, eyedropper, and right-click context menus. Autosave per keystroke is the editor half of #22; remote push is deferred to P04/P05.
4. **A `CanvasRenderer` package (`packages/canvas`)** owns WebGL2 + WebGPU pipelines with a Canvas2D fallback. The renderer consumes a normalized scene graph (computed by the layout worker) and emits draw commands; it does not mutate the scene graph.
5. **Input pipeline with pointer arbitration** (`packages/canvas/src/input`): single-pointer ownership, multi-touch routing, gesture recognition (drag, pinch, marquee, chord). Pointer-down-to-first-frame ≤ 8 ms per `docs/editor-canvas.md` §3.2.
6. **Unlimited undo/redo with visual history timeline** (`packages/canvas/src/history`): a command-pattern engine, named ops, scrubbable timeline UI, persistent in IndexedDB per the autosave stub from P02.
7. **A keyboard-first UX** with a conflict-checked shortcut registry, Cmd+K omnisearch palette, chord support, platform-aware (`Cmd` vs. `Ctrl`), and a remappable per-user shortcut map.

## 3. Scope

**In scope (feature numbers):**

- **#1** — Infinite canvas (data model from P02; _rendering_ is the new work here).
- **#2** — Drag-drop WYSIWYG editing with pixel-perfect and snap-to-grid modes.
- **#3** — Smart alignment guides, spacing hints, and distribution tools.
- **#4** — Multi-select, group/ungroup, lock, hide layers.
- **#5** — Full layers panel with drag-reorder, search, filtering.
- **#6** — Frames-within-frames (nested components, Figma-style).
- **#7** — Auto-layout containers (flexbox-like, reflow).
- **#8** — Constraints system (pin to edges/center for responsive scaling).
- **#9** — Vector pen tool. **Boolean operations are deferred** to a later phase (out of scope below).
- **#10** — Rulers, guides, and customizable grid systems.
- **#11** — Zoom 2 % to 6400 % with GPU-accelerated rendering.
- **#12** — Unlimited undo/redo with visual history timeline.
- **#13** — Keyboard-first workflow + Cmd+K command palette.
- **#14** — Copy/paste styles, format painter, "paste to match destination" (uses theme tokens from P02; full theme system lands in P07).
- **#15** — Eyedropper color picking.
- **#16** — Right-click contextual menus tuned per element type.
- **#18** — Cursor chat and pointer "ping". **Note:** #18 is _partial_ in P03 — the local UX (T-to-chat, Cmd+Shift+P ping) is wired; the multiplayer transport (presence service, remote broadcast) lands in P04. P03 implements the input bindings and the local "ping" animation.
- **#22** — Autosave every keystroke. P03 implements the **editor half**: per-keystroke op generation, debounced durable write to IndexedDB, the "synced / syncing… N pending" indicator. **Remote push is P04/P05.**

**Out of scope (deferred):**

- **#9 (boolean operations)** — Pen tool paths are created and edited; union/subtract/intersect/exclude are P09 (animation/interaction) territory; the schema slot is in P02, the runtime is later.
- **#17** — Multiplayer live editing with cursors, selections, presence avatars (P04).
- **#19** — Branching and merging (P05).
- **#20** — Named checkpoints and version history UI (P05).
- **#21** — Offline CRDT-based sync (P04).
- **CRDT transport** — P03 emits ops to the local `AutosaveQueue` (P02 stub) and IndexedDB; the server endpoint `POST /v1/decks/{id}/schema` is _callable_ but P03 only uses it on a manual "save now" button hidden behind a feature flag (default off).
- **#23–#240** — All deepening/surface features: components, theming, charts, animation, prototyping, 3D, AI, presenter, audience, sharing, analytics. Each has its own phase.
- **Per-element animations** (P09) — the schema slot exists from P02; no timeline UI in P03.
- **3D / media** (P11) — schema slots exist; no runtime in P03.
- **Live data bindings** (P08) — schema slot exists; the bindings panel and refresh are P08.
- **Components / variants** (P06) — the `ComponentInstance` slot exists; the components panel and "create component" flow are P06.

## 4. Dependencies

**Upstream (must be complete before P03):**

- **Phase 00 — Repository, contracts, dev environment.** P03 assumes the pnpm + Turborepo monorepo, the OpenAPI/JSON Schema/Protobuf layout, and the contracts rule per `docs/06-technology-stack.md` §6.2.0.
- **Phase 01 — Observability, CI/CD, infra baseline.** P03 assumes the telemetry SDK, the perf budget dashboard, the Playwright + axe CI, and the Sentry frontend error tracker.
- **Phase 02 — Deck schema & scene-graph foundation.** P03 consumes `@domio/sdk` (`DeckDocument`, `Slide`, `Element`, `SemanticAddress`, `validate`, `migrate`) and the `DocumentLoader`. The example deck fixture from P02 is the demo deck.

**Downstream (this phase unblocks):**

- **Phase 04 — Real-time collaboration & CRDT sync.** P04 layers Yjs over the local scene-graph mutations emitted by the history engine in P03. The `AutosaveQueue` from P02 + P03 is the local op source.
- **Phase 05 — Persistence, versioning, branches.** P05 turns on the `DocumentLoader.save` server endpoint that P03 has already wired but disabled by default. The history engine's command stream becomes the source for CRDT ops.
- **Phase 06 — Components & templates ecosystem.** The `ComponentInstance` slot and `element_overrides` table from P02 are read by the layers panel (#5) in P03 and become writable in P06.
- **Phase 07 — Theming & brand.** The "paste to match destination" flow in #14 uses theme tokens; the full theming engine lands in P07 but the data path is P03.
- **Phase 09 — Animation & transitions.** The history engine's command pattern from P03 is the substrate for keyframe ops in P09.
- **Phase 12 — AI copilot.** AI actions in P12 generate ops through the same history engine entry points; "smart components with editable props panel" (#25) builds on the layers panel from P03.

## 5. Workstreams

P03 has six workstreams. Each task lists files/packages touched, contracts added or consumed, tests written, and Definition of Done for the task.

### WS-A — Editor app shell and routing (2 tasks)

**A.1 — Next.js web app skeleton with viewer route.**

- Files touched: `/apps/web/package.json`, `/apps/web/next.config.ts`, `/apps/web/src/pages/index.tsx`, `/apps/web/src/pages/decks/[id].tsx`, `/apps/web/src/pages/viewer/[id].tsx`, `/apps/web/src/lib/document-loader-client.ts`.
- Contracts consumed: `@domio/sdk` `DeckDocument`; `ClientDocumentLoader` from P02.
- Tests written: `/apps/web/__tests__/viewer.test.tsx` (renders a deck JSON via the SSR viewer; matches the example fixture's first slide; axe clean).
- DoD: `pnpm --filter @domio/web dev` serves a working viewer at `http://localhost:3000/decks/{id}`; viewer is SSR-rendered for SEO; viewer route is keyboard-navigable (next/prev slide, fullscreen, escape).

**A.2 — Vite editor app route mounted from the Next.js shell.**

- Files touched: `/apps/editor/package.json`, `/apps/editor/vite.config.ts`, `/apps/editor/src/main.tsx`, `/apps/editor/src/App.tsx`, `/apps/web/src/pages/editor/[id].tsx` (mounts the editor in a portal/iframe).
- Contracts consumed: `packages/canvas`, `packages/schema`, `@domio/sdk`; `Worker` API for layout.
- Tests written: `/apps/editor/__tests__/boot.test.ts` (editor route renders a frame within 200 ms; `DocumentLoader.load` resolves; first frame within 16 ms of layout).
- DoD: `/editor/{id}` loads the deck, initializes the scene graph, and renders the first frame; the route is excluded from SSR (`dynamic = 'force-static'` and client-only mount); bundle size budget ≤ 1.5 MB gzipped (per `docs/06-technology-stack.md` §6.5.0).

### WS-B — Canvas renderer package (`packages/canvas`) (5 tasks)

**B.1 — Bootstrap `packages/canvas` with WebGL2 + WebGPU adapter selection.**

- Files touched: `/packages/canvas/package.json`, `/packages/canvas/src/renderer/index.ts`, `/packages/canvas/src/renderer/gpu-adapter.ts`, `/packages/canvas/src/renderer/canvas2d-fallback.ts`.
- Contracts added: `Renderer` interface (`init(canvas, scene)`, `draw(scene)`, `dispose()`, `setCamera(camera)`); `RenderCapabilities` (`webgpu`, `webgl2`, `canvas2d`); adapter selector.
- Tests written: `/packages/canvas/__tests__/adapter-selection.test.ts` (selects WebGPU when available, falls back to WebGL2, then Canvas2D; user-visible warning when forced to Canvas2D).
- DoD: adapter selection is deterministic and unit-tested; the renderer survives a `WEBGL_lose_context` event by re-initializing.

**B.2 — Tile cache and render command pipeline.**

- Files touched: `/packages/canvas/src/renderer/tile-cache.ts`, `/packages/canvas/src/renderer/commands.ts`, `/packages/canvas/src/renderer/passes.ts`.
- Contracts added: `RenderCommand` (typed: `drawRect`, `drawText`, `drawPath`, `drawImage`, `drawGroup`, `clip`, `transform`); `TileCache` (LRU at 256 MB, 30 s TTL); `RenderPass` (`OpaquePass`, `TextPass`, `OverlayPass`).
- Tests written: `/packages/canvas/__tests__/tile-cache.test.ts` (LRU eviction; 30 s TTL; tile invalidation on transform mutation).
- DoD: render command list is consumed zero-copy by the GPU buffer; at 100 layers the frame time is ≤ 16 ms (p95) on the reference hardware per `docs/editor-canvas.md` §3.2.

**B.3 — Layout worker.**

- Files touched: `/packages/canvas/src/worker/layout.ts`, `/packages/canvas/src/worker/auto-layout.ts`, `/packages/canvas/src/worker/constraints.ts`, `/packages/canvas/src/scene/normalize.ts`.
- Contracts consumed: `@domio/sdk` `Element`, `AutoLayoutSpec`, `LayerConstraints`; `yoga-layout` for flexbox (per `docs/06-technology-stack.md` §6.1.4).
- Tests written: `/packages/canvas/__tests__/auto-layout.test.ts` (row/column/wrap, padding, gap, align, justify; `position: absolute` escapes layout); `/packages/canvas/__tests__/constraints.test.ts` (left/right/top/bottom/center/scale/stretch per axis; mixed constraints; scale clamps to min/max).
- DoD: layout runs in a web worker; incremental layout updates on a single element ≤ 6 ms p95; constraints are applied _after_ auto-layout per `docs/editor-canvas.md` §1 Feature 7.

**B.4 — Hit testing and scene graph reactive bridge.**

- Files touched: `/packages/canvas/src/scene/scene-graph.ts`, `/packages/canvas/src/scene/hit-test.ts`, `/packages/canvas/src/scene/spatial-index.ts`.
- Contracts added: `SceneNode` (discriminated union mirror of `Element`); `SceneGraph` API (`addNode`, `removeNode`, `updateTransform`, `reorder`, `query`); `SpatialIndex` (R-tree over layer bounds for guide calculation per `docs/editor-canvas.md` §1 Feature 3).
- Tests written: `/packages/canvas/__tests__/hit-test.test.ts` (click on nested frame, group, locked layer, hidden layer); `/packages/canvas/__tests__/spatial-index.test.ts` (R-tree queries return correct guides in O(log n) up to 10,000 layers).
- DoD: hit testing handles z-order, locked layers (skipped), hidden layers (skipped), and frame clipping correctly; spatial index is used by the guides feature in WS-C.

**B.5 — Camera and zoom 2–6400 %.**

- Files touched: `/packages/canvas/src/renderer/camera.ts`, `/packages/canvas/src/renderer/zoom.ts`, `/packages/canvas/src/renderer/tile-coords.ts`.
- Contracts added: `Camera` (`{x, y, zoom}`, with origin offset for far frames); `zoomTo(value)`, `fit(bounds)`, `panBy(dx, dy)`.
- Tests written: `/packages/canvas/__tests__/zoom.test.ts` (clamp to [0.02, 64.0]; Cmd-held snap to fit/100%/200%; 1:1 at zoom=1.0).
- DoD: at 100 % a 16:9 frame renders 1:1 with pixels; at 6400 % individual anchor points are inspectable; float64 origin offset keeps precision out to 100,000 world units.

### WS-C — Input pipeline and editor interactions (6 tasks)

**C.1 — Pointer and keyboard arbitration.**

- Files touched: `/packages/canvas/src/input/pointer.ts`, `/packages/canvas/src/input/keyboard.ts`, `/packages/canvas/src/input/gestures.ts`, `/packages/canvas/src/input/commands.ts`.
- Contracts added: `PointerEvent` (normalized: `down`, `move`, `up`, `wheel`, `pinch`); `KeyboardEvent` (with platform mapping `Cmd` vs. `Ctrl`); semantic `Intent` (`beginDrag`, `beginMarquee`, `beginTextEdit`, `commitOp`).
- Tests written: `/packages/canvas/__tests__/pointer.test.ts` (pointer-down to first frame ≤ 8 ms; multi-touch arbitration; long-press recognition); `/packages/canvas/__tests__/keyboard.test.ts` (platform mapping; focus-aware — text-input does not steal `B` for bold).
- DoD: pointer and keyboard produce semantic intents only; they never touch the scene graph directly (per `docs/editor-canvas.md` §4.2).

**C.2 — Drag-drop with snap modes (#2).**

- Files touched: `/packages/canvas/src/commands/drag.ts`, `/packages/canvas/src/commands/transform.ts`, `/packages/canvas/src/input/snap.ts`.
- Contracts added: `DragOp` (ephemeral during gesture, committed on pointer-up); `SnapMode` (`none | pixel | grid`); `Shift` (constrain), `Alt`/`Option` (disable snap).
- Tests written: `/packages/canvas/__tests__/drag.test.ts` (drag starts within 8 ms; snap resolves to nearest multiple of `gridStep`; Shift constrains rotation/resize; auto-layout reflows on drop into a container).
- DoD: drag generates a single committed `MoveOp` / `ResizeOp` on pointer-up; intermediate drags use an ephemeral layer that the history engine does not see.

**C.3 — Smart guides, spacing hints, distribution (#3).**

- Files touched: `/packages/canvas/src/guides/alignment.ts`, `/packages/canvas/src/guides/spacing.ts`, `/packages/canvas/src/guides/distribute.ts`, `/packages/canvas/src/renderer/overlay/guides.ts`.
- Contracts added: `Guide` (`type: 'align' | 'spacing' | 'equal-spacing'`, `axis`, `position`, `targets`).
- Tests written: `/packages/canvas/__tests__/alignment.test.ts` (R-tree query under 1 ms for 1,000 layers; equal-spacing detection tolerance `Math.max(1, 1/zoom)`); `/packages/canvas/__tests__/distribute.test.ts` (`evenly` and `toCanvas` modes).
- DoD: guides render within one frame after pointer-move; locked/hidden layers are excluded per `docs/editor-canvas.md` §1 Feature 3; distribution commands equalize spacing correctly.

**C.4 — Multi-select, group/ungroup, lock/hide (#4).**

- Files touched: `/packages/canvas/src/selection/marquee.ts`, `/packages/canvas/src/selection/group.ts`, `/packages/canvas/src/selection/lock-hide.ts`.
- Contracts added: `Selection` (immutable set of `ElementId`); `Marquee` (Shift add / Alt subtract); `GroupOp`, `UngroupOp`, `LockOp`, `HideOp`.
- Tests written: `/packages/canvas/__tests__/marquee.test.ts` (Shift add, Alt subtract, locked layers skipped); `/packages/canvas/__tests__/group.test.ts` (children's absolute transforms preserved on ungroup; group is itself multi-selectable).
- DoD: marquee respects locked layers visually and operationally; group preserves z-order; hidden layers are excluded from render and bounds queries but persist in the scene graph per `docs/editor-canvas.md` §1 Feature 4.

**C.5 — Layers panel (#5).**

- Files touched: `/apps/editor/src/panels/LayersPanel.tsx`, `/apps/editor/src/panels/LayersPanel.search.ts`, `/apps/editor/src/panels/LayersPanel.filter.ts`, `/apps/editor/src/panels/LayersPanel.dnd.tsx`.
- Contracts consumed: `Element` discriminator; `componentInstanceId` filter; `dataSourceId` filter (slot exists; live data is P08).
- Tests written: `/apps/editor/__tests__/layers-panel.test.tsx` (drag-reorder is a single `ReorderOp`; search matches `name`/`role`/`dataTags`; filter by type/locked/data source/component instance; "show hidden" toggle).
- DoD: layers panel shows the full logical tree (including children of hidden frames); reorder across frames re-parents correctly; virtualization kicks in at 500 visible rows per `docs/editor-canvas.md` §7.2.

**C.6 — Frames, rulers, guides, grid systems (#6, #10).**

- Files touched: `/packages/canvas/src/frames/frame.ts`, `/packages/canvas/src/renderer/overlay/rulers.tsx`, `/packages/canvas/src/renderer/overlay/guides.tsx`, `/packages/canvas/src/grid/grid.ts`.
- Contracts added: `Frame` (own viewport, scroll bounds, clip behavior); `Ruler`, `Guide`, `GridSpec` (square, columns, baseline); `overflow: visible | clip`.
- Tests written: `/packages/canvas/__tests__/frame.test.ts` (nested frame clipping; `Cmd+Alt+Up` selects parent; column grids apply to auto-layout); `/packages/canvas/__tests__/rulers-guides.test.ts` (drag from ruler creates guide; guides snap to grid intersections).
- DoD: ruler shows world coords and zoom; guide dragging is sub-frame responsive; baseline grid is per-frame, columns grid is per-frame.

### WS-D — Vector pen, eyedropper, styles (#9 partial, #14, #15) (3 tasks)

**D.1 — Vector pen primitive (#9 partial).**

- Files touched: `/packages/canvas/src/pen/pen-tool.ts`, `/packages/canvas/src/pen/path.ts`, `/packages/canvas/src/pen/anchor.ts`.
- Contracts added: `VectorPath` (cubic Béziers with `x1,y1,x2,y2` handles per anchor); `BooleanShape` (schema slot exists; runtime deferred); `fillRule: 'evenodd' | 'nonzero'`.
- Tests written: `/packages/canvas/__tests__/pen.test.ts` (click adds anchor; double-click closes; `Esc` ends open path; `Alt` breaks handle symmetry).
- DoD: pen creates vector layers in the schema; paths are saved/loaded; boolean ops slot exists but is not wired to runtime.

**D.2 — Eyedropper (#15).**

- Files touched: `/packages/canvas/src/eyedropper/index.ts`, `/packages/canvas/src/color/spaces.ts`, `/packages/canvas/src/color/theme-match.ts`.
- Contracts added: `Eyedropper` API (`start()`, `sample(x, y)`, `cancel()`); `Color` in sRGB and P3; delta-E warning when out-of-gamut.
- Tests written: `/packages/canvas/__tests__/eyedropper.test.ts` (`I` activates; 8x magnifier; continuous sampling at 8 Hz; multi-display; theme token matching when match found).
- DoD: sampled colors are expressed in sRGB and converted to the deck's working color space; P3 fallback is hard-coded; lint flag for out-of-palette is wired (full lint rules land with theming in P07).

**D.3 — Style engine: copy/paste/painter/match (#14).**

- Files touched: `/packages/canvas/src/styles/style-snapshot.ts`, `/packages/canvas/src/styles/copy-paste.ts`, `/packages/canvas/src/styles/format-painter.ts`, `/packages/canvas/src/styles/theme-map.ts`.
- Contracts added: `StyleSnapshot` (versioned via `StyleFormatVersion`); `copyStyleCommand`, `applyStyleCommand`; `themeMapping` block for cross-deck paste.
- Tests written: `/packages/canvas/__tests__/style-copy-paste.test.ts` (`Cmd+Alt+C` copies style only; double-click enters persistent mode; `Esc` exits; cross-deck paste carries `themeMapping`).
- DoD: "paste to match destination" maps fills/strokes/type to the deck's theme tokens; missing tokens fall back to a hard-coded fallback palette; old style snapshots migrate on read.

### WS-E — History engine, undo/redo, autosave (#12, #22 editor half) (3 tasks)

**E.1 — History engine with command pattern.**

- Files touched: `/packages/canvas/src/history/engine.ts`, `/packages/canvas/src/history/ops.ts`, `/packages/canvas/src/history/checkpoint.ts`, `/packages/canvas/src/history/snapshot.ts`.
- Contracts added: `HistoryOp` (named, with `forward` and `inverse`); `HistoryEngine` API (`apply`, `undo`, `redo`, `checkpoint`, `restore`); `HistoryEntry` (`{ opId, opName, authorId?, timestamp, thumbnail? }`).
- Tests written: `/packages/canvas/__tests__/history.test.ts` (unbounded depth; cross-deck operations as single entries; per-op `apply`/`inverse` symmetry; `opId` is ULID).
- DoD: every operation is reversible; `Cmd+Z` / `Cmd+Shift+Z` work; branch-merge operations collapse to a single history entry (per `docs/editor-canvas.md` §1 Feature 12); named checkpoints are pinned history entries.

**E.2 — Visual history timeline UI.**

- Files touched: `/apps/editor/src/panels/HistoryPanel.tsx`, `/apps/canvas/src/history/thumbnail.ts`.
- Contracts added: `HistoryPanel` shows entries with timestamp, author, and thumbnail; `scrubTo(opId)` previews the state without committing; `releaseScrub()` commits.
- Tests written: `/apps/editor/__tests__/history-panel.test.tsx` (timeline renders ≥ 1,000 entries virtualized; scrub latency ≤ 200 ms per `docs/editor-canvas.md` §3.2; thumbnails computed for the example deck).
- DoD: scrubbing previews state without committing until release; cross-deck operations appear as a single named entry; named checkpoints are pinned.

**E.3 — Autosave queue integration (#22 editor half).**

- Files touched: `/packages/sdk-ts/src/autosave-queue.ts` (extend P02 stub), `/apps/editor/src/lib/autosave.ts`, `/apps/editor/src/components/SyncIndicator.tsx`.
- Contracts added: `SyncIndicator` shows `synced` / `syncing… N pending`; `flush()` is idempotent; quota exceeded returns graceful error.
- Tests written: `/apps/editor/__tests__/autosave.test.ts` (every op durable within 16 ms; pending count updates per keystroke; `flush()` is idempotent; manual "save now" calls `DocumentLoader.save`).
- DoD: every keystroke yields a `HistoryOp`; the op is durable in IndexedDB within 16 ms; the "save now" button is feature-flagged off by default; the sync indicator is visible in the editor chrome.

### WS-F — Keyboard, command palette, context menus (#13, #16, #18 partial) (3 tasks)

**F.1 — Shortcut registry and Cmd+K palette.**

- Files touched: `/packages/canvas/src/keyboard/registry.ts`, `/packages/canvas/src/keyboard/chord.ts`, `/apps/editor/src/panels/CommandPalette.tsx`, `/apps/editor/src/state/shortcut-map.ts`.
- Contracts added: `Shortcut` (with conflict detection at registration); `Chord` (`G then G` → "go to slide", 1 s timeout); `CommandPalette` searches actions, layers, components, themes; remappable per-user.
- Tests written: `/packages/canvas/__tests__/shortcut.test.ts` (conflict refused at registration; chord timer resets; platform mapping `Cmd` vs. `Ctrl`); `/apps/editor/__tests__/command-palette.test.tsx` (Cmd+K cold ≤ 50 ms, warm ≤ 16 ms; searches examples).
- DoD: every action reachable via a single keystroke or via Cmd+K; chord timer resets on any keypress; remappings persist per-user in IndexedDB.

**F.2 — Right-click context menus (#16).**

- Files touched: `/apps/editor/src/panels/ContextMenu.tsx`, `/packages/canvas/src/menus/registry.ts`, `/apps/editor/src/menus/per-type.ts`.
- Contracts added: `MenuEntry` registered per `LayerType`; sub-menus nest up to 2 levels (deeper flattens); keyboard navigation (arrow keys, Enter).
- Tests written: `/apps/editor/__tests__/context-menu.test.tsx` (text layer menu differs from frame layer menu; long menus scroll; most-used pinned at top; feature-flag hidden items are not shown).
- DoD: each layer type has a tuned menu; per-user pinning learns from frequency (initial implementation: last-used order, no telemetry-based ranking yet — that comes with P17 analytics).

**F.3 — Cursor chat + ping (local UX, transport deferred) (#18 partial).**

- Files touched: `/packages/canvas/src/presence/local-chat.ts`, `/packages/canvas/src/presence/ping.ts`, `/apps/editor/src/components/LocalPing.tsx`.
- Contracts added: `localChat.open()` (T held); `localPing.emit()` (Cmd+Shift+P) — emits a 1.2 s expanding-ring animation at the cursor; both are local-only in P03.
- Tests written: `/apps/editor/__tests__/local-ping.test.tsx` (Cmd+Shift+P emits visible ring; T-held opens chat input; rate limit 1 per 2 s).
- DoD: local UX works; remote broadcast is a P04 concern and is explicitly not implemented. The chat and ping code paths are abstracted behind `LocalPresenceAdapter` so P04 can swap in a `RemotePresenceAdapter` without touching the editor.

## 6. Architecture & data

### 6.1 New services and modules

- **`/apps/editor`** — Vite-bundled editor app route. Owns panels (Layers, History, CommandPalette, ContextMenu), state (Zustand stores per `docs/04-system-architecture.md` §4.5.1), the local autosave wiring, and the per-user shortcut map.
- **`/apps/web`** — Next.js shell with viewer route (`/decks/[id]`), admin viewer, and the editor mount.
- **`/packages/canvas`** — The renderer + scene graph + input + history + layout worker. Single workspace, multiple sub-modules.

### 6.2 New tables

- **No new tables in P03.** All schema is already in P02 (`decks`, `slides`, `elements`, `element_overrides`, `deck_schemas`, `component_instances`). P03 _reads and writes_ through `DocumentLoader`; the only durable additions are:
  - Per-user shortcut map: persisted in IndexedDB (no Postgres table in P03; sync to a future `user_preferences` table is a P22 polish item).
  - Per-user context-menu pinning: same as above.

### 6.3 New modules and contracts

- `packages/canvas/src/renderer/` — `Renderer`, `RenderCommand`, `TileCache`, `Camera`.
- `packages/canvas/src/scene/` — `SceneNode`, `SceneGraph`, `SpatialIndex`, `hit-test`.
- `packages/canvas/src/worker/` — `layout` (auto-layout + constraints), runs off main thread per `docs/04-system-architecture.md` §4.5.2.
- `packages/canvas/src/input/` — `Pointer`, `Keyboard`, `Gestures`, `Commands`, `Snap`.
- `packages/canvas/src/history/` — `HistoryEngine`, `HistoryOp`, `HistoryEntry`, `Checkpoint`, `Snapshot`.
- `packages/canvas/src/keyboard/` — `Registry`, `Chord`, `Map`.
- `packages/canvas/src/menus/` — `Registry`, `Entry`.
- `packages/canvas/src/pen/`, `packages/canvas/src/eyedropper/`, `packages/canvas/src/color/`, `packages/canvas/src/styles/` — domain modules.
- `packages/canvas/src/presence/` — `LocalPresenceAdapter` interface; `LocalChat`, `Ping` implementations. P04 will add `RemotePresenceAdapter` speaking the WS protocol from `docs/editor-canvas.md` §6.3.
- `apps/editor/src/panels/` — React components: `LayersPanel`, `HistoryPanel`, `CommandPalette`, `ContextMenu`.
- `apps/editor/src/lib/` — `autosave.ts`, `document-loader-client.ts`, `shortcut-map.ts`.

### 6.4 Cross-references to master docs

- **Architecture** — `docs/04-system-architecture.md` §4.5 (Client Architecture: web app = Next.js + React shell, editor = Vite, canvas renderer is a separate package; state layers server/local/CRDT/render are followed); §4.5.2 (canvas render pipeline; 16.67 ms frame budget; input + CRDT update ≤ 2 ms; layout worker ≤ 6 ms; GPU draw ≤ 8 ms); §4.5.1 (service worker + IndexedDB + OPFS); §4.6.2 (REST contracts including `POST /v1/decks/{deckId}/commands` with semantic target `slide[3].chart[revenue_by_region]`).
- **Data model** — `docs/05-data-database-design.md` §5.2.2 (`decks`, `deck_versions`, `slides`); §5.2.3 (`elements`, `element_overrides`, `deck_schemas`, `component_instances`).
- **Tech stack** — `docs/06-technology-stack.md` §6.1.1 (Next.js + React + TS, with editor split into Vite bundle); §6.1.2 (WebGL2 + WebGPU + Canvas2D fallback); §6.1.3 (Yjs for P04+, sub-documents per slide); §6.1.4 (Yoga for auto-layout + custom constraints); §6.1.5 (Vitest + Playwright + axe); §6.2.0 (contract rule for any cross-language call — but P03 is TS-only, so this is just a forward reference for P04+).
- **Editor canvas** — `docs/editor-canvas.md` §1 (Features 1–18 detailed acceptance criteria, behavioral details, dependencies); §2 (user flows that P03 must implement — 2.1 create slide, 2.2 drag element, 2.3 multi-select via marquee, 2.4 reorder layers, 2.5 set constraints, 2.6 undo/redo); §3 (NFRs: pointer-down → first frame ≤ 8 ms; drag FPS ≥ 55 with 100 layers, ≥ 30 with 5,000; op commit ≤ 16 ms; Cmd+K ≤ 50 ms cold / 16 ms warm); §4 (client architecture and module boundaries; renderer is pure rendering, scene graph is reactive, input emits semantic intents); §5 (Postgres data model already covered by P02; JSONB scene graph storage is the contract P03 consumes); §6 (REST surface; `DocumentLoader.save` is the only durable write path).

## 7. Verification

| #   | Feature | Test                                                                         | Expected result                                                                         | Owner       |
| --- | ------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------- |
| 1   | #1      | Playwright e2e: open example deck, see 2 slides as frames on infinite canvas | All 10 layers render; world coords visible; pan in 4 directions                         | Editor lead |
| 2   | #1      | Playwright e2e: drop a new slide at the cursor                               | Frame inserted at grid-snapped position; world origin offset maintained                 | Editor lead |
| 3   | #2      | `packages/canvas/__tests__/drag.test.ts`                                     | pointer-down → first frame ≤ 8 ms; snap to nearest `gridStep`; Shift constrains         | Canvas lead |
| 4   | #2      | Playwright e2e: drag element into auto-layout container                      | Container reflows on drop; one `MoveOp` committed                                       | Editor lead |
| 5   | #3      | `packages/canvas/__tests__/alignment.test.ts`                                | R-tree query under 1 ms for 1,000 layers; equal-spacing tolerance `Math.max(1, 1/zoom)` | Canvas lead |
| 6   | #3      | Playwright e2e: select 3 elements, distribute evenly                         | Spacing equalized; locked/hidden layers excluded                                        | Editor lead |
| 7   | #4      | `packages/canvas/__tests__/marquee.test.ts`                                  | Shift add, Alt subtract; locked layers skipped                                          | Canvas lead |
| 8   | #4      | Playwright e2e: group 3 layers, ungroup                                      | Children's absolute transforms preserved                                                | Editor lead |
| 9   | #5      | `/apps/editor/__tests__/layers-panel.test.tsx`                               | Drag-reorder = 1 `ReorderOp`; search by `name`/`role`/`dataTags`                        | Editor lead |
| 10  | #5      | Playwright e2e: filter by `type=text`                                        | Only text layers shown; show-hidden toggle works                                        | Editor lead |
| 11  | #6      | `packages/canvas/__tests__/frame.test.ts`                                    | Nested frame clipping; `Cmd+Alt+Up` selects parent                                      | Canvas lead |
| 12  | #7      | `packages/canvas/__tests__/auto-layout.test.ts`                              | Yoga layout matches flexbox semantics                                                   | Canvas lead |
| 13  | #8      | `packages/canvas/__tests__/constraints.test.ts`                              | left/right/top/bottom/center/scale/stretch per axis; scale clamps                       | Canvas lead |
| 14  | #9      | `packages/canvas/__tests__/pen.test.ts`                                      | Click anchor; double-click closes; `Esc` ends; `Alt` breaks handle                      | Canvas lead |
| 15  | #10     | `packages/canvas/__tests__/rulers-guides.test.ts`                            | Rulers show world coords; drag from ruler creates guide; guides snap to grid            | Canvas lead |
| 16  | #11     | `packages/canvas/__tests__/zoom.test.ts`                                     | Clamp [0.02, 64.0]; Cmd-snap to 100%/200%; 1:1 at 100%                                  | Canvas lead |
| 17  | #11     | Playwright perf: 5,000 layers, drag, FPS                                     | ≥ 30 FPS p95 on reference hardware                                                      | Editor lead |
| 18  | #11     | Playwright perf: 100 layers, drag, FPS                                       | ≥ 55 FPS p95 on reference hardware                                                      | Editor lead |
| 19  | #12     | `packages/canvas/__tests__/history.test.ts`                                  | Unbounded depth; per-op `apply`/`inverse` symmetry; ULID `opId`                         | Canvas lead |
| 20  | #12     | Playwright e2e: scrub history                                                | Latency ≤ 200 ms per scrub; release commits                                             | Editor lead |
| 21  | #13     | `packages/canvas/__tests__/shortcut.test.ts`                                 | Conflict refused; chord timer; platform mapping                                         | Canvas lead |
| 22  | #13     | Playwright e2e: Cmd+K, search "frame"                                        | Cold ≤ 50 ms; warm ≤ 16 ms; lists frames in deck                                        | Editor lead |
| 23  | #14     | `packages/canvas/__tests__/style-copy-paste.test.ts`                         | `Cmd+Alt+C`; double-click persistent; cross-deck carries `themeMapping`                 | Canvas lead |
| 24  | #15     | `packages/canvas/__tests__/eyedropper.test.ts`                               | 8x magnifier; 8 Hz continuous sample; multi-display; P3 delta-E                         | Canvas lead |
| 25  | #16     | `/apps/editor/__tests__/context-menu.test.tsx`                               | Per-type menus; long menu scroll; feature-flagged items hidden                          | Editor lead |
| 26  | #18     | `/apps/editor/__tests__/local-ping.test.tsx`                                 | Cmd+Shift+P emits visible ring; rate limit 1/2s                                         | Editor lead |
| 27  | #22     | `packages/sdk-ts/__tests__/autosave-queue.test.ts`                           | Op durable in 16 ms; pending count updates                                              | Editor lead |
| 28  | #22     | Playwright e2e: reload page mid-edit                                         | Queued ops replay; "syncing… N pending" indicator shows                                 | Editor lead |
| 29  | A11y    | `/apps/editor/__tests__/axe.test.tsx`                                        | axe-core clean on every panel; keyboard nav full                                        | UX lead     |
| 30  | Adapter | `packages/canvas/__tests__/adapter-selection.test.ts`                        | WebGPU → WebGL2 → Canvas2D fallback; user-visible warning on Canvas2D                   | Canvas lead |
| 31  | Adapter | Playwright e2e: force Canvas2D via feature flag                              | Warning shown; editing still works                                                      | Editor lead |
| 32  | Bundle  | `pnpm --filter @domio/editor build`                                          | ≤ 1.5 MB gzipped; source maps present                                                   | Devx        |

## 8. Risks & open decisions

| Risk                                                                       | Impact                | Mitigation                                                                                                                                                      |
| -------------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GPU adapter variance** — WebGPU/WebGL2 inconsistencies across browsers   | Mid                   | Adapter selection unit-tested; Canvas2D fallback is always available; per-browser test matrix in Playwright (Chrome stable, Edge, Firefox, Safari Tech Preview) |
| **Frame budget regression** at 5,000 layers                                | High                  | Continuous perf tracking; p95 FPS gate in CI; render profiling in DevTools when budget exceeded                                                                 |
| **Bundle size bloat** — editor bundle exceeds 1.5 MB                       | High                  | Bundle analyzer in CI; per-route code splitting; Vite tree-shaking; defer non-critical libs (e.g., Lottie) to lazy chunks                                       |
| **History engine unbounded growth**                                        | Mid                   | Disk-quota bound; 5,000-op snapshot compaction; client prunes older ops on snapshot receipt (logic from `docs/editor-canvas.md` §3.4)                           |
| **Auto-layout interaction with constraints** — edge cases                  | Mid                   | `position: absolute` escapes; constraints run _after_ layout; comprehensive fixtures in `packages/canvas/__tests__/auto-layout-constraints.test.ts`             |
| **Pen tool + boolean ops confusion** — users may expect booleans in P03    | Low                   | Schema slot exists; runtime deferred; UX explicitly says "combine shapes" lands later; lint message in P03                                                      |
| **Local ping without remote broadcast** — confusing for multi-user testing | Low                   | Banner "presence transport not yet enabled" in P03; `LocalPresenceAdapter` is a stub                                                                            |
| **CRDT layering (P04) requires changing the history engine**               | Mid                   | P03's history engine emits typed `HistoryOp` with `forward`/`inverse` — these map cleanly to Yjs updates in P04; ADR required before P04 starts                 |
| **WebGPU-only when available vs parallel WebGL2 always** (OD-STK-01)       | Low                   | Default to adapter selection (WebGPU when present, WebGL2 otherwise); document in code; revisit if profiling shows WebGL2 startup cost                          |
| **OSM-ARCH-06 — ORM choice**                                               | Low (resolved in P02) | Drizzle for query building, raw SQL for migrations                                                                                                              |
| **Layer panel virtualization library choice**                              | Low                   | Default to `react-virtuoso` (well-maintained, headless); alternative TanStack Virtual; pick during implementation, document in PR                               |

**Open decisions to resolve during P03:**

- Should the per-user shortcut map and context-menu pinning eventually sync to a `user_preferences` table, or stay local-only forever? **Recommendation:** keep local-only in P03; revisit in P22.
- Should the editor route be served from the same Next.js host (via `/editor/[id]`) or from a separate subdomain? **Recommendation:** same host for simplicity; cookie/IndexedDB scope is the same origin; revisit if bundle size forces a CDN split.

## 9. Demo script (internal environment)

**Pre-reqs:**

- Local stack up (`pnpm stack:up`); Postgres with P02 migration applied; example fixture loaded.
- Two browser profiles: one for "demo editor", one as a stand-in for a future collaborator (used to demonstrate that no multiplayer is enabled in P03).
- Reference hardware: 2019-era MacBook Pro (Intel UHD 630) for the perf check.

**Demo flow (≤ 15 minutes):**

1. **Open `/editor/example`** — see the example deck with 2 slides, 3 frames, 10 layers. Walk the world canvas; show the rulers, the layers panel, the history panel.
2. **Drag the "Quarterly Revenue" chart** — show snap-to-grid (toggle on/off via shortcut); show smart alignment guides appear within one frame; show spacing hints when the gap matches a third element. Use the `Alt`/`Option` modifier to disable snap mid-drag.
3. **Multi-select 3 text elements** with marquee, then `Cmd+G` to group. Undo (`Cmd+Z`) and redo (`Cmd+Shift+Z`). Show the visual history timeline: scrub to the group op, see the state, release to commit.
4. **Layers panel** — drag-reorder a layer across a frame (re-parent); type "chart" in the search box; filter by `type=text`. Show the "show hidden" toggle.
5. **Vector pen** — press `P`, click 4 anchor points, double-click to close; show the resulting `VectorLayer` in the layers panel.
6. **Constraints** — select a child inside a frame; toggle `horizontal: stretch` and `vertical: bottom` in the constraints inspector; resize the parent; the child tracks correctly.
7. **Auto-layout** — drop a child into a `RowContainer`; reflow happens on drop; insert a new child via `+` button; reflow again.
8. **Zoom** — `Cmd+0` fit, `Cmd+1` 100 %, scroll-zoom in to 6400 % to inspect an anchor point. Show FPS counter overlay.
9. **Cmd+K palette** — open it; type "frame"; pick "Insert frame". Show that the palette lists actions, layers, components, themes. Type "G G" to jump to a slide.
10. **Copy/paste styles** — `Cmd+Alt+C` on a styled text, then `Cmd+Alt+V` on a target; double-click format painter for persistent mode; `Cmd+Shift+Alt+V` paste-to-match-destination.
11. **Eyedropper** — `I`, sample a color from a sibling element; show the captured hex; show a delta-E warning if the color is out of P3 gamut.
12. **Right-click** — right-click on a text layer; show the text-tuned menu (font size, weight, color). Right-click on a frame; show the frame menu (clipping, overflow, fit).
13. **Local ping** — `Cmd+Shift+P` to emit a 1.2 s expanding ring at the cursor; show the rate limit (1 per 2 s). Hold `T` to type a local chat message; release; message appears anchored to cursor. (Note: this is local-only in P03.)
14. **Autosave** — type into a text layer; show "syncing… N pending" → "synced" in the status bar; reload the page; show the queued ops replay and the deck is in the same state.
15. **Perf check** — open the 5,000-layer perf fixture; drag a layer; show FPS ≥ 30 p95 on the reference hardware; show tile cache hit rate in the dev panel.
16. **A11y** — tab through the editor; open the layers panel via keyboard; activate an action via `Enter`; screen-reader announces layer name and type.

**Demo pass criterion:** all 16 steps complete without manual fix-up; FPS budget met on the reference hardware; a11y clean; autosave replays after reload.

## 10. Definition of Done

- [ ] All six workstreams (WS-A through WS-F) closed with their per-task DoDs met.
- [ ] Editor app boots at `/editor/{id}` and renders the example deck; viewer at `/decks/{id}` renders the same deck SSR.
- [ ] WebGL2 + WebGPU + Canvas2D adapter selection unit-tested; Canvas2D fallback shows a user-visible warning.
- [ ] All 15 in-scope features (#1, #2, #3, #4, #5, #6, #7, #8, #9 partial, #10, #11, #12, #13, #14, #15, #16, #18 partial, #22 editor half) pass their respective verification tests.
- [ ] Frame budget met: ≥ 55 FPS p95 for 100 layers, ≥ 30 FPS p95 for 5,000 layers on reference hardware, with continuous perf tracking in CI.
- [ ] Bundle size budget: editor bundle ≤ 1.5 MB gzipped; CI fails on regression.
- [ ] Autosave: every op durable in IndexedDB within 16 ms; "save now" button is feature-flagged off by default (manual save calls `DocumentLoader.save`); sync indicator visible.
- [ ] A11y: axe-core clean on every panel; full keyboard navigation; screen-reader labels for layer tree.
- [ ] Telemetry: spans for `drag.begin`, `drag.commit`, `layout.incremental`, `history.apply`, `history.undo`, `autosave.flush`, `command_palette.open`, `eyedropper.sample`; histograms for `canvas_fps`, `drag_frame_ms`, `layout_ms`, `autosave_drain_ms`; counters for `autosave_quota_exceeded_total`, `history_scrub_total`. All emitted via the Phase 01 OTel SDK.
- [ ] Docs updated: `/docs/editor-canvas.md` §4 (client architecture) cross-references the `packages/canvas` modules; §6.2 REST surface references the editor's actual `DocumentLoader.save` call; `/docs/04-system-architecture.md` §4.5.2 (canvas render pipeline) cross-references the WebGPU/WebGL2 adapter selection.
- [ ] Security gate: no PII in logs; per-keystroke ops are idempotent (`opId` ULID); `DocumentLoader.save` is the only durable write path.
- [ ] Playwright suite runs in CI on every PR; all 32 verification-matrix tests pass on the merge commit.
- [ ] Internal demo passed per `docs/development_phases/README.md` legend; demo recording archived.
- [ ] Handoff doc to P04 (CRDT sync) lands in `/docs/handoff/P03-to-P04.md` — it enumerates the history-engine extension points, the `LocalPresenceAdapter` interface, the WS message types from `docs/editor-canvas.md` §6.3 that P04 will adopt, and any data-model changes P04 must make to `crdt_logs` and `presence_sessions`.
