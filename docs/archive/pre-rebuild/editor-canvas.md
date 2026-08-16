# Section 1 — Core Editor & Canvas (Features 1–22)

> **Scope:** This document is the deep technical plan for the Figma-grade foundation of Domio: the infinite canvas, the WYSIWYG editing surface, the scene graph, multiplayer presence, Git-like branching, version history, offline CRDT sync, and autosave. It is the substrate everything else (components, theming, animation, agentic layer) renders onto, so the contracts defined here are load-bearing for sections 2–16.

---

## 1. Feature-by-Feature Mapping

Each feature below is annotated with: a short **intent** statement, **acceptance criteria** (testable), **behavioral details / edge cases**, and **dependencies** on other features (internal to this section and external to later sections).

### Feature 1 — Infinite canvas workspace with multiple slide aspect ratios

- **Intent:** Provide a single continuous work surface holding 16:9 (default), 4:3, 9:16, ultrawide (21:9), and LED-wall custom ratios, all zoomable from 2 % to 6400 % (#11) without seams or banding.
- **Acceptance criteria**
  - Canvas pans infinitely in all four directions with no fixed bounds.
  - At any zoom level, dropping a new slide inserts a frame at the current cursor position snapped to the grid.
  - All aspect ratios coexist on the same workspace; a 4:3 frame rendered adjacent to a 16:9 frame aligns to the shared grid.
  - Custom ratios are entered as `W:H` (positive integers ≤ 8192) and stored as a `SlideAspectRatio` value object.
- **Behavioral details / edge cases**
  - Canvas world coordinates are `int64`-precision floating point; we offset the world origin from the viewport origin so distant slides don't lose precision.
  - Off-screen slides use culling (only viewport + 1-screen margin rendered).
  - LED-wall custom ratios up to 32 K pixels per side, with a hardware-cap warning beyond that.
- **Dependencies:** #2 (drag-drop), #5 (layers panel), #11 (zoom), #13 (keyboard). Provides the world that #6 (frames-within-frames) and #21 (offline CRDT) operate in.

### Feature 2 — Drag-and-drop WYSIWYG editing with pixel-perfect and snap-to-grid modes

- **Intent:** All authoring interactions (place, move, resize, rotate) feel native and either pixel-perfect or grid-snapped based on a toggle.
- **Acceptance criteria**
  - Pointer-down on an element begins a drag within 8 ms of `pointerdown`.
  - Holding `Alt` (Windows/Linux) / `Option` (macOS) disables snapping temporarily.
  - Snap-to-grid resolves to the nearest integer multiple of `gridStep` (configurable 1, 2, 4, 8, 16 px).
  - Pressing `Shift` constrains to 0°/45°/90° during rotation and preserves aspect ratio during resize.
- **Behavioral details / edge cases**
  - A drag transforms a `Layer`'s `transform: { x, y, w, h, rotation }` via an _intermediate_ ephemeral layer in the history engine (#12) so the underlying scene graph never sees per-frame mutations.
  - Drop targets inside auto-layout containers (#7) trigger reflow on drop, not before.
  - Dropping outside any slide frame creates a new slide at the drop point with the element's bounding box as initial slide aspect ratio.
  - During a multi-touch drag, only the first touch owns the gesture; subsequent touches are routed to the input pipeline's pointer arbitration.
- **Dependencies:** #3 (smart guides), #5 (layers panel reordering), #7 (auto-layout reflow), #12 (history), #14 (paste styles).

### Feature 3 — Smart alignment guides, spacing hints, and distribution tools

- **Intent:** Visual hints appear during drag/resize to show alignment, equal spacing, and edge proximity to other layers; distribution commands equalize spacing across a multi-selection.
- **Acceptance criteria**
  - Guides render within one frame after pointer-move so they don't lag behind the gesture.
  - Spacing hints appear when the gap between two layers equals the gap to a third ("equal-spacing" detection).
  - Distribution commands: horizontal/vertical distribute with `evenly` (equal gaps) and `toCanvas` (gap relative to canvas bounds).
- **Behavioral details / edge cases**
  - Guide calculation is incremental: maintain an R-tree of layer bounds; query for guides in O(log n) rather than O(n).
  - Equal-spacing tolerance is `Math.max(1, 1 / zoom)` world units, so guides behave correctly at any zoom (#11).
  - When two equal-space candidates exist simultaneously, prefer the one closer to the drag axis.
  - Guides ignore locked (#4) and hidden (#4) layers.
- **Dependencies:** #2 (drag), #4 (lock/hide), #11 (zoom), #13 (keyboard shortcuts for distribute).

### Feature 4 — Multi-select, group/ungroup, lock, hide layers

- **Intent:** Standard layer operations for composing complex slides.
- **Acceptance criteria**
  - Marquee select uses a `Shift` add / `Alt` subtract toggle semantics.
  - Group creates a `GroupLayer` parent; ungroup preserves absolute transforms of children.
  - Lock sets a `Layer.locked` flag that suppresses pointer events and inline-editing.
  - Hide sets `Layer.hidden`; hidden layers are excluded from render and bounds queries but persist in the scene graph.
- **Behavioral details / edge cases**
  - Locking a parent does not lock children (children are independently lockable).
  - Hidden layers cannot be selected by clicking; they are selectable from the layers panel (#5) only.
  - Groups preserve z-order relative to siblings and are themselves multi-selectable.
- **Dependencies:** #5 (layers panel), #6 (frames within frames), #12 (history of group/ungroup).

### Feature 5 — Full layers panel with drag-reorder, search, and filtering

- **Intent:** A right-rail panel showing the full z-order tree with drag-to-reorder, type-ahead search, and tag filters.
- **Acceptance criteria**
  - Drag-reorder is a _structural_ operation, not a z-index bump: it re-parents across frames (#6) when dropped onto another layer.
  - Search matches `name`, `role`, `dataTags`, and component-id substrings; result set is highlighted; non-matching rows collapse to dimmed.
  - Filters: by `layerType`, by `locked` state, by `dataSourceId` (cross-section tie to #48), and by `componentInstanceId` (#25).
- **Behavioral details / edge cases**
  - The panel shows the full logical tree (including children of hidden frames); a "show hidden" toggle inverts visibility.
  - Reorder by drag generates a single history entry (#12) regardless of intermediate drag positions.
  - Search index is a per-deck inverted index built on deck load and updated incrementally.
- **Dependencies:** #4 (lock/hide), #6 (frames), #12 (history), #25 (component variants), #48 (data bindings).

### Feature 6 — Frames-within-frames (nested components, like Figma)

- **Intent:** Frames are first-class layers that act as nested sub-canvases with their own viewport, scroll, and clip behavior.
- **Acceptance criteria**
  - Any layer can be wrapped in a frame via `Cmd+Alt+G`.
  - Nested frames clip their children by default; an `overflow: visible` flag is selectable.
  - Frames support their own background, corner radius, and shadow.
  - Selecting an element inside a frame and using "select parent" (`Cmd+Alt+Up`) walks up the frame tree.
- **Behavioral details / edge cases**
  - Frames have a `viewport` (camera transform) and a `scrollBounds` region; auto-layout containers (#7) ignore viewport scroll.
  - A child cannot be dragged outside its parent unless the parent is `overflow: visible` or the drag is a cross-frame reparent (#5).
- **Dependencies:** #7 (auto-layout), #8 (constraints), #36 (brand-locked templates can lock frames, not elements).

### Feature 7 — Auto-layout containers (flexbox-like)

- **Intent:** Containers that reflow their children when content, count, or padding changes — eliminating manual repositioning.
- **Acceptance criteria**
  - Auto-layout has `direction` (row/column), `gap`, `padding`, `align` (start/center/end/stretch), `justify` (start/center/end/between/around), `wrap`.
  - Inserting a child or editing text triggers a reflow in the next animation frame.
  - Auto-layout state is serializable; flipping a frame to auto-layout computes the layout from children's bounds.
- **Behavioral details / edge cases**
  - Constraints (#8) are applied _after_ auto-layout resolves positions, so a `pin: left` child still tracks the container's left edge as the container grows.
  - Children with explicit `position: absolute` escape the layout pass.
  - Layout runs on the renderer thread (off main thread) for frames with >100 children.
- **Dependencies:** #6 (frames), #8 (constraints), #25 (smart components reflow with content), #85 (animation timelines can target auto-layout `gap`).

### Feature 8 — Constraints system (pin to edges/center for responsive scaling)

- **Intent:** Specify how each child behaves when its parent is resized — left/right/top/bottom pins, center, scale, or stretch.
- **Acceptance criteria**
  - Per-axis constraint: horizontal ∈ {left, right, center, scale, stretch}, vertical ∈ {top, bottom, center, scale, stretch}.
  - `scale` mode multiplies the layer's size by the parent's resize ratio, clamped to a min/max.
  - Constraints are honored during presenter "fit slide" recalculation (#126) and exported PDF re-pagination (#164).
- **Behavioral details / edge cases**
  - When a parent is itself auto-laid out (#7), `scale` constraints use the resolved post-layout size as the reference.
  - Mixed constraints (e.g., `left + stretch` horizontally) are valid: the layer pins left and fills remaining width.
- **Dependencies:** #7 (auto-layout interaction), #126 (presenter refit), #164 (PDF export).

### Feature 9 — Vector pen tool, boolean operations, and shape editing

- **Intent:** Authoring custom vector shapes with a pen tool and combining shapes via union, subtract, intersect, exclude.
- **Acceptance criteria**
  - Pen tool clicks add anchor points; double-click closes a path; `Esc` ends an open path.
  - Boolean ops produce a new `BooleanShape` layer referencing the source shapes; sources remain editable but hidden behind a "flatten" action.
  - Path handles use cubic Bézier (`x1,y1, x2,y2`) for in/out control points per anchor.
- **Behavioral details / edge cases**
  - Paths can be `evenodd` or `nonzero` fill rule.
  - Boolean ops are computed server-side (#24 of ops) for ops ≥ 256 anchors; smaller ops compute locally.
  - Anchor point editing supports `Alt` to break handle symmetry.
- **Dependencies:** #14 (paste styles of fills/strokes), #15 (eyedropper samples path fills).

### Feature 10 — Rulers, guides, and customizable grid systems

- **Intent:** Pixel-accurate alignment via rulers (top + left), draggable guides, and grid systems (square, columns, baseline).
- **Acceptance criteria**
  - Rulers show world coordinates and the current zoom level.
  - Drag from a ruler creates a guide; guides can be horizontal, vertical, or both at a single point (cross-guide).
  - Grid systems: square (configurable step), columns (count + gutter), baseline (line-height step).
  - Guides are per-slide; column/baseline grids are per-frame.
- **Behavioral details / edge cases**
  - Guides participate in snap (#2) but are themselves snappable to grid intersections.
  - Column grids apply even to auto-layout containers (#7) by setting `padding`.
- **Dependencies:** #2 (snap), #7 (auto-layout), #13 (toggle grids via shortcut).

### Feature 11 — Zoom from 2 % to 6400 % with GPU-accelerated rendering

- **Intent:** Smooth, GPU-accelerated zoom across five orders of magnitude.
- **Acceptance criteria**
  - Zoom range [0.02, 64.0]; default scroll-zoom = 1.0; pinch-zoom on trackpads respects platform gestures.
  - At 100 % the slide renders 1:1 with pixels; at 6400 % individual vector anchors are inspectable.
  - Pan/zoom maintains ≥ 55 FPS on a 2019-era MacBook Pro (Intel UHD 630) with 100 layers on screen; ≥ 30 FPS with 5,000 layers.
  - Zoom levels snap to `fit`, `100%`, `200%`, etc. when `Cmd` is held.
- **Behavioral details / edge cases**
  - Render uses a tile cache (# tiles = viewport / 256 px) cached for 30 s after last view.
  - At <25 % zoom, layer labels show; anti-aliasing of small text is disabled to avoid blur.
  - GPU adapter falls back to software rendering with a user-visible warning.
- **Dependencies:** #1 (canvas), #3 (guides respect zoom), #5 (layers panel virtualization), #20 (version diff thumbnails).

### Feature 12 — Unlimited undo/redo with visual history timeline

- **Intent:** Every operation is reversible, presented as a scrubbable timeline.
- **Acceptance criteria**
  - Undo stack depth is unbounded (subject to disk-quota); redoes mirror undoes.
  - Timeline UI lists entries with timestamp, author (in collab mode, #17), and a thumbnail at that history state.
  - Scrubbing to a point previews the state without committing; releasing commits.
  - Cross-deck actions (e.g., paste from a different deck, #14) appear as a single named entry.
- **Behavioral details / edge cases**
  - The history engine is a **command pattern** with named ops (`MoveOp`, `ResizeOp`, `StyleOp`, `GroupOp`...).
  - Linear-history-per-client; in collab (#17) the local view merges remote ops into history as discrete entries with the remote user's identity.
  - Branch-merge operations (#19) collapse to a single history entry.
- **Dependencies:** #17 (presence-aware history attribution), #19 (branching), #20 (named checkpoints are pinned history entries).

### Feature Feature 13 — Keyboard-first workflow with command palette (Cmd+K)

- **Intent:** Every action reachable via a single keystroke; Cmd+K surfaces an omnisearch palette.
- **Acceptance criteria**
  - Shortcut map is conflict-checked at registration time; collisions are refused.
  - Cmd+K searches actions, layers (#5), components (#25), templates (#29), and themes (#37).
  - Shortcuts respect platform (`Cmd` vs. `Ctrl`) and are remappable by the user; remappings persist per-user.
  - Chord shortcuts (`G` then `G` = "go to slide") work with a 1 s timeout window.
- **Behavioral details / edge cases**
  - Chord timer resets on any other keypress.
  - When the focus is in a text input, only text-relevant shortcuts fire (avoids stealing `B` for bold from text editing).
- **Dependencies:** Cross-section: every later feature registers shortcuts into the same palette.

### Feature 14 — Copy/paste styles, format painter, "paste to match destination"

- **Intent:** Reuse styling without duplicating geometry; paste-and-match reformats incoming content to the destination's style profile.
- **Acceptance criteria**
  - `Cmd+Alt+C` copies style only; subsequent selection + `Cmd+Alt+V` applies.
  - Format painter double-click enters "persistent" mode; `Esc` exits.
  - "Paste to match destination" (`Cmd+Shift+Alt+V`) maps fills/strokes/type to the destination theme (#37).
- **Behavioral details / edge cases**
  - Style snapshots are versioned per format version (`StyleFormatVersion`); old snapshots are migrated on read.
  - Cross-deck paste carries a `themeMapping` block; missing tokens fall back to a hard-coded fallback palette.
- **Dependencies:** #37 (design tokens), #38 (theme swap), #46 (style linting flags mismatches).

### Feature 15 — Eyedropper color picking from anywhere on screen

- **Intent:** Sample a color from any pixel on screen (canvas, OS chrome, another app) for use as fill, stroke, or theme color.
- **Acceptance criteria**
  - `I` activates eyedropper; cursor becomes a magnifier at 8x.
  - Click captures the pixel; drag captures continuously (8 samples/sec) while held.
  - Captured color is expressed in sRGB and converted to the deck's working color space (default P3) with a delta-E warning if out-of-gamut.
- **Behavioral details / edge cases**
  - Multi-display support: hovered display's primary color profile is used.
  - Captured colors are tagged with the source element's theme token if a token match is found (#37).
- **Dependencies:** #37 (token matching), #14 (paste styles), #46 (lint flag on out-of-palette picks).

### Feature 16 — Right-click contextual menus tuned per element type

- **Intent:** Element-type-aware context menus (a `TextLayer`'s menu is different from a `FrameLayer`'s).
- **Acceptance criteria**
  - Menu entries are registered per `LayerType`; entries can be enabled/disabled dynamically based on selection.
  - Sub-menus nest up to 2 levels; deeper nesting flattens.
  - Keyboard navigation (arrow keys, Enter) works fully.
- **Behavioral details / edge cases**
  - Long menus scroll; the most-used entries are pinned at the top per-user (learned from frequency).
  - Context menu items can be hidden via feature flag (#4.9) for staged rollout.
- **Dependencies:** #13 (shortcut equivalents), cross-section: each new layer type registers its own menu.

### Feature 17 — Multiplayer live editing with cursors, selections, and presence avatars

- **Intent:** Multiple users editing the same deck simultaneously with real-time visibility into each other's cursors, selections, and identity.
- **Acceptance criteria**
  - Cursor position updates fan out within 80 ms p95 over a healthy network.
  - A remote user's selection is rendered as a colored outline matching their avatar color.
  - Avatar list in the top-right shows all present users; clicking an avatar follows their viewport.
  - Edits from two users to the same layer are resolved by CRDT (#21) — last-writer-wins is _never_ the fallback for property changes.
- **Behavioral details / edge cases**
  - Each user has a stable `presenceId` and a session token; presence is heartbeated every 5 s.
  - Cursor positions are throttled to 30 Hz with linear interpolation between samples on the receiver.
  - "Follow mode" follows viewport + scroll position, not pointer (avoids aggressive camera warping).
- **Dependencies:** #18 (cursor chat piggybacks on the same session), #21 (CRDT), #176 (live-session analytics).

### Feature 18 — Cursor chat and pointer "ping" for design discussions

- **Intent:** Inline chat bubbles anchored to cursor position; explicit "ping" pulse draws attention to a point.
- **Acceptance criteria**
  - Typing while holding `T` opens a chat input anchored to the cursor; `Enter` sends, `Esc` dismisses.
  - "Ping" (`Cmd+Shift+P`) emits a 1.2 s expanding-ring animation at the cursor world position, visible to all present users.
  - Chat bubbles auto-fade after 8 s; clicking a faded bubble re-pins it for 8 s.
- **Behavioral details / edge cases**
  - Chats are stored as ephemeral `presence` events, not persisted to deck history (#12); they live for the session only.
  - Pings are rate-limited per user (1 per 2 s).
- **Dependencies:** #17 (presence), #13 (shortcut registration).

### Feature 19 — Branching & merging of decks (Git-like)

- **Intent:** Create a branch from any checkpoint (#20), work in isolation, and merge back via a structured merge request.
- **Acceptance criteria**
  - `Cmd+Shift+B` opens "Branch from current state"; branch name validated unique per deck.
  - Branches track lineage (parent branch + parent checkpoint).
  - Merging produces a **merge request** with a structured diff (added/modified/deleted slides, layers, theme tokens).
  - Conflicts (two branches editing the same property) surface in a 3-way diff UI; resolution is manual or auto (`theirs` / `ours` / `manual`).
- **Behavioral details / edge cases**
  - Branching copies the scene graph reference; CRDT branches maintain their own op log (#21).
  - A "fast-forward" merge (target has no new commits since branch base) skips the diff UI.
  - Cross-deck branching is not supported in v1.
- **Dependencies:** #12 (history), #20 (checkpoints), #21 (CRDT), #182 (suggestion-mode equivalent for branch review), #183 (deck merge request with visual diffing).

### Feature 20 — Full version history with named checkpoints, diffs, and restore

- **Intent:** Every meaningful state is restorable by name with a structured diff.
- **Acceptance criteria**
  - User-created named checkpoints appear in a side panel sorted by recency.
  - System-created "auto" checkpoints are created every 50 ops or every 10 min, whichever first; auto-checkpoints expire after 30 days.
  - Diff view shows slide-level and layer-level changes with add/modify/delete markers.
  - Restore is non-destructive: it creates a new forward edge in history rather than rewinding (i.e., restore = "checkout + new commit").
- **Behavioral details / edge cases**
  - Named checkpoints are immutable; renaming them is allowed (history entry for the rename).
  - Diff granularity: property-level for transforms/styles; structural for layer tree.
- **Dependencies:** #12 (history), #19 (branching), #206 (living documents).

### Feature 21 — Offline editing with conflict-free sync on reconnect (CRDT-based)

- **Intent:** Full editor functionality with zero connectivity; on reconnect, local ops merge deterministically with remote state.
- **Acceptance criteria**
  - Service-worker caches the deck's CRDT state, all referenced assets (#24), and the most recent 5,000 ops.
  - Edits made offline are applied locally without round-trip.
  - On reconnect, ops sync via the CRDT protocol; final state is identical to having been online the whole time.
  - If two offline clients edit the same layer property, the CRDT's per-property LWW (Last-Writer-Wins) or per-element RGA picks a deterministic winner.
- **Behavioral details / edge cases**
  - Assets uploaded offline are queued in IndexedDB and uploaded on reconnect.
  - Presence (#17) is suspended while offline; on reconnect, the presence service re-registers the session.
  - Branch divergence detection: if the offline client's base checkpoint is not an ancestor of the server's current head, a 3-way merge is required (#19).
- **Dependencies:** #17 (presence), #19 (branching), #22 (autosave per-keystroke), #24 (assets).

### Feature 22 — Autosave every keystroke, never a "save" button

- **Intent:** No save UI; the system is always durable.
- **Acceptance criteria**
  - Every op is durably written to local storage (IndexedDB) within 16 ms of generation.
  - Ops are pushed to the server within 200 ms of generation when online.
  - A "synced" / "syncing… N pending" indicator shows the local↔remote state.
  - Crash recovery: opening the deck replays local ops onto the last server checkpoint.
- **Behavioral details / edge cases**
  - Local-only ops during offline (#21) are persisted first, then transmitted.
  - Server rejects an op whose `causalOrder` is missing prerequisites; the client retries by re-sending the gap.
  - "Save" is never visible; a destructive operation (delete deck) is the only "are you sure" prompt in the area.
- **Dependencies:** #12 (history), #17 (presence), #21 (offline CRDT), #22 of storage (quota).

---

## 2. Key User Experience Flows

These flows are the **acceptance paths** for the section — every testable user journey that touches more than one feature.

### 2.1 Create a new slide

1. User presses `N` (shortcut) or clicks the "+" on the slide rail.
2. The new slide inherits the deck's default aspect ratio (#1); if the deck has multi-ratio enabled, the aspect prompt appears.
3. A blank frame is inserted at the slide rail's next position; the canvas pans to it; a `FrameLayer` is added to the scene graph.
4. If the deck is in collaboration (#17), the new slide appears in other clients' rails within 80 ms.

**Latency budget:** 16 ms for the insert to be visible locally; 80 ms to be visible to other users.

### 2.2 Drag an element

1. Pointer-down on a layer starts a drag (#2). A `dragOperation` ephemeral op is created in the history engine (#12) but not committed.
2. As the pointer moves, smart guides (#3) update each frame; the layer's `transform.x/y` updates in the scene graph under a `batchedTransform` op.
3. On pointer-up, the batched op is committed; the remote clients receive the op (#21); presence cursors update (#17).

**Latency budget:** 8 ms from `pointerdown` to first frame; ≥ 55 FPS during drag.

### 2.3 Multi-select via marquee

1. Pointer-down on empty canvas starts a marquee (#4).
2. As the pointer drags, an R-tree query (#3) returns intersecting layers; only non-locked layers are included.
3. On pointer-up, selected layers receive a `selected` flag in the presence service (#17); other collaborators see the outline.

**Edge case:** If the marquee intersects a locked layer, the marquee visually "skips" it; if the marquee starts inside a locked layer, the marquee is suppressed.

### 2.4 Reorder layers via drag

1. User drags a row in the layers panel (#5).
2. A drop indicator shows the target position; dropping reorders the layer's `zIndex` and re-parents if dropped onto another layer.
3. A single `ReorderOp` is committed to history (#12); CRDT propagates (#21).

### 2.5 Set constraints on a child

1. User selects a layer inside a frame; the constraints panel shows current constraints (#8).
2. User toggles `horizontal: stretch` and `vertical: bottom`.
3. The constraint is recorded; on the next parent resize, the child resizes accordingly.

### 2.6 Undo / redo

1. `Cmd+Z` pops the local command stack (#12); the inverse op is applied.
2. The redo stack receives the operation; `Cmd+Shift+Z` reapplies it.
3. In collaboration (#17), undo only affects the local user's edits; remote edits are not undone.

### 2.7 Collaboration cursor and chat

1. User A moves the cursor; presence publishes a `cursor` event (#17).
2. User B's renderer interpolates and renders User A's avatar at the new position within 80 ms.
3. User A holds `T` and types "what about margin here?"; on `Enter`, the chat message is broadcast (#18).

### 2.8 Branch / merge

1. User A on the deck's `main` branch presses `Cmd+Shift+B`, names the branch `experiment/header-v2`, and the branch is created from the current checkpoint (#19).
2. User A edits the branch offline; later, both clients come online; ops merge via CRDT (#21).
3. User A opens the merge request UI; the 3-way diff is shown; User A resolves the one conflict; the merge commits.

### 2.9 Offline reconnect

1. User's network drops; presence goes offline (#17).
2. User continues editing; ops persist to IndexedDB (#22, #21).
3. Network returns; the client performs a handshake with the server: sends ops with `causalOrder` ≥ server's known head; server responds with missing ops; both sides converge.

---

## 3. Functional & Non-Functional Requirements

### 3.1 Functional requirements (summary)

| ID   | Requirement                                                          | Source feature(s) |
| ---- | -------------------------------------------------------------------- | ----------------- |
| F-1  | Render an infinite canvas with multiple aspect ratios simultaneously | #1                |
| F-2  | Author and transform layers via drag-and-drop with snap and guides   | #2, #3            |
| F-3  | Manage layer organization via select/group/lock/hide/layers panel    | #4, #5            |
| F-4  | Compose nested frames with auto-layout and constraints               | #6, #7, #8        |
| F-5  | Edit vectors with pen + booleans; align to grid/guides               | #9, #10           |
| F-6  | Zoom 2 %–6400 % with ≥ 55 FPS on reference hardware                  | #11               |
| F-7  | Undo/redo any operation with visual history                          | #12               |
| F-8  | Drive all authoring via keyboard and Cmd+K palette                   | #13               |
| F-9  | Reuse styles via copy/paste/painter/match                            | #14               |
| F-10 | Sample colors from anywhere via eyedropper                           | #15               |
| F-11 | Right-click context menus per layer type                             | #16               |
| F-12 | Multiplayer cursors, selections, presence                            | #17, #18          |
| F-13 | Branch/merge with merge requests                                     | #19, #20          |
| F-14 | Offline editing with CRDT-based conflict-free sync                   | #21               |
| F-15 | Autosave per keystroke with no save UI                               | #22               |

### 3.2 Non-functional requirements (latency budgets)

| Interaction                                                | Budget (p95)                                   | Notes                                           |
| ---------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| Pointer-down → first frame response                        | 8 ms                                           | hard ceiling; under-budget is the goal          |
| Drag frame rate                                            | ≥ 55 FPS (100 layers), ≥ 30 FPS (5,000 layers) | per #11                                         |
| Zoom frame rate                                            | ≥ 55 FPS                                       | mid-zoom; snaps can drop to 30 FPS              |
| Op commit (local)                                          | ≤ 16 ms                                        | write to IndexedDB                              |
| Op round-trip (online, healthy network)                    | ≤ 200 ms                                       | send + ack                                      |
| Remote cursor render                                       | ≤ 80 ms                                        | from sender's pointer-move to receiver's render |
| CRDT convergence on reconnect (offline < 5 min, < 500 ops) | ≤ 1 s                                          | handshake + replay                              |
| History scrub (timeline preview)                           | ≤ 200 ms per scrub                             | thumbnail + state replay                        |
| Branch creation                                            | ≤ 500 ms                                       | copy scene-graph reference + log a branch op    |
| 3-way merge diff render                                    | ≤ 1.5 s for decks up to 200 slides             |                                                 |
| Cmd+K palette open                                         | ≤ 50 ms                                        | cold; ≤ 16 ms warm                              |
| Eyedropper pixel sample                                    | ≤ 16 ms                                        | including sRGB→working-color-space conversion   |
| Autosave durability                                        | 16 ms                                          | per op                                          |

### 3.3 Conflict resolution semantics (CRDT choice and justification)

**Choice:** A composite CRDT built from:

- **Yjs-style `Y.Map` and `Y.Array`** for the scene-graph tree (layers, frames, slides).
- **Per-property LWW (Last-Writer-Wins) registers** with hybrid logical clocks for scalar properties (transforms, styles, names).
- **RGA (Replicated Growable Array)** for ordered collections (slide rail order, layer z-order within a parent, layers panel reorder).
- **Per-layer vector clock** as the tiebreaker for LWW when wall clocks collide.

**Justification:**

- LWW per-property gives intuitive "whoever changed it most recently wins" semantics for the _vast_ majority of conflicts (transforms, colors, text content).
- RGA preserves ordering across concurrent reorderings — without it, two users concurrently reordering the slide rail could cause silent deletions.
- Vector clocks per layer give deterministic resolution without a central authority (no server-side coordinator required for convergence), making offline (#21) safe.
- We deliberately do _not_ use OT (Operational Transformation); OT requires a central server to serialize ops and breaks down offline.

**Edge cases:**

- Concurrent edits to the same property: LWW picks the higher HLC timestamp; the loser receives an "edit superseded" notification (#17) and can manually re-apply if desired.
- Concurrent slide deletion vs. child edit: deletion wins (the layer is gone); the child's edit is tombstoned and pruned after 30 days.
- Concurrent branch creation from the same checkpoint: both branches succeed; they share the parent commit.

### 3.4 Autosave semantics

- **Trigger:** Every op is durable within 16 ms of generation.
- **Local persistence:** IndexedDB (Dexie wrapper) keyed by `deckId + opSequence`.
- **Remote push:** Outbound queue pushes ops at ≤ 200 ms cadence, batched up to 50 ops per WS message.
- **Crash recovery:** On client boot, replay local ops ≥ server head onto the server's state snapshot.
- **Idempotency:** Each op carries a ULID (`opId`) so duplicate sends are no-ops.
- **Compaction:** Every 5,000 ops, the server snapshots the CRDT state and the client prunes its local op log older than the snapshot.

---

## 4. Architecture

### 4.1 Client/server split

```
┌───────────────────────────────────────────────┐
│ CLIENT (TypeScript, Vite, React + custom      │
│ canvas renderer in WebGL2 + WebGPU fallback)  │
│  - Scene graph (in-memory)                    │
│  - Renderer (tile cache, GPU)                 │
│  - Input pipeline                             │
│  - History engine (command pattern)           │
│  - CRDT local replica (yjs)                   │
│  - Presence client (WS)                       │
│  - Autosave queue (IndexedDB)                 │
└──────────────┬────────────────────────────────┘
               │  HTTPS (REST/GraphQL) + WSS
┌──────────────▼────────────────────────────────┐
│ SERVER (Node + Fastify, modular monolith)     │
│  - API gateway (REST + GraphQL, /v1)          │
│  - Sync service (WS, CRDT op log relay)       │
│  - Presence service (Redis-backed pubsub)     │
│  - Branch/merge service                       │
│  - History snapshotter                        │
│  - Asset service (S3-compatible)              │
└──────────────┬────────────────────────────────┘
               │
   ┌───────────┼────────────┬─────────────┐
   ▼           ▼            ▼             ▼
 Postgres   Redis         S3/MinIO    OpenSearch
 (durable)  (presence,    (assets,    (search
             ephemeral)   thumbnails)   index)
```

### 4.2 Modular client breakdown

| Module               | Responsibility                                                                  | Boundary                                                   |
| -------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Renderer**         | WebGL2/WebGPU pipeline, tile cache, anti-aliasing, GPU adapter failover         | Pure rendering — does not mutate scene graph               |
| **Scene graph**      | In-memory tree of `Slide`, `FrameLayer`, `GroupLayer`, etc.                     | Reactive: emits events; does not know about renderer       |
| **Input pipeline**   | Pointer/keyboard arbitration, gesture recognition (pinch, drag, marquee, chord) | Emits semantic intents; never touches scene graph directly |
| **History engine**   | Command pattern; named ops; undo/redo stack; checkpoint pinning                 | Wraps scene-graph mutations                                |
| **CRDT sync engine** | Local replica; outbound op queue; inbound op applier; conflict resolution       | Wraps history engine; emits "remote intent" events         |
| **Presence service** | Cursor/selection publishing; chat/ping; avatar registry                         | Uses CRDT sync transport; separate ephemeral state store   |
| **Branch store**     | Branch/merge request management; lineage graph; diff computation                | Talks to server branch API + local CRDT                    |

### 4.3 Server modular breakdown

| Module                   | Responsibility                                               | Notes                                         |
| ------------------------ | ------------------------------------------------------------ | --------------------------------------------- |
| **API gateway**          | REST + GraphQL surface (`/v1/...`); auth; rate limiting      | OpenAPI source-of-truth                       |
| **Sync service**         | WS endpoint; CRDT op relay; per-deck fan-out                 | Stateless WS nodes; presence pinned via Redis |
| **Presence service**     | Cursor/selection pubsub; ephemeral storage (TTL 60 s)        | Backed by Redis                               |
| **Branch/merge service** | Branch creation; 3-way diff; merge request lifecycle         | Computes diffs against CRDT snapshots         |
| **History snapshotter**  | Periodic CRDT state snapshots (every 5,000 ops)              | Stored in Postgres JSONB + S3                 |
| **Asset service**        | Signed-URL upload; image transcoding; vector tile generation | Fronted by CDN                                |

### 4.4 Modular monolith now vs. split later — long-term rationale

We deliberately start as a **modular monolith** for these reasons:

- A single team can move faster without network/observability overhead between services.
- Most "seams" (presence vs. sync vs. branches) are small dataflows; splitting them prematurely creates a distributed monolith with worse debuggability.
- The modules above are written with clear boundaries (typed RPC-style contracts, separate Postgres schemas per module where appropriate), so when scale demands a split (e.g., presence becoming its own cluster), the cut is along an existing boundary.
- Decision triggers to split: (a) presence traffic > 100 k concurrent WS connections per node, (b) branch/merge diff computation exceeding 5 s for typical decks, (c) distinct on-call rotations for sync vs. branch teams. None of these are true at v1 scale.

---

## 5. Data Model

### 5.1 Postgres schemas

```sql
-- Decks: top-level container
CREATE TABLE decks (
  id            UUID PRIMARY KEY,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id),
  name          TEXT NOT NULL,
  owner_id      UUID NOT NULL REFERENCES users(id),
  aspect_policy TEXT NOT NULL DEFAULT 'mixed',  -- 'single' | 'mixed'
  default_ratio TEXT NOT NULL DEFAULT '16:9',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at   TIMESTAMPTZ
);

-- Slides are addressable rows; scene graph lives in JSONB for fast whole-deck read.
CREATE TABLE slides (
  id          UUID PRIMARY KEY,
  deck_id     UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  index       INT NOT NULL,           -- RGA-resolved position
  aspect      TEXT NOT NULL,          -- '16:9', '4:3', '9:16', 'custom'
  custom_w    INT,                     -- only when aspect = 'custom'
  custom_h    INT,
  scene       JSONB NOT NULL,          -- scene-graph root for this slide
  crdt_state  JSONB NOT NULL,          -- last applied CROT state vector
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deck_id, index)
);
CREATE INDEX slides_deck_idx ON slides(deck_id);

-- Style tokens (references section 3)
CREATE TABLE style_tokens (
  id          UUID PRIMARY KEY,
  deck_id     UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  scope       TEXT NOT NULL,           -- 'global' | 'theme:dark' | 'slide:<id>'
  category    TEXT NOT NULL,           -- 'color' | 'type' | 'space' | 'radius'
  name        TEXT NOT NULL,
  value       JSONB NOT NULL,
  UNIQUE (deck_id, scope, category, name)
);

-- Constraints (per layer, per axis)
CREATE TABLE layer_constraints (
  layer_id   UUID NOT NULL,
  parent_id  UUID NOT NULL,
  horizontal TEXT NOT NULL CHECK (horizontal IN ('left','right','center','scale','stretch')),
  vertical   TEXT NOT NULL CHECK (vertical   IN ('top','bottom','center','scale','stretch')),
  min_scale  NUMERIC(4,3),
  max_scale  NUMERIC(4,3),
  PRIMARY KEY (layer_id)
);

-- Autosave checkpoints (every 5,000 ops or 10 min, whichever first)
CREATE TABLE autosave_checkpoints (
  id              UUID PRIMARY KEY,
  deck_id         UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  op_seq          BIGINT NOT NULL,
  scene_snapshot  JSONB NOT NULL,    -- frozen CRDT state at this op
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX checkpoints_deck_seq ON autosave_checkpoints(deck_id, op_seq DESC);

-- Named user checkpoints
CREATE TABLE named_checkpoints (
  id          UUID PRIMARY KEY,
  deck_id     UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  op_seq      BIGINT NOT NULL,
  parent_id   UUID REFERENCES named_checkpoints(id),
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Branches
CREATE TABLE branches (
  id              UUID PRIMARY KEY,
  deck_id         UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  parent_branch   UUID REFERENCES branches(id),
  base_checkpoint UUID NOT NULL REFERENCES named_checkpoints(id),
  head_op_seq     BIGINT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('open','merged','abandoned')),
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deck_id, name)
);

-- Merge requests
CREATE TABLE merge_requests (
  id              UUID PRIMARY KEY,
  deck_id         UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  source_branch   UUID NOT NULL REFERENCES branches(id),
  target_branch   UUID NOT NULL REFERENCES branches(id),
  status          TEXT NOT NULL CHECK (status IN ('open','conflicted','resolved','merged','closed')),
  diff_summary    JSONB NOT NULL,
  created_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  merged_at       TIMESTAMPTZ
);

-- CRDT op log (append-only)
CREATE TABLE crdt_ops (
  op_id        TEXT PRIMARY KEY,           -- ULID
  deck_id      UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  slide_id     UUID,                       -- null if cross-slide op
  author_id    UUID NOT NULL REFERENCES users(id),
  hlc          BIGINT NOT NULL,            -- Hybrid Logical Clock
  parent_hlc   BIGINT NOT NULL,            -- causal predecessor
  payload      JSONB NOT NULL,             -- op body
  applied_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX crdt_ops_deck_hlc ON crdt_ops(deck_id, hlc);

-- Presence sessions (ephemeral, mirrored to Redis)
CREATE TABLE presence_sessions (
  session_id   UUID PRIMARY KEY,
  deck_id      UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id),
  color        TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX presence_deck ON presence_sessions(deck_id);
```

### 5.2 JSONB scene graph storage

The per-slide scene graph is stored as JSONB for several reasons:

- Whole-deck read/write is one row, avoiding N+1 queries during a typical "open the deck" load.
- Postgres JSONB supports GIN indexes on selected properties (e.g., `scene->'layers'->>'type'`) for the layers-panel search (#5).
- CRDT snapshots (#21) are themselves JSONB; storing both in the same format reduces impedance mismatch.
- For decks beyond ~5,000 layers, we shard the slide row by lazy-splitting the scene into chunked JSONB columns (`scene_chunk_0..N`); the renderer requests chunks lazily.

### 5.3 Vector tile / asset storage

- Vector tiles (thumbnail caches at fixed zoom levels) are stored as PNG/WebP in S3 with a `tile:{deckId}:{slideId}:{zoom}:{x}:{y}` key pattern.
- Full slide thumbnails (256×144, 1280×720, 4K) are stored alongside.
- User-uploaded assets (images, videos, fonts) are in S3 with signed-URL access; metadata is in `assets` table.
- All assets are content-addressed (SHA-256) to enable deduplication across decks.

### 5.4 CRDT op log

- Append-only (`crdt_ops` table) with `op_id` (ULID) as PK; never updated, only pruned by retention policy.
- Each op carries an HLC (`hlc`, `parent_hlc`) so the server can validate causal order without central serialization.
- Retention: 30 days for full op log; then snapshots only.

---

## 6. APIs and Contracts

### 6.1 REST surface (`/v1`)

| Method   | Path                                          | Purpose                                  |
| -------- | --------------------------------------------- | ---------------------------------------- |
| `GET`    | `/decks/:deckId`                              | Deck metadata                            |
| `POST`   | `/decks`                                      | Create deck                              |
| `PATCH`  | `/decks/:deckId`                              | Update metadata                          |
| `GET`    | `/decks/:deckId/slides`                       | List slides (summary)                    |
| `GET`    | `/decks/:deckId/slides/:slideId`              | Full slide scene graph                   |
| `POST`   | `/decks/:deckId/slides`                       | Insert slide (returns op)                |
| `PATCH`  | `/decks/:deckId/slides/:slideId`              | Mutate slide (returns op)                |
| `DELETE` | `/decks/:deckId/slides/:slideId`              | Delete slide                             |
| `POST`   | `/decks/:deckId/checkpoints`                  | Create named checkpoint                  |
| `GET`    | `/decks/:deckId/checkpoints`                  | List checkpoints                         |
| `POST`   | `/decks/:deckId/checkpoints/:id/restore`      | Restore to checkpoint                    |
| `GET`    | `/decks/:deckId/diff?from=:seq&to=:seq`       | Diff between two checkpoints             |
| `POST`   | `/decks/:deckId/branches`                     | Create branch                            |
| `GET`    | `/decks/:deckId/branches`                     | List branches                            |
| `POST`   | `/decks/:deckId/branches/:branchId/checkout`  | Switch to branch (returns WS endpoint)   |
| `POST`   | `/decks/:deckId/merge_requests`               | Create MR                                |
| `GET`    | `/decks/:deckId/merge_requests/:mrId`         | Get MR + diff                            |
| `POST`   | `/decks/:deckId/merge_requests/:mrId/resolve` | Submit resolution                        |
| `POST`   | `/decks/:deckId/merge_requests/:mrId/merge`   | Commit merge                             |
| `POST`   | `/decks/:deckId/ops`                          | Bulk op submission (also handled via WS) |

Versioning: `/v1` is the only path-versioned namespace. Within a version, fields are added non-breakingly; removals require `/v2`. Deprecation: 6-month sunset with `Sunset` header per RFC 8594.

### 6.2 GraphQL surface (`/graphql`)

A parallel GraphQL endpoint exposes a subset optimized for the layers panel (#5) and Cmd+K search (#13). Schema (abridged):

```graphql
type Deck {
  id: ID!
  name: String!
  slides: [Slide!]!
  branches: [Branch!]!
  checkpoints: [Checkpoint!]!
}

type Slide {
  id: ID!
  index: Int!
  aspect: String!
  layers(first: Int, after: String, filter: LayerFilter): LayerConnection!
}

type Layer {
  id: ID!
  type: LayerType!
  name: String!
  parent: Layer
  children(first: Int, after: String): LayerConnection
  bounds: Bounds!
  constraints: Constraints
  dataSource: DataSourceBinding
  componentInstance: ComponentInstance
}

input LayerFilter {
  type: [LayerType!]
  locked: Boolean
  hidden: Boolean
  dataSourceId: ID
  componentInstanceId: ID
  search: String
}
```

### 6.3 WebSocket message types

The sync WS endpoint (`wss://api.domio/v1/sync/:deckId`) speaks a binary protocol (MessagePack) with these top-level message kinds:

| Kind             | Direction | Payload                                                       |
| ---------------- | --------- | ------------------------------------------------------------- | ---------------------- |
| `hello`          | C→S       | `{ sessionId, token, lastHLC }`                               |
| `welcome`        | S→C       | `{ serverHLC, peers: PresencePeer[] }`                        |
| `op`             | C↔S      | `{ opId, deckId, slideId?, hlc, parentHlc, payload }`         |
| `op_ack`         | S→C       | `{ opId, status: 'ok'                                         | 'rejected', reason? }` |
| `presence`       | C↔S      | `{ sessionId, cursor?, selection?, viewport?, chat?, ping? }` |
| `peer_joined`    | S→C       | `{ sessionId, user, color }`                                  |
| `peer_left`      | S→C       | `{ sessionId }`                                               |
| `branch_switch`  | C↔S      | `{ branchId, baseHLC }`                                       |
| `branch_head`    | S→C       | `{ branchId, headHLC, opsToReplay }`                          |
| `merge_state`    | S→C       | `{ mrId, status, conflicts? }`                                |
| `asset_progress` | S↔C      | `{ assetId, uploadedBytes, totalBytes }`                      |
| `error`          | S→C       | `{ code, message, retryable }`                                |

WS messages carry a `protocolVersion` field; mismatch triggers reconnect with the new protocol version.

---

## 7. Security, Performance, Observability, Testing

### 7.1 Security

- **Auth:** All API/WS calls require a session JWT (short-lived, 15 min) refreshed via a refresh token bound to the device. SSO (#193) for enterprise.
- **Authorization:** Per-deck ACL (`viewer | commenter | editor | admin | owner`) plus workspace-level roles. Every REST/WS call is authorized against the deck's ACL.
- **Threat model highlights:**
  - CSRF: all state-changing endpoints require `Authorization` header; no cookie-based auth.
  - SSRF via "live data" #48 (later section) is gated by an outbound allowlist.
  - Op injection: server validates op schema and per-deck ACL before fan-out.
  - Asset upload: signed URLs with content-type and size limits; malware scanning via ClamAV.
- **Secrets:** All secrets via env vars; never in code. Secrets manager (Vault or cloud equivalent) for production.
- **Input validation:** Server-side JSON schema validation on all inbound payloads (Ajv). Client-side validation is a UX nicety, not a security boundary.
- **Rate limiting:** 600 req/min per user per endpoint; 60 WS messages/sec per session for `op`; stricter for `presence` ping/chat (anti-spam).

### 7.2 Performance

- Renderer tile cache: 30 s TTL; LRU eviction at 256 MB.
- Layers panel virtualized for >500 visible rows.
- WS op batching: 50 ops per outbound frame, max 16 ms flush interval.
- CRDT compaction: snapshot every 5,000 ops; client prunes older ops on snapshot receipt.
- Diff computation: 3-way diff uses Myers algorithm for slide-level structural diff; per-property diff via JSON-patch.
- Postgres: connection pooled (PgBouncer); JSONB GIN indexes on `scene` for search; partial indexes for active decks.

### 7.3 Observability

- **Logs:** Structured JSON (pino). Per-request correlation ID propagated through WS frames.
- **Metrics:** Prometheus:
  - `canvas_fps` (histogram, per device class)
  - `op_apply_duration_ms` (histogram, by op type)
  - `ws_round_trip_ms` (histogram)
  - `crdt_convergence_seconds` (histogram, on reconnect)
  - `presence_active_sessions` (gauge)
  - `branch_diff_duration_ms` (histogram)
- **Tracing:** OpenTelemetry; spans for `op.apply`, `render.frame`, `presence.publish`, `branch.merge`.
- **RUM (real-user monitoring):** Web Vitals + custom canvas FPS sampling, sent to a telemetry endpoint at 1 % sampling for v1, configurable per workspace.

### 7.4 Testing strategy

- **Unit:** Vitest for scene-graph ops, history engine, CRDT conflict resolution (table-driven tests over hundreds of concurrent-edit scenarios), constraints solver.
- **Integration:** Test the full op round-trip (client → server → other clients) using a fake WS harness; assert CRDT convergence after scripted concurrent edits.
- **End-to-end:** Playwright on a headless Chromium against a real staging API; golden-image canvas tests for known slides.
- **Visual regression:** Pixelmatch on canvas tiles at fixed zoom levels for stability of #3, #11, #38.
- **Performance tests:** k6 against staging with 50 concurrent sessions per deck, asserting op round-trip < 200 ms.
- **Chaos:** Toxiproxy-induced latency/loss to assert offline (#21) and reconnect paths.
- **Accessibility:** axe-core in CI; manual NVDA/VoiceOver pass before each release.
- **Definition of "done" for any feature in this section:** unit tests + 1 integration test + 1 Playwright happy-path + axe clean + a CHANGELOG entry + ADR if architectural.

---

## 8. Cross-Section Dependencies

This section is the foundation; the contracts below are inputs to every later section.

| Cross-section tie                         | Section    | How #1–22 connects                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Components** (#2: 23–36)                | Section 2  | Layers panel (#5) indexes components by `componentInstanceId`; CRDT sync (#21) propagates component overrides; branch/merge (#19) handles component variant collisions; autosave (#22) persists overrides                                                                                                                                                            |
| **Theming** (#3: 37–47)                   | Section 3  | Style tokens (`style_tokens` table) reference layers by id; "paste to match destination" (#14) resolves to tokens; eyedropper (#15) tags with nearest token; constraints (#8) operate inside themed frames                                                                                                                                                           |
| **Live data** (#4: 48–64)                 | Section 4  | Layers carry an optional `dataSourceBinding`; presence (#17) shows data refresh state; autosave (#22) snapshots `crdt_state` so re-fetched data restores deterministically                                                                                                                                                                                           |
| **3D / motion** (#5: 65–84)               | Section 5  | 3D scenes are nested inside frames (#6); motion targets the same `transform` fields; keyframe data rides as `Y.Array` entries in the CRDT (#21)                                                                                                                                                                                                                      |
| **Animation** (#6: 85–95)                 | Section 6  | Timeline ops are CRDT ops (#21); branches (#19) let users experiment with motion variants; presence (#17) shows remote scrub on the timeline                                                                                                                                                                                                                         |
| **Prototyping** (#7: 96–107)              | Section 7  | Hotspots are layer-attached; interactivity state is a per-slide CRDT branch that forks on hot-spot entry                                                                                                                                                                                                                                                             |
| **AI copilot** (#8: 108–125)              | Section 8  | AI actions generate CRDT ops (#21) with `author_kind: 'agent'` so the audit trail is distinct (#227 in #16)                                                                                                                                                                                                                                                          |
| **Presenter experience** (#9: 126–141)    | Section 9  | Presenter mode reads the same scene graph (#1, #6); "jump to slide" uses the layers panel search (#5) over the slide rail                                                                                                                                                                                                                                            |
| **Audience participation** (#10: 142–154) | Section 10 | Audience-driven navigation (#148) generates events that mutate `currentSlide` via the same CRDT path; engagement events are presence-adjacent                                                                                                                                                                                                                        |
| **Sharing** (#11: 155–168)                | Section 11 | Shared-link state is a _read-only_ projection of the deck's CRDT state; per-link content control (#159) is a filter over slides/layers                                                                                                                                                                                                                               |
| **Analytics** (#12: 169–178)              | Section 12 | Per-viewer analytics ride on presence sessions; "live session" analytics tap the same WS connection as collaboration (#17)                                                                                                                                                                                                                                           |
| **Collaboration** (#13: 179–192)          | Section 13 | Comments are pinned to layer ids from the layers panel (#5); suggestion mode (#182) is a CRDT branch with restricted write rights                                                                                                                                                                                                                                    |
| **Enterprise** (#14: 193–204)             | Section 14 | Audit logs subscribe to the op stream; DLP checks inspect ops before fan-out; data residency affects where the op log is stored                                                                                                                                                                                                                                      |
| **Novel** (#15: 205–219)                  | Section 15 | "Presentation state timeline" (#205) reuses the CRDT op log as the recording source; provenance chips (#215) join `crdt_ops` with `assets`/`data_sources`                                                                                                                                                                                                            |
| **Agentic** (#16: 221–240)                | Section 16 | The MCP server exposes the same REST + WS API surface; agent edits flow through CRDT (#21) with `author_kind: 'agent'`; capability discovery (#236) reads from the OpenAPI + GraphQL schemas above; deck-as-code (#223–224) is a serialization of the scene graph; semantic addressing (#226) is a stable id scheme that this section already assigns to every layer |

### 8.1 Branching tie-out (#19) as the Git-like primitive

Because branching lives in this section but is consumed by sections 2 (component variants), 6 (motion variants), 13 (review workflows), and 16 (agent workflows), the contract is:

- `Branch` is per-deck.
- `MergeRequest` carries a `diff_summary` that is structured (not just visual) so sections 13 and 16 can branch on it programmatically.
- A fast-forward merge (#19) is the _same_ operation as a `restore` (#20) — both create a forward edge in history.

### 8.2 Offline-first vs. cloud-first

Section 21 (offline CRDT) is the dominant operating mode for the eventual product (consistent with the local-first philosophy noted in the broader plan). All later sections that introduce server-only state (e.g., audience participation #10, analytics #12) must tolerate the offline case: queue events locally and replay on reconnect, or degrade gracefully.

---

## Appendix A — Feature → Module → API mapping (cross-reference)

| Feature                        | Primary module(s)                    | Primary API(s)                                 |
| ------------------------------ | ------------------------------------ | ---------------------------------------------- |
| 1 Infinite canvas              | Renderer, Scene graph                | (internal)                                     |
| 2 Drag-drop                    | Input pipeline, Scene graph          | `PATCH /slides/:id` (op)                       |
| 3 Smart guides                 | Input pipeline, Scene graph (R-tree) | (internal)                                     |
| 4 Multi-select/group/lock/hide | Scene graph, History engine          | `PATCH /slides/:id`                            |
| 5 Layers panel                 | Layers panel UI, GraphQL             | `Query.slides.layers(filter)`                  |
| 6 Frames-within-frames         | Scene graph                          | `PATCH /slides/:id`                            |
| 7 Auto-layout                  | Layout engine (worker)               | `PATCH /slides/:id`                            |
| 8 Constraints                  | Layout engine                        | `PATCH /slides/:id`, `layer_constraints` table |
| 9 Vector pen/booleans          | Vector engine                        | `PATCH /slides/:id`                            |
| 10 Rulers/grids                | Renderer                             | (internal)                                     |
| 11 Zoom 2 %–6400 %             | Renderer                             | (internal)                                     |
| 12 Undo/redo                   | History engine                       | (local)                                        |
| 13 Keyboard / Cmd+K            | Shortcut registry                    | (local + remote search via GraphQL)            |
| 14 Paste styles                | Style engine                         | (local + style token mapping)                  |
| 15 Eyedropper                  | Color picker                         | (local)                                        |
| 16 Right-click menus           | Menu registry                        | (local)                                        |
| 17 Multiplayer cursors         | Presence service                     | WS `presence`                                  |
| 18 Cursor chat/ping            | Presence service                     | WS `presence`                                  |
| 19 Branch/merge                | Branch/merge service                 | REST + WS                                      |
| 20 Named checkpoints           | History snapshotter                  | REST + WS                                      |
| 21 Offline CRDT                | CRDT sync engine                     | REST + WS + IndexedDB                          |
| 22 Autosave                    | Autosave queue + IndexedDB           | REST + WS                                      |

---

## Appendix B — Open questions / decisions to confirm before build

1. **WebGPU vs. WebGL2 default?** Plan: WebGPU primary, WebGL2 fallback; ship WebGL2 first to maximize compatibility.
2. **YCJS vs. Automerge for the CRDT substrate?** Plan: Yjs (mature, smaller bundle); revisit if performance requires.
3. **Service worker scope for offline (#21)?** Plan: scope to deck origin; cache CRDT state + last 5,000 ops + asset metadata; assets themselves cached on first visit.
4. **Visual diff in #20 — server-rendered thumbnails or client-computed?** Plan: server-rendered for fast scrub; client-computed for live preview.
5. **Branch storage (#19) — full scene-graph copy or shared base + diff?** Plan: shared base + diff to minimize storage; branch creation copies a reference, not data.
