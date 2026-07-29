# Section 6 — Animation & Transition System

**Codename:** Domio
**Section scope:** Features 85–95 (per `feature-list.md`)
**Source files:** `feature-list.md` (lines 100–112), `pre-development-planning-guide.md`
**Document type:** Pre-development planning
**Status:** Draft for engineering review

This document is the section-6 working plan. It covers timeline-based authoring, magic-move between slides, per-element triggers, transitions, easing, reduced-motion, copy/paste of animations, scroll-linked animations, and GIF/video export of animated slides. Where decisions cross other sections (editor canvas, theming, live charts, prototyping, presenter overlays, sharing), explicit cross-section ties are documented in §10.

---

## 1. Feature-by-Feature Mapping

Acceptance criteria are written so each item can be promoted to a ticket, an automated test, or a manual QA checklist row without further interpretation.

### Feature 85 — Timeline-based animation editor (After Effects-lite: keyframes, easing curves, delays)

**Behavior.** Every animated element owns one or more **tracks** (e.g., `transform.x`, `transform.y`, `transform.scale`, `opacity`, `rotation`, `fill`, `stroke_width`). A track holds an ordered set of **keyframes**, each stamped with a `time_ms` and an `easing_curve_id`. The editor exposes a horizontal timeline with: playhead, ruler (zoom from 100 ms/px to 5 s/px), track headers, per-keyframe markers, and a "duration strip" beneath. Multi-track selection, drag-to-retime, alt-drag to clone, shift-click for range selection, and Cmd+drag for in/out points are first-class.

**Acceptance criteria.**

- AC-85.1: Selecting an element opens a timeline panel docked beneath the canvas; tracks default to all transform properties when an element is first selected and the user adds a keyframe.
- AC-85.2: Adding a keyframe at `t = 0` and another at `t = 600 ms` with `ease-out-cubic` produces an interpolated intermediate frame that can be scrubbed and previewed at 30 fps without dropping below 50 fps on a 2021-era laptop for ≤ 16 simultaneous animated elements.
- AC-85.3: Delays are stored per-track (not as a "delay" track) as `start_offset_ms`; toggling "delay" in the inspector sets/clears this field and visibly shifts the marker in the timeline.
- AC-85.4: Undo/redo covers every timeline mutation (add keyframe, delete keyframe, retime, re-ease, change property binding). Each undo step is a single visual step in the editor's existing history (cross-ref feature #12).
- AC-85.5: A "snap to playhead" mode (default ON) snaps any new keyframe to the current playhead position when created via the shortcut `K`; the unsnapped behavior is available via shift-K.

**Edge cases.**

- Two keyframes at identical `time_ms` on the same track are rejected at write time (unique index on `(track_id, time_ms)`).
- A track with only one keyframe is treated as "static after that point" — no interpolation, no animation.
- Keyframes cannot be placed before `t = 0`; the timeline clamps and surfaces an inline error toast.
- Property types must match the track (e.g., you cannot keyframe a string property on `opacity`). Mismatch is blocked at the API layer with HTTP 422.

### Feature 86 — Magic move between slides

**Behavior.** When the presenter transitions from slide A to slide B (default arrow key, swipe, or click), elements that exist in both slides and share an `element_role` (e.g., "title", "kpi.revenue") are auto-matched and tweened (position, size, rotation, opacity, fill, stroke, corner radius, text style). Matched elements are visually connected during the transition; unmatched elements cross-fade.

**Acceptance criteria.**

- AC-86.1: For any two slides containing elements sharing `element_role`, the magic-move engine computes a transition ≤ 50 ms after the second slide is touched (cached thereafter) for ≤ 200 elements per slide.
- AC-86.2: Manual override of matching is available via a per-element "ignore magic move" toggle in the inspector.
- AC-86.3: When the diff is ambiguous (two candidate matches above 0.7 similarity), the engine keeps the higher-similarity match and marks the other with a yellow badge in the "magic-move inspector" panel.
- AC-86.4: A "magic move debug" mode renders each matched pair with a colored outline and serializes the diff to a downloadable JSON file.

**Edge cases.**

- Zero matches → standard slide transition (no morph); user is informed via a one-line status message.
- Mismatched element counts → elements that exist on one side only cross-fade; matched ones tween.
- A user can opt out per slide transition in the slide-level transition inspector.
- If both slides are reduced-motion-mode (§93), magic-move collapses to a 1-frame cross-fade (≤ 50 ms) so the affordance is preserved for accessibility users.

### Feature 87 — Entrance/exit/emphasis presets with physics-based easing

**Behavior.** A library of named presets ("drop in", "spring bounce", "ken-burns zoom", "fade-rise", "type-on typewriter"). Each preset bundles: trigger (`on_enter`, `on_exit`, `on_click`), default duration, default easing (often a physics spring), and property mutations.

**Acceptance criteria.**

- AC-87.1: At least 24 presets ship at launch: 8 entrance, 8 exit, 8 emphasis. Each is JSON-defined and hot-reloadable without code change.
- AC-87.2: Applying a preset creates the underlying keyframes (not a black-box reference) so users can edit individual keyframes afterward.
- AC-87.3: Physics-based easing presets (spring, bounce) are evaluated against a deterministic spring solver so the same deck rendered on any device plays identically.

**Edge cases.**

- A preset applied to an element without the property it animates (e.g., "type-on" on a shape) is rejected with an inline error pointing to the missing property.
- Presets that imply `on_enter` on the last slide are silently converted to `on_click` to avoid the animation never firing.

### Feature 88 — Per-element animation triggers

**Behavior.** Each animation has one trigger bound to it: `on_click` (presenter advances via click/tap/space/arrow), `on_enter` (fires when the slide becomes current), `on_hover` (mouse-enter on the element in presenter mode), `on_data_change` (fired when a bound data field updates), `on_timer` (after `N` ms from slide enter or from prior animation end).

**Acceptance criteria.**

- AC-88.1: Each trigger type is selectable via a dropdown in the timeline inspector.
- AC-88.2: `on_data_change` resolves to a specific bound field (`source_id.field_path`); when that field updates in presenter mode, the animation replays from frame 0.
- AC-88.3: `on_timer` accepts a millisecond offset (0–60,000 ms); offset below 0 is rejected.
- AC-88.4: Multiple animations on the same element form a sequence or stagger, controlled by `sequence: parallel | sequence | stagger` and `stagger_ms` per element.

**Edge cases.**

