# Section 7 — Prototyping & Interactivity (Features #96–#107)

> **Scope of this document.** This file is the pre-development planning record for the "Prototyping & Interactivity" layer of Domio — the Figma-prototype grade runtime that turns a non-interactive deck into a clickable, branching, variable-driven experience with embedded calculators, device frames, user-testing telemetry, and deep-linkable state.
>
> Source material: `feature-list.md` lines 113–127 (features #96–#107) and `pre-development-planning-guide.md` (sections 1–12). No source files were modified. This document does not commit.

---

## 7.0 Section Overview

Section 7 takes a presentation off the rails and onto an *interaction graph*. Where sections 1–6 give us a static + animated canvas and section 4 gives us live data, this section introduces a **runtime** that:

1. makes any element addressable as an input or output (hotspots, form inputs, calculators),
2. lets the deck author describe **state** (variables, conditional rules, branching graphs),
3. lets the deck author **simulate external surfaces** (device frames, embedded apps) inside a slide, and
4. makes every one of those interactions **observable and replayable** (prototype user testing, deep-linked state).

Everything in this section builds on top of and is constrained by:

- **Section 1** (Core Editor) — hotspots must edit on top of the same shape/coordinates/selection model as every other element.
- **Section 2** (Smart Components) — component states and props (#25, #99) are the canonical way to express element-level interaction state (#99).
- **Section 4** (Live Data) — scenario manager (#57), cross-chart filtering (#52), and what-if sliders (#53) are the data-path cousins of the variable engine defined here.
- **Section 5** (Live App Embeds #81) — the iframe-sandbox runtime is reused for the device-frame surface (#103).
- **Section 6** (Animation) — per-element triggers (#88) are how interactions start animations, and timing rules here tie back to the animation evaluator.
- **Section 8** (AI Copilot) — AI prototype generation (#108, #111–#114) consumes the prototyping schema as its target representation.
- **Section 9** (Presenter Mode) — the prototyping runtime is also the runtime used *during* a live presentation; deep links (#107), scenario state (#57), and form/calculator inputs (#101, #102) are all replayable presenter-mode artifacts.
- **Section 12** (Analytics) — telemetry from the prototype user-testing mode (#104) and A/B testing (#173) feed into the analytics layer.
- **Section 16** (Agentic) — every prototyping feature must be addressable via MCP (`get_deck_state`, `run_scenario`, etc., #222) and patchable via the natural-language patch API (#234).

**Non-goals for this section:**
- Authoring 3D interactions (#65–#74) — those live in section 5's runtime; we only *consume* their inputs (e.g., a hotspot tap can start a 3D animation).
- Live audience participation (#142–#154) — those features reuse the **variable store** and **conditional rule engine** defined here, but the audience transport (QR join, polling) is out of scope for this section.
- Authoring/exporting interactive content as standalone apps — that is a section 11 (publishing) concern.

---

## 7.1 Feature-by-Feature Mapping (#96–#107)

Each feature is documented as: **Purpose / Acceptance Criteria / Behavioral Details / Edge Cases / Cross-section ties.**

### #96 — Clickable hotspots and links between any slides (non-linear navigation)

**Purpose.** Allow any element (or any region not covered by an element) on any slide to act as a tap target that navigates to another slide — or to any arbitrary URL, overlay, or interaction — at presentation time. This is the foundational non-linear navigation primitive that every other feature in this section depends on.

**Acceptance Criteria.**
- The editor exposes a "Hotspot" tool in the layers panel; selecting it lets the author draw a rectangle, ellipse, or polygon on top of any element or on empty canvas.
- A hotspot stores: `{ id, slide_id, shape, geometry, target_type, target_ref, transition, gesture_mask }` where `target_type ∈ { slide, overlay, url, interaction }`.
- Tapping the hotspot during a prototype / presentation / preview advances the runtime's `activeSlideId` to the target, or triggers the specified overlay/URL/interaction.
- A hotspot respects the editor's element ordering: a hotspot drawn "behind" an element is occluded by it and thus untappable; a hotspot drawn "in front" occludes the element's own click affordance.
- Hotspots are visible in the editor at all zoom levels ≥ 25%, with a distinct color/style per gesture type (click, hover, press, long-press), and toggleable visibility.
- Every hotspot survives **deck branching + merge** (#19), **deck inheritance** (#212), and **auto-updating shared slides** (#186) by stable ID; new hotspot IDs must be allocated in a content-addressable namespace (`hs.<base36-slide>.<base36-counter>`).
- Every hotspot can be addressed via MCP (`#222`) for surgical edits by an agent (`slide[3].hotspot[cta_pricing]`).
- Branching navigation respects a **flow graph** that the author can inspect (#6's layers panel + a separate "Connections" panel), with cycle detection (see §7.3.3).

**Behavioral Details.**
- Hotspot drawing is bound to the same coordinate space as the slide frame. For responsive constraint rule variants (left/right/center pinned, top/bottom pinned, scale, etc., #8), the hotspot geometry is stored in *normalized* coordinates (0–1 on width/height) and resolved at runtime against the rendered frame's actual rect.
- A hotspot supports multiple gestures: `onClick`, `onDoubleClick`, `onLongPress`, `onHoverEnter`, `onHoverExit`, `onPress`, `onRelease`. Each can have a different `target_type` (so a hover can preview an overlay while a click commits navigation).
- Hotspot transitions reuse the slide transition vocabulary from #91 (fade, push, morph, instant). For "morph" between slides where shared element IDs exist, #86 (magic move) is the actual transition.
- When a hotspot targets a slide that is later deleted, the runtime logs a `warn`, marks the hotspot as `dangling: true`, and on the next editor session the author is shown a "Broken connection" panel to fix.
- Smart components (#25) can expose a "host-able" prop that auto-generates a hotspot over their bounds when dropped onto a slide.

**Edge Cases.**
- A hotspot fully contained inside a hotspot (nested) — supported; innermost hotspot wins on tap. Authoring surface warns when nesting.
- Tap target too small (< 44×44px at runtime resolution) — editor warns (accessibility, see §7.8).
- Hotspot on a slide with `display_condition` that evaluates false — hotspot is invisible and non-interactive.
- Hotspot with a cycle in the navigation graph — the runtime uses a visited-set (see §7.3.3) and will not infinite-loop.
- Hostspot on a constrained element where the bound retargets during responsive scaling — geometry is recomputed at runtime from normalized coords.
- Hotspot overlapping an animated element (#88) — the hotspot's hit region expands to encompass the element's animation bounding box but does not consume pointer events during in-flight transitions.
- Hotspot on a slide with a `device_frame` (#103) — taps are routed to the frame's simulated input layer, not the hotspot layer.

---

### #97 — Interactive branching presentations ("which topic first?" audience choice changes the path through the deck)

**Purpose.** Make the deck's narrative *non-deterministic at runtime*. The author defines a directed graph over slides; the runtime resolves the next slide based on (a) explicit author wires (hotspots from #96), (b) conditional logic (#100), and (c) runtime events.

**Acceptance Criteria.**
- Every slide has an `entry_conditions` list and an `exit_targets` list. `entry_conditions` is evaluated before the slide is shown; if any condition is false, the slide is skipped.
- The author's "Connections" panel shows a graph view: nodes are slides, edges are hotspots/conditional links. Graph view supports cycle highlighting.
- The runtime supports **starting slides**: a deck has at least one slide marked `is_start: true`; multi-start decks ("choose your path" homepages) work out of the box.
- The runtime supports **multiple end states**: a deck can have `is_end: true` on any number of slides; reaching an end during a presentation stops the transition engine.
- Branching can be **deterministic** (author wires everything explicitly) or **conditional** (variable-driven, see #100). The same deck can mix both.
- A "Replay with deterministic seed" mode (using the prototype session recorder from #104) lets researchers re-walk a path.

**Behavioral Details.**
- The slide graph is internally represented as an adjacency list: `slide.graph = { outgoing: [edge], incoming: [edge] }`, where edges are exactly the hotspots + conditional rules that target a given slide + animations that branch.
- "Which topic first?" choice pattern: an "index" slide with N hotspots, each pointing at one branch. The runtime enters `path_tracking` mode where a `path_stack` records every transition. The stack is queryable from MCP (`get_path_state`) and visualizable in the prototype session replay.
- The runtime supports a "skip if not yet visited" condition operator — prevents backtracking into an already-visited branch (useful for "scavenger hunt" training decks).

**Edge Cases.**
- Multiple `is_start: true` slides with conflicting default opening — author must mark exactly one as `default_start`; the Connections panel warns when more than one is true and none is default.
- A slide that no edge points to (`is_island: true`) — reachable only via direct deep link (#107) or as the explicit start.
- A cycle in the branching graph — cycle detection (§7.3.3) raises an editor warning; runtime caps traversal to ≤ N hops per session to prevent infinite loops.
- Conditional branches that, under the active scenario (#57), all evaluate false — runtime falls through to a configurable `fallback_slide_id` or the slide the author has wired as `default`.
- Branching during presenter mode (#126) — presenter's "next slide" controls follow the deck graph; an audience-facing poll result (#148) can dynamically insert a slide into the graph at runtime.

---

### #98 — Overlay states (modals, tooltips, drawers inside a slide)

**Purpose.** Let a slide host *secondary surfaces* (modal dialogs, slide-out drawers, hover tooltips, popovers) that share the slide's coordinate space and lifecycle but are not full slide transitions. Overlays are how product mockups show "click → menu opens" without leaving the slide.

**Acceptance Criteria.**
- Overlay types: `modal`, `drawer_left`, `drawer_right`, `drawer_top`, `drawer_bottom`, `tooltip`, `popover`, `lightbox`, `snackbar`, `fullscreen_panel`. Author picks from a preset library or defines a custom container.
- An overlay is a **child of a slide** in the data model (§7.5), with its own list of elements copied/cloned from the slide (or referenced via a smart component variant, #25).
- Overlays open and close on runtime events (hotspot click, hover, variable change, form submission, timer).
- Open/close animations use the section 6 transition vocabulary (#91); modal default is scale+fade; drawer default is slide-in; tooltip is fade only.
- Multiple overlays per slide are supported; an `overlay_stack` tracks the active overlay chain (z-order is `last-opened-on-top`).
- Body scroll lock when a modal/lightbox is open; focus trap + return focus to invoker on close (accessibility per §7.3.7).

**Behavioral Details.**
- Each overlay declares: `{ id, slide_id, type, anchor, size_strategy, open_trigger, close_trigger, dismissable, backdrop, aria_label }`.
- `anchor` can be a hotspot (#96), a slide element, or absolute coordinates.
- `size_strategy ∈ { fixed, auto, slide_percent, content_fit }` controls how the overlay sizes to its container.
- The runtime maintains an **`overlay_stack`** scoped to the current slide, separate from the slide-to-slide navigation stack (#97). This means: opening an overlay does *not* reset the presentation's place in the branching graph; closing the overlay returns to where you were.
- Closing behavior: `dismissable: true` allows backdrop/escape click; `dismissable: false` requires an explicit close trigger.
- Overlays can also be **persistent** (`persistent: true`): once opened they remain open across slide transitions (e.g., a global "speaker notes" panel visible across an entire section).

**Edge Cases.**
- An overlay triggered to open while already open — author can specify `replace_existing` (default true) or `stack`.
- An overlay referencing an element that has been deleted — overlay renders with a placeholder; runtime warns on hover.
- A persistent overlay surviving a deep link (#107) that targets a slide where the overlay wouldn't normally be — the deep-link state serializer (§7.4.9) records that the overlay was forcibly open, restoring it on the target slide.
- Modal opened from inside another modal — supported up to a max depth (configurable, default 5) to prevent UX death-spirals.
- Tooltip overlap — runtime picks the most-recently-opened tooltip and queues others, or runs a layout policy (`flip`, `shift`, `clamp`).

---

### #99 — Component states & interactions (hover, pressed, toggled) for product mockups

**Purpose.** Bring Figma-grade interactive component state definitions into Domio. A "Button" component has hover, pressed, focused, disabled, loading, toggled-on, toggled-off variants; tapping a button on a slide flips its state at runtime, which in turn drives conditional logic (#100) and animations (#88).

**Acceptance Criteria.**
- Every component instance exposes a **state machine** (declared in the component definition, #25). States include at minimum: `default`, `hover`, `pressed`, `focused`, `disabled`, `loading`, plus any component-specific states (`toggled_on`, `expanded`, `collapsed`, `selected`, etc.).
- The state machine is a directed graph: `{ states: [...], transitions: [{ from, event, to, condition? }] }`. State transitions fire `onTransition(prevState, nextState, payload)` events that the variable store (#100) can subscribe to.
- State changes trigger: (a) variant swap (the canonical variant for the new state is rendered), (b) animation playback (#88), (c) variable updates, (d) overlay open/close (#98), (e) navigation (#96, #97).
- The editor's layers panel shows the *current state* of any component instance when the prototype runtime is in `pause_and_inspect` mode.
- State transitions are replayable in the prototype session recorder (#104).
- Components marked `brand_locked: true` (#36) can have their state machine locked too — a junior cannot redefine state transitions on a brand-locked button.

**Behavioral Details.**
- Underneath, #99 extends the smart-component prop system (#25) with a `state` derived prop that is computed from the state machine plus the user-controlled props (`disabled`, `loading`, etc.).
- An instance's state is **session-scoped** by default (resets on every slide enter unless `persist_instance_state: true`), or **deck-scoped** (persists across slide transitions), or **persistent-session** (persists across the entire presentation/prototype session, serialized in deep links, #107).
- States can be **bound to a variable** so that toggling one button toggles a master variable and updates every related component instance (see #100 conditional logic).
- "Pressed" is implemented as a transient sub-state of `hover` with `pointer_down: true`. "Focused" is set by tab-key navigation.
- The `loading` state typically holds a spinner and is conditional on a `data_source_state != 'ready'` from #48.
- Disabled interactions: when a component instance is `disabled`, all its gestures are inert; the runtime skips the transition evaluator for that instance.

**Edge Cases.**
- Two state transitions fired on the same tick (e.g., hover enter + click) — the higher-priority event wins; resolved by a documented precedence order (focus > press > click > hover > default).
- State transition A→B→C where B is deleted by the author mid-session — runtime falls back to the default state with a console warn.
- An animation (#88) bound to a state transition on an element whose state changed faster than the animation duration — animations are interruptible; new state replaces the in-flight animation's target.
- State machine with no transitions out of `loading` — runtime forces `loading → default` after a configurable timeout (default 30s) and surfaces a "Stuck in loading" diagnostic.

---

### #100 — Variables & conditional logic ("if toggle = annual, show annual pricing")

**Purpose.** Provide a typed, reactive variable store and a safe conditional rule evaluator that gates what is *visible*, *enabled*, *bound*, and *navigated to* at runtime. This is the brain that turns a static deck into a true interactive experience.

**Acceptance Criteria.**
- Variables are **typed**: `string`, `number`, `integer`, `boolean`, `enum`, `date`, `datetime`, `array`, `object`, `record<T>`. Numeric values use `decimal128`-equivalent precision; calculations are deterministic.
- Variables have a **scope**: `deck`, `slide`, `component_instance`, `session`, `viewer`. See §7.3.1.
- Variables can be `read_only` (set by the runtime/data source/component), `read_write` (editable by the viewer), or `private` (server-only, never exposed to the runtime).
- A **conditional rule** has the form `{ id, condition: expression, action: { type, target, params }, priority }` where actions include `show`, `hide`, `enable`, `disable`, `set_variable`, `navigate_to`, `play_animation`, `submit_form`, `open_overlay`, `close_overlay`.
- Rules are evaluated in `priority` order (highest first), short-circuit on `true`.
- Bound element props update **reactively** (re-render only when their binding's value changes).
- Rule editor exposes a `safe expression builder` — no raw JS eval; see §7.3.2.
- Variables and rules are addressable via MCP (#222) for agent-driven updates and can be patched via #234's natural-language patch API.
- Variables are persisted to deep-link state (#107) and to prototype session telemetry (#104) (but with viewer-scoping respected, §7.3.1).

**Behavioral Details.**
- The variable store is the **single source of truth** for runtime state. Element bindings are derived from it. See §7.4 for architecture.
- A binding is `{ source: variable_id | formula, target: element_id, prop: 'visible'|'enabled'|'text'|'value'|... }`.
- Variable updates are **event-driven**: `onVarChange(id, oldVal, newVal)` fires *only* if the value actually changed (`Object.is` semantics), and dependents are notified in topological order to avoid cyclic re-evaluation.
- Formulas are a strict subset of arithmetic/string/comparison: `$x * 1.08`, `concat($firstName, ' ', $lastName)`, `$count > 0 and $status == 'open'`. No closures, no globals, no I/O, no function calls except a small builtin library (`round`, `floor`, `ceil`, `abs`, `min`, `max`, `clamp`, `if`, `coalesce`, `length`, `match`, `formatNumber`, `formatCurrency`, `formatDate`).
- Every variable update produces an entry in the prototype session telemetry stream (#104) — except for private or session-only variables when telemetry is "anonymous" mode.

**Edge Cases.**
- A binding to a deleted variable — element renders with a default value and `binding_status: 'dangling'` warning.
- A circular binding (A's value depends on B's, B's on A's) — detected at validation time (cycle in dependency graph) and rejected.
- A formula that throws at runtime (divide by zero, NaN, type mismatch) — element renders the last good value; runtime logs `formula_eval_error`; user sees an inline "calculation error" badge if visible-bound to text.
- Multiple rules targeting the same action with conflicting decisions (`show` then `hide`) — priority-resolved; ties broken by rule creation order.
- Variable value exceeds type range (number too large for `integer`) — runtime clamps to type range or coerces per documented type-coercion rules.
- Conditional rule referencing a variable from a **different deck** (cross-deck import via shared components, #186) — supported, but read-only and tagged with the source deck ID.

---

### #101 — Form inputs inside slides (text fields, dropdowns, sliders) feeding variables

**Purpose.** Make slides collect structured input from viewers/audience — text fields, dropdowns, multi-select, radio groups, checkboxes, sliders, date pickers, file uploads, signature fields, rich-text editors. Each input writes into a typed variable (#100), which in turn drives the rest of the runtime.

**Acceptance Criteria.**
- Input types: `text`, `textarea`, `rich_text`, `number`, `integer`, `currency`, `percent`, `slider`, `date`, `datetime`, `time`, `dropdown`, `multiselect`, `radio_group`, `checkbox`, `boolean_toggle`, `file_upload`, `signature`, `rating`, `color`, `address`.
- Every input has: `{ id, label, placeholder, help_text, default, validation_rules, bound_variable_id, scope, persist, sanitizer }`.
- On user input, the form writes to `bound_variable_id` after **debounced validation** (defaults: 250ms for text, 16ms for sliders).
- Inputs validate per §7.3.4. Failed validation shows inline errors; submit is blocked until required fields pass.
- Supports `autofill` from the prototype test session (#104) for replay/debug; `autofill` blocked for production users unless explicitly allowed.
- File uploads stream into the deck's asset library (#185) with virus scanning and content-type enforcement.
- All form values are scoped per §7.3.1 and serialized into deep-link state (#107) as appropriate.
- Inputs render as accessible: visible label, aria-describedby for help, `aria-invalid` on validation failure, keyboard-navigable.

**Behavioral Details.**
- A "form" in this context is a logical grouping: an author can name a `form_id` and explicitly "submit" it (which can fire a conditional rule, a telemetry event, a network request, or an A/B test bucket assignment).
- Unsubmitted inputs are still read into variables immediately on change (live-binding); submitting is for grouping / network calls / final validation.
- Date pickers respect locale (§11 of pre-development-planning-guide: i18n matters); Bangla, English, and 100+ other languages (#113).
- File uploads with `max_size: 5MB`, `allowed_types: ['image/png','image/jpeg','application/pdf']`, scanned before storage.
- Rich-text editor supports a sanitized markdown subset (no raw HTML, no script, no iframe).

**Edge Cases.**
- Text overflow on a fixed-width input — inputs grow to content within a max width, then scroll.
- Input receives an out-of-range value via paste — sanitizer/coercion applied; validation triggers.
- Network failure on file upload — input shows retry UI; partial uploads resumable.
- Two viewers concurrently editing the same shared form in a co-presenting session (#213) — last-write-wins per field with optimistic UI; conflict surfaced as a "merged with edit" toast.
- Anonymous users filling forms on a public deck (#155) — writes go to a session-scoped variable, then optionally submitted to a server-side collector if the deck author enables it.

---

### #102 — Embedded calculators (ROI calculator slide that prospects can use live)

**Purpose.** Provide a sandboxed calculator runtime that can be embedded into a slide as if it were a single "Calculator" component. Authoring mode defines inputs and a formula/calculation graph; runtime mode lets the viewer drag sliders / type numbers and see live results.

**Acceptance Criteria.**
- A `calculator_def` is a DAG of `input_nodes`, `formula_nodes`, `output_nodes`, and `aggregation_nodes`. Variables (#100) are the binding layer.
- Numeric precision: **decimal128-equivalent** (38 digits, configurable up to 12 shown) to avoid floating-point drift. See §7.3.5.
- Calculator **safety**: every formula is sandboxed (§7.4.7). No external calls, no globals, no eval.
- Visual presentation: inputs laid out per a templated form; outputs rendered as numbers, charts (reusing #49–#50 chart types), or callout cards.
- Calculator steps are replayable (#104) — every slider drag is a recorded event.
- "Save my calculation" produces a deep link with the calculator state serialized (#107).
- `reset`, `copy_to_clipboard`, `email_results`, `export_pdf` are first-class calculator actions.

**Behavioral Details.**
- Two authoring modes:
  - **Form mode:** inputs and outputs, with one or more formulas linking them. Sufficient for 80% of cases (ROI, TCO, savings).
  - **Graph mode:** author connects input nodes to calculation nodes to output nodes visually. For complex calculators (multi-stage, e.g., "developer time saved" × "loaded salary" × "headcount").
- Aggregations available: `sum`, `avg`, `count`, `min`, `max`, `weighted_avg`, `cagr`, `npv`, `irr` (Newton-Raphson, bounded), `payback_period`.
- Charts in calculators reuse the full chart vocabulary (#50) with their data source bound to the calculator's outputs.
- Outputs are "live" in the sense that *every* change to any input recomputes only the affected downstream nodes (DAG-based recompute), bounded by a per-frame budget (default 5ms).

**Edge Cases.**
- A formula that overflows standard `double` — uses `decimal128`; if even that overflows, clamps to `±Infinity` markers with explicit UI "value out of range, reduce inputs."
- Slider values dragged beyond min/max — clamped; runtime warns authors if they set min > max at validation time.
- Negative IRR — handled (no sign change ⇒ no IRR; user sees "no IRR in range").
- Currency rounding for display — uses `formatCurrency` with locale-aware rounding half-to-even (banker's rounding) to avoid bias.
- A circle in the calculation DAG — author-time validation (cycle detection); runtime never executes.
- A user pastes a billion into a "team size" input — typed coercion clamps to `integer` maximum; UI shows red invalid state until corrected.

---

### #103 — Device frames (present a mobile app flow inside an iPhone frame with working taps)

**Purpose.** Author a slide that hosts an *iframe-style* rendering of a UI inside a phone/tablet/desktop/watch/TV frame, complete with simulated taps, swipes, and OS chrome. Lets a salesperson put a real product click-through inside the deck.

**Acceptance Criteria.**
- Frame presets for: iPhone (multiple generations), iPad, Apple Watch, Android phones (Pixel/Samsung), Android tablets, MacBook, Windows laptop, Apple TV, generic desktop browser, custom-resolution frame.
- The author configures: device type, chrome (notch, status bar, time, battery, signal), orientation (portrait/landscape), screen size, content source (deck slide reference or external URL via #81), safe-area insets.
- Simulated input: tap, long-press, swipe (4 directions + multi-finger), pinch, rotate, home button, back button, recent apps, hardware keyboard.
- Frame coordinates are **normalized to the frame's screen rectangle**, not the slide; multi-resolution sources render correctly across orientations.
- The frame participates in hotspot routing (#96): tapping the screen surface forwards the tap into the embedded content as a touch event.
- Overlay support inside the frame (#98).
- Form inputs/calculators inside the frame fully work (#101, #102).
- Device frame state (e.g., currently-displayed app screen) is serializable into deep links (#107).

**Behavioral Details.**
- Implementation is a sandboxed iframe (#81's iframe-sandbox runtime) plus a *simulated pointer event shim* that converts slide-level pointer events into correct touch/click semantics (`pointerdown`/`pointermove`/`pointerup` for the target device's gesture map).
- The device frame is a first-class `element` type with `{ device_type, chrome_state, content_ref, orientation, safe_area }`. Rendered via the same GPU path as other elements (#11), with the iframe composited inside the element's bounding rect.
- "Working taps" means: the iframe receives `pointerdown`/`pointerup` events with the correct coordinates mapped from slide → frame → device screen. We do **not** fake keypresses; we forward them.
- A `simulate_device_tap(x_pct, y_pct)` action exists for use in conditional rules and AI-authored demo flows: the action is identical to a viewer tap in semantics, so the simulator and runtime share one code path.
- During a "device demo" with an external content source (#81), if the source does not load, the frame displays a graceful fallback ("source unreachable").

**Edge Cases.**
- iframe sandboxed — sources that require cookies/credentials beyond what #81 allows are blocked; auth passthrough per #62 and #81 covers dashboards.
- Multi-finger pinch — converted to a `gesturechange` event the consumer app must opt into.
- Frame rotation animation — supports smooth transitions between portrait/landscape via the section 6 transition system.
- Hotspot on a device frame — taps on the frame's bezel (outside the screen rectangle) are *not* forwarded into the iframe; they're available for slide-level hotspot use.
- Frame content cached aggressively for offline presentation (#137); refresh policy configurable.
- High-DPI rendering on 4K presentation hardware — frame renders at the device's native pixel ratio capped at 3x for performance.

---

### #104 — Prototype user-testing mode — share a deck as a clickable prototype and record where viewers click

**Purpose.** Allow researchers and PMs to share a deck in prototype mode (no edit access, full interaction) and capture a stream of telemetry — every tap, scroll, hover, form input, calculator usage, scenario toggle, dropout, completion — that can be replayed and analyzed.

**Acceptance Criteria.**
- "Share as prototype" generates a distinct URL with read-only, fully-interactive access (#157 + #104).
- The recorder captures: `{ session_id, viewer_id (pseudonymous), device, viewport, slide_enter, slide_exit, gesture, target_id, ts, path, var_snapshot }` per event.
- Telemetry is **integrity-protected**: every record carries a monotonic `seq`, an HMAC over payload+seq, and a chained hash so any tampering is detectable (§7.7.4).
- Sessions are replayable as a timeline (similar to #205, "Presentation state timeline" replay), letting the researcher scrub through viewer's experience at speed.
- Recordings can be aggregated into heatmaps by deck element, funneled through A/B tests (#173), and integrated with the analytics platform (#169–#178).
- Privacy controls: opt-in / opt-out per shared link, PII redaction configurable, region-scoped storage (see §7.7.4 and the BD-specific PDPA notes below).
- Recording is sampled by default (configurable to 100%); rates and storage budgets are explicit (§7.8.3).
- Session data can be exported as CSV/Parquet for offline analysis; deletion honored within 30 days per data subject rights.

**Behavioral Details.**
- Telemetry is streamed (chunked, JSON over HTTPS) to a `telemetry_ingest` endpoint, batched per playback session at viewer's session end or at 30-second intervals (whichever comes first).
- **Sampling policy:** by default 100% capture, but configurable per deck to `1/n` to control cost; researcher can mark a study "high fidelity" to opt out of sampling.
- **Pseudonymization:** viewer identifiers are SHA-256(session_salt + viewer_token) — the server never sees raw IP unless the researcher explicitly enables "identify individual viewers" mode.
- **Replay:** the prototype session has a viewer + a serializer + a replayer. The replayer fast-forwards the variable store and overlay stack to the event's snapshot, then plays forward at original or accelerated speed.
- **A/B test support:** if the deck's URL carries a `?variant=A` query param (or the deck is configured for A/B), the recorder tags events with `variant` so downstream analytics can split.

**Edge Cases.**
- Viewer reloads mid-session — session continues with `rejoined_session_id` link; recorder merges telemetry via session token + IP/device fingerprinting (subject to consent).
- Viewer navigates away before the first 250 ms — discarded as a bounce.
- Recorder fails (network partition) — client buffers up to 5MB in IndexedDB, replays on reconnect.
- Telemetry collision (two devices with the same pseudonym) — extremely unlikely given the salt, but if observed, sessions are disambiguated by device fingerprint with a "collision detected" warning shown to the analyst.
- Cross-deck test: a viewer is sent from one prototype URL to another (deep link #107) — telemetry is bridged via a `parent_session_id` so the funnel is preserved.

---

### #105 — Mini-games/quiz mechanics for training decks (drag-to-match, hotspot quizzes)

**Purpose.** Provide first-class training-game primitives so a "team onboarding" deck is a *game* rather than a slideshow. Includes: drag-to-match (connect left-column items to right-column items), hotspot quizzes (mark the region with X), multiple-choice quizzes, ordering puzzles (drag to reorder), fill-in-the-blank, true/false, timed flash cards, "find the answer" reveals.

**Acceptance Criteria.**
- Question types: `multiple_choice` (1+ correct), `multi_select`, `true_false`, `fill_blank` (exact/regex/similarity match), `ordering`, `matching` (drag-to-pair), `hotspot` (click the right region on a slide element), `flash_card` (timed), `short_answer` (LLM-graded).
- Each quiz is a `quiz_def` with `{ id, deck_id, slide_ids, questions: [...], passing_score, max_attempts, randomize, time_limit }`.
- Variables (#100) receive `{ score, attempts, per_question_result, time_per_question }` after submission.
- Score-driven branch (#97): pass → next module; fail → remediation slide.
- Leaderboard per session, per cohort (#146 in section 10; quiz backend is shared).
- Quiz results emit an `xAPI`-compatible statement (`actor`, `verb`, `object`, `result`) for SCORM/LRS integration — important for compliance training (#152, #186).
- Quiz authoring lives in the same authoring surface as every other component; it does not require code.

**Behavioral Details.**
- **Drag-to-match** runtime: HTML5 drag-and-drop with a touch fallback; connections are stored as an `Edge[]` until submitted; on submit they're validated against the canonical matching rule.
- **Hotspot quiz:** a region defined in normalized coords; the viewer clicks somewhere in the slide; the click distance from the region centroid (or polygon point-in-shape test) determines correctness.
- **Fill-blank:** server-grade regex matching or string distance (Levenshtein) for typo tolerance, configurable.
- **Short-answer, LLM-graded:**#108's AI generates a "model answer" + scoring rubric from the deck's content; viewer submission is scored 0–1 with feedback ("close but missing X").
- **Adaptive difficulty:** question pool + per-question-difficulty metadata enables a streaming adaptivity algorithm.
- **Time limit:** enforced server-side (not just client timer); expired quiz auto-submits the current answers.

**Edge Cases.**
- A drag-to-match viewer uses keyboard only — full keyboard alternative (`Tab` to select, arrow keys, `Enter` to confirm) per accessibility §7.8.
- A quiz question references a deleted hotspot — runtime flags `dangling: true` and substitutes a placeholder.
- Multiple attempts with `randomize: true` — the order of answer options shuffles server-side and persists per session.
- A hotspot quiz region overlaps a slide element that itself is hidden by a conditional rule — runtime defers the quiz submit until the rule resolves.
- Concurrent attempts on the same prototype session (e.g., a shared kiosk) — score per session, not per viewer.
- LLM-graded short answer — falls back to a human review queue if the grader's confidence is below threshold (configurable, default 0.7).

---

### #106 — Timed auto-advance sequences with pause/resume

**Purpose.** Provide a "kiosk-mode" timeline so a slide sequence advances by itself (with `interval` per slide, optionally per-element), and is pausable / resumable from any number of control surfaces (the slide itself, a phone remote #127, presenter mode #126, a quiz answer, etc.).

**Acceptance Criteria.**
- A deck can declare a `sequence` of slides with `interval_ms`, `pause_on_event`, `loop`, `count`, `interruption_policy`.
- `pause_on_event` can be `interaction`, `hover`, `audio_playing`, `video_playing`, `scroll`, `navigate`, or any custom event.
- Pause/resume is first-class state and is serialized into deep links (#107) and prototype sessions (#104).
- Accessibility: a "Reduce motion" or "Pause for me" affordance must be visible at all times; auto-advance must respect `prefers-reduced-motion` (#93).
- Per-slide overrides: an individual slide can override the sequence's interval.

**Behavioral Details.**
- Implementation: a `timeline_runtime` that tracks `{ current_idx, current_started_at, paused_total_ms, paused_at_ms, last_resumed_at_ms }`.
- `loop` semantics: when true, sequence restarts at slide 0 after `count` cycles (default infinite; configurable max cycles).
- `interruption_policy ∈ { ignore, queue, abort }` — what happens if a hotspot fires mid auto-advance: ignore (next auto-tick), queue (run after auto-advance would have fired), abort (kill the timer and use the manual target).
- **Reduced motion handling:** `prefers-reduced-motion: reduce` → auto-advance defaults to off; intervals are user-controllable; sequence disabled unless explicitly opted-in by the author.

**Edge Cases.**
- Browser tab is backgrounded mid-sequence — clock is paused (`document.hidden` listener) and resumed on visibility; alt: server-side ticks via a "ghost clock" sent during reconnect.
- A user pauses, makes a hotspot tap (#96), then resumes — the slide that was displayed at pause time is what they resume to, with `paused_total_ms` correctly accumulated.
- Multiple timers (one sequence on slide-level, one on element-level animation, #88) — single timeline source of truth; element timers derive from the sequence.
- A timer-watcher service in the runtime warns if a sequence has been paused longer than `pause_warn_at_ms` (default 30 min), in case it's "stuck" — usable for trade-show kiosks (#218).
- A timer-initiated navigation fires while a form is half-filled (#101) — form is auto-saved to session-scoped variables per the form's `autosave_on_advance` policy.

---

### #107 — Deep-linkable slide states (a URL that opens slide 7 with the "Bear case" scenario active)

**Purpose.** Make every meaningful runtime state reachable via a URL, shareable as a link, and restorable on open. This is the unit of "send to a colleague" for prototypes and live presentations.

**Acceptance Criteria.**
- A deep link has the shape: `https://<deck-host>/d/<deck_id>?state=<encoded>` or `/d/<deck_id>/<slide_id>?<query>` (short form for trivial cases).
- The `state` payload encodes: `slide_id`, `path_stack` (#97), `overlay_stack` (#98), `variable_snapshot` (variables in scope, scoped-filtered, viewer-allowed subset), `device_frame_state` (#103), `scenario` (#57), `cursor_focus` (for resumption), `form_drafts`.
- State encoding uses a **compact, signed, base64url** format (`bse.sign(state).compact_payload`), with HMAC for tamper detection and an embedded `exp` for expiry (§7.4.9).
- Two forms: **anonymous** state (no viewer identity, expirable) and **authenticated** state (binds to a viewer, refresh token).
- A short-form URL uses a server-side `deep_link_id` stored in the DB; long-form encodes inline.
- Resolving a deep link involves validating signature, expiry, scope, fetching the deck (or cached copy), and restoring state before first paint.
- Resolution latency budget: 95th percentile ≤ 300ms for in-region viewer, ≤ 800ms for cross-region (see §7.8.5).
- Visible UI: a "Resuming from your last session" toast appears for ≤ 1.5s when state is restored.

**Behavioral Details.**
- **Encoder** (`encode_state(deck_ctx, viewer_ctx, runtime_state)`): produces an opaque token that any compatible client (web, mobile, embedded) can decode.
- **Decoder** (`decode_state(token, viewer_ctx)`): validates signature, scopes the variable snapshot to the current viewer (i.e., strips private/session-only/other-viewer-scoped variables from a link meant for someone else), merges with current viewer context, and prepares the runtime for first paint.
- **Link shortener** `link_svc.shorten(long)` returns a short id, stored server-side, optionally TTL'd.
- **State authority:** the URL is *one* source of truth for "where the viewer should land." When the runtime diverges from the URL state (because the user's local state is newer), policy decides: by default, the link wins unless the user explicitly chose "continue locally."
- **Sharing intent:** when a user clicks "Share current state," the runtime grabs the current runtime state and produces a token via the encoder; the user can then paste into Slack, email, or QR. QR rendering leverages section 9 presenter-mode remote.

**Edge Cases.**
- **Token tampering** — HMAC fails on decode; runtime refuses to apply; opens deck at its default start instead.
- **Expired token** — runtime offers "this link expired, retry at default" with the reason.
- **Variables present in the snapshot but not allowed for the current viewer** — stripped silently with a warn log; the URL looks valid but the viewer's scope filters it.
- **Deck changed since the link was created** (slide deleted, hotspot removed, variable renamed) — runtime applies best-effort: removes missing elements, falls back to `default_slide` if the target is gone; surfaces a "Some elements have changed" banner with a "go to current version" button.
- **Anonymous vs. authenticated mismatch** — token meant for anonymous users but the viewer is signed in: the URL's *intent* (which scenario, which slide) is honored; viewer-scoped variables are taken from the viewer's session, not the URL.
- **Pasting a link into a viewer with cookies blocked** — link works, but only restores the *anonymous* subset of state.

---

## 7.2 UX Flows

This subsection walks through end-to-end user flows the prototyping runtime must support. Each flow is described as: **trigger → sequence → success state → failure / edge state.**

### 7.2.1 Drawing a hotspot on a slide

1. User selects the **Hotspot** tool from the toolbar.
2. Cursor changes to a crosshair; user drags a rectangle (or draws a polygon/ellipse) on top of an element or empty canvas.
3. On release, the **Hotspot properties** side panel opens to configure:
   - Target type (Slide / Overlay / URL / Interaction),
   - Target reference (slide picker / overlay picker / URL field / interaction type selector),
   - Gesture(s) enabled (click, double-click, long-press, hover),
   - Transition type & duration.
4. **Validation** runs: target exists, geometry is ≥ 44×44px (or author acknowledges the accessibility warning), no shape conflicts.
5. Hotspot is committed to the deck. Visible as an outline in the editor at the configured style/color. Listed in the new **Connections** panel.
6. **Save** is automatic (#22). The hotspot is now addressable via MCP (`slide[N].hotspot[id].target`).
7. Failure: if the target does not resolve (deleted slide, malformed URL), the hotspot is rendered with a red border + warning label, and the **Connections** panel flags it as broken. The user is offered a one-click fix ("rebind" / "remove").

### 7.2.2 Setting up branching logic

1. Author opens **Connections** panel (Cmd/Ctrl+Shift+K, or via command palette #13).
2. Switches to **Graph view** — slides appear as nodes, edges as wires.
3. Author drags from a hotspot on slide A to slide B; a new edge is created (or, if a hotspot already targets B, the edge is highlighted).
4. Author selects an edge and edits its **condition** in the side panel:
   - No condition (always fires) — default;
   - Or `if <variable> <op> <value>` using the safe expression builder (#100).
5. Author clicks **Validate graph** — cycles, unreachable slides, dangling edges are surfaced.
6. Author adds a `fallback_target` for edges whose conditions can all be false.
7. Author presses **Preview** → the prototype runtime simulates the path with a labeled variable inspector so the author can play through every branch.
8. Failure: an edge is in a cycle — author is shown a "Cycle: A → B → C → A. Pick one to remove" prompt. The runtime cannot iterate past `max_hops_per_session` (default 100) regardless.

### 7.2.3 Configuring conditional variables

1. Author opens the **Variables** panel (sidebar) and clicks **+ New Variable**.
2. Names it (`pricingTier`), selects type (`enum`), scope (`deck`), default (`monthly`).
3. Drops a **Toggle** component on slide 3 bound to `$pricingTier`; configures the toggle's `options: [monthly, annual]`.
4. Adds a **Conditional Rule** (`if $pricingTier == 'annual'` → `show` slide element "annualPricing").
5. Uses **Preview** mode to toggle the switch and verify slide element visibility.
6. **Schema check** runs at save: the expression compiles, references valid vars, doesn't cycle with other bindings.
7. Failure: the expression references an undefined variable — runtime highlights with a red squiggle in the rule editor, refuses to save until fixed.
8. **AI assist:** #108/AI Copilot can also generate variables/rules from natural language (e.g., "create a variable that tracks user's plan and toggle visibility of the discount banner based on whether they have ≥10 seats").

### 7.2.4 Building an ROI calculator slide

1. Author inserts a **Calculator** component onto a slide.
2. Picks "Form mode" in the calculator wizard; names inputs:
   - `team_size` (slider, 1–500, default 10, step 1),
   - `loaded_salary` (currency, $50k–$300k, default $120k),
   - `hours_saved_per_week` (number, 0–20, default 4),
   - `weeks_per_year` (number, default 50).
3. Names outputs:
   - `annual_savings` = `$team_size * $loaded_salary / 2080 * $hours_saved_per_week * $weeks_per_year`,
   - `five_year_savings` = `$annual_savings * 5`.
4. Charts are auto-bound: author picks a "savings over time" chart, points it at `$annual_savings` — chart rebinds automatically.
5. Author toggles **Preview** — drags inputs, watches charts update in <16ms.
6. Author adds a **"Save my calculation"** button — clicking it produces a deep link (#107) that fully restores the calculator state.
7. Failure: a formula references an undeclared input — calculator wizard flags with "red input"; cannot publish.

### 7.2.5 Simulating device-frame taps

1. Author inserts a **Device Frame** component onto a slide, picks `iPhone 15 Pro`, `portrait`.
2. Author points the frame at an existing deck slide (or an external URL via #81); the frame renders the screen inside the bezel.
3. Author adds a hotspot covering the iPhone screen; configures target as **"simulate_device_tap(x_pct=50, y_pct=30)"**.
4. Author switches to **Prototype preview**; taps the hotspot.
5. Runtime maps the hotspot tap to a `pointerdown`/`pointerup` pair at coordinate (50%, 30%) of the device screen; the embedded content receives the same touch event as a real device tap.
6. **State capture:** if the embedded content changes (e.g., moves to a new screen of the embedded app), the frame's `device_frame_state` is updated and saves into a variable binding.
7. Failure: the iframe does not load — fallback "source unreachable" overlay appears; hotspot does nothing.

### 7.2.6 Recording user-testing telemetry

1. Author goes to **Share** → **Prototype Test Link**, configures: capture all events, anonymized viewers, 90-day retention, sampling 100% (or `1/n`), PII redaction on (`name`/`email` fields redacted client-side), assign to A/B variant A or B.
2. Author copies the link / sends via Slack / generates a QR.
3. Viewers click the link. The runtime mounts in read-only mode, full interaction. The **recorder** starts streaming events.
4. Researcher opens the **Test Sessions** dashboard, sees each session as a thumbnail (initial viewport snapshot), a timeline of interactions, and a replay button.
5. Researcher clicks **Play** — the deck replays exactly as the viewer experienced it, with a cursor, variable inspector (#7.2.7), and an event palette.
6. Researcher exports session data as CSV/Parquet for offline analysis.
7. Failure: viewer reload — session continues; reload event logged. Viewer never reaches end — session remains open until 30-minute inactivity timeout; researcher can manually close.

### 7.2.7 Deep-linking to a specific slide state

1. User (any) is at slide 7 with the **Bear case** scenario active and a form half-filled.
2. They click **Share state** (anywhere in the top bar).
3. Runtime builds the `state` payload:
   - `slide_id = 7`,
   - `path_stack = [home, 3, 5, 7]`,
   - `scenario = "bear"`,
   - `form_drafts = [{ field: "email", value: "..." }]` (subject to #101's `autosave_on_advance` + a "share the draft?" consent flow),
   - `var_snapshot` = allowed variables (deck-scoped, excluding private/session-only).
4. Token is HMAC-signed with `exp = now + 7 days`.
5. URL is generated, copied to clipboard, optionally shortened.
6. Recipient clicks link. Client resolves: validates signature, fetches deck, sets up runtime with the state, displays a "Resuming from a shared link" toast, and lands them at slide 7 with the Bear scenario active.
7. Failure: token expired → "this link has expired, open the deck at its start?" Failure: signature invalid → "this link appears to have been tampered with." Failure: variables in snapshot no longer exist in deck → "Some variables from this link aren't in the current version of the deck; defaults will be used." with a list.

---

## 7.3 Functional and Non-Functional Requirements (NFRs)

This section enumerates the runtime semantics — the contract between authoring and execution.

### 7.3.1 Variable Scoping (deck / slide / component_instance / session / viewer)

| Scope | Lifetime | Author mutability | Viewer mutability | Persisted in deep link (#107)? | Visible to MCP (#222)? |
|---|---|---|---|---|---|
| `deck` | Lives as long as the deck. Set by author or by component default. | Yes | No | Yes (read-only) | Yes |
| `slide` | Reset on every slide enter (unless `persist: true`). | Yes | Only via rules bound to slide; otherwise no | Only when `persist: true` | Yes |
| `component_instance` | Bound to a specific instance; resets when instance is unmounted. | Yes | Per-component rules | No | Yes |
| `session` | Lives for the entire session (browser tab + protocol-defined extension). | Yes | Yes (via forms/calculators) | Optional | No (private to runtime) |
| `viewer` | Lives in the viewer's account storage; key-value per deck. | Yes | Yes | No — bound to viewer's server-side profile | Yes (per-agent permission) |

**Functional rules:**
- A binding always reads from the most specific scope available, falling back to broader scopes: `viewer → session → component_instance → slide → deck`.
- A write only succeeds if the writing surface has write permission to the scope (e.g., a form input can write to `session`; a hotspot cannot write to `viewer`-scoped variables unless explicitly authorized).
- Cross-deck variables (e.g., from shared components, #186) are read-only and tagged with the source deck.

**Non-functional:**
- Resolve latency: variable read on a hot path (visible-bound element re-render) ≤ 0.5ms p99, ≤ 1ms p99.9.
- Storage: per-deck variable count budget 5,000 (warning at 4,000); per-component instance variable count budget 200.

### 7.3.2 Conditional Logic Engine Semantics

- **Compilation:** every rule expression is compiled at save time to a tree of `Expr` nodes (`Literal`, `Ident`, `BinaryOp`, `UnaryOp`, `FuncCall`, `MemberAccess`). The compiler enforces the safe-subset whitelist.
- **Evaluation:** rules are evaluated in priority order, top-down. Each rule's `condition` is the compiled `Expr` evaluated against the current variable context (an immutable snapshot at the moment of evaluation).
- **Short-circuit:** boolean operators short-circuit (`a and b` does not evaluate `b` if `a` is false).
- **Pure:** no side effects in expressions. Side effects happen via the `action` block.
- **Reactive updates:** when a variable referenced by an expression changes, all dependent expressions are invalidated and re-evaluated in topological order, depth-first.
- **Cycle detection:** at runtime, if a variable update through evaluation reaches a `max_depth` (default 50) without convergence, evaluation halts and emits `cyclic_update_aborted`. Authors see a warning at validation when a binding graph has a cycle.
- **Type coercion:** number → string only via `formatNumber`/`formatCurrency`/`formatDate` (locale-aware). Other coercions throw `type_error`.
- **Errors:** runtime errors never crash the deck; failed evaluations fall back to `last_good_value`, with `formula_eval_error` telemetry emitted.

### 7.3.3 Branching Graph Traversal Order (with Cycle Detection)

- **Data structure:** each slide node has `{ outgoing: Edge[], incoming: Edge[], metadata }`. Each edge has `{ from_slide_id, from_event_ref, to_slide_id, condition, priority, parallel_group }`.
- **Traversal:** when the runtime needs the "next slide" (due to a hotspot fire, timer tick, conditional rule, etc.), it walks `outgoing` in `priority desc, created_at asc` order, evaluates each `condition` until one is `true`, and then transitions.
- **Cycle detection:** the runtime maintains a `visited_set` per session that records every slide's `visit_count`. Default cap: `max_hops_per_session = 100` (configurable per deck; e.g., escape-room decks may need higher).
- **Cycle analytics:** cycles are also detected at *authoring* time (Tarjan's SCC over the slide graph) and surfaced as warnings in the Connections panel.
- **Parallel navigation:** an edge can declare `parallel_group: "<id>"` — edges in the same group all fire, opening multiple slides concurrently (read-only research use case).

### 7.3.4 Form Input Validation

- **Levels of validation:**
  1. **Type coercion** (e.g., `number` rejects non-numeric input),
  2. **Range validation** (`min`, `max`, `min_length`, `max_length`, `pattern`),
  3. **Cross-field validation** (`matches`, `not_matches`, `sum_equals`),
  4. **Async/server validation** (e.g., "is this a valid company URL"),
  5. **Custom expression** (a safe formula evaluated client-side; same sandbox as #100).
- **Timing:** client-side validation runs on blur and on debounced input; async validators fire after debounce (default 400ms).
- **Submit gate:** the form's `onSubmit` handler runs only when all required fields pass. Failed submit highlights the first failing field and focuses it.
- **Accessibility:** errors are announced via `aria-live="polite"`; the field receives `aria-invalid="true"`; the input has a visible error message and is associated via `aria-describedby`.

### 7.3.5 Calculator Numeric Precision and Overflow Safety

- **Internal format:** `decimal128`-equivalent (38 digits of precision, configurable 12 shown).
- **Overflow handling:**
  - If a calculation exceeds the type range: clamps to `±Infinity` markers in the *output*, with a visible `value_out_of_range` badge.
  - If intermediate computation exceeds: clamps silently to type range; subsequent formula evaluations re-detect and display `value_out_of_range`.
- **Rounding:** currency uses banker's rounding to even (default); user setting can override.
- **Floating point hazards:**
  - All arithmetic in the formula runtime uses decimal128, never float64.
  - Slide-chart updates from the calculator (#102) use the same decimal type to avoid display drift.
- **Pasting the value `1e308`** — runtime rejects inputs above `1e30` for `number` typed variables; above `1e38` rejected even for `decimal128`. Above that, the runtime returns a "value too large" inline error.
- **NaN prevention:** any explicit division by zero or `0/0` returns `0` for consumer-facing outputs with a flag `was_zero_division: true`; authors can configure an explicit error.

### 7.3.6 Device Frame Rendering Correctness

- **Coordinate space:** the device frame is rendered at `device_physical_pixel_ratio` capped at 3. Tap coordinates are converted from slide coordinates → frame rectangle → device screen pixel coordinates.
- **Touch event semantics:** every gesture (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`) is dispatched with `pointerType: 'touch'` and the `isPrimary` flag set per the gesture map for the target device.
- **OS chrome:** rendered as a CSS-only composition (status bar, notch, time, battery) using a stable sprite; clock is configurable (mock time vs. real time).
- **Rotation:** orientation change is animated via a 250ms rotate transition; safe-area insets are recomputed on rotation.
- **Hi-DPI:** the frame composites at its native pixel ratio when running on presentation hardware ≥ 4K, capped at 3x for embedded GPU constraints.
- **Offline:** once cached, the frame renders fully offline (#137); cached version is keyed by frame URL + content hash + last-modified header.

### 7.3.7 Deep-Link State Serialization

See also §7.1 #107 and §7.4.9 architecture. Summary:

- **Payload:** `{ v: <version>, exp: <epoch>, deck_id, slide_id, path_stack, overlay_stack, var_snapshot, device_frame_state, scenario, form_drafts, sig }`.
- **Encoding:** `header.payload.sig` (header = `{ alg, kid }`, sig = HMAC-SHA256 over header.payload).
- **Transport:** `base64url(header) "." base64url(payload) "." base64url(sig)`.
- **Storage budget:** single deep link ≤ 4 KB (browser limit considerations). Excess state goes server-side via `deep_link_id`.
- **Validation:** signature, expiry, version compatibility, deck existence, variable scoping.
- **Failure policy:** invalid signature → refuses to apply, opens at default; expired → graceful fallback.

### 7.3.8 A/B Test Telemetry Integrity

- **Bucket assignment:** sticky at session start. Hash of `(viewer_id + variant_seed) % 2` selects A/B; deterministic for re-entry.
- **Event tagging:** every recorded event carries `variant: "A" | "B"` and a stable `bucket` for cohort slicing.
- **Sample-size sufficiency:** runtime reports a "statistical power" indicator when the recorder's `min_per_arm` threshold (default 100 sessions) is unmet; researchers see a warning until enough data is captured.
- **Immutability:** the telemetry log is append-only; corrections happen through event-sourced reconciliation, never direct edit.
- **Audit:** every analytics export includes the methodology (`version`, `sampling_rate`, `redaction_policy`).
- **Cross-section tie:** the analytics layer (section 12, #173) consumes this telemetry unchanged. Prototyping records are *not* double-counted.

### 7.3.9 Accessibility (NFR)

WCAG 2.2 AA is the floor for all of §7. Specifically:

- All hotspots are reachable via keyboard (`Tab`, `Enter`, `Space`).
- All form inputs have visible labels, `aria-describedby` for help/errors, and `aria-invalid` when failed.
- All overlays trap focus and return focus on close.
- Auto-advance (#106) respects `prefers-reduced-motion` and provides an always-visible pause control.
- Quiz interactions (#105) have keyboard equivalents (drag-to-match → Tab + arrow keys).
- Color is never the sole indicator of state (e.g., a hotspot's "broken" state has both color *and* icon).
- Device frame (#103) is treated as a single composite element for tab order; pressing `Enter` simulates a tap.
- Captions or transcripts for any audio associated with a quiz/overlay.

### 7.3.10 Internationalization

- All text in overlays, forms, quiz prompts, hotspot tooltips, and the prototype runtime's chrome is locale-routed through section 11's translation pipeline; fallback chain: viewer locale → deck locale → `en-US`.
- Calculator formatting (#102) and date pickers (#101) honor viewer locale (Bangla, English, 100+ languages per #113).
- Number inputs use locale digits where culturally expected (Bangla numerals per §12.4 of pre-development-planning-guide).

---

## 7.4 Architecture

> **Style.** Sectional guidance (§4.2 of pre-development-planning-guide) is to start as a modular monolith, splitting services along business capability. Section 7's prototyping runtime ships as **two services** from day one: `prototype_runtime` (low-latency, in-memory state, embedded in the editor and viewer processes) and `prototype_recorder` (telemetry ingest, with its own write-heavy scaling needs). The other sub-systems below live as modules in the larger `editor` service until specific scaling reasons emerge.

### 7.4.1 Hotspot Manager

**Responsibility.** Own hotspot CRUD, validation, hit-testing, and target resolution.

```
type HotspotManager struct {
    Deck           *Deck
    HitTestCache   *lru.Cache[slideKey, []*Hotspot] // ordered by z-index desc
    BrokenChecker  chan<- BrokenHotspot
}

func (m *HotspotManager) HitTest(slideID string, pt Point) (*Hotspot, bool) {...}
func (m *HotspotManager) ResolveTarget(hs *Hotspot, ctx *RuntimeContext) (Target, error) {...}
```

**Implementation notes:**
- Hit-test cache is invalidated on any hotspot geometry / z-order change.
- Target resolution short-circuits on the first matching gesture's configured target.
- A `BrokenChecker` runs as a background job, scanning for hotsposts whose targets have been deleted, and surfaces them in the editor's **Connections** panel.

### 7.4.2 Overlay Layer System

**Responsibility.** Layered compositing of overlays above a slide, with z-stack ordering, focus management, dismissability, and animation hooks.

**Architecture.**
- The runtime instantiates an `OverlayStack` per slide with `[]Overlay { id, contentRef, mode, dismissable, open_trigger, close_trigger, ... }`.
- Each overlay is a React portal (or equivalent in the chosen UI framework — see §6) mounted into the slide's overlay layer container.
- Z-stack: `last-opened-on-top` is the default. Persistent overlays layer above transient ones.
- Animation: enter/exit use the §6 transition vocabulary; an `InertialOverlay` mode disables transitions for accessibility when `prefers-reduced-motion: reduce`.

### 7.4.3 Component State Machine Runtime

**Responsibility.** Manage per-instance state machines (#99), fire transitions, and emit `onTransition` events.

**Components.**
- `StateMachine { states, transitions, initial }` declared in component metadata.
- `InstanceRuntime { id, component_def, current_state, events: EventLog }` — one per instance on the canvas.
- `TransitionEvaluator` — given `(current_state, event, condition_snapshot)`, returns `(next_state, side_effects)` or `(current_state, nil)` if no transition matches.
- `EventBus` — channel for cross-runtime events: state changes broadcast here → variable store subscribers (#100).

**Persistence.**
- Session-scoped instance state serialized into #107 deep link state.
- Deck-scoped instance state stored in the deck document (CRDT cell, #21).

### 7.4.4 Variable Store and Reactive Bindings

**Responsibility.** Single source of truth for runtime state. Reactive, transactional, type-safe, scope-aware.

**Type signatures:**
```ts
type VarStore = {
  // read with scope resolution: viewer > session > instance > slide > deck
  read(name: VarName, ctx: EvalCtx): Value;

  // write with type validation and scope check
  write(name: VarName, value: Value, opts: WriteOpts): WriteResult;

  // bindings: a binding is {(sourceExpr), target: ElementBinding}
  bindings: Map<BindingID, Binding>;

  // subscribe to a variable's change (filtered by scope and predicate)
  subscribe(name: VarName, fn: (oldV, newV) => void): Subscription;

  // snapshot/restore for serializer/deserializer
  snapshot(scope: ScopeFilter): Snapshot;
  restore(snap: Snapshot, opts: RestoreOpts): void;
};
```

**Reactivity.**
- A `BindingsDAG` is built at editor-load time, mapping every binding to its dependencies (variables read by `sourceExpr`).
- Variable updates trigger a *topological* propagation: only bindings whose dependencies changed are recomputed.
- A batched transaction boundary: variable writes within the same micro-task are coalesced; bindings see a coherent update.

### 7.4.5 Conditional Logic Evaluator (with Safe Evaluation)

**Responsibility.** Evaluate safe expressions, evaluate rules, fire actions, all in a sandbox.

**Architecture.**
- `ExprCompiler` — parses and *typechecks* the source expression (no `eval`, no `Function` ctor). Builds an `Expr` AST. Whitelist-enforced.
- `ExprEvaluator` — walks the AST against a `VariableContext` (read-only view of the variable store). Pure, no side effects, no globals beyond the builtin library (`round`, `floor`, etc.).
- `RuleEvaluator` — iterates rules in priority order, returns first `true` rule, then `ActionExecutor` runs the action.
- `ActionExecutor` — supports `show`/`hide`/`enable`/`disable`/`set_variable`/`navigate_to`/`play_animation`/`submit_form`/`open_overlay`/`close_overlay`.

```ts
type Action =
  | { type: 'show'; target: ElementRef }
  | { type: 'hide'; target: ElementRef }
  | { type: 'enable'; target: ElementRef }
  | { type: 'disable'; target: ElementRef }
  | { type: 'set_variable'; name: VarName; value: Value }
  | { type: 'navigate_to'; slide_id: SlideID }
  | { type: 'play_animation'; target: ElementRef; animation_id: AnimationID }
  | { type: 'submit_form'; form_id: FormID }
  | { type: 'open_overlay'; overlay_id: OverlayID }
  | { type: 'close_overlay'; overlay_id: OverlayID };
```

### 7.4.6 Form Input Registry

**Responsibility.** Register input components, manage their lifecycle, validate, sanitize, debounce, and write to bound variables.

**Components.**
- `FormRegistry` — keyed by `form_id`, owns a `Map<input_id, InputDef>`.
- `InputRenderer` — lazy-loaded per input type (`text`, `slider`, etc.) to keep the bundle slim.
- `InputValidator` — runs the validation chain from §7.3.4.
- `AutosavePolicy` — for `autosave_on_advance`, hooks into §7.4.4 variable store.

### 7.4.7 Calculator Runtime (Sandboxed)

**Responsibility.** Evaluate calculator DAGs in a sandboxed decimal-arithmetic runtime.

**Components.**
- `CalculatorDef` — the DAG, parsed from `#102`'s authoring output.
- `DecimalRuntime` — `decimal128`-equivalent arithmetic, format-and-parse helpers.
- `RecomputeEngine` — watches input changes, recomputes only affected nodes (DAG-based), within a per-frame budget (5ms).
- `BuiltinLibrary` — `round`, `floor`, `ceil`, `abs`, `min`, `max`, `clamp`, `if`, `coalesce`, `length`, `match`, `formatNumber`, `formatCurrency`, `formatDate`, `cagr`, `npv`, `irr`, `payback_period`.

### 7.4.8 Device Frame Renderer (with Simulated Input)

**Responsibility.** Render the device frame, dispatch simulated input, integrate with the §5 #81 live-app-embed runtime.

**Components.**
- `DeviceFrameRenderer` — composes the iframe sandbox + the chrome sprite layer into the slide element.
- `SimulatedInputShim` — maps slide pointer events to device touch events with correct semantics.
- `DeviceState` — exposed as a binding/conditional-rule target, enabling variables (#100) and rules (deep links #107) to influence the frame.

### 7.4.9 Prototype User-Testing Telemetry Recorder

**Responsibility.** Capture, stream, persist, and serve back the event log for prototype sessions.

**Components.**
- `EventRecorder` — runs in the viewer runtime; emits to a `chunked_upload_stream`.
- `TelemetryIngest` — backend service: appends to a time-series store (e.g., columnar storage / Postgres + JSONB for ad-hoc queries).
- `ReplayRenderer` — consumes the event log, fast-forwards the variable store, then plays events.
- `Integrity Layer` — HMAC and chained hashing for tamper detection (§7.7.4).

### 7.4.10 Deep-Link State Encoder/Decoder

**Responsibility.** Encode runtime state into a URL-safe token; decode and restore on the receiving client.

**Components.**
- `StateEncoder` — pure function `(deck_ctx, viewer_ctx, runtime_state) → token`.
- `StateDecoder` — `(token, viewer_ctx) → (state_or_rejection, reason?)`.
- `LinkShortener` — server-side, maps `deep_link_id` to stored long token when state exceeds 4 KB.

---

## 7.5 Data Model

This section defines entities for the prototyping runtime. Storage substrate: **Postgres + JSONB** for the rule graph (§4.7 of the planning guide, "complex structured data with ad-hoc queries" is exactly JSONB's strength). Long-lived, queryable artifacts (sessions, deep-link rows) live in normalized tables; complex/deeply-nested graphs (a calculator DAG, a branching graph) live as JSONB.

```sql
-- 7.5.1 Hotspot
CREATE TABLE hotspots (
  id              UUID PRIMARY KEY,
  deck_id         UUID NOT NULL,
  slide_id        UUID NOT NULL,
  shape           TEXT NOT NULL CHECK (shape IN ('rect','ellipse','polygon')),
  geometry        JSONB NOT NULL,           -- normalized 0..1 rect or polygon points
  z_index         INT NOT NULL DEFAULT 0,
  gesture_mask    INT NOT NULL,             -- bitmask: click=1, dblclick=2, hover=4, long_press=8, press=16
  target_type     TEXT NOT NULL CHECK (target_type IN ('slide','overlay','url','interaction','simulate_device_tap','submit_form','set_variable','open_overlay','close_overlay','play_animation')),
  target_ref      JSONB NOT NULL,           -- varies by target_type: { slide_id } | { overlay_id } | { url } | { x_pct, y_pct } | ...
  transition      JSONB,                    -- { type, duration_ms, easing } | null
  accessibility   JSONB,                    -- { keyboard_shortcut, aria_label }
  status          TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','dangling')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);
CREATE INDEX ON hotspots (deck_id, slide_id) WHERE deleted_at IS NULL;
CREATE INDEX ON hotspots USING gin (geometry);  -- geometric hit-test queries

-- 7.5.2 Overlay (a slide child with its own element list)
CREATE TABLE overlays (
  id                 UUID PRIMARY KEY,
  deck_id            UUID NOT NULL,
  slide_id           UUID NOT NULL,
  type               TEXT NOT NULL CHECK (type IN ('modal','drawer_left','drawer_right','drawer_top','drawer_bottom','tooltip','popover','lightbox','snackbar','fullscreen_panel','custom')),
  size_strategy      TEXT NOT NULL CHECK (size_strategy IN ('fixed','auto','slide_percent','content_fit')),
  anchor             JSONB NOT NULL,       -- { hotspot_id | element_id | rect }
  open_trigger       JSONB,                -- { gesture, condition }
  close_trigger      JSONB,                -- { gesture, dismissable, esc_close, backdrop_close }
  persistent         BOOLEAN NOT NULL DEFAULT FALSE,
  content_ref        JSONB,                -- points at a component variant or a slide sub-region
  aria_label         TEXT,
  schema             JSONB NOT NULL,        -- element list (JSONB for schema flexibility)
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7.5.3 Interaction_state (per-component-instance state machine)
CREATE TABLE interaction_states (
  id              UUID PRIMARY KEY,
  component_id    UUID NOT NULL,             -- component definition reference
  state_machine   JSONB NOT NULL,            -- { states, transitions, initial }
  instance_id     UUID NOT NULL,             -- individual instance ID on a slide
  slide_id        UUID NOT NULL,
  current_state   TEXT NOT NULL,
  scope           TEXT NOT NULL CHECK (scope IN ('session','slide','deck','persistent_session')),
  last_event_ts   TIMESTAMPTZ
);
CREATE INDEX ON interaction_states (instance_id, slide_id);

-- 7.5.4 Variable
CREATE TABLE variables (
  id              UUID PRIMARY KEY,
  deck_id         UUID NOT NULL,
  name            TEXT NOT NULL,             -- '$pricingTier'
  type            TEXT NOT NULL CHECK (type IN ('string','number','integer','boolean','enum','date','datetime','array','object','record')),
  scope           TEXT NOT NULL CHECK (scope IN ('deck','slide','component_instance','session','viewer')),
  default_value   JSONB,                    -- parsed-typed value
  validation      JSONB,                    -- { min, max, pattern, allowed_values, ... }
  visibility      TEXT NOT NULL DEFAULT 'deck_public' CHECK (visibility IN ('deck_public','private','server_only')),
  bound_to        UUID,                     -- optional: source-of-truth external binding
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(deck_id, name)
);

-- 7.5.5 Conditional_rule
CREATE TABLE conditional_rules (
  id              UUID PRIMARY KEY,
  deck_id         UUID NOT NULL,
  priority        INT NOT NULL DEFAULT 100,
  scope_slide_id  UUID,                     -- null = deck-wide
  condition_expr  JSONB NOT NULL,           -- compiled Expr AST
  action          JSONB NOT NULL,           -- Action object (see §7.4.5)
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON conditional_rules (deck_id, scope_slide_id, priority DESC) WHERE enabled;

-- Bindings (a normalized view of variable ↔ element prop)
CREATE TABLE variable_bindings (
  id              UUID PRIMARY KEY,
  variable_id     UUID NOT NULL,
  target_kind     TEXT NOT NULL CHECK (target_kind IN ('element','overlay','hotspot','animation','form_input','calculator_node','device_frame_state','quizz_state')),
  target_id       UUID NOT NULL,
  target_prop     TEXT NOT NULL,            -- 'visible','enabled','text','value',...
  transform       JSONB,                    -- optional converter: { format: 'currency', locale: 'en-US' }
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON variable_bindings (variable_id);
CREATE INDEX ON variable_bindings (target_kind, target_id);

-- 7.5.6 Form_input
CREATE TABLE forms (
  id              UUID PRIMARY KEY,
  deck_id         UUID NOT NULL,
  slide_id        UUID NOT NULL,
  submission_hook JSONB,                    -- { type: 'telemetry'|'network'|'conditional_rule'|'a_b_assign', ... }
  schema          JSONB NOT NULL,           -- list of inputs: { id, label, type, validation, bound_variable_id, ... }
  autosave_on_advance BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE form_submissions (
  id              UUID PRIMARY KEY,
  form_id         UUID NOT NULL,
  session_id      UUID NOT NULL,
  viewer_id_hash  TEXT,                     -- pseudonymized
  payload         JSONB NOT NULL,
  validation_state JSONB NOT NULL,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON form_submissions (form_id, submitted_at);

-- 7.5.7 Calculator_def
CREATE TABLE calculator_defs (
  id              UUID PRIMARY KEY,
  deck_id         UUID NOT NULL,
  slide_id        UUID NOT NULL,
  name            TEXT NOT NULL,
  graph           JSONB NOT NULL,           -- { nodes: [...], edges: [...], outputs: [...] } — DAG
  precision       INT NOT NULL DEFAULT 12,  -- decimal digits to show
  rounding_mode   TEXT NOT NULL DEFAULT 'bankers' CHECK (rounding_mode IN ('bankers','half_up','truncate')),
  schema_version  INT NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7.5.8 Device_frame
CREATE TABLE device_frames (
  id              UUID PRIMARY KEY,
  deck_id         UUID NOT NULL,
  slide_id        UUID NOT NULL,
  device_type     TEXT NOT NULL,            -- 'iphone-15-pro','pixel-8', etc.
  orientation     TEXT NOT NULL CHECK (orientation IN ('portrait','landscape')),
  chrome_state    JSONB,                    -- { notch: bool, status_bar: { time, battery, signal } }
  safe_area       JSONB,                    -- per-orientation insets
  content_ref     JSONB NOT NULL,           -- { kind: 'slide' | 'external', ref }
  bound_state_var UUID,                     -- optional: variable to store the frame's state
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7.5.9 Prototype_session (a user-testing recording)
CREATE TABLE prototype_sessions (
  id              UUID PRIMARY KEY,
  deck_id         UUID NOT NULL,
  variant         TEXT,                     -- 'A','B','control' (A/B tag)
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  viewer_id_hash  TEXT,
  device_fingerprint TEXT,
  consent_level   TEXT NOT NULL CHECK (consent_level IN ('opt_in','opt_out','anonymous','authenticated')),
  retention_until TIMESTAMPTZ,
  integrity_chain JSONB NOT NULL DEFAULT '[]'::JSONB,  -- running hash chain
  metadata        JSONB
);
CREATE INDEX ON prototype_sessions (deck_id, started_at);

CREATE TABLE prototype_events (
  id              UUID PRIMARY KEY,
  session_id      UUID NOT NULL,
  seq             BIGINT NOT NULL,           -- monotonic per session
  ts              TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind            TEXT NOT NULL,             -- 'slide_enter','slide_exit','hotspot_fire','form_input','overlay_open','overlay_close','calculator_input','quiz_submit','scenario_change','device_tap','viewport','error'
  payload         JSONB NOT NULL,
  var_snapshot    JSONB,                     -- the relevant variable scope at the moment of the event
  sig_hmac        BYTEA NOT NULL,            -- HMAC-SHA256(payload || seq || prev_hash, server_key)
  prev_hash       BYTEA NOT NULL
);
CREATE UNIQUE INDEX ON prototype_events (session_id, seq);
CREATE INDEX ON prototype_events (deck_id, kind, ts);

-- 7.5.10 Deep_link_state
CREATE TABLE deep_links (
  id              UUID PRIMARY KEY,           -- short-form slug
  long_token      TEXT,                       -- full encoded state (if exceeds 4 KB inline)
  payload         JSONB NOT NULL,
  signature       BYTEA NOT NULL,
  expires_at      TIMESTAMPTZ,
  created_by      UUID,                       -- authoring user
  viewer_scope    TEXT NOT NULL CHECK (viewer_scope IN ('anonymous','authenticated','scoped')),
  allowed_viewers JSONB,                      -- array of viewer hashes for scoped links
  click_count     INT NOT NULL DEFAULT 0,
  last_clicked_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON deep_links (expires_at);
```

---

## 7.6 APIs and Contracts

> **Style.** REST + JSON for external / MCP; internal services may use gRPC for performance, but a public REST surface is required for the developer ecosystem (#200) and agentic surface (#222). OpenAPI 3.1 is the source of truth for external contracts.

### 7.6.1 Hotspot CRUD

```
GET    /v1/decks/{deck_id}/slides/{slide_id}/hotspots
POST   /v1/decks/{deck_id}/slides/{slide_id}/hotspots
PATCH  /v1/hotspots/{hotspot_id}
DELETE /v1/hotspots/{hotspot_id}
POST   /v1/hotspots/{hotspot_id}/resolve     # debug: returns the runtime-resolved target
```

Request shape (POST/PATCH):
```json
{
  "shape": "rect",
  "geometry": { "x": 0.12, "y": 0.34, "w": 0.2, "h": 0.1 },
  "z_index": 5,
  "gesture_mask": 1,
  "target_type": "slide",
  "target_ref": { "slide_id": "fcae..." },
  "transition": { "type": "fade", "duration_ms": 200 },
  "accessibility": { "keyboard_shortcut": "Enter", "aria_label": "Open pricing slide" }
}
```

Error format (`application/problem+json`):
```json
{ "type": "https://errors.domio.app/hotspot/dangling-target", "title": "Target slide not found", "status": 422 }
```

### 7.6.2 Variable Binding

```
GET   /v1/decks/{deck_id}/variables
POST  /v1/decks/{deck_id}/variables
PATCH /v1/variables/{variable_id}
POST  /v1/variables/{variable_id}/bindings
DELETE /v1/bindings/{binding_id}
```

Binding request:
```json
{
  "target_kind": "element",
  "target_id": "f1f1...",
  "target_prop": "visible",
  "transform": null
}
```

### 7.6.3 Conditional Rule CRUD

```
GET    /v1/decks/{deck_id}/rules
POST   /v1/decks/{deck_id}/rules
PATCH  /v1/rules/{rule_id}
DELETE /v1/rules/{rule_id}
POST   /v1/rules/{rule_id}/test      # body: { snapshot } returns boolean for that snapshot
```

Rule request:
```json
{
  "priority": 100,
  "scope_slide_id": null,
  "condition_expr": { "op": "==", "left": "$pricingTier", "right": "annual" },
  "action": { "type": "show", "target": { "kind": "element", "id": "abcd..." } },
  "enabled": true
}
```

### 7.6.4 Form / Calculator Submission

```
POST /v1/forms/{form_id}/submissions
POST /v1/forms/{form_id}/draft           # autosave draft
GET  /v1/calculators/{calculator_id}/state
POST /v1/calculators/{calculator_id}/compute   # body: { inputs } returns outputs (debug)
```

### 7.6.5 Telemetry Ingestion

```
POST /v1/telemetry/prototype/batch
Content-Type: application/json
```
Body:
```json
{
  "session_id": "fa01...",
  "events": [
    {
      "seq": 12,
      "kind": "hotspot_fire",
      "ts": "2026-07-29T10:23:14.512Z",
      "payload": { "hotspot_id": "h1", "from_slide": "s1", "to_slide": "s2" },
      "var_snapshot": { "$pricingTier": "annual" }
    }
  ]
}
```
Server returns `{ "accepted_seq": 12, "next_seq": 13, "ingest_at": "..." }`. Rejected events return `422` with a `reason` per event.

### 7.6.6 Deep-Link Resolver

```
POST /v1/deep_links/shorten
GET  /d/{deck_id}?state=<token>          # primary public resolve (browser-navigated)
POST /v1/deep_links/resolve               # server-side validation without redirect
DELETE /v1/deep_links/{id}                # author revokes a link
```

Resolve response (server validation):
```json
{
  "valid": true,
  "expires_at": "...",
  "deck_id": "...",
  "state": { "slide_id": "...", "scenario": "bear", ... }
}
```

### 7.6.7 Auth

- All endpoints require Bearer token (a session token from section 13's auth, or an MCP agent token scoped per #225).
- Anonymous read-only endpoints (e.g., viewing a public prototype) accept a public-link token instead.
- MCP-flavored endpoints (`/v1/mcp/*`) honor agent-scoped permissions (#225) with capability claims: `read_state`, `modify_state`, `bind_variable`, `manage_rules`.

---

## 7.7 Security

This section covers the security model for prototyping features, including the specific compliance considerations referenced in `pre-development-planning-guide.md` (sections 7 and 11).

### 7.7.1 Variable Isolation per Viewer

- All `viewer`-scoped variables are stored in a separate table whose primary-key includes a salted hash of the viewer identity; queries always join on the viewer's session token.
- A `private`-marked variable is never serialized to the client; its value is consulted server-side only (e.g., for `submit_form` server validation).
- Cross-viewer access (one viewer reading another viewer's `viewer` variable) is rejected at the API layer with `403`.
- Cross-deck variables (e.g., from shared components #186) are read-only and tagged with the source deck ID for audit.

### 7.7.2 Conditional Rule Sandboxing

- Rule expressions are compiled against a strict grammar; no `eval`, no `Function` ctor, no globals.
- The compiler rejects: dynamic property access (`obj[var]`), `with`, `delete`, prototype mutation, `this`, `arguments`, network calls.
- Formula evaluation runs in a **dedicated worker** with a per-frame budget (default 5ms; configurable up to 50ms) and a hard memory ceiling (default 8 MB).
- A degenerate rule (extremely deep AST, infinite loop via tautology) is detected at author-time static analysis where possible; runtime fallback is `max_depth_reached` abort.
- Rule executions are logged in `prototype_events` as `rule_fire` records with the rule ID, the snapshot, and the resulting action — for audit and replay.

### 7.7.3 Telemetry PII Handling (incl. BD-specific PDPA considerations)

Per `pre-development-planning-guide.md` §11.1, Bangladesh's PDPA 2026 is in force in principle and fully enforceable from May 2027. The data fiduciary (Domio) must handle consent, retention, and data subject rights for any user data flowing through telemetry. Concrete rules:

- **Default PII redaction (client-side):** form inputs flagged as `pii: true` (e.g., email, phone, name) are sent to telemetry in their raw form **only** if the recorder is in an authenticated and consented mode; otherwise they are redacted to `***` *before* leaving the client.
- **Pseudonymization:** viewer identifiers are SHA-256(session_salt + viewer_token); raw IPs are not stored unless "identify individual viewers" mode is explicitly enabled by the author and consented to by the viewer.
- **Consent UI:** every prototype link has a top-level consent banner with three options (`opt_in`, `opt_out`, `anonymous`) and explicit retention display; the consent record is tied to the session.
- **Retention:** configurable per deck; default 90 days; `prototype_sessions.retention_until` is set at session start and enforced by a daily cron job (hard-deletes sessions and their events).
- **DSR endpoints:** `GET /v1/me/telemetry_sessions`, `DELETE /v1/me/telemetry_sessions/{id}`, bulk `DELETE /v1/me/telemetry_sessions?before=...` for right-to-erasure.
- **Data localization (per §11.2 of planning guide):** sessions with `consent_level: 'opt_in'` and identified viewers are stored in region-pinned object stores; `anonymous` sessions may be cross-region. If regulatory relocation is ordered, the storage layer supports a region-pinning override.
- **Breach notification:** §11.3 (Cyber Security Ordinance 2025) requires breach notification — telemetry infrastructure emits `security.incident.detected` events for any anomalous data access; an incident-response runbook (§10.3 of planning guide) ties these to the legal/comms path.
- **No analytics resale:** raw prototype event payloads are never sold or shared with third parties; aggregate statistics are computed on a differentially-private basis (#178's benchmarks).

### 7.7.4 Deep-Link Auth and Signed Tokens

- Deep-link tokens are **signed, not encrypted.** Variables included in the snapshot must be in the `viewer_scope`-allowed set; the encoder strips any variable the current viewer cannot see *before* signing.
- Tokens carry an `exp` (expiry) and an optional `aud` (target viewer identifier). Decoding rejects mismatches.
- Signature: HMAC-SHA256 with a per-deck rotating `kid`. Rotation policy: 30-day rotation, with a 7-day overlap window where both old and new keys verify.
- Long-form URLs that exceed 4 KB are stored server-side; the URL carries only an opaque `deep_link_id`. The `deep_links.click_count` and `last_clicked_at` columns are updated and `viewer_id_hash` is recorded when authenticated.
- **Replay-attack defense:** every successful resolve increments `click_count`; the server can be configured to single-use links by enforcing `click_count <= 1`.
- **Author revocation:** `DELETE /v1/deep_links/{id}` immediately revokes; subsequent resolves return `410 Gone`.

### 7.7.5 OWASP Coverage

| Concern | Mitigation in §7 |
|---|---|
| A01 Broken Access Control | All hotspots/rules/forms scoped to deck + slide; agent tokens (MCP) carry capability claims (`#225`). |
| A03 Injection (XSS, SQLi, NoSQLi) | All form input rendered with text-content APIs; rule expressions compile to a sandbox AST; SQL always parameterized. |
| A04 Insecure Design | Layered defenses (compile-time + runtime validation); telemetry integrity chain (§7.7.4). |
| A05 Security Misconfiguration | Default-deny variable visibility; default-deny form input storage. |
| A07 Identification and Auth Failures | Telemetry consent + DSR endpoints; deep-link signing; PII redaction on by default. |
| A08 Software and Data Integrity | Signed deep links, telemetry integrity chain; deck rendering integrity (CRDT version pinning). |
| A09 Logging Failures | Every rule fire, every variable write (above a severity threshold), every deep-link resolve, every telemetry batch — logged with structured fields (§7.9). |
| A10 SSRF | Device-frame (#103) external URL allowlist per deck author; iframe sandbox (#81) per OWASP sandbox-iframe guidance. |

### 7.7.6 Secrets and Credentials

- HMAC keys for deep links stored in a secrets manager (§7.3 of planning guide); rotated per the policy above.
- Telemetry signing keys distinct from deep-link keys.
- Telemetry **never** logs raw form values for `pii: true` fields, even server-side, except under explicit consent `opt_in`.

---

## 7.8 Performance

Concrete budgets. Numbers in parentheses are defaults; all are configurable per deck via project settings.

### 7.8.1 Branching Traversal Budget

- **Per transition decision:** ≤ 1 ms p99 (rule evaluation + DAG traversal).
- **Per session cap:** `max_hops_per_session = 100` (default). Per-deck override up to 10,000 (for escape-room decks).
- **Graph view rendering** in the editor: incremental; ≤ 16 ms per update for a deck of ≤ 500 slides.

### 7.8.2 Conditional Evaluation Budget

- **Per rule batch:** ≤ 5 ms p99 for ≤ 100 rules per slide.
- **Bindings reactive update:** ≤ 16 ms p99 (one animation frame).
- **Compile-time validation of expressions:** the editor runs validation on every change; bounded to ≤ 100 ms per keystroke debounced.

### 7.8.3 Telemetry Sampling

- **Sampling rates:** 100% default; configurable to 1/2, 1/5, 1/10, 1/100.
- **Batch size:** events queued client-side, flushed every 5s or at 50 events, whichever first. On `navigator.sendBeacon` failure, fall back to `fetch` with `keepalive`.
- **Server ingest throughput:** ≥ 5K events/sec/region at p99; horizontally scalable with Kafka / NATS JetStream and a columnar backend.
- **Storage budget:** 90 days default retention at 100% sampling supports ~50K sessions; degrade gracefully (drop oldest first) if budget exceeded.

### 7.8.4 Calculator / Formula Performance

- **DAG recompute per input change:** ≤ 5 ms p99 for DAGs with ≤ 100 nodes.
- **Per-frame budget:** 5 ms per frame; longer-running computations chunked via `requestIdleCallback`.
- **Decimal precision operations:** 38-digit decimal arithmetic at ≤ 100K ops/sec single-thread; offloadable to a worker for ≥ 100-node DAGs.

### 7.8.5 Deep-Link Resolution Latency

- **Resolve latency:** 95th percentile ≤ 300 ms (in-region), ≤ 800 ms (cross-region). Achievable via edge caching of the deck document + a CDN for short-form tokens.
- **Decode latency:** client-side, ≤ 5 ms p99 for ≤ 4 KB tokens.
- **Hash chain verification:** server-side, ≤ 10 ms p99 for the per-request overhead.

### 7.8.6 Hotspot Hit-Test, Overlay Compositing, Frame Rendering

- **Hotspot hit-test:** ≤ 0.1 ms p99 (cached per slide).
- **Overlay composite:** ≤ 1 ms per overlay per animation frame.
- **Device frame render:** first paint ≤ 250 ms; steady-state 60 fps on M-class devices with content up to 1080p.
- **Prototype runtime memory:** ≤ 100 MB per tab (excluding embedded content).

---

## 7.9 Observability and Testing

### 7.9.1 Observability

- **Structured logging:** every section 7 action emits a structured log with `event`, `deck_id`, `slide_id`, `viewer_id_hash`, `latency_ms`, `result`, `session_id`. Logs redact PII; format is JSON; consumer is the centralized observability stack (§8.4 of pre-development-planning-guide).
- **Metrics (Prometheus):**
  - `domio_prototype_hotspot_resolve_total{result}`,
  - `domio_prototype_rule_eval_latency_seconds_bucket`,
  - `domio_prototype_variable_write_total{scope,result}`,
  - `domio_prototype_form_submission_total{result}`,
  - `domio_prototype_calculator_recompute_latency_seconds_bucket`,
  - `domio_prototype_deep_link_resolve_total{result}`,
  - `domio_prototype_telemetry_ingest_events_total{kind}`,
  - `domio_prototype_quiz_attempt_total{question_type,result}`.
- **Tracing (OpenTelemetry):** spans span the runtime: `interaction.tap → hotspot.resolve → overlay.open | navigate → slide.render → variable.write → bindings.recompute`. All instrumentation respects the `propagation` context so traces join across the studio, the viewer, and the telemetry ingest.
- **Health checks:** every section 7 service exposes `/healthz` and `/readyz`; the prototype recorder additionally exposes `/ingest/healthz` checking the tail of the ingest queue and the storage backend.
- **Alerts:** §8.5 of pre-development-planning-guide — alerts fire on (i) deep-link resolve p99 > 800ms for 5 min, (ii) telemetry ingest drop rate > 1%, (iii) formula eval error rate > 0.1% per deck, (iv) deep-link HMAC failure rate > 0.01% (potential key attack), (v) replay-integrity hash mismatch (potential tampering).

### 7.9.2 Testing Strategy (per §9 of pre-development-planning-guide)

- **Unit tests:**
  - Expression compiler (whitelist enforcement, type checking),
  - Bindings DAG (cycle detection, topological propagation),
  - Branching graph (cycle detection, reachability, fallback resolution),
  - Decimal arithmetic edge cases (overflow, NaN, division by zero),
  - Deep-link encode/decode (signature verification, expiry, scope filtering),
  - HMAC integrity chain (reordering, deletion, mutation detection).
- **Integration tests:**
  - Hotspot + overlay + variable end-to-end tap-through,
  - Conditional rule firing on variable change with reactive UI update,
  - Form input autosave on slide advance; submission with server validation,
  - Calculator recompute on DAG input change; correctness against a known fixture suite,
  - Device frame tap → iframe event flow,
  - Prototype session recording + replay equivalence.
- **End-to-end (Playwright/equivalent):**
  - Authoring a hotspot, hotspot working in prototype preview,
  - Authoring a branching graph with cycles (caught by editor warning),
  - Adding conditional logic that swaps visibility based on toggle,
  - Sharing a deep link to a colleague who lands on the right state.
- **Property-based tests:**
  - For any expression + variable context, eval is pure (same input → same output),
  - For any rule + binding DAG, reactivity is acyclic on a finite trail,
  - For any deep-link token, decode of an encoded state round-trips.
- **Fuzzing:**
  - Form input fuzzing for XSS/SQLi/parser flaws,
  - Expression fuzzing (the compiler must reject every malformed input).
- **Performance tests:**
  - k6 / vegeta harness against the deep-link resolver and telemetry ingest,
  - Browser perf tests for hotspot hit-test, overlay composition, frame rendering.
- **Accessibility tests:**
  - axe-core in CI on every preview surface that hosts a hotspot/overlay/form/calculator/quiz,
  - Manual keyboard-only review for at least 5 reference decks per release.
- **A11y & i18n:**
  - Locale-correct rendering for `bn-BD`, `en-US`, `de-DE`, `ja-JP` — especially numerals and date formatting (§12.4 of planning guide).
- **Compliance tests (BD PDPA):**
  - DSR endpoint behavior (right-to-erasure removes both raw and derived data),
  - Retention-cron enforcement (sessions past retention are deleted within 24h),
  - Cross-region storage flags respected on session creation.

### 7.9.3 Definition of Done (per §9.3)

A feature #96–#107 ships only when:
- Code reviewed and merged.
- Unit tests written with ≥ 80% line coverage on the relevant module.
- Integration test exercising the happy path + at least 2 edge cases.
- Accessibility test passes.
- Telemetry instrumentation added (at minimum, the metric name appears).
- MCP surface implemented (every feature must have at least one MCP tool to support #222–#236) and tested.
- Localization verified for the top 4 locales (en, bn, es, ja).
- Documentation note added to the public docs portal.
- Author/changelog note added for release.

---

## 7.10 Cross-Section Ties

Concrete, validated integration points. This subsection is the authoritative map of "section 7 touches these other sections."

| Direction | Section & feature | Integration detail |
|---|---|---|
| Section 1 → | #6 (frames-within-frames), #7 (auto-layout), #8 (constraints) | Hotspots (#96), overlays (#98), device frames (#103), and forms (#101) inherit the auto-layout and constraints system. Coordinates are stored normalized; hit-test resolution uses the final rendered rect after constraints are applied. |
| Section 1 → | #11 (zoom + GPU rendering) | Hotspot overlay visibility threshold matches the editor's zoom-UI threshold; the device frame's GPU path is shared with the editor's GPU renderer. |
| Section 1 → | #14 (format painter / paste to match destination) | Hotspot style sheets, overlay templates, form input templates are copy-paste-able. |
| Section 1 → | #19 (deck branching/merge) | Every feature #96–#107 must survive deck merge; new IDs are content-addressable (§7.1 #96). |
| Section 1 → | #22 (autosave) | All runtime state-related edits (hotspot geometry, rule priority, variable default) save on keystroke via the CRDT layer. |
| Section 2 → | #25 (smart components with editable props) | Variables (#100) are exposed as Smart Component Props; the JSON Schema for props (used by #233's function-calling) is generated from the variable definitions. |
| Section 2 → | #27 (team component libraries) | Conditional rules (#100) and calculator definitions (#102) are shared as part of component definitions in libraries. |
| Section 4 → | #48 (live data) | Variable values (#100) can be **bound to live data sources**, e.g., a variable's value is the latest BigQuery result for a query; an updating data source triggers the same reactive bindings pipeline as a form input. |
| Section 4 → | #52 (cross-chart filtering) | Filtering is implemented as a special variable write; cross-slide filtering is enabled by promoting the filter variable to deck scope. |
| Section 4 → | #53 (what-if sliders), #57 (scenario manager) | Variables (§100) ARE the scenario/slider mechanism; #53 and #57 are formalized as variable bindings with `scenario` scoping. A what-if slider writes a variable; the calculator/runtime reads it. |
| Section 4 → | #54 (formula engine) | The prototyping engine's formula runtime IS the spreadsheet-style formula engine for the deck's data layer; one compiler, one evaluator. |
| Section 4 → | #60 (threshold alerts) | Threshold rules are a thin special case of conditional rules (#100). |
| Section 4 → | #61 (currency localization) | Locale handling is shared; calculator formatting honors viewer locale (also §12.3 planning guide). |
| Section 4 → | #64 (data source access control) | Live-data-backed variables follow the same access-control rules as their underlying source: viewers never see source credentials. |
| Section 5 → | #81 (live app embedding) | Device frames (#103) reuse the iframe-sandbox runtime; the same allow-list, same auth passthrough, same fallback behavior. |
| Section 5 → | #82 (code blocks / JS sandboxes) | The calculator sandbox (#102) uses the same safe-eval primitives. The conditional rule sandbox (#100) inherits from these primitives. |
| Section 5 → | #84 (maps) | A "tap-to-filter" map hotspot is implemented as a hotspot (#96) targeting a variable write (#100). |
| Section 6 → | #85 (timeline-based animation) | Triggers (#88) consumed by variable changes, gesture fires, etc.; sequence timers (#106) integrate with the animation editor's per-slide timeline. |
| Section 6 → | #86 (magic move) | When a hotspot's target slide shares an element-id set with the source, magic move handles the transition automatically. |
| Section 6 → | #88 (per-element animation triggers) | Animation triggers consume runtime events (hotspot fire, variable change, form submit); the on-tick animation timing is shared with the auto-advance sequence (#106). |
| Section 6 → | #91 (slide transitions) | Hotspot-targeted transitions pick from this vocabulary. |
| Section 6 → | #93 (reduced motion) | Auto-advance (#106) and overlay animations honor this preference. |
| Section 8 → | #108 (full deck generation from prompt) | AI can author hotspots, branching, conditional rules, forms, calculators, quizzes by emitting the same JSON schema the editor produces. |
| Section 8 → | #111 (AI slide designer), #112 (AI redesign) | Prototyping features are treated as design-system constraints during AI redesign; AI cannot break reachable graph invariants. |
| Section 8 → | #113 (copy assistant) | Rule conditions and form labels are subject to AI translation; locale-aware. |
| Section 8 → | #114 (AI image generation) | Hotspot targets can be AI-generated images with hotspot regions auto-suggested from salient objects. |
| Section 8 → | #116 (AI speaker notes) | Speaker notes for branching slides can be auto-generated per branch. |
| Section 8 → | #117 (AI rehearsal coach) | The presentation state timeline (#205) integrates rehearsal telemetry with prototype replay to identify where the presenter stumbled. |
| Section 8 → | #118 (AI-anticipated Q&A) | Quizzes (#105) and quizzes embedded in Q&A flows are integrated. |
| Section 8 → | #119 (smart summarization) | A "smart summary" can be implemented as an auto-advance sequence (#106) with rules collapsing optional branches. |
| Section 8 → | #120 (audience-adaptive versions) | The 5-minute version uses branched entry points + auto-advance sequences; the technical version shows extra overlays; the exec version collapses branches. Variables drive the conditional routing. |
| Section 8 → | #123 (AI chart selection) | Calculator output charts (#102) participate in this selection algorithm. |
| Section 8 → | #125 (AI content freshness checker) | Bindings to live data (#48) automatically receive freshness flags; the freshness checker reuses the integrity chain. |
| Section 9 → | #126 (presenter view) | All of section 7's state is "presenter mode is just a prototype with no-presentation overlay"; the auto-advance timer (#106) and the overlay stack (#98) carry over. |
| Section 9 → | #127 (phone remote) | The phone remote's deep-link button uses the deep-link resolver (#107) to send a state token. |
| Section 9 → | #130 (instant "jump to slide" grid) | Builds on the same slide graph data structure. |
| Section 9 → | #129 (reorder/hide slides mid-presentation) | Hide and reorder are runtime mutators to the branching graph; the trail is recorded as events. |
| Section 9 → | #131 (rehearsal mode) | Rehearsal uses the same prototype session recorder (#104) with the presenter as the viewer. |
| Section 9 → | #133 (live "parking lot") | Q&A items are written to a session-scoped variable (#100); the wrap-up slide is bound to that variable. |
| Section 9 → | #136 (presenter failover) | Failover uses deep-link state (#107) to resume the exact slide and state on the phone. |
| Section 9 → | #137 (offline presenting) | The prototype runtime is designed offline-first; cached decks run identically without network. Telemetry is queued for later flush. |
| Section 9 → | #141 (instant recap) | Recap is built from the same `prototype_events` stream (#104) that powers user-testing replay — single source of truth. |
| Section 9 → | #205 (presentation state timeline) | Reuses the event log from #104 — same replay engine serves both. |
| Section 9 → | #209 (voice-triggered slide states) | Voice commands map to variable writes (#100); e.g., "bear case" → set `$scenario = "bear"`. Conditional rules (#100) propagate. |
| Section 9 → | #211 (two-way slides) | Two-way slides are a multi-viewer variant of section 7 — variables are `viewer`-scoped but shared across viewers in the session; variable writes propagate with CRDT semantics. |
| Section 9 → | #212 (deck inheritance trees) | Hotspots, rules, variables inherited via the same content-addressable ID namespace as deck merge (#19). |
| Section 9 → | #213 (real-time co-presenting) | Co-presenting is a multi-`viewer_id_hash` prototype session; `last-write-wins` per variable; conflicts surfaced. |
| Section 9 → | #214 (AI meeting listener) | Listener can trigger `navigate_to` or `set_variable` actions — the conditional rule engine handles the rest. |
| Section 10 → | #143 (live polls), #149 (slider sentiment) | Audience inputs are written to `session`- or `viewer`-scoped variables (#100); poll results drive conditional rules. |
| Section 11 → | #155 (deck is a web page) | Deep links (#107) are URLs into the same web-paginated runtime; the prototyping runtime and the published web page share the same `prototype_runtime`. |
| Section 11 → | #157 (sharing levels) | Prototype test links are a sharing level variant. |
| Section 11 → | #159 (per-link content control) | Deep links (#107) are the implementation: a link carries the visibility map. |
| Section 11 → | #163 (narrated auto-play) | Implemented via auto-advance (#106) bound to narration events. |
| Section 11 → | #164 (video export with interactivity) | Interactivity degrades gracefully — hotspots, calculators are rendered as their *current state* snapshots in the export; deep links in the export let viewers recover full interactivity. |
| Section 12 → | #169–#170 (per-viewer, per-slide analytics) | Prototype telemetry (#104) is one input; live presentation telemetry is another; analytics layer aggregates both. |
| Section 12 → | #173 (A/B testing) | A/B variant tags originate in the prototype recorder (#104) and flow into the analytics engine. |
| Section 12 → | #176 (CRM sync) | Form submissions (#101) and calculator submissions (#102) are the natural events to sync. |
| Section 12 → | #177 (funnel view) | The branching graph (`#97`) IS the funnel; analytics operates on the same node/edge representation. |
| Section 12 → | #205 (presentation state timeline) | Reuses `prototype_events`. |
| Section 13 → | #180 (review/approval) | Conditional rules (#100) cannot be shared externally until approval is granted. |
| Section 13 → | #186 (auto-updating shared slides) | Shared slides may carry variables/calculators/hotspots; when the source slide updates, downstream decks inherit the update via content-addressable IDs. |
| Section 13 → | #192 (guest collaborators with scoped, expiring access) | Same scoping/token expiry machinery used for deep links (#107). |
| Section 15 → | #205, #206, #209, #211, #212, #213 | All depend on the section 7 runtime — design references are pointers back to this document. |
| Section 16 → | #222 (full MCP tool surface) | Every feature #96–#107 must expose MCP tools (`create_hotspot`, `update_variable`, `set_scenario`, `run_calculator`, etc.). |
| Section 16 → | #225 (agent-scoped permissions) | MCP tokens carry capability claims; an agent given `modify_state` can update variables, but cannot query `viewer`-scoped variables without the additional `read_private` capability. |
| Section 16 → | #226 (semantic element addressing) | Hotspot IDs, overlay IDs, form IDs are first-class in the agent-readable schema; #235's `get_deck_summary` lists them. |
| Section 16 → | #227 (tool-call transcript) | Every MCP invocation on section 7 features is appended to the deck's audit trail (separately from human edits). |
| Section 16 → | #228 (dry-run mode) | Conditional rules (#100), variable writes, hotspot additions can be proposed as diffs and reviewed before landing. |
| Section 16 → | #229 (webhooks → agent triggers) | "When a variable `$customerScore` crosses 0.8, invoke agent X." is exactly the conditional-rule event-channel. |
| Section 16 → | #233 (function-calling-ready component props) | Variables are exposed as JSON Schema so LLMs can `set_variable` via structured output. |
| Section 16 → | #234 (natural-language patch API) | "Move the CTA hotspot to the bottom-right and add a Bear-case-triggering rule" — one patch handles hotspot + rule. |
| Section 16 → | #237 (deck linting for agents) | Includes a lint rule for: dead hotspots, unwired conditional rules, decimal-precision-bait formulas, untestable branches, missing KB exceeds in deep links. |
| Section 16 → | #239 (simulation mode for scenario testing) | The calculator runtime exposes `sweep(input, range)` that calls the bindings graph; an agent can sweep a slider programmatically and consume the results. |
| Section 16 → | #240 (deck diffing API) | Structural diffs of hotspots/rules/variables/calculators are first-class types in the diff API. |

**Section 7 ↔ Planning-guide section alignment.**
- §1 (Problem) — target user for §7 includes deck authors, trainers, salespeople, researchers — captured explicitly per persona in this document.
- §4 (Architecture) — modular monolith with two services (§7.4 intro) consistent with §4.2.
- §5 (Data) — Postgres + JSONB for rule graphs (§7.5), with documented retention, classification, and DSR endpoints.
- §7 (Security) — variables isolation, rule sandboxing, telemetry PII handling, deep-link auth are covered in §7.7. Bangladesh-PDPA-specific clauses are explicit and call out §11.1 of the planning guide directly.
- §8 (Infrastructure / DR) — DR RPO ≤ 1 hour for `prototype_sessions`, RPO ≤ 15 min for deck + rule graphs; RTO ≤ 30 min via the standard infra runbook.
- §11 (Legal) — Bangladesh context: PDPA compliance, localization considerations, retention limits; specific clauses in §7.7.3.
- §12 (Bangladesh context) — connectivity / mobile-first / Bangla i18n all inherited from §7.3.9–§7.3.10.

---

## Appendix A — Index of Feature Numbers and Where They Are Defined in This Document

- #96 → §7.1, §7.2.1, §7.3.3, §7.4.1, §7.5 hotspots, §7.6.1, §7.10 (Section 1, Section 6, Section 9)
- #97 → §7.1, §7.2.2, §7.3.3, §7.4.1, §7.5 hotspots (edges encoded in targets), §7.10 (Section 12 funnel, Section 16 simulation)
- #98 → §7.1, §7.4.2, §7.5 overlays, §7.10 (Section 6 animation)
- #99 → §7.1, §7.4.3, §7.5 interaction_states, §7.10 (Section 2, Section 16 component props)
- #100 → §7.1, §7.2.2, §7.3.1, §7.3.2, §7.4.4, §7.4.5, §7.5 variables/conditional_rules/bindings, §7.6.2, §7.6.3, §7.7.1, §7.7.2, §7.10 (Section 4, Section 8, Section 9, Section 16)
- #101 → §7.1, §7.2.4 (calculator draft), §7.3.4, §7.4.6, §7.5 forms, §7.6.4, §7.10 (Section 4, Section 9)
- #102 → §7.1, §7.2.4, §7.3.5, §7.4.7, §7.5 calculator_defs, §7.6.4, §7.10 (Section 4 formulas, Section 8, Section 16 simulation)
- #103 → §7.1, §7.2.5, §7.3.6, §7.4.8, §7.5 device_frames, §7.10 (Section 5 embeds)
- #104 → §7.1, §7.2.6, §7.3.8, §7.4.9, §7.5 prototype_sessions/events, §7.6.5, §7.7.3, §7.10 (Section 12 analytics, Section 16 audit)
- #105 → §7.1, §7.4.6 (form input registry shared with quizzes), §7.10 (Section 10 audience, Section 13 review)
- #106 → §7.1, §7.4.1 (timeline_runtime module), §7.3.9 a11y, §7.10 (Section 6 animation, Section 9 presenter, Section 11 narrated)
- #107 → §7.1, §7.2.7, §7.3.7, §7.4.10, §7.5 deep_links, §7.6.6, §7.7.4, §7.8.5, §7.10 (Section 11 publishing, Section 9 phone remote, Section 16 patch)

## Appendix B — Open Questions / Future Decisions

- **Quiz xAPI storage** — final SCORM/LRS provider selection pending (Tin Can vs. cmi5 vs. proprietary).
- **IRB / consent workflow** for academic-style user testing — PII redaction level may need a third tier ("anonymized-but-linkable" for compensation).
- **Determinism vs. responsiveness trade-off** in deep-link state — currently "link wins" by default; may need a UX-study pass.
- **Cross-deck deep links** — presently out of scope but architecturally easy; defer to a v2 once cross-deck knowledge graph (#219) lands.
- **Voice-triggered states (#209)** — speech recognition is a separate infrastructure concern; section 7 only owns the *action* surface that voice triggers consume.

---

_End of section 7 planning document._
