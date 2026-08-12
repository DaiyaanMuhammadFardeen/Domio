# Wave 2 — Editor Surface Completion

**Intent.** Deliver every editor-facing capability listed in §1 (Core Editor & Canvas), §2 (Components & Templates), §3 (Theming/Branding), §4 (Live Data & Charts — editor side), §5 (3D/Motion/Rich Media — editor side), §6 (Animation/Transition), and §7 (Prototyping/Interactivity — editor side) of `feature-list.md`. After Wave 2, the editor has a reachable panel for every editor-facing feature the backend exposes, and the canvas chrome (rulers, guides, zoom HUD, snapping, etc.) is production-grade.

**Why it matters.** The editor is the primary authoring surface and the place where every paid plan is sold. Any feature that's hard to reach in the editor is effectively dead to users.

---

## 1. Scope (by feature ID)

- **§1 Core editor & canvas:** #1–22.
- **§2 Components/templates:** #23–36.
- **§3 Theming/branding:** #37–47.
- **§4 Live data:** #48–64 (editor-facing portion).
- **§5 3D/motion/media:** #65–84 (editor-facing portion).
- **§6 Animation/transitions:** #85–95.
- **§7 Prototyping/interactivity:** #96–107 (editor-facing portion).

---

## 2. Sub-phase map

### S2.1 — Canvas chrome (rulers, guides, grid, zoom HUD)

**Features:** #10, #11, #13, #14, #16, #17.

**Files to create/modify:**
- `apps/editor/src/components/canvas/Rulers.tsx`
- `apps/editor/src/components/canvas/Guides.tsx`
- `apps/editor/src/components/canvas/GridOverlay.tsx`
- `apps/editor/src/components/canvas/ZoomHUD.tsx`
- `apps/editor/src/components/canvas/SnapEngine.ts`
- `apps/editor/src/panels/canvas-controls-panel.tsx` (new — exposes rulers, grid, snapping toggles)
- `apps/editor/src/components/EditorRoot.tsx` (mounts the new chrome)

**Build instructions:**
1. Rulers render tick marks every 50 px and major marks every 100 px. Cursor coordinates update on hover. Click on a ruler drops a guide.
2. Guides are draggable, double-click to remove, shift-click to convert to slide-bound. Position is persisted via CRDT.
3. Grid overlay supports columns (1–12) and baseline grid (configurable px). Toggle in `canvas-controls-panel`.
4. Zoom HUD: a bottom-left pill showing `45%`. Click to open a numeric input + fit/100%/200% shortcuts.
5. Snap engine: when an element is being dragged, compute distances to other edges and to grid lines; show pink guide lines when within 4 px.
6. Keyboard shortcuts: `Shift+R` toggles rulers, `Shift+G` toggles grid, `Shift+;` toggles guides, `0` zoom-fit, `1` zoom-100%, `2` zoom-200%, `Cmd+;` snaps to nearest.

**SOLID notes:**
- **S:** each chrome element (ruler, guide, grid) is its own component; the canvas is not a god component.
- **O:** adding a new overlay (e.g. bleed marks) is a new file.
- **I:** chrome elements receive minimal props `{ zoom, panOffset, viewportSize }` — they do not see the entire deck.

**Acceptance:**
- All keyboard shortcuts work in production build.
- Drag-to-snap correctly guides and releases.
- Ruler coordinates match zoom level.

---

### S2.2 — Layers panel: outline view + group/lock/hide

**Features:** #4, #5, #17, #18.

**Files to modify:**
- `apps/editor/src/panels/LayersPanel.tsx` (existing)
- `apps/editor/src/components/canvas/OutlineTree.tsx` (new)
- `apps/editor/src/hooks/useSelection.ts` (new — centralizes selection state)

**Build instructions:**
1. Layers panel shows two tabs: **Flat** (current) and **Outline** (tree of slides → groups → elements).
2. Drag-reorder works at any level (group, slide, element).
3. Right-click on a layer opens a context menu with: rename, duplicate, group/ungroup, lock/unlock, hide/show, send-to-back/front, convert-to-component.
4. Multi-select via Shift+click and Cmd+click; group transform handle appears when ≥2 selected.
5. Search input filters layers by name, type, and tag (e.g. "kpi").
6. Locked layers show a small lock icon and cannot be selected on canvas; hidden layers are excluded from canvas and exports.

**SOLID notes:**
- **L:** `useSelection` exposes a uniform API regardless of whether selection came from canvas or layers.
- **D:** layers panel depends on `useSelection` interface, not on canvas internals.

**Acceptance:**
- 100-element deck renders layers panel in <100 ms.
- Group/ungroup survives CRDT round-trip.

---

### S2.3 — Multi-select / group transform handle

**Features:** #4.

**Files to create:**
- `apps/editor/src/components/canvas/GroupTransformHandle.tsx`

**Build instructions:**
1. When ≥2 elements are selected, render a bounding box with 8 resize handles and a rotation handle.
2. Hold Alt to scale from center; hold Shift to keep aspect ratio.
3. Press `Cmd+G` to group, `Cmd+Shift+G` to ungroup, `Cmd+Option+→` to send forward.
4. Group selection persists across CRDT ops; deleting a group deletes its children.

---

### S2.4 — Insert panel completion (templates, sections, variants)

**Features:** #23, #24, #25, #28, #29, #30, #31, #32, #33, #34, #35.

**Files to modify:**
- `apps/editor/src/panels/InsertPanel.tsx`
- `apps/editor/src/lib/component-service.ts` (new in Wave 1)
- `apps/editor/src/components/widget-palette/ComponentThumb.tsx`
- `apps/editor/src/components/widget-palette/TemplateGallery.tsx` (new)

**Build instructions:**
1. Tab the panel by source: **Components** (smart components), **Templates** (full-deck), **Sections** (slide-group), **Stock** (Unsplash/Pexels), **Lottie**, **Stickers**, **Icons**.
2. Components subpanel shows variant selector when a component has variants (`light/dark`, `sm/md/lg`).
3. Smart components render an editable props form in the side panel when selected (the existing `PropsPanel` schema-driven editor already does this; verify all variants wire through).
4. Template gallery uses a grid with cover thumbnails, use-case chips (Pitch, Board Report, QBR, All-hands), and "Open preview" CTA.
5. Section templates: a slide-group (e.g. "Team", "Financials") inserts as 3–5 slides.
6. Each insert emits a CRDT op; undo is one-click.

**Acceptance:**
- 10k+ components lazy-load in pages of 50; scrolling remains 60 fps.
- Insert + undo works in real-time multiplayer without duplication.

---

### S2.5 — Theme & brand panel (full token editor + brand extract + dark/light + multi-brand)

**Features:** #36–47.

**Files to modify:**
- `apps/editor/src/panels/theme-brand-panel.tsx`
- `apps/editor/src/lib/brand-service.ts`
- `apps/editor/src/components/brand/BrandExtractDialog.tsx` (new)
- `apps/editor/src/components/brand/TokenEditor.tsx` (new)
- `apps/editor/src/components/brand/ThemeMarketplace.tsx` (new)

**Build instructions:**
1. Tab **Tokens**: full editor for color, type, spacing, radius, shadow scales. Live preview on canvas.
2. Tab **Brand kits**: list brand kits from `/v1/brand/kits`; "Extract from URL" button opens `BrandExtractDialog` (calls `POST /v1/brand/extract`).
3. Tab **Multi-brand**: agencies managing multiple clients; switch active brand kit per slide or per deck.
4. Tab **Theme marketplace**: browse `services/marketplace-preview`, preview live demo, install with one click.
5. Dark/light toggle at the top right; generates the opposite scheme from the current one via `POST /v1/theme/generate-dark`.
6. Style-lint button calls `POST /v1/lint/style` and lists off-brand elements with one-click fix.
7. Per-slide theme override: a slide-scoped color picker that takes precedence over the deck theme.

**SOLID notes:**
- **O:** the token editor doesn't know about brand kits; the brand panel composes both.
- **I:** each tab is a separate component with its own props.

**Acceptance:**
- Token change updates every canvas element in <16 ms.
- Brand extract from URL produces a kit with primary + accent + 3 typography choices.

---

### S2.6 — Library + marketplace in editor

**Features:** #26, #27, #28, #33, #36.

**Files to modify:**
- `apps/editor/src/panels/library-panel.tsx`
- `apps/editor/src/panels/marketplace-panel.tsx`
- `apps/editor/src/components/library/VersionPinBadge.tsx`

**Build instructions:**
1. Library tab shows team libraries + personal libraries; track-version, pin-version, pin-range toggles exist.
2. Update badges appear when a newer version of a subscribed component is published; "Update" CTA.
3. Marketplace tab inside the editor is the same as `apps/marketplace-web` but constrained to "install-to-current-deck" actions.
4. Brand-locked components show a lock icon and refuse override.
5. "Promote to library" action (the existing `promote-dialog.tsx`) uses the real `POST /v1/library/publish`.

**Acceptance:**
- Library pagination + search filters <100 ms for 1k items.
- Marketplace install adds the component to the deck within 1 round-trip.

---

### S2.7 — Data sources + bind inspector + scenario switcher + filters + threshold

**Features:** #48–64.

**Files to modify:**
- `apps/editor/src/panels/data-source-panel.tsx`
- `apps/editor/src/panels/bind-inspector.tsx`
- `apps/editor/src/panels/scenario-switcher.tsx`
- `apps/editor/src/panels/filters-panel.tsx`
- `apps/editor/src/panels/threshold-panel.tsx`
- `apps/editor/src/components/data/QueryBuilder.tsx` (new)

**Build instructions:**
1. Data source panel lists real sources (Sheets, Airtable, Notion, Postgres, MySQL, BigQuery, Snowflake, REST, GraphQL). Add-source form posts to `POST /v1/connector-framework/sources`.
2. Connector-specific credential UI (OAuth flow for Sheets, connection string for Postgres).
3. Bind inspector on each chart shows the current binding, allows rebinding via drag-and-drop, and displays last-synced timestamp from `services/freshness-tracker`.
4. Scenario switcher: list scenarios (Base/Bull/Bear), create new scenario, edit dataset binding per scenario. Calls `POST /v1/scenario/{id}/bindings`.
5. Filters panel: cross-chart filter dimensions; one-click "apply filter to all slides on this deck."
6. Threshold panel: KPI threshold rules; "when X > Y, restyle to red."
7. QueryBuilder: SQL editor (Monaco) with autocomplete from the data source's schema; safe-execute against a sandboxed account.

**SOLID notes:**
- **S:** QueryBuilder is not coupled to any chart component; it returns a query AST that any chart can bind to.
- **D:** chart components depend on `BindingAdapter` interface, not on a specific connector.

**Acceptance:**
- A bound chart in editor reflects data changes within 500 ms of source refresh.
- Scenario switch in editor triggers a CRDT op that updates every chart and text callout bound to that scenario.

---

### S2.8 — Annotations on data + ticker animations

**Features:** #58, #59.

**Files to create:**
- `apps/editor/src/components/data/AnnotationPin.tsx`
- `apps/editor/src/components/data/TickerAnimationPanel.tsx`

**Build instructions:**
1. Right-click a data point → "Pin annotation." Pin is a CRDT op with `{ dataPointId, text, color, author }`. Renders as a leader-line + chip.
2. Ticker animation: count-up effect on KPIs. Configurable duration, easing, and locale (currency formatting).
3. Number-ticker is a separate element type `kpi-ticker` so designers can place it like any element.

---

### S2.9 — Currency / unit localization (editor side)

**Features:** #61.

**Files to create:**
- `apps/editor/src/components/locale/LocalePicker.tsx`
- `apps/editor/src/components/locale/UnitFormatDialog.tsx`

**Build instructions:**
1. Per-element locale picker: "Show USD to one audience, EUR to another."
2. Calls `POST /v1/localization/format` to render preview values in chosen locale.
3. Currency switch is per-deck-share, not per-element, so the editor surface is just configuration.

---

### S2.10 — Media panel completion (3D editor, AR, video, audio, embeds, code, LaTeX, maps)

**Features:** #65–84.

**Files to modify:**
- `apps/editor/src/panels/media-panel.tsx`
- `apps/editor/src/components/media/Model3DEditor.tsx` (new)
- `apps/editor/src/components/media/CadImportDialog.tsx` (new)
- `apps/editor/src/components/media/ARPreviewButton.tsx` (new)
- `apps/editor/src/components/media/VideoTrimmer.tsx` (new)
- `apps/editor/src/components/media/AudioVoiceoverPanel.tsx` (new)
- `apps/editor/src/components/media/CodeBlockEditor.tsx` (new)
- `apps/editor/src/components/media/LatexEditor.tsx` (new)
- `apps/editor/src/components/media/MapPicker.tsx` (new)

**Build instructions:**
1. **3D editor** (model3d tab): load a GLB/USDZ; the panel shows a 3D viewport with lighting + camera controls. Add hotspots that trigger slide actions. Author camera keyframes on a timeline.
2. **CAD import**: drop a STEP/FBX; the panel submits a `POST /v1/cad-jobs` and polls; on completion, replaces the drop with the optimized GLB.
3. **AR preview**: "Preview in AR" button generates a QR for the AR view.
4. **Video trimmer**: range-select on the timeline; non-destructive edits stored as a clip mask.
5. **Audio / voiceover**: per-slide recording via `MediaRecorder`. Save calls `POST /v1/media/audio`.
6. **Code block editor**: Monaco with `run` button that submits to `POST /v1/sandbox-runs`. Output renders below the block.
7. **LaTeX editor**: live preview rendering through `POST /v1/latex`.
8. **Map picker**: Mapbox/MapLibre with marker drag-drop; choropleth config panel.
9. **Live app embed**: iframe sandbox config (origin allowlist, allowed permissions, JWT generation).

**Acceptance:**
- 3D editor maintains ≥30 fps with 100k-triangle model.
- Voiceover recording round-trips in <500 ms.
- AR preview QR opens the `apps/viewer/ar` route.

---

### S2.11 — Animation + transition panel (timeline + magic move + motion path)

**Features:** #85–95.

**Files to modify:**
- `apps/editor/src/panels/animations-panel.tsx`
- `apps/editor/src/components/animation/MotionPathEditor.tsx` (new)
- `apps/editor/src/components/animation/EasingBezierEditor.tsx` (new)

**Build instructions:**
1. Timeline view shows tracks per element, keyframes, easing curves. Drag keyframes to retime.
2. Magic-move: matching elements across two selected slides morph position/size/style. Preview button.
3. Motion-path editor: draw a bezier path; elements animate along it. Triggered by on-click/on-enter/on-data-change/on-timer.
4. Easing bezier editor: drag the two control points; live preview.
5. Reduced-motion toggle respects `prefers-reduced-motion` and `deck.settings.allowReducedMotion`.
6. Copy animation between elements and slides via right-click menu.

**Acceptance:**
- Magic move correctly identifies matching elements by stable id (`slide[3].chart[revenue_by_region]`).
- Motion paths round-trip through CRDT.

---

### S2.12 — Prototyping panels (connections, state machine, variables, deep links, test sessions, heatmap, sequences)

**Features:** #96–107.

**Files to modify:**
- `apps/editor/src/panels/connections-panel.tsx`
- `apps/editor/src/panels/state-inspector-panel.tsx`
- `apps/editor/src/panels/variables-panel.tsx`
- `apps/editor/src/panels/deep-links-panel.tsx`
- `apps/editor/src/panels/test-sessions-panel.tsx`
- `apps/editor/src/panels/heatmap-panel.tsx`
- `apps/editor/src/panels/sequence-inspector-panel.tsx`
- `apps/editor/src/components/prototyping/VoiceGestureTriggerPanel.tsx` (new)
- `apps/editor/src/components/prototyping/ConditionalLogicBuilder.tsx` (new)
- `apps/editor/src/components/prototyping/FormInputPalette.tsx` (new)
- `apps/editor/src/components/prototyping/DeviceFramePicker.tsx` (new)

**Build instructions:**
1. Connections panel: 4 tabs (Hotspots, Branching, Overlays, Graph) already exist; add **Triggers** tab with on-voice / on-gesture options.
2. State inspector: visual state machine with states/transitions; pause-and-inspect toggle.
3. Variables: 5 scopes, 6 types, 10 actions already; add a visual conditional-logic builder ("if annual_toggle = true → show annual pricing slide").
4. Deep links: mint/resolve/delete; show analytics per link (clicks, unique viewers).
5. Test sessions panel: list recorded sessions, scrub the timeline, replay with state snapshot.
6. Heatmap panel: real heatmap from `services/heatmap-generator`, not synthetic.
7. Sequence inspector: name/slides/interval/loop/count/interruption policy/reduced-motion/pause-warn already; add a **simulate** button.
8. Voice/gesture triggers: bind STT phrases or MediaPipe hand poses to slide actions.
9. Conditional logic builder: visual IF/THEN graph.
10. Form input palette: insert text fields, dropdowns, sliders as variables.
11. Device frame picker: wrap a slide in an iPhone/iPad/Mac frame.

**SOLID notes:**
- **S:** prototyping panels do not import canvas directly; they bind to the canvas via an event bus.
- **O:** adding a new trigger kind (e.g. proximity sensor) is one new file.

**Acceptance:**
- Hotspot click in editor preview jumps to the target slide with state restored.
- Voice trigger surfaces in the test-sessions replay.

---

## 3. SOLID injection — concrete shapes for the editor

### Editor module map
```
apps/editor/src/
├── panels/
│   ├── registry.ts           # PANELS list, getPanel(), PanelGroup
│   ├── canvas-controls-panel.tsx
│   ├── ...  (one file per panel)
├── components/
│   ├── canvas/               # chrome, overlay, selection handles
│   ├── data/                 # data-binding-specific UI
│   ├── media/                # media-type-specific UI
│   ├── animation/            # animation-specific UI
│   ├── prototyping/          # prototyping-specific UI
│   ├── brand/                # brand-specific UI
│   └── ui/                   # generic primitives
├── hooks/                    # useDeck, useSelection, useBindings, ...
├── lib/                      # *-service.ts wrappers
└── store/                    # Zustand stores, kept narrow
```

### Rule: no canvas import outside `components/canvas/**` and `panels/**`
Panels describe state, never render canvas. Components in `components/canvas/**` render canvas. This separation is enforced by lint.

### Rule: every new element type is one file
Adding `kpi-ticker` (S2.8) means creating `components/data/TickerElement.tsx`, registering it in `packages/scene-graph` registry, and writing tests. No edits to `EditorRoot` or `LayersPanel`.

---

## 4. Out of scope

- Audience/presenter-side rendering of these features (Waves 4 + 5).
- AI suggestions (Wave 6 — copilot lives in its own panel).
- Marketplace listing flows (Wave 9).
- Analytics on these features (Wave 7 reads editor events).

---

## 5. DoD checklist

- [ ] Every panel listed in the master §3 matrix for editor has a real implementation; no mock data anywhere.
- [ ] All 22 §1 features reachable from the editor.
- [ ] All 14 §2 features reachable from the editor.
- [ ] All 11 §3 features reachable from the editor.
- [ ] All 17 §4 features (editor-facing) reachable from the editor.
- [ ] All 20 §5 features (editor-facing) reachable from the editor.
- [ ] All 11 §6 features reachable from the editor.
- [ ] All 12 §7 features (editor-facing) reachable from the editor.
- [ ] No canvas-import lint errors.
- [ ] Every new panel has Vitest + Playwright tests.
- [ ] Lighthouse accessibility ≥ 95.
- [ ] Editor TTI ≤ 2.5 s.