- `on_hover` is suppressed in passive viewer mode (scrollytelling web page) and only active in presenter mode and prototype mode (cross-ref feature #97, #99).
- `on_data_change` requires the element to be bound to a data source — otherwise the option is greyed out.
- A click trigger consumed by an interactive prototype hotspot (feature #97) cannot be double-bound to an animation trigger; the binding UI prevents this and surfaces an explanation.

### Feature 89 — Staggered list/grid reveals with one control

**Behavior.** A "stagger" toggle on any group of elements applies a uniform delay offset (`stagger_ms`) to each member's animation start. The group can be a multi-selection, a frame, an auto-layout container, or a smart component's children.

**Acceptance criteria.**

- AC-89.1: Selecting N elements and applying "stagger 80 ms" produces a uniform 80 ms increment between the start of each element's animation; all underlying timings stay editable per-element afterward.
- AC-89.2: Direction options `forward | reverse | center-out | random` are available and re-order only the stagger offsets, not the element z-order.

**Edge cases.**

- Stagger on a single element is a no-op (no error).
- Stagger is preserved across element reordering within a group until the user explicitly re-applies it.

### Feature 90 — Scroll-linked animations for the web-shared version

**Behavior.** In "scroll mode" (feature #156), elements can opt into scroll-linked animation: a property is bound to `scroll_progress` (0..1 across the slide viewport) so it interpolates as the viewer scrolls past the slide.

**Acceptance criteria.**

- AC-90.1: An element with a scroll-linked track is rendered with `transform: translate3d(...)` and never reads layout during scroll to avoid forced reflow (cross-ref §3 performance budget).
- AC-90.2: Scroll-linked timelines coexist with on-enter animations; a "scroll replaces enter" toggle resolves the conflict (default: scroll replaces enter for the same property).
- AC-90.3: The total number of simultaneously scroll-linked properties on screen is capped at 32 (enforced client-side and server-side) to protect rendering budget.

**Edge cases.**

- Touch devices without a scroll wheel still trigger scroll-linked animations via swipe/scroll position.
- A scroll-linked animation cannot depend on another scroll-linked animation (no DAG) — the authoring tool prevents this.

### Feature 91 — Slide transitions: morph, push, fade, 3D flip, cube, portal

**Behavior.** A slide-level transition is applied between two slides. Built-in transitions: `fade`, `push`, `morph` (between magic-move matched pairs), `3d-flip`, `cube`, `portal`, `cover`, `reveal`. Each is configurable by `duration_ms` and `easing_curve_id`.

**Acceptance criteria.**

- AC-91.1: At least 8 transitions ship at launch, all GPU-accelerated (transform/opacity only where possible).
- AC-91.2: `morph` is magic-move-aware: it uses the §86 match table to plan element tweens.
- AC-91.3: Selecting a transition in the slide inspector surfaces a 1-second preview button that plays the transition between the two adjacent slides without leaving the inspector.

**Edge cases.**

- `cube` and `3d-flip` require perspective preserved on the parent; the editor auto-injects `perspective: 1200px` on the slide root if absent.
- A transition that exceeds the user's `max_animation_duration_ms` setting is clamped and flagged.

### Feature 92 — Animation curve library + custom bezier editor

**Behavior.** A built-in library (`linear`, `ease`, `ease-in`, `ease-out`, `ease-in-out`, `ease-in-quad/cubic/quart/quint`, `ease-out-*`, material-style curves, spring presets) plus a custom cubic-Bezier editor (two handles, one for `x1,y1`, one for `x2,y2`).

**Acceptance criteria.**

- AC-92.1: The custom bezier editor enforces monotonicity in `x` and rejects handle moves that would produce a non-function curve; invalid moves snap back.
- AC-92.2: User-defined curves are stored as `(cubicP1X, cubicP1Y, cubicP2X, cubicP2Y)` and clamped to `0 ≤ x ≤ 1`; `y` is unclamped and may exceed `[0,1]` for overshoot effects.
- AC-92.3: A "preview" swatch animates a sample element (a moving circle) in a 200×200 viewport at 30 fps using the current curve.

**Edge cases.**

- A curve with `x1 == x2 == 0` (degenerate) is rejected.
- Bezier curves are evaluated with a fixed-step Newton-Raphson solver at compile time (precomputed 256-entry LUT per curve) to avoid per-frame root finding.

### Feature 93 — Reduced-motion mode auto-respecting viewer OS preferences

**Behavior.** When `prefers-reduced-motion: reduce` is set in the viewer's OS/browser, the player switches to a "reduced" rendering mode that replaces long transitions with ≤ 100 ms cross-fades, drops decorative parallax/particles (feature #72), collapses scroll-linked animations to a static end-state at full progress, and converts number-ticker animations (feature #58) to instant set-value.

**Acceptance criteria.**

- AC-93.1: The OS preference is observed via `window.matchMedia('(prefers-reduced-motion: reduce)')` and re-evaluated on `change` events.
- AC-93.2: The author can override the OS preference per-deck ("always reduced", "always full", "follow OS" — default). The setting is stored on `deck.reduced_motion_settings` (see §5).
- AC-93.3: Reduced mode is logged in the presentation state timeline (feature #205) so analytics can report how many viewers experienced reduced motion.

**Edge cases.**

- If the OS preference cannot be detected (older browser), default is "follow full" (no reduction).
- A `prefers-reduced-motion: no-preference` user is never silently downgraded; a user setting "always reduced" is always honored.

### Feature 94 — Animation copy/paste between elements and slides

**Behavior.** `Cmd/Ctrl+C` on a selected element with animation copies the entire animation graph (tracks, keyframes, easing, triggers). Pasting onto another element rebinds property values to the target's property types where compatible. Cross-slide paste adds the animation to the target element with no time-of-day offset conflict.

**Acceptance criteria.**

- AC-94.1: Pasting a copied animation onto an element of an incompatible type drops incompatible tracks silently and surfaces an "X tracks skipped" inline toast with a "view details" link.
- AC-94.2: Pasting across slides preserves all keyframe timings relative to the slide enter time.
- AC-94.3: "Copy animation style" (a separate shortcut, `Cmd/Ctrl+Alt+C`) copies only easing curves so users can quickly re-ease many tracks.

**Edge cases.**

- Copying an `on_data_change`-triggered animation to an element bound to a different data source requires explicit confirmation (the trigger will rebind).
- A read-only / brand-locked element (feature #36) refuses paste with an inline error.

### Feature 95 — GIF/video export of any animated slide for social sharing

**Behavior.** A "share as motion" button on any slide opens an export dialog: format (GIF, MP4, WebM), resolution (480p, 720p, 1080p), duration (one play of the slide, or loop N times for GIF), and a transparent-background toggle (MP4/WebM only). Export is processed server-side via the export pipeline (§4.7).

**Acceptance criteria.**

- AC-95.1: A 10-second slide at 720p exports as MP4 within 30 s wall time on the standard export worker.
- AC-95.2: A 6-second slide exports as a GIF ≤ 8 MB at 480p/15 fps by default.
- AC-95.3: The export honors the deck's reduced-motion and per-element trigger settings: a slide with `on_click` triggers is exported with all triggers fired sequentially (as if the presenter clicked through).
- AC-95.4: Exported GIFs include a small "Made with Domio" watermark in the corner for free-tier users; watermark is removable for paid tiers and configurable per workspace.

**Edge cases.**

- Export fails if the slide has a broken data binding (feature #48) that would prevent playback; the user is shown which binding failed.
- A GIF export with a transparent background is not supported (always composites on the deck background); the option is hidden with an inline explanation.
- Exported MP4 of a slide containing embedded live iframes (feature #81) records only the iframe's first-frame state with a placeholder warning burned in.

---

## 2. UX Flows

These flows describe the author/viewer journey for the four most consequential interactions in this section. Each flow lists inputs, screens, state changes, and failure modes.

### Flow A — Authoring keyframes on the timeline

1. **Open timeline.** User selects an element on the canvas (cross-ref section 1, feature #5 layers). The timeline panel becomes active and shows existing tracks for that element. If no animation exists, a "+ Add track" affordance is shown.
2. **Choose property.** User picks a property from the "+" menu (`x`, `y`, `scale`, `opacity`, etc.). A track row appears.
3. **Place keyframes.** User moves the playhead to `t = 0 ms` and presses `K` to drop a keyframe. User moves to `t = 800 ms` and presses `K` again. The track now has two keyframes.
4. **Set easing.** User clicks the easing badge between the two keyframes and selects `ease-out-cubic` (or drags the bezier handles for a custom curve).
5. **Set delay.** User toggles "delay" and enters `200 ms`. The first keyframe marker visually shifts right by 200 ms; the track property shows `start_offset_ms = 200`.
6. **Preview.** User presses space. The element tweens from start to end over the configured duration using the chosen curve, with the 200 ms delay observed.
7. **Save.** The animation is part of the element's persisted state; autosave (feature #22) records it.

**Failure modes.**

- If the user adds a keyframe on a property whose type doesn't match (e.g., a string property), the badge turns red and a tooltip explains the type mismatch.
- If the user sets a `start_offset_ms` larger than the slide's allowed duration (configurable per workspace), an inline warning caps it.

### Flow B — Magic-move detection between slides

1. **Author two slides.** Slide A has a chart at `(x=100, y=200, w=400, h=300)` titled "Q1". Slide B has the same chart at `(x=600, y=100, w=400, h=300)` titled "Q2".
2. **Open transition inspector.** User selects the transition between A and B and toggles "Magic move" on.
3. **Compute diff.** The engine computes a `magic_move_pair` (slide A → slide B) and serializes element-role matches with similarity scores. Computation runs once and is cached.
4. **Review matches.** The inspector shows: `chart[revenue_by_region]: 0.94` with a green dot, `title[Q1] → title[Q2]: 0.91` with a green dot. Optional elements with no match are listed under "Unmatched" with a toggle to cross-fade only.
5. **Override.** If the user disagrees with a match, they click the green dot and either disable that match (manual pair-off) or re-pin it to a different element via a target picker.
6. **Preview.** User clicks "Preview transition" and the engine interpolates over the chosen duration.
7. **Save.** The transition settings (magic-move enabled, per-element overrides, duration, easing) are persisted on the slide pair.

**Failure modes.**

- If a slide contains > 200 elements, the user sees a "magic-move disabled: too many elements" message and falls back to the slide-level transition.
- If two elements tie on similarity within 0.05, the lower-similarity match is shown yellow; user is asked to disambiguate.

### Flow C — Setting per-element triggers

1. **Select animation.** User selects an existing animation on an element and opens the inspector panel.
2. **Choose trigger.** Dropdown shows `on_click`, `on_enter`, `on_hover`, `on_data_change`, `on_timer`. Default is `on_enter`.
3. **Configure trigger-specific fields.**
   - `on_data_change`: picker shows available data fields on the bound source; user selects one.
   - `on_timer`: numeric input for ms (0–60,000).
4. **Confirm.** Inspector collapses and the timeline displays the trigger badge next to the first keyframe.

**Failure modes.**

- `on_data_change` only appears if the element is bound to a data source. If unbound, the option is greyed with a tooltip "bind to a data source to enable".
- `on_hover` is greyed in scroll-mode viewer (it is presenter-only).

### Flow D — Exporting an animated slide as GIF

1. **Open share menu.** User clicks "Share" → "Export motion".
2. **Choose slide.** Multi-select picker allows one or many slides. Default is the slide the user is on.
3. **Configure export.** Format (`GIF`, `MP4`, `WebM`); resolution (`480p`, `720p`, `1080p`); loop count (`1` for MP4/WebM, `1`–`5` for GIF); watermark toggle.
4. **Submit.** Client sends an export job (§6 API). A progress indicator shows the queue position and ETA.
5. **Complete.** A download link appears; a copy-link button is provided. The export is also listed in the workspace's "Exports" history (cross-ref feature #163).

**Failure modes.**

- A slide with broken data bindings shows a red banner before submission with "Fix data bindings to export".
- GIF exports over 8 MB (the default cap) surface a "Reduce to 480p/15 fps to fit in 8 MB" inline suggestion.
- Server-side rate limit (§7) returns HTTP 429 with a `Retry-After` header.

### Flow E — Applying reduced-motion preferences automatically

1. **Viewer opens shared deck link.** Their browser sends `prefers-reduced-motion: reduce` via media query.
2. **Detection.** Player reads `matchMedia('(prefers-reduced-motion: reduce)').matches`.
3. **Mode selection.** The deck's `reduced_motion_settings.mode = 'follow_os'` (default) selects reduced mode.
4. **Playback adjustment.** All transitions > 100 ms are clamped to ≤ 100 ms cross-fades; decorative parallax/particles disabled; number tickers set values instantly.
5. **Log.** A `reduced_motion_observed: true` event is appended to the presentation state timeline (feature #205) and to per-viewer analytics (feature #169).
6. **Live change.** If the OS preference changes mid-session (e.g., user toggles it), the `change` event fires and the player switches modes seamlessly on the next slide transition.

**Failure modes.**

- Browser doesn't support `matchMedia` → default to "follow full" (no reduction).
- Author set `mode = 'always_full'` → OS preference ignored, full motion always plays.

---

## 3. Functional & Non-Functional Requirements

### 3.1 Functional

- **F-1.** Timeline CRUD on tracks and keyframes, scoped to a deck.
- **F-2.** Trigger assignment per animation (`on_click | on_enter | on_hover | on_data_change | on_timer`).
- **F-3.** Magic-move diff computation between any ordered pair of slides within a deck.
- **F-4.** Animation preset library (24+ presets, JSON-defined).
- **F-5.** Custom Bezier curve definition per ease curve, with per-curve LUT caching.
- **F-6.** Reduced-motion mode toggle (`follow_os | always_reduced | always_full`), re-evaluated on media-query change events.
- **F-7.** Slide transition selection with magic-move integration and 8+ built-in transitions.
- **F-8.** Scroll-linked animation binding for properties.
- **F-9.** Stagger control with direction modes.
- **F-10.** Animation copy/paste and easing copy/paste.
- **F-11.** Export job submission for GIF/MP4/WebM of animated slide(s).
- **F-12.** Cross-deck respect for theming tokens in animated color/typography transitions (cross-ref section 3, features #37, #38).

### 3.2 Non-functional

- **NFR-1. Performance — timeline evaluation.** A slide with ≤ 32 simultaneously animating properties must hold 60 fps on a 2021-era laptop. The evaluation loop runs on the main thread but defers to `requestAnimationFrame`; heavy interpolations use Web Workers where the property is large (e.g., path data, gradient stops).
- **NFR-2. Performance — magic-move compute.** A diff between two slides of ≤ 200 elements each must complete in ≤ 50 ms (p95) on a warm cache; cold path ≤ 250 ms (p95). Budget enforced in CI with a benchmark fixture.
- **NFR-3. Performance — GIF export budget.** Per-slide export at 720p/15 fps/6 s must complete ≤ 30 s wall time on the standard worker. At 480p/15 fps/6 s, ≤ 12 s.
- **NFR-4. Performance — scroll-linked animation budget.** ≤ 32 scroll-linked properties on screen at any time; the player refuses to schedule more and surfaces an inline warning. Each scroll-linked property must evaluate ≤ 1 ms per frame.
- **NFR-5. Performance — GPU-accelerated transitions.** All transitions in §91 must run on the GPU compositor (transform/opacity only); exceptions for `morph` (which animates geometry attributes) are documented and benchmarked.
- **NFR-6. Accessibility.** Reduced-motion mode must default to `follow_os` and be observable by assistive tech (the player surfaces a `data-reduced-motion="true"` attribute on the root element when active).
- **NFR-7. Determinism.** Given identical input deck state and trigger sequence, playback frame N must be byte-identical across platforms (web, embedded renderer, export worker). This requires a fixed-step spring solver and precomputed Bezier LUTs.
- **NFR-8. Browser support.** Latest two major versions of Chrome, Edge, Safari, Firefox; Safari ≥ 16 for `matchMedia('(prefers-reduced-motion: reduce)')` reliability.
- **NFR-9. Localization.** Timeline inspector copy and easing names are localized to the user's UI language; easing IDs are stable English slugs.
- **NFR-10. Telemetry.** Every timeline edit, magic-move computation, and export job emits a structured event with deck_id, slide_id, latency_ms, and result.

---

## 4. Architecture

### 4.1 Component overview

```
                       ┌──────────────────────────────┐
                       │   Editor (section 1 canvas)   │
                       └──────────────┬───────────────┘
                                      │ selection / element ops
                                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Animation Timeline Engine (client)             │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐ │
│  │ Track Manager  │  │ Easing Evaluator│  │ Trigger Resolver   │ │
│  └────────────────┘  └────────────────┘  └────────────────────┘ │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐ │
│  │ Preset Library │  │ Reduced-Motion │  │ Custom Bezier Ed.  │ │
│  │   (JSON)       │  │ Mode Flag      │  │ + LUT cache        │ │
│  └────────────────┘  └────────────────┘  └────────────────────┘ │
└──────────────┬─────────────────────────────────┬────────────────┘
               │ debounced writes                │ reads
               ▼                                 ▼
   ┌────────────────────┐         ┌──────────────────────────────┐
   │  Timeline API      │         │   Magic-Move Diff Engine     │
   │  (server)          │         │   (server worker)            │
   └────────────────────┘         └──────────────┬───────────────┘
                                                  │ diffs
                                                  ▼
   ┌────────────────────┐         ┌──────────────────────────────┐
   │  Trigger API       │◀────────│   Slide Transition Engine    │
   └────────────────────┘         │   (client, on transition)    │
                                  └──────────────────────────────┘
               ┌──────────────────────────────┐
               │   Export Pipeline (server)   │
               │   ┌──────────┐ ┌───────────┐  │
               │   │ Renderer │→│ FFmpeg /  │  │
               │   │ (headless)│ │gifenc/etc │  │
               │   └──────────┘ └───────────┘  │
               └──────────────────────────────┘
```

### 4.2 Animation Timeline Engine (client)

- Lives in a `TimelineEngine` singleton per editor session.
- Holds the in-memory `tracks` graph; debounces writes to the server at 250 ms.
- Exposes `subscribe(listener)` for the canvas to receive interpolated values per frame.
- Per-frame loop: `requestAnimationFrame` → compute current time → for each active animation in `playing` state → resolve trigger → evaluate easing → emit interpolated properties.
- Owns the **reduced-motion flag** and reacts to `matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', ...)`.

### 4.3 Easing Curve Evaluator (with custom Bezier editor)

- Stateless module: input `(curve_id, progress)` → output `(value)`.
- Built-in curves ship as code; user-defined curves are stored as `(cubicP1X, cubicP1Y, cubicP2X, cubicP2Y)` and compiled to a 256-entry LUT on first use. LUTs are cached by `curve_id` with an LRU cap of 1024.
- Spring presets are evaluated by a fixed-step semi-implicit Euler solver at 240 Hz sub-stepping so they play identically across frame rates.

### 4.4 Magic-Move Diff Engine (server-side worker)

- Stateless service that, given `(deck_id, slide_a_id, slide_b_id)`, returns a `magic_move_pair` object with matches and per-property diffs.
- Computed once per slide pair on demand; cached for 24 h or invalidated on either slide's edit.
- Computes three signals per candidate pair:
  - **Shape similarity**: cosine similarity of bounding-box descriptors plus corner-radius / stroke-width style vector.
  - **Position interpolation**: distance between centers normalized to slide diagonal; if below 0.4 normalized distance, treat as "near".
  - **Style tween**: continuous-space interpolation of fill, opacity, font-size, weight, letter-spacing, line-height.
- Combined score = `0.5 * shape + 0.3 * style + 0.2 * element_role_exact_match`. Threshold 0.6 to consider a match.

### 4.5 Preset Library

- JSON files in `assets/animation-presets/v1/*.json`. Each file declares a single preset with `name`, `trigger`, `properties[]`, `keyframes[]`, `default_duration_ms`, `tags[]`.
- Hot-reloadable in dev; in prod, bundled at build time and addressed by stable ID.
- 24 presets at launch across `entrance | exit | emphasis`.

### 4.6 Per-Element Trigger Resolver

- A `TriggerResolver` evaluates `resolve(animation, ctx) → "fire" | "wait"` per frame given the current context (`slide_enter_at`, `last_click_at`, `hover_target_id`, `data_field_changed_at`, `timer_offset_ms`).
- For `on_data_change`, the resolver subscribes to the data source event bus and pushes a synthetic event when the bound field updates.

### 4.7 Reduced-Motion Mode Flag Propagation

- Single source of truth: `reduced_motion_settings` per deck (mode: `follow_os | always_reduced | always_full`).
- Player reads OS preference on each session start and on media-query `change` events.
- Flag propagates: `TimelineEngine` clamps durations and disables parallax/particles; `SlideTransitionEngine` replaces non-fade transitions with cross-fade ≤ 100 ms; chart ticker animations (feature #58) set values instantly; scroll-linked animations collapse to static end-state at full progress.

### 4.8 Export Pipeline (server)

- Job submitted via `POST /decks/{id}/exports` with `{ slide_ids[], format, resolution, loop_count, watermark }`.
- Worker pool consumes from `exports` queue (BullMQ or equivalent). A headless Chromium renders each slide to a frame sequence; `gifenc` (JS) or `ffmpeg` (system) stitches to GIF/MP4/WebM.
- Output stored in object storage with a 7-day signed URL; metadata written to `exports` table.

---

## 5. Data Model

PostgreSQL is the system of record; large or shape-variable animation data lives in JSONB columns. All tables inherit `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()` unless noted.

### 5.1 Tables

```sql
-- Animation timeline: one per animated element on a slide.
CREATE TABLE timelines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id         UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    slide_id        UUID NOT NULL REFERENCES slides(id) ON DELETE CASCADE,
    element_id      UUID NOT NULL REFERENCES elements(id) ON DELETE CASCADE,
    duration_ms     INTEGER NOT NULL DEFAULT 1000 CHECK (duration_ms BETWEEN 1 AND 600000),
    loop            BOOLEAN NOT NULL DEFAULT FALSE,
    play_count      INTEGER,                 -- NULL = infinite
    start_offset_ms INTEGER NOT NULL DEFAULT 0 CHECK (start_offset_ms >= 0),
    tracks          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- see §5.2
    triggers        JSONB NOT NULL DEFAULT '[]'::jsonb,  -- see §5.3
    preset_id       TEXT,                              -- nullable; origin preset if any
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (element_id, preset_origin_index)          -- soft uniqueness per element
);
CREATE INDEX idx_timelines_deck_slide ON timelines (deck_id, slide_id);
CREATE INDEX idx_timelines_element    ON timelines (element_id);

-- A track is one property's keyframe list. Stored inline in timelines.tracks JSONB
-- (see §5.2) for read/write efficiency, but also flattened here for analytics queries.

CREATE TABLE tracks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timeline_id     UUID NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
    property_path   TEXT NOT NULL,           -- e.g., 'transform.x', 'opacity', 'fill.color'
    property_type   TEXT NOT NULL,           -- 'number' | 'color' | 'length' | 'string' | 'transform'
    easing_curve_id UUID NOT NULL REFERENCES easing_curves(id) ON DELETE RESTRICT,
    keyframes       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- see §5.4
    is_scroll_linked BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tracks_timeline ON tracks (timeline_id);

-- A keyframe is a single point on a track.
-- Stored inline in tracks.keyframes JSONB; this table is a denormalized mirror
-- used for analytics and global search ("find every keyframe that tweens red").
CREATE TABLE keyframes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    track_id        UUID NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
    time_ms         INTEGER NOT NULL CHECK (time_ms >= 0),
    value           JSONB NOT NULL,          -- typed per property_type
    hold            BOOLEAN NOT NULL DEFAULT FALSE,  -- step interpolation if true
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (track_id, time_ms)
);
CREATE INDEX idx_keyframes_track ON keyframes (track_id);

-- Easing curves: built-ins (seeded) + user-defined.
CREATE TABLE easing_curves (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id         UUID REFERENCES decks(id) ON DELETE CASCADE,  -- NULL = global built-in
    workspace_id    UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL CHECK (kind IN ('linear','cubic_bezier','spring','step','physics')),
    params          JSONB NOT NULL,          -- see §5.5
    is_builtin      BOOLEAN NOT NULL DEFAULT FALSE,
    lut             BYTEA,                   -- 256-entry precomputed LUT (optional cache)
    lut_version     INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, name)
);
CREATE INDEX idx_easing_curves_workspace ON easing_curves (workspace_id);

-- Animation presets: bundled library + workspace customizations.
CREATE TABLE animation_presets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID REFERENCES workspaces(id) ON DELETE CASCADE,  -- NULL = global
    name            TEXT NOT NULL,
    category        TEXT NOT NULL CHECK (category IN ('entrance','exit','emphasis')),
    trigger         TEXT NOT NULL CHECK (trigger IN ('on_click','on_enter','on_hover','on_data_change','on_timer')),
    default_duration_ms INTEGER NOT NULL,
    definition      JSONB NOT NULL,          -- tracks + keyframes + easing refs
    tags            TEXT[] NOT NULL DEFAULT '{}',
    is_builtin      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_animation_presets_workspace ON animation_presets (workspace_id);
CREATE INDEX idx_animation_presets_tags    ON animation_presets USING GIN (tags);

-- Triggers: declared per animation. Stored inline in timelines.triggers JSONB
-- for read efficiency; this table is the analytics mirror.
CREATE TABLE triggers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timeline_id     UUID NOT NULL REFERENCES timelines(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('on_click','on_enter','on_hover','on_data_change','on_timer')),
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- on_data_change: {"source_id":"...","field_path":"..."}
    -- on_timer:       {"offset_ms": 1500, "from":"slide_enter"|"prior_animation_end"}
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (timeline_id, kind)
);

-- Slide transitions: declared per ordered slide pair.
CREATE TABLE transitions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id         UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    from_slide_id   UUID NOT NULL REFERENCES slides(id) ON DELETE CASCADE,
    to_slide_id     UUID NOT NULL REFERENCES slides(id) ON DELETE CASCADE,
    kind            TEXT NOT NULL CHECK (kind IN ('fade','push','morph','3d-flip','cube','portal','cover','reveal','none')),
    duration_ms     INTEGER NOT NULL DEFAULT 350 CHECK (duration_ms BETWEEN 0 AND 5000),
    easing_curve_id UUID REFERENCES easing_curves(id) ON DELETE SET NULL,
    magic_move_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    magic_move_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,  -- per-element overrides
    metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (from_slide_id, to_slide_id)
);
CREATE INDEX idx_transitions_deck ON transitions (deck_id);

-- Magic-move diff results, cached per slide pair.
CREATE TABLE magic_move_pairs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id         UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    from_slide_id   UUID NOT NULL REFERENCES slides(id) ON DELETE CASCADE,
    to_slide_id     UUID NOT NULL REFERENCES slides(id) ON DELETE CASCADE,
    pairs           JSONB NOT NULL DEFAULT '[]'::jsonb,  -- see §5.6
    unmatched_from  JSONB NOT NULL DEFAULT '[]'::jsonb,
    unmatched_to    JSONB NOT NULL DEFAULT '[]'::jsonb,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    compute_latency_ms INTEGER NOT NULL,
    cache_version   INTEGER NOT NULL DEFAULT 1,
    UNIQUE (from_slide_id, to_slide_id)
);
CREATE INDEX idx_magic_move_deck ON magic_move_pairs (deck_id);

-- Reduced-motion settings, per deck.
CREATE TABLE reduced_motion_settings (
    deck_id             UUID PRIMARY KEY REFERENCES decks(id) ON DELETE CASCADE,
    mode                TEXT NOT NULL DEFAULT 'follow_os'
                        CHECK (mode IN ('follow_os','always_reduced','always_full')),
    max_transition_ms   INTEGER NOT NULL DEFAULT 100 CHECK (max_transition_ms BETWEEN 0 AND 1000),
    disable_particles   BOOLEAN NOT NULL DEFAULT TRUE,
    collapse_scroll_linked BOOLEAN NOT NULL DEFAULT TRUE,
    instant_tickers     BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Export jobs (referenced by §4.8 export pipeline).
CREATE TABLE export_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deck_id         UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    requested_by    UUID NOT NULL REFERENCES users(id),
    format          TEXT NOT NULL CHECK (format IN ('gif','mp4','webm')),
    resolution      TEXT NOT NULL CHECK (resolution IN ('480p','720p','1080p')),
    fps             INTEGER NOT NULL DEFAULT 15 CHECK (fps IN (15,24,30,60)),
    duration_ms     INTEGER NOT NULL,
    loop_count      INTEGER NOT NULL DEFAULT 1,
    watermark       BOOLEAN NOT NULL DEFAULT FALSE,
    slide_ids       UUID[] NOT NULL,
    status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','rendering','encoding','completed','failed')),
    progress_pct    INTEGER NOT NULL DEFAULT 0,
    error_message   TEXT,
    output_url      TEXT,
    output_bytes    BIGINT,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_export_jobs_deck   ON export_jobs (deck_id);
CREATE INDEX idx_export_jobs_status ON export_jobs (status);
```

### 5.2 `timelines.tracks` JSONB shape

```json
[
  {
    "id": "8b1f…",
    "property_path": "transform.x",
    "property_type": "number",
    "easing_curve_id": "ec_out_cubic",
    "is_scroll_linked": false,
    "keyframes": [
      { "time_ms": 0,   "value": 100, "hold": false },
      { "time_ms": 600, "value": 240, "hold": false }
    ]
  },
  {
    "id": "9c2e…",
    "property_path": "opacity",
    "property_type": "number",
    "easing_curve_id": "ec_in_out_quad",
    "is_scroll_linked": false,
    "keyframes": [
      { "time_ms": 0,   "value": 0,   "hold": false },
      { "time_ms": 400, "value": 1,   "hold": false }
    ]
  }
]
```

### 5.3 `timelines.triggers` JSONB shape

```json
[
  {
    "kind": "on_enter",
    "config": {}
  }
]
```

`on_data_change` example:

```json
{
  "kind": "on_data_change",
  "config": { "source_id": "ds_abc", "field_path": "kpis.revenue.value" }
}
```

`on_timer` example:

```json
{
  "kind": "on_timer",
  "config": { "offset_ms": 1500, "from": "prior_animation_end" }
}
```

### 5.4 `keyframes` JSONB shape (when stored inline)

```json
{ "time_ms": 0, "value": 100, "hold": false, "metadata": {} }
```

`value` is JSON-typed to match `property_type`:
- `number` → JSON number
- `color` → `{"r": 1, "g": 0.5, "b": 0, "a": 1}` (linear-space) or CSS string
- `length` → `{"value": 24, "unit": "px"}`
- `transform` → `{"tx": 0, "ty": 0, "sx": 1, "sy": 1, "r": 0}`
- `string` → JSON string (rare; mostly used for text-replace effects)

### 5.5 `easing_curves.params` JSONB shape

`cubic_bezier`:

```json
{ "kind": "cubic_bezier", "p1x": 0.25, "p1y": 0.1, "p2x": 0.25, "p2y": 1.0 }
```

`spring`:

```json
{ "kind": "spring", "mass": 1.0, "stiffness": 170, "damping": 26 }
```

`physics` (preset-only, e.g., "bounce"):

```json
{ "kind": "physics", "preset": "bounce", "gravity": 9.81, "bounce_count": 2 }
```

### 5.6 `magic_move_pairs.pairs` JSONB shape

```json
[
  {
    "from_element_id": "el_abc",
    "to_element_id":   "el_def",
    "element_role":    "title",
    "similarity":      0.94,
    "signals": {
      "shape_similarity": 0.97,
      "position_distance_norm": 0.18,
      "style_vector_cosine": 0.92,
      "element_role_exact_match": true
    },
    "diffs": {
      "transform": { "tx": 500, "ty": -100, "sx": 1, "sy": 1, "r": 0 },
      "size":      { "w": 0, "h": 0 },
      "fill":      { "from": "#1F2937", "to": "#0F172A" },
      "opacity":   { "from": 1, "to": 1 },
      "text":      { "font_size": 0, "weight_delta": 0 }
    }
  }
]
```

### 5.7 Foreign-key & integrity notes

- `tracks.keyframes` (JSONB) and the denormalized `keyframes` table must stay consistent; a write trigger on `tracks` re-syncs the mirror table inside the same transaction.
- `transitions.from_slide_id` and `to_slide_id` must be distinct; enforced by check constraint.
- Deleting a deck cascades to `timelines`, `tracks`, `keyframes`, `triggers`, `transitions`, `magic_move_pairs`, `reduced_motion_settings`, and `export_jobs`.

---

## 6. APIs and Contracts

REST over HTTPS. JSON request/response bodies. Auth via the workspace session token (cross-ref section 14, feature #193). All endpoints are idempotent where noted.

### 6.1 Timeline CRUD

```
GET    /v1/decks/{deck_id}/slides/{slide_id}/timelines
       → 200 { "timelines": [Timeline, ...] }

POST   /v1/decks/{deck_id}/slides/{slide_id}/timelines
       body: TimelineCreate
       → 201 { "timeline": Timeline }

GET    /v1/timelines/{timeline_id}
       → 200 { "timeline": Timeline }

PATCH  /v1/timelines/{timeline_id}
       body: TimelinePatch   (deep-merge; track + keyframe edits included)
       → 200 { "timeline": Timeline }
       Idempotency-Key: required for retry safety.

DELETE /v1/timelines/{timeline_id}
       → 204
```

```ts
// TypeScript-flavored shapes (server is Postgres; client treats as canonical).
type TimelineCreate = {
  element_id: string;
  duration_ms: number;            // 1..600000
  loop: boolean;
  play_count: number | null;
  start_offset_ms: number;        // >= 0
  tracks: Track[];
  triggers: Trigger[];
  preset_id?: string | null;
};

type Track = {
  id?: string;
  property_path: string;
  property_type: "number" | "color" | "length" | "transform" | "string";
  easing_curve_id: string;
  is_scroll_linked: boolean;
  keyframes: Keyframe[];
};

type Keyframe = {
  time_ms: number;
  value: unknown;                 // typed per property_type
  hold?: boolean;
};

type Trigger =
  | { kind: "on_click"; config: {} }
  | { kind: "on_enter"; config: {} }
  | { kind: "on_hover"; config: {} }
  | { kind: "on_data_change"; config: { source_id: string; field_path: string } }
  | { kind: "on_timer"; config: { offset_ms: number; from: "slide_enter" | "prior_animation_end" } };
```

Error responses: 400 invalid body, 404 deck/slide/timeline not found, 409 optimistic-lock conflict (response includes `current_etag`), 422 type mismatch (e.g., keyframe on incompatible property), 429 rate limited.

### 6.2 Trigger assignment

```
PUT    /v1/timelines/{timeline_id}/triggers
       body: { triggers: Trigger[] }
       → 200 { "triggers": Trigger[] }
       Replaces the entire trigger list. Use PATCH on timeline for partial updates.
```

### 6.3 Magic-move computation

```
POST   /v1/decks/{deck_id}/magic-move
       body: {
         from_slide_id: string;
         to_slide_id: string;
         force_recompute?: boolean;
       }
       → 200 {
         "pair": MagicMovePair,    // same shape as §5.6
         "cached": boolean,
         "compute_latency_ms": number
       }
       → 202 if recompute queued (long-running)
```

### 6.4 Slide transition

```
PUT    /v1/decks/{deck_id}/transitions/{from_slide_id}/{to_slide_id}
       body: {
         kind: "fade"|"push"|"morph"|"3d-flip"|"cube"|"portal"|"cover"|"reveal"|"none";
         duration_ms: number;            // 0..5000
         easing_curve_id: string | null;
         magic_move_enabled: boolean;
         magic_move_overrides: object;   // per-element pair-off
       }
       → 200 { "transition": Transition }
```

### 6.5 Easing curve CRUD

```
POST   /v1/workspaces/{workspace_id}/easing-curves
       body: { name: string; kind: "cubic_bezier"|"spring"|"physics"; params: object }
       → 201 { "curve": EasingCurve }
```

Built-in curves are seeded and read-only; the server returns 403 on writes to `is_builtin = true`.

### 6.6 Reduced-motion settings

```
GET    /v1/decks/{deck_id}/reduced-motion
       → 200 { "settings": ReducedMotionSettings }

PUT    /v1/decks/{deck_id}/reduced-motion
       body: ReducedMotionSettings
       → 200 { "settings": ReducedMotionSettings }
```

### 6.7 Export job submission

```
POST   /v1/decks/{deck_id}/exports
       body: {
         format: "gif"|"mp4"|"webm";
         resolution: "480p"|"720p"|"1080p";
         fps: 15|24|30|60;
         slide_ids: string[];            // 1..50
         loop_count: number;            // gif only; 1..5
         watermark: boolean;
       }
       → 202 {
         "job": { id: string, status: "queued", progress_pct: 0, eta_seconds: number }
       }

GET    /v1/exports/{job_id}
       → 200 {
         "job": {
           id, status, progress_pct, output_url?, error_message?, eta_seconds?
         }
       }
```

`output_url` is a 7-day signed URL; client refreshes by re-GETting the job.

### 6.8 Animation preset discovery

```
GET    /v1/workspaces/{workspace_id}/animation-presets?category=&tag=
       → 200 { "presets": Preset[] }
```

---

## 7. Security

### 7.1 Sandboxing for user-defined Bezier curves

User-defined cubic-bezier and spring curves are pure data; they are evaluated inside the same JS context as the rest of the editor. The risk surface is bounded:

- **No code execution.** Curves are JSON values, not scripts. The Bezier editor UI rejects handle positions that produce a non-function curve (`x1 < x2`, both `x`s in `[0,1]`) before save.
- **LUT validation.** When a curve is first used, the server computes and caches a 256-entry LUT. Values outside `[-0.25, 1.25]` are clamped; if clamping would mute the effect, the server returns 422 and asks the user to pick a built-in.
- **Spring solver bounds.** Spring presets must respect `mass ∈ [0.1, 10]`, `stiffness ∈ [10, 1000]`, `damping ∈ [1, 200]`. Out-of-range values are rejected.
- **Render isolation.** The export worker renders user-deck content in a sandboxed Chromium with `--disable-web-security`, but with the network blocked at the OS firewall level so embedded iframes cannot reach external origins during export.

### 7.2 Export rate limits

Per-user and per-workspace caps protect the render pool:

| Tier       | Per-user daily | Per-workspace daily | Concurrent jobs | Max resolution |
|------------|----------------|---------------------|-----------------|----------------|
| Free       | 5              | 20                  | 1               | 480p           |
| Pro        | 50             | 200                 | 3               | 1080p          |
| Enterprise | 500            | (negotiated)        | 10              | 1080p          |

Rate-limit responses are HTTP 429 with `Retry-After` and `X-RateLimit-Remaining` headers.

### 7.3 Abuse prevention

- **Bot detection.** Export endpoints are gated behind the same bot-detect middleware used for signups (Turnstile or equivalent).
- **Content checks.** Decks flagged by DLP (feature #195) cannot be exported to GIF/MP4 (text-burn-in risk).
- **Watermarking.** Free-tier GIF/MP4 exports include a 1-second corner watermark; removal requires Pro tier and is recorded in the audit log (feature #196).
- **Slide-count cap.** Single export job caps at 50 slides; > 50 surfaces an inline warning asking the user to split.
- **SSRF defense.** Slide content can include live iframes (feature #81) bound to arbitrary URLs; the export renderer refuses to load URLs that resolve to internal RFC1918 / link-local / loopback ranges.

### 7.4 Auth and authorization

- All endpoints require a workspace session token; per-deck authorization is checked against the workspace ACL (cross-ref section 13, features #184, #192).
- Brand-locked regions (feature #36) cannot have their animations modified by users without `edit_brand_locked` permission; the PATCH endpoint returns 403 with an explanation.

---

## 8. Performance

### 8.1 Timeline evaluation budget

- **Per-frame budget:** ≤ 8 ms total for interpolation of all active tracks on the current slide.
- **Active-track cap:** ≤ 64 simultaneously animating tracks on screen; the player refuses to start more and surfaces an inline message.
- **Worker offload:** Properties whose values are large JSON (path data, gradient stops) are interpolated in a Web Worker; the main thread receives a transferable `Float32Array` per frame.
- **GC pressure:** Keyframe arrays are reused across frames; values are mutated in place to avoid per-frame allocation.

### 8.2 Magic-move compute budget

- **Cold compute (p95):** ≤ 250 ms for two slides of ≤ 200 elements.
- **Warm cache hit:** ≤ 50 ms (returns from `magic_move_pairs` table).
- **In-flight cap:** ≤ 4 concurrent computations per workspace; subsequent requests queue.
- **Memory cap:** A computation holds ≤ 50 MB resident; out-of-memory abort returns 503 and the client retries with exponential backoff (250 ms, 1 s, 4 s).

### 8.3 GIF / video export budget per slide

| Format | Resolution | FPS | Duration | Budget (wall) | Output cap |
|--------|------------|-----|----------|---------------|-----------:|
| GIF    | 480p       | 15  | 6 s      | ≤ 12 s        | 8 MB       |
| GIF    | 480p       | 15  | 10 s     | ≤ 22 s        | 12 MB      |
| MP4    | 720p       | 30  | 10 s     | ≤ 30 s        | 25 MB      |
| MP4    | 1080p      | 30  | 10 s     | ≤ 60 s        | 60 MB      |
| WebM   | 720p       | 30  | 10 s     | ≤ 30 s        | 20 MB      |

Per-job budget: a 50-slide MP4 export at 720p must complete ≤ 25 min wall time. Above that, the worker marks the job `failed` with `error_message = "wall_budget_exceeded"` and the client offers a lower-resolution retry.

### 8.4 GPU-accelerated transitions

- All transitions in §91 use `transform` and `opacity` exclusively, except `morph` (which animates geometry attributes for matched pairs) and `portal` (which uses `clip-path`).
- `transform`/`opacity` runs on the compositor thread; CPU usage stays under 5% on a 2021-era laptop for any single transition.
- `morph` and `portal` are benchmarked in CI on a reference machine and gated: a > 12 ms median frame time blocks the merge.

### 8.5 Caching

- **Bezier LUT cache:** 1024-entry LRU in-memory; rebuilt on worker restart.
- **Magic-move cache:** persisted for 24 h, invalidated on either slide's edit (write trigger on `slides` table purges relevant `magic_move_pairs` rows).
- **Preset metadata:** loaded at worker startup and held in memory.

### 8.6 Scroll-linked animation budget (web rendering)

- ≤ 32 simultaneously scroll-linked properties on screen (enforced client-side and server-side on save).
- Each property uses `transform: translate3d(...)` and reads `scrollY` from a passive `scroll` listener at ≤ 60 Hz; the listener writes to a `Float32Array` shared with the renderer via `requestAnimationFrame`.
- Forced reflow during scroll is forbidden by an ESLint rule that disallows layout-triggering APIs inside scroll handlers.
- Properties exceeding the budget are deferred to "render at scroll end" mode (a single set at 100% progress) with an inline note in the inspector.

---

## 9. Observability & Testing

### 9.1 Structured logs

Every timeline, magic-move, transition, reduced-motion, and export event emits a JSON log line:

```json
{
  "ts": "2026-07-29T12:34:56.789Z",
  "event": "timeline.evaluated",
  "deck_id": "d_abc",
  "slide_id": "s_xyz",
  "timeline_id": "t_123",
  "active_tracks": 8,
  "frame_time_ms": 3.4,
  "reduced_motion": false
}
```

Events of interest: `timeline.created`, `timeline.updated`, `timeline.deleted`, `timeline.evaluated`, `trigger.fired`, `magic_move.computed`, `magic_move.cache_hit`, `magic_move.cache_miss`, `transition.played`, `reduced_motion.observed`, `reduced_motion.overridden`, `export.queued`, `export.started`, `export.completed`, `export.failed`, `bezier.rejected`.

### 9.2 Metrics

| Metric | Type | Labels | Use |
|--------|------|--------|-----|
| `animation.frame_time_ms` | histogram | deck_id, slide_id | NFR-1 budget alerting |
| `animation.active_tracks` | gauge | deck_id | Detect hot decks |
| `magic_move.compute_ms` | histogram | cached | NFR-2 budget alerting |
| `magic_move.cache_hit_ratio` | gauge | — | Cache effectiveness |
| `export.wall_time_ms` | histogram | format, resolution | NFR-3 budget alerting |
| `export.queue_depth` | gauge | — | Backpressure detection |
| `reduced_motion.viewer_count` | gauge | mode | Product analytics |
| `bezier.rejected_total` | counter | reason | Detect authoring friction |

Alerts fire on:

- p95 `animation.frame_time_ms` > 8 ms for ≥ 5 min.
- p95 `magic_move.compute_ms` > 250 ms (cold) or > 50 ms (warm) for ≥ 5 min.
- p95 `export.wall_time_ms` exceeds the table in §8.3 by > 50%.
- `export.queue_depth` > 50 for ≥ 2 min.

### 9.3 Distributed tracing

The export pipeline emits OpenTelemetry spans:

```
export.job
  └── render.slide (per slide)
       └── frame.capture (per frame)
  └── encode.video
       └── ffmpeg.transcode
```

The magic-move diff engine emits:

```
magic_move.compute
  └── candidate_pairs.enumerate
  └── similarity.score (per pair)
  └── match.resolve
```

### 9.4 Test plan

- **Unit (≥ 80% coverage in `animation/`, `magic_move/`, `easing/`):**
  - Bezier solver monotonicity and LUT clamping.
  - Spring solver determinism across N=10,000 randomized inputs.
  - Stagger direction ordering (`forward | reverse | center-out | random`).
  - Magic-move similarity scoring against a fixture of 20 hand-scored pairs.
  - Reduced-motion clamping logic.

- **Integration:**
  - Timeline CRUD round-trips preserve every field including JSONB tracks.
  - Magic-move cache invalidation fires on slide edits.
  - Export job submission → completion with a 5-slide GIF fixture.

- **End-to-end (Playwright):**
  - "Author a keyframe, preview, save, reload" → state is identical.
  - "Toggle OS reduced-motion preference" → player switches modes.
  - "Submit GIF export" → job completes within budget and the file plays.

- **Performance benchmarks (CI gate):**
  - 64 active tracks at 60 fps on a reference headless browser.
  - Magic-move cold compute ≤ 250 ms (p95) on 200-element slides.
  - GIF export at 480p/15 fps/6 s ≤ 12 s.

- **Determinism test (CI gate):**
  - Frame-by-frame compare of two runs of the same deck on the same input — must be byte-identical for the first 600 frames.

- **Accessibility test:**
  - `prefers-reduced-motion: reduce` triggers a documented mode and `data-reduced-motion="true"` is set on the root.
  - Keyboard-only navigation can reach every timeline control.

---

## 10. Cross-Section Ties

This section depends on and influences the following sections. Each tie lists the upstream/downstream feature and the integration contract.

### 10.1 Editor canvas (section 1)

- **#5 Layers panel.** Animations are owned by elements; the layers panel shows a small "A" badge when an element has at least one timeline. Clicking the badge opens the timeline panel.
- **#12 Unlimited undo/redo.** Every timeline mutation is one undo step. The undo stack is shared with element-level ops; interleaving is allowed (e.g., undo an element move, then undo a keyframe retime).
- **#22 Autosave.** Timeline writes are debounced at 250 ms then flushed; the same autosave pipeline carries them.

### 10.2 Theming transitions respect tokens (section 3)

- **#37 Design tokens.** A keyframe on `fill.color` stores a token reference (`token://brand.primary`) rather than a literal value, so a theme swap (feature #38) re-tints the animation in real time.
- **#38 One-click theme swap.** Magic-move style tween recomputes against the new theme token values; cached `magic_move_pairs` are invalidated when a theme swap commits.
- **#47 Per-slide theme overrides.** Slide-local tokens override deck-wide tokens during a transition; the interpolation uses the *target* slide's token, not the source's, to avoid mid-transition color flicker.

### 10.3 Chart ticker animations (section 4)

- **#58 Number ticker / animated chart builds.** Tickers read their easing curve from the animation timeline engine; the player can swap a ticker from `linear` to a custom curve via the inspector.
- **#51 Data refresh on stage.** When a data source updates in presenter mode, any `on_data_change` trigger on an animated chart re-fires the animation from frame 0. The data refresh is observed via the trigger resolver (§4.6).
- **#53 What-if sliders.** Sliders can drive `on_data_change` triggers; dragging a slider replays animations bound to the affected fields.

### 10.4 Interactive prototype triggers (section 7)

- **#96 Clickable hotspots.** A click consumed by a hotspot advances navigation; a click trigger on an animation only fires if the click is not consumed by a hotspot on the same element (the binding UI prevents double-binding; see §1, feature #88 edge cases).
- **#97 Branching presentations.** A `on_click` trigger on a slide-level animation advances one step; a hotspot on the same element can override the trigger to advance to a different slide. The trigger resolver picks the higher-priority binding.
- **#99 Component states & interactions.** Hover/pressed/toggled component states are evaluated before `on_hover` triggers fire — if the component is in the `pressed` state, hover triggers are suppressed.

### 10.5 Presenter overlays (section 9)

- **#128 Live annotation tools.** When the presenter uses spotlight/zoom lens, animated elements beneath the lens remain visible and continue to animate; the lens is a non-destructive overlay.
- **#129 On-the-fly slide reordering.** Reordering updates the `transitions` table (rows whose `from_slide_id` or `to_slide_id` change are dropped or re-created). Cached magic-move pairs for affected slide pairs are invalidated.
- **#134 PiP presenter camera bubble.** Camera bubble motion is rendered above the slide root and never intersects the animation timeline; the player reserves the topmost z-band for the bubble.
- **#205 Presentation state timeline.** Every animation `trigger.fired` event is recorded, so a meeting replay (feature #205) shows precisely which animations played and when.

### 10.6 Sharing scroll-linked animations (section 11)

- **#155 Deck-as-a-web-page.** The shared web player mounts the same `TimelineEngine`; animations authored in editor mode play in the web player.
- **#156 Scroll mode.** Scroll-linked animations (§1, feature #90) are enabled only in scroll mode; in classic slide mode they degrade to `on_enter` with a console info log.
- **#158 Per-link content control.** A shared link can suppress animations entirely (`reduced_motion_settings.mode = 'always_reduced'` override at the link level), useful for bandwidth-constrained viewers.
- **#163 Video export.** A "video export of full deck" shares the per-slide export pipeline (§4.8); per-slide triggers fire in order so the exported video plays the deck end-to-end as a presenter would.

---

## Appendix A — Out-of-Scope / Non-Goals

- **3D animation authoring (camera keyframes, exploded views).** Covered by section 5 (features #65–#74); this section does not extend animation authoring into 3D scenes.
- **Lottie/Rive state-machine authoring.** Section 5 (feature #79) handles importing; this section does not provide a Lottie editor.
- **Physics playground.** Feature #71 is a one-off authoring surface; this section does not provide a free-form physics sandbox.
- **AI-generated animations.** AI generation of animation graphs (feature #112, #121) lives in section 8.

## Appendix B — Open Questions

1. Should the per-deck `max_animation_duration_ms` cap (referenced in §1, feature #91 edge cases) live on `reduced_motion_settings` or as a separate workspace setting? **Proposed:** separate `workspace.animation_policy` table to keep reduced-motion semantics pure.
2. Should scroll-linked animations in the editor preview match the web-player experience exactly, or is a "scrubbed in editor" mode acceptable? **Proposed:** editor uses scrubbed preview at any zoom; web player uses scroll-driven.
3. GIF encoder choice: client-side `gifenc` (faster, smaller files, no server round-trip) vs. server-side `ffmpeg` (higher quality, larger files). **Proposed:** server-side for v1 to keep client bundle small.

## Appendix C — Glossary

- **Track** — one property's keyframe list (e.g., `transform.x`).
- **Keyframe** — a single timed value on a track.
- **Easing curve** — a function mapping animation progress `[0,1]` to value progress (often `[0,1]` but may overshoot).
- **Trigger** — the event that starts an animation (`on_click`, `on_enter`, etc.).
- **Magic move** — a transition where matched elements tween between slides.
- **Reduced motion** — the user's accessibility preference for minimal animation.
- **Stagger** — uniform delay between successive elements in a group.
- **Scroll-linked** — a track whose progress is bound to scroll position rather than wall-clock time.

---

_Document path: `/home/daiyaan2002/Desktop/Projects/domio/docs/animation-transitions.md`_
_Source files (unchanged): `/home/daiyaan2002/Desktop/Projects/domio/feature-list.md`, `/home/daiyaan2002/Desktop/Projects/domio/pre-development-planning-guide.md`_