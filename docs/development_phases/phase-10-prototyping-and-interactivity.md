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

# Phase 10 — Prototyping & Interactivity

> **Phase:** 10 of 22
> **Name:** Prototyping & Interactivity
> **Stream:** C (Interactive media) — runs in parallel with Phase 11 (3D & Media), Phase 06/07 (Ecosystem), Phase 08/09 (Data & Motion), Phase 12/13 (AI & Agents)
> **Critical path?** No — runs as a **deepening** track once Phase 05 lands. The variable store and deep-link codec are first-class shared infrastructure consumed by Phases 14, 15, 16, 17, and 21.
> **Owner:** Stream C tech lead + 4–6 engineers (frontend-heavy; needs both a runtime specialist and a formula/security specialist)
> **Status:** Not started (phase doc only)

**Intent.** Turn a static Domio deck into a clickable, branching, variable-driven interactive runtime — with hotspots (#96), non-linear navigation (#97), overlay states (#98), component state machines (#99), typed variables and safe conditional logic (#100), form inputs feeding variables (#101), sandboxed calculators (#102), simulated device frames (#103), prototype user-testing telemetry (#104), quiz mechanics (#105), timed auto-advance (#106), and deep-linkable slide states (#107). Every feature must be addressable via MCP so the agentic surface (Phase 13) and AI copilot (Phase 12) can author and patch it, and every interaction must be observable/replayable so the analytics layer (Phase 17) and presenter experience (Phase 15) inherit a single event log. The runtime is the substrate for "deck-as-interactive-product" — a Figma-grade prototype layer on top of the canvas.

---

## 1. Goals

1. **Clickable, non-linear navigation.** Any element or region of any slide becomes a hotspot (#96) that drives slide-to-slide branching (#97) or opens an overlay/URL/interaction. Branching graphs are inspectable, cycle-checked, and survive deck merge / inheritance.
2. **State machines and conditional logic.** Every component instance has a state machine (#99); the variable store (#100) is the single source of truth for runtime state; the conditional-rule engine is a sandboxed, deterministic evaluator with no `eval` and no globals.
3. **Forms, calculators, device frames.** Authors can drop in form inputs (#101), sandboxed decimal-precision calculators (#102), and device-frame sandboxes with simulated taps (#103), each wiring into the variable store with live recompute under a 5 ms per-frame budget.
4. **Observable, replayable, deep-linkable.** Every interaction is recorded as an integrity-protected telemetry event (#104); quizzes/auto-advance (#105, #106) emit xAPI-style statements and respect `prefers-reduced-motion`; deep links (#107) encode the full runtime state into a signed, expiring URL.
5. **Accessible and consent-compliant by default.** All hotspots/forms/overlays are keyboard-navigable, axe-clean; prototype telemetry honors BD-PDPA consent tiers, default-on PII redaction, and DSR endpoints.
6. **Agent-addressable.** Every feature in this phase has at least one MCP tool (e.g., `create_hotspot`, `set_variable`, `bind_variable`, `run_calculator`, `resolve_deep_link`) with semantic element addressing (`slide[3].hotspot[cta_pricing]`), so the Phase 13 agentic surface can read/write it without ambiguity.

---

## 2. Scope

**Feature numbers in scope (per `feature-list.md`):**

| Feature | Name                                        | Notes                                                                             |
| ------- | ------------------------------------------- | --------------------------------------------------------------------------------- |
| #96     | Clickable hotspots and links between slides | Foundations for navigation; normalized-coord geometry; multi-gesture              |
| #97     | Interactive branching presentations         | Directed graph; multi-start/multi-end; cycle detection; path_stack                |
| #98     | Overlay states (modals, tooltips, drawers)  | Per-slide overlay_stack; persistent + transient; focus-trap                       |
| #99     | Component states & interactions             | State machines per instance; `default/hover/pressed/focused/disabled/loading/...` |
| #100    | Variables & conditional logic               | Typed var store; 5 scopes; safe expression compiler; reactive bindings DAG        |
| #101    | Form inputs feeding variables               | 20+ input types; debounced validation; autosave drafts; locale-aware              |
| #102    | Embedded calculators                        | Sandboxed decimal128 DAG; form/graph mode; chart binding                          |
| #103    | Device frames with simulated input          | iPhone/iPad/Android/Desktop frames; touch-event shim; offline cache               |
| #104    | Prototype user-testing telemetry            | Integrity-protected event log; replay; CSV/Parquet export; consent UI             |
| #105    | Mini-games/quiz mechanics                   | Drag-to-match, hotspot, MCQ, fill-blank, ordering, flash_card, short_answer       |
| #106    | Timed auto-advance sequences                | `interval_ms`, pause/resume, `pause_on_event`, reduced-motion default-off         |
| #107    | Deep-linkable slide states                  | Signed base64url state token; short-form server mapping; scope-filtered vars      |

**Out of scope (deferred):**

- **3D interactions** (#65–#74, #69) — those are authored in Phase 11. Hotspots here may _trigger_ Phase 11 camera keyframes or physics via the trigger resolver, but do not own 3D authoring.
- **Audience participation transport** (#142–#154) — QR join, polls, leaderboards. The audience inputs ultimately write to the same `session`-/`viewer`-scoped variable store built here, but the transport is Phase 16.
- **AI-authored interactive content** (#108, #111–#114) — Phase 12 wraps the JSON Schemas emitted here. AI cannot author a conditional rule it cannot read.
- **MCP server core** (#221) — Phase 13, but every feature here must emit at least one MCP tool definition.
- **Sharing/publishing transport** (#155, #157) — Phase 14; this phase only ships the deep-link codec and recorder ingest.
- **Analytics OLAP / dashboards** (#169–#178) — Phase 17; this phase writes to the telemetry event stream and the analytics pipeline projects from it.
- **Presentation state timeline replay UI** (#205) — Phase 21, but the event log is shared.
- **Voice-triggered slide states** (#209), **two-way slides** (#211), **deck inheritance trees** (#212), **real-time co-presenting** (#213) — Phase 21; this phase exposes the action surface those features call into.
- **xAPI / SCORM LRS provider selection** — pending; we ship an xAPI-compatible emitter and a pluggable LRS adapter interface.
- **Cross-deck deep links** — deferred to v2 with cross-deck knowledge graph (#219).

---

## 3. Dependencies

**Upstream (must be complete):**

- **Phase 02 — Deck schema & scene-graph foundation.** Every row in this phase hangs off `(deck_id, slide_id, element_id)`. The element schema's `element_role` (e.g., `kpi.revenue`) is the binding key.
- **Phase 03 — Canvas editor MVP.** Hotspots, overlays, forms, calculators, and device frames are first-class canvas elements using the same selection / alignment / constraints system.
- **Phase 04 — CRDT.** Variable writes and hotspot geometry changes are multiplayer-editable; presence in the Connections panel and the Variables panel uses the CRDT awareness channel.
- **Phase 05 — Persistence, versioning, branches.** Hotspots, overlays, variables, rules, calculators, device frames, quizzes, sequences, and deep links are branch-scoped. Reordering slides (#129) invalidates affected `transitions` and cached `branching_graph` projections.

**Cross-stream (parallel, must coexist):**

- **Phase 06 — Components.** Smart-component prop definitions expose a `host-able` prop that auto-generates a hotspot. State machines (#99) extend component metadata; brand-locked components can lock state-machine transitions.
- **Phase 07 — Theming.** Quiz prompts, hotspot tooltips, overlay labels, form input labels, and calculator output formats are theme-token-driven (e.g., `color.brand.primary`).
- **Phase 08 — Live Data & Charts.** Cross-chart filtering (#52), what-if sliders (#53), and scenario manager (#57) write into the variable store defined here. The formula engine (#54) is shared with the calculator sandbox (#102).
- **Phase 09 — Animation & Transitions.** Hotspot fire / variable change / form submit are event sources for animation triggers (#88); auto-advance (#106) integrates with the animation editor's per-slide timeline. Magic-move (#86) handles transitions where hotspot targets share an element-id set.
- **Phase 11 — 3D & Rich Media.** Device frames (#103) reuse the iframe-sandbox runtime from F81. AR handoff (#74) tokens reuse the deep-link signing machinery from #107.

**Downstream (this phase unblocks):**

- **Phase 12 — AI Copilot.** AI slide designer (#111), AI redesign (#112), and data-to-story (#110) emit JSON matching the schemas emitted here. AI rehearsal coach (#117) integrates prototype telemetry with rehearsal.
- **Phase 13 — Agentic / MCP.** Every feature here has at least one MCP tool. Semantic element addressing (#226) reuses hotspot/overlay/form/calculator IDs.
- **Phase 14 — Sharing & Publishing.** Deep links (#107) are the implementation of per-link content control (#159); narrated auto-play (#163) reuses auto-advance (#106); video export (#164) snapshots interactivity into the export with deep-link revival.
- **Phase 15 — Presenter Experience.** Presenter view is "a prototype with a presenter overlay"; phone remote (#127) uses the deep-link codec; on-the-fly reorder (#129) mutates the branching graph at runtime; offline mode (#137) uses the cached prototype runtime.
- **Phase 16 — Audience Participation.** Audience inputs (`polls`, `slider sentiment`, `word cloud`) write to `session`- or `viewer`-scoped variables and drive conditional rules.
- **Phase 17 — Analytics & Engagement Intelligence.** Prototype telemetry (#104) is one input; per-viewer/per-slide analytics (#169–#170), A/B testing (#173), and the funnel view (#177) all consume the same `prototype_events` log.
- **Phase 18 — Collaboration & Workflow.** Comments pinned to hotspots/overlays/variables; review/approval (#180) blocks sharing external decks with conditional rules.
- **Phase 20 — Security & Enterprise.** Audit log, DLP, residency rules apply to telemetry (#104) and deep links (#107); MCP agent tokens (#225) carry capability claims over the variable store.
- **Phase 21 — Novel & Frontier.** Presentation state timeline (#205), living documents (#206), two-way slides (#211), co-presenting (#213), AI meeting listener (#214), and cross-deck knowledge graph (#219) all build on this phase's substrate.

---

## 4. Workstreams

The phase splits into eight ordered workstreams. **M1** is the foundation that blocks everything else; **M2** ships the variable store and conditional logic, the brain of the runtime; **M3** ships hotspots/branching/overlays/component states; **M4** ships forms/calculators/device frames; **M5** ships the recorder/telemetry; **M6** ships quizzes and auto-advance; **M7** ships deep links; **M8** is the MCP + agent surface that runs alongside M3–M7.

### M1 — Hotspot / Overlay / Branching Data Plane (foundation)

#### M1.1 — `hotspots`, `overlays`, `interaction_states`, `branching_edges` schema + CRUD

- **Files / packages touched:**
  - `db/migrations/2026Q4/p10_prototyping.sql` — `hotspots`, `overlays`, `interaction_states`, `branching_edges`, `presentation_sequences` (built per `/docs/prototyping-interactivity.md` §7.5.1–§7.5.3 and §7.5.11).
  - `db/migrations/2026Q4/p10_prototyping_indexes.sql` — `gin(geometry)` on `hotspots`, `(deck_id, slide_id, priority DESC)` on `conditional_rules`, `gin(metadata)` on `interaction_states`.
  - `services/prototype-runtime/src/routes/{hotspots,overlays,interaction-states}.ts` — REST handlers per `/docs/prototyping-interactivity.md` §7.6.1.
  - `packages/schema/src/prototyping/{hotspot,overlay,state-machine}.ts` — generated TS types from JSON Schemas.
- **Contracts produced:**
  - `contracts/openapi/v1/prototyping-hotspots.yaml`
  - `contracts/openapi/v1/prototyping-overlays.yaml`
  - `contracts/openapi/v1/prototyping-state-machines.yaml`
  - `contracts/json-schema/hotspot.v1.json`
  - `contracts/json-schema/overlay.v1.json`
  - `contracts/json-schema/state-machine.v1.json`
  - `contracts/json-schema/branching-edge.v1.json`
- **Tests written:**
  - Migration test: each DDL block applies and reverts cleanly; RLS policies enforce tenant scope.
  - Contract tests: every endpoint validates the JSON Schema (Ajv) and returns `400/422` (`application/problem+json`).
  - Unit: hotspot geometry stored in normalized `[0..1]` coords; round-trip preserves sub-pixel precision at 1080p.
- **DoD:** All endpoints from `/docs/prototyping-interactivity.md` §7.6.1 are live; tests green; types generated; MCP server (M8.1) sees the new contracts.

#### M1.2 — Hotspot hit-test, overlay stack, dangling-target checker

- **Files / packages touched:**
  - `apps/editor/src/prototyping/hotspots/HitTest.ts` — LRU-cached per slide; z-index aware; ≤ 0.1 ms p99.
  - `apps/web-viewer/src/prototyping/hotspots/HitTest.ts` — same contract; reused in presenter mode.
  - `apps/editor/src/prototyping/overlays/OverlayStack.ts` — z-stack; focus trap; `last-opened-on-top`.
  - `workers/prototype-runtime/src/dangling-checker.ts` — BullMQ worker; surfaces broken hotspots in the Connections panel.
- **Contracts consumed:** REST endpoints from M1.1.
- **Tests written:**
  - Unit: nested hotspots — innermost wins; LRU evicts under pressure.
  - Unit: overlay stack with 5 nested modals rejects the 6th open (`max_depth = 5`).
  - E2E: deleted target slide → hotspot flagged `dangling: true` within 60 s.
- **DoD:** Hotspot hit-test < 0.1 ms p99; overlay composite < 1 ms per overlay; focus trap returns focus to invoker.

#### M1.3 — Branching graph compute + Connections panel (graph view, cycle detection)

- **Files / packages touched:**
  - `services/prototype-runtime/src/branching/{graph,traverse,cycle-detect}.ts`
  - `apps/editor/src/components/prototyping/ConnectionsPanel.tsx` — list + graph view.
  - `apps/editor/src/components/prototyping/GraphView.tsx` — DAG layout via dagre/ELK; ≤ 16 ms update for ≤ 500 slides.
- **Contracts produced:** `POST /v1/decks/{deck_id}/branching/validate` (returns cycles, unreachable, islands).
- **Tests written:**
  - Unit: Tarjan SCC over a 500-slide fixture; detects every cycle and reports reachability.
  - Unit: `max_hops_per_session = 100` cap enforced; escape-room override up to 10 000.
  - E2E: author fixes a cycle from the Connections panel; one-click remove edge.
- **DoD:** AC-97.1–AC-97.4 pass in Playwright; Connections panel matches the spec in `/docs/prototyping-interactivity.md` §7.2.2.

### M2 — Variable Store + Conditional Rule Engine

#### M2.1 — `variables`, `variable_bindings`, `conditional_rules` schema + CRUD

- **Files / packages touched:**
  - `db/migrations/2026Q4/p10_variables.sql` — `variables`, `variable_bindings`, `conditional_rules` (per `/docs/prototyping-interactivity.md` §7.5.4–§7.5.5).
  - `services/prototype-runtime/src/routes/{variables,rules,bindings}.ts` — REST per `/docs/prototyping-interactivity.md` §7.6.2–§7.6.3.
  - `packages/schema/src/prototyping/{variable,binding,rule}.ts`.
- **Contracts produced:**
  - `contracts/openapi/v1/prototyping-variables.yaml`
  - `contracts/openapi/v1/prototyping-rules.yaml`
  - `contracts/json-schema/variable.v1.json`
  - `contracts/json-schema/conditional-rule.v1.json`
  - `contracts/json-schema/binding.v1.json`
- **Tests written:**
  - Unit: variable uniqueness per `(deck_id, name)`; `read_only` rejects writes with `403`.
  - Unit: bindings DAG cycle detected at validation; runtime aborts with `cyclic_update_aborted` after `max_depth=50`.
  - Contract: rule `POST /v1/rules/{id}/test` returns boolean for a given snapshot.
- **DoD:** Schema matches §7.5.4–§7.5.5; tests green; MCP tools (`create_variable`, `update_variable`, `create_rule`, `list_bindings`) wired in M8.

#### M2.2 — Safe expression compiler + evaluator + worker isolation

- **Files / packages touched:**
  - `packages/formula/src/compiler.ts` — recursive-descent parser; whitelist (`Literal | Ident | BinaryOp | UnaryOp | FuncCall | MemberAccess`); rejects `eval`, `Function`, dynamic property access, `with`, `delete`, `this`, `arguments`.
  - `packages/formula/src/evaluator.ts` — pure AST walker against an immutable `VariableContext`.
  - `packages/formula/src/builtin.ts` — `round, floor, ceil, abs, min, max, clamp, if, coalesce, length, match, formatNumber, formatCurrency, formatDate`.
  - `workers/formula-sandbox/src/index.ts` — dedicated Web Worker; per-frame budget 5 ms; memory cap 8 MB; `requestIdleCallback` chunking.
  - `services/prototype-runtime/src/routes/rule-eval.ts` — `POST /v1/rules/{id}/test`.
- **Tests written:**
  - Unit: `eval`, `Function`, dynamic access, prototype mutation, network — every one rejected at compile.
  - Unit: numeric overflow clamps to type range; divide-by-zero returns `0` with `was_zero_division: true`.
  - Property: 10 000 randomized expressions × variable contexts — eval is pure.
  - Fuzz: 100 000 malformed expressions — compiler rejects every one.
- **DoD:** AC-100.1–AC-100.4 pass; AC-100.7 (no raw JS eval) verified by negative tests; per-frame budget 5 ms p99.

#### M2.3 — Reactive bindings DAG + VarStore runtime

- **Files / packages touched:**
  - `apps/editor/src/prototyping/runtime/VarStore.ts` — `read(name, ctx)`, `write(name, value, opts)`, `subscribe(name, fn)`, `snapshot(scope)`, `restore(snap, opts)`.
  - `apps/editor/src/prototyping/runtime/BindingsDAG.ts` — topological propagation; ≤ 0.5 ms p99 per variable read.
  - `apps/web-viewer/src/prototyping/runtime/VarStore.ts` — same contract; reused in presenter and share views.
  - `packages/schema/src/prototyping/scopes.ts` — scope resolution `viewer → session → component_instance → slide → deck`.
- **Tests written:**
  - Unit: `Object.is` change detection — no spurious notification when value unchanged.
  - Unit: write to lower-scope variable does not affect higher-scope read.
  - Unit: viewer-scope write rejected with `403` from non-authorized surface.
- **DoD:** AC-100.5–AC-100.6 pass; bindings re-render ≤ 16 ms p99.

#### M2.4 — Rule evaluator + ActionExecutor (top-down priority, short-circuit)

- **Files / packages touched:**
  - `apps/editor/src/prototyping/runtime/RuleEvaluator.ts`
  - `apps/editor/src/prototyping/runtime/ActionExecutor.ts` — `show | hide | enable | disable | set_variable | navigate_to | play_animation | submit_form | open_overlay | close_overlay`.
  - `apps/editor/src/components/prototyping/RuleEditor.tsx` — safe expression builder UI; no raw input.
- **Tests written:**
  - Unit: rules evaluated in `priority desc, created_at asc`; first true short-circuits.
  - Unit: conflicting `show` then `hide` resolved by priority.
  - E2E: author builds "if $pricingTier == annual → show annualPricing"; preview toggle flips visibility.
- **DoD:** AC-100.5–AC-100.8 pass; < 5 ms p99 per rule batch of 100 rules.

### M3 — Component State Machines + State-Scoped Persistence

#### M3.1 — State machine runtime + transition events

- **Files / packages touched:**
  - `apps/editor/src/prototyping/state-machines/StateMachine.ts` — `{ states, transitions, initial }` parsed from component metadata.
  - `apps/editor/src/prototyping/state-machines/TransitionEvaluator.ts` — precedence `focus > press > click > hover > default`.
  - `apps/editor/src/prototyping/state-machines/EventBus.ts` — `onTransition` broadcast to VarStore subscribers.
- **Contracts consumed:** `interaction_states` from M1.1.
- **Tests written:**
  - Unit: hover + click fired same tick → press wins.
  - Unit: deleted state in transition graph → falls back to `default` with console warn.
  - Unit: animation interrupt — new state replaces in-flight animation target.
- **DoD:** AC-99.1–AC-99.4 pass; state-changed events propagate to bindings DAG.

#### M3.2 — State scope persistence (session / slide / deck / persistent_session)

- **Files / packages touched:**
  - `apps/web-viewer/src/prototyping/state-machines/StateScope.ts` — session-scoped default; `persist_instance_state` toggle.
  - `apps/editor/src/components/prototyping/StateInspector.tsx` — `pause_and_inspect` mode shows current state in layers panel.
- **Tests written:**
  - Unit: slide-scoped state resets on slide enter unless `persist_instance_state: true`.
  - Unit: persistent-session state serialized into deep links (#107).
  - E2E: brand-locked component (`brand_locked: true`) refuses state-machine edit from a junior role.
- **DoD:** AC-99.5–AC-99.6 pass; brand-lock enforced (Phase 06 contract).

### M4 — Forms, Calculators, Device Frames

#### M4.1 — Form registry, 20+ input types, validation chain, autosave drafts

- **Files / packages touched:**
  - `services/prototype-runtime/src/routes/forms.ts` — CRUD; `POST /v1/forms/{form_id}/submissions`; `POST /v1/forms/{form_id}/draft`.
  - `db/migrations/2026Q4/p10_forms.sql` — `forms`, `form_submissions` (per §7.5.6).
  - `apps/editor/src/prototyping/forms/{FormRegistry,InputRenderer,InputValidator,AutosavePolicy}.ts`.
  - `apps/editor/src/components/prototyping/inputs/{Text,Slider,Dropdown,DatePicker,RichText,Signature,FileUpload,...}.tsx`.
- **Contracts produced:**
  - `contracts/openapi/v1/prototyping-forms.yaml`
  - `contracts/json-schema/form.v1.json`
  - `contracts/json-schema/form-input.v1.json`
- **Tests written:**
  - Unit: type coercion (number rejects non-numeric), range (`min/max/length/pattern`), cross-field, async (400ms debounce).
  - Unit: required-field submit gate focuses the first failing field with `aria-invalid`.
  - Unit: file upload > 5 MB or wrong MIME rejected; virus-scanned before persistence.
  - E2E: locale-aware date picker renders Bangla/English; numeral locale respects §12.4 of pre-development-planning-guide.
- **DoD:** AC-101.1–AC-101.7 pass; `submissions` and `drafts` persist; submission hook fires `telemetry|network|conditional_rule|a_b_assign`.

#### M4.2 — Calculator DAG runtime + decimal128 arithmetic + builtin library

- **Files / packages touched:**
  - `db/migrations/2026Q4/p10_calculators.sql` — `calculator_defs` (per §7.5.7).
  - `packages/decimal128/src/{arithmetic,rounding,parse,format}.ts`.
  - `apps/editor/src/prototyping/calculators/{CalculatorDef,RecomputeEngine,BuiltinLibrary}.ts`.
  - `apps/editor/src/components/prototyping/CalculatorWizard.tsx` — Form mode + Graph mode.
  - `apps/editor/src/components/prototyping/CalculatorOutput.tsx` — number / chart / callout bindings.
- **Contracts produced:** `POST /v1/calculators/{calculator_id}/compute`; `GET /v1/calculators/{calculator_id}/state`.
- **Tests written:**
  - Unit: decimal128 precision — 38-digit accumulator; rounded output to configured precision (default 12).
  - Unit: `IRR` Newton-Raphson bounded; negative IRR "no IRR in range" path.
  - Unit: `formatCurrency` uses banker's rounding by default; locale-aware (en-US, bn-BD, de-DE, ja-JP).
  - Unit: DAG cycle detected at author-time; runtime never executes a cycle.
  - Property: DAG recompute on input change — ≤ 5 ms p99 for ≤ 100 nodes.
- **DoD:** AC-102.1–AC-102.6 pass; form-mode covers 80% of use cases; graph mode powers complex multi-stage ROI / TCO.

#### M4.3 — Device frame renderer + simulated input shim + offline cache

- **Files / packages touched:**
  - `services/prototype-runtime/src/routes/device-frames.ts` — CRUD on `device_frames` (per §7.5.8).
  - `apps/editor/src/prototyping/device-frames/{DeviceFrameRenderer,SimulatedInputShim,DeviceState}.ts`.
  - `apps/editor/src/components/prototyping/DeviceFramePresets.ts` — iPhone 15 Pro, iPad, Pixel 8, MacBook, generic desktop, custom resolution.
  - `apps/web-viewer/src/prototyping/device-frames/cache.ts` — keyed by frame URL + content hash + last-modified.
- **Contracts consumed:** Phase 11 F81's iframe-sandbox runtime; share-link auth passthrough (#62, #81).
- **Tests written:**
  - Unit: coordinate conversion slide → frame → device screen pixel; multi-resolution preserved.
  - Unit: `pointerdown`/`pointermove`/`pointerup` dispatched with `pointerType: 'touch'` and correct gesture map per device.
  - Unit: high-DPI rendering capped at 3x for embedded GPU constraints.
  - E2E: hotspot on iPhone screen → iframe receives `pointerdown` at mapped coords.
  - E2E: external content source unreachable → "source unreachable" overlay; hotspot no-op.
- **DoD:** AC-103.1–AC-103.7 pass; offline rendering of cached frame succeeds; rotation animates with section 6 transition vocabulary.

### M5 — Prototype User-Testing Telemetry Recorder

#### M5.1 — `prototype_sessions`, `prototype_events` schema + ingest API

- **Files / packages touched:**
  - `db/migrations/2026Q4/p10_telemetry.sql` — `prototype_sessions`, `prototype_events` (per §7.5.9), `integrity_chain JSONB`.
  - `services/prototype-recorder/src/ingest.ts` — `POST /v1/telemetry/prototype/batch` (per §7.6.5).
  - `services/prototype-recorder/src/integrity.ts` — chained HMAC; seq monotonicity; prev_hash linkage.
  - `workers/prototype-recorder/src/{session-pruner,dsr-erasure}.ts`.
- **Contracts produced:**
  - `contracts/openapi/v1/prototype-recorder.yaml`
  - `contracts/json-schema/prototype-event.v1.json`
- **Tests written:**
  - Unit: HMAC over `(payload || seq || prev_hash, server_key)` rejects any payload mutation.
  - Unit: reordering events detected by chain mismatch.
  - Integration: 5 K events/sec/region p99 ingest (load test).
  - Compliance: DSR endpoint removes both raw and derived data within 24 h.
- **DoD:** AC-104.1–AC-104.5 pass; PDPA retention cron enforced; consent UI served on first visit.

#### M5.2 — EventRecorder client + replay engine + heatmap aggregation

- **Files / packages touched:**
  - `apps/web-viewer/src/prototyping/recorder/{EventRecorder,ChunkedUploadStream,IndexedDBQueue}.ts` — `sendBeacon` + `fetch(keepalive)` fallback; 5 MB client buffer; 5 s flush.
  - `apps/editor/src/prototyping/recorder/ReplayRenderer.ts` — fast-forwards VarStore then plays events at original or accelerated speed.
  - `apps/editor/src/components/prototyping/recorder/{TestSessionsDashboard,Heatmap,Replay,ExportCsvParquet}.tsx`.
- **Contracts consumed:** ingest API from M5.1.
- **Tests written:**
  - Unit: reload mid-session continues via `rejoined_session_id`; merge by session token + fingerprint.
  - Unit: client buffer survives `navigator.sendBeacon` failure.
  - E2E: researcher opens dashboard → replay exactly reproduces viewer's experience (variable inspector shows snapshot at each event).
- **DoD:** AC-104.6–AC-104.8 pass; CSV/Parquet export round-trip; A/B variant tags propagate.

#### M5.3 — PII redaction, consent UI, retention, DSR endpoints

- **Files / packages touched:**
  - `apps/web-viewer/src/prototyping/recorder/PiiRedactor.ts` — client-side redact `***` for fields flagged `pii: true` unless consent is `opt_in`.
  - `apps/web-viewer/src/components/ConsentBanner.tsx` — three-tier consent (`opt_in | opt_out | anonymous`); retention displayed.
  - `services/prototype-recorder/src/dsr.ts` — `GET /v1/me/telemetry_sessions`, `DELETE /v1/me/telemetry_sessions/{id}`, bulk delete with `?before=`.
  - `apps/editor/src/components/prototyping/recorder/StudyConfig.tsx` — sampling rate, retention, redaction, A/B variant.
- **Tests written:**
  - Unit: PII fields redacted by default; raw only on `opt_in`.
  - Compliance: retention cron hard-deletes expired sessions and events within 24 h.
  - Compliance: region-pinned storage flag respected on session creation.
  - Security: HMAC failure rate alert fires when > 0.01% (potential key attack).
- **DoD:** AC-104 (privacy controls) pass; consent banner audit log entry per session; PDPA-ready.

### M6 — Quizzes + Auto-Advance

#### M6.1 — Quiz runtime + 9 question types + xAPI emission

- **Files / packages touched:**
  - `db/migrations/2026Q4/p10_quizzes.sql` — `quizzes`, `quiz_attempts`, `quiz_results`.
  - `services/prototype-runtime/src/routes/quizzes.ts` — CRUD + submission.
  - `apps/editor/src/prototyping/quizzes/{QuizRuntime,DragToMatch,HotspotQuiz,FillBlank,FlashCard,ShortAnswerLLM}.ts`.
  - `apps/editor/src/components/prototyping/quiz/{QuizPanel,Leaderboard}.tsx`.
- **Contracts produced:**
  - `contracts/openapi/v1/prototyping-quizzes.yaml`
  - `contracts/json-schema/quiz.v1.json`
  - `contracts/json-schema/xapi-statement.v1.json` — `actor | verb | object | result`.
- **Tests written:**
  - Unit: each question type validates against canonical rule; deterministic seed for re-attempts.
  - Unit: hotspot quiz — point-in-shape or centroid distance; tolerance configurable.
  - Unit: fill-blank — Levenshtein similarity; configurable typo tolerance.
  - Unit: LLM-graded short-answer falls back to human review queue below confidence 0.7.
  - E2E: pass → next-module slide; fail → remediation slide (branching integration with #97).
  - E2E: xAPI statement emitted; replayed by an external LRS reference (e.g., Yet Analytics SCORM Cloud).
- **DoD:** AC-105.1–AC-105.7 pass; leaderboard per session/cohort (#146 reuse); keyboard-only drag-to-match works (a11y).

#### M6.2 — Presentation sequences + pause/resume + reduced-motion default-off

- **Files / packages touched:**
  - `db/migrations/2026Q4/p10_sequences.sql` — `presentation_sequences` (per §7.5.11).
  - `apps/editor/src/prototyping/sequences/{TimelineRuntime,InterruptionPolicy}.ts`.
  - `apps/editor/src/components/prototyping/sequences/SequenceInspector.tsx` — `interval_ms`, `pause_on_event`, `loop`, `count`, `interruption_policy`.
  - `apps/web-viewer/src/prototyping/sequences/visibility-listener.ts` — pauses on `document.hidden`, resumes on visibility.
- **Tests written:**
  - Unit: pause/resume accumulates `paused_total_ms` correctly; resume displays the slide paused on.
  - Unit: `interruption_policy ∈ {ignore, queue, abort}` matches spec.
  - Unit: `prefers-reduced-motion: reduce` → sequence off by default.
  - Unit: `pause_warn_at_ms = 30 min` warning fires (kiosk-mode diagnostics).
- **DoD:** AC-106.1–AC-106.6 pass; pause control always visible; tab-backgrounded clock handled.

### M7 — Deep-Link State Codec

#### M7.1 — `deep_links` schema + StateEncoder/StateDecoder + signing

- **Files / packages touched:**
  - `db/migrations/2026Q4/p10_deep_links.sql` — `deep_links` (per §7.5.10); click_count, expires_at, viewer_scope.
  - `services/deep-link-svc/src/{encoder,decoder,shortener,resolve}.ts` — pure functions; HMAC-SHA256 with per-deck rotating `kid`.
  - `packages/deep-link/src/types.ts` — `{ v, exp, deck_id, slide_id, path_stack, overlay_stack, var_snapshot, device_frame_state, scenario, form_drafts, sig }`.
  - `services/deep-link-svc/src/routes.ts` — `POST /v1/deep_links/shorten`, `POST /v1/deep_links/resolve`, `DELETE /v1/deep_links/{id}` (per §7.6.6).
- **Contracts produced:**
  - `contracts/openapi/v1/deep-links.yaml`
  - `contracts/json-schema/deep-link-payload.v1.json`
- **Tests written:**
  - Unit: round-trip encode → decode preserves every field.
  - Unit: HMAC failure → decoder refuses; opens at default start.
  - Unit: expiry respected; mismatched `aud` rejected.
  - Unit: scope filter strips private/session-only/other-viewer vars before signing.
  - Security: 30-day key rotation + 7-day overlap window.
  - Replay-attack: single-use link enforced via `click_count <= 1`.
- **DoD:** AC-107.1–AC-107.6 pass; resolve latency ≤ 300 ms p95 in-region; ≤ 5 ms decode p99.

#### M7.2 — Share-current-state UI + toast on restore

- **Files / packages touched:**
  - `apps/editor/src/components/prototyping/ShareStateButton.tsx` — encodes current runtime state; copies URL; optional QR.
  - `apps/web-viewer/src/prototyping/deep-links/{Resolver,RestoreToast}.tsx` — "Resuming from your last session" toast ≤ 1.5 s.
- **Tests written:**
  - E2E: share at slide 7 with Bear case active + half-filled form → recipient lands at slide 7 with Bear + form draft.
  - E2E: token expired → "this link has expired, open at default?"
  - E2E: variable in snapshot deleted from deck → "Some variables from this link aren't in the current version of the deck; defaults will be used."
- **DoD:** AC-107.7 pass; "go to current version" banner offers recovery.

### M8 — MCP Agent Surface (parallel, depends on M1.1 + M2.1 contracts)

#### M8.1 — MCP tools for hotspots, overlays, variables, rules, bindings

- **Files / packages touched:**
  - `services/mcp/src/tools/prototyping/{hotspots,overlays,state-machines,variables,rules,bindings,forms,calculators,device-frames,quizzes,sequences,deep-links}.ts`.
  - `services/mcp/src/router.ts` — capability-claim gating (Phase 13 #225); `read_state | modify_state | bind_variable | manage_rules`.
  - `packages/agent-schema/src/prototyping/{hotspots,variables,rules}.ts` — JSON Schemas with semantic element addressing (`slide[3].hotspot[cta_pricing]`).
- **Contracts produced:**
  - `contracts/openapi/v1/mcp-prototyping.yaml`
  - `contracts/mcp/prototyping.tools.json` — `describe_schema`-friendly tool descriptions.
- **Tests written:**
  - Unit: every tool validates request against JSON Schema; rejects with `422` on invalid.
  - Security: agent without `modify_state` cannot `set_variable`; `read_private` required for `viewer`-scoped reads.
  - E2E: agent authors a conditional rule via `create_rule`; deck re-renders with new rule applied.
- **DoD:** AC: every feature in #96–#107 has at least one MCP tool; capability claims enforced; tool-call transcript appended to deck audit trail (#227).

#### M8.2 — Natural-language patch API for prototyping surfaces

- **Files / packages touched:**
  - `services/mcp/src/tools/prototyping/nl-patch.ts` — thin wrapper over the granular tools (Phase 13 #234); e.g., "Move the CTA hotspot to the bottom-right and add a Bear-case-triggering rule" → two tool calls.
  - `apps/editor/src/components/prototyping/agent/AuditTrail.tsx` — distinguishes human edits from agent edits (#227); diff preview before apply (#228).
- **Tests written:**
  - Unit: NL patch decomposed into granular tool calls; rollback on any failure.
  - E2E: dry-run patch shows diff; author approves; deck applies changes.
- **DoD:** NL patch accepted for hotspots, variables, rules, bindings, forms, calculators, device frames.

#### M8.3 — Simulator sweep + deck diff for prototyping surfaces

- **Files / packages touched:**
  - `services/mcp/src/tools/prototyping/simulate.ts` — `sweep(input, range)` for calculators (#239); programmatic scenario run.
  - `services/mcp/src/tools/prototyping/diff.ts` — structural diff of hotspots/rules/variables/calculators (#240).
- **Tests written:**
  - Unit: sweep across `team_size ∈ [1, 100]` returns 100 samples; ≤ 5 ms per sample for ≤ 100-node DAG.
  - Unit: diff produces structured `{ added: [], removed: [], changed: [] }` over two deck versions.
- **DoD:** Agents can run sensitivity analysis (#239) and produce diffs (#240) without UI round-trips.

---

## 5. Architecture & Data

References master docs: `/docs/04-system-architecture.md` (modular monolith control plane), `/docs/05-data-database-design.md` (Postgres source of truth + JSONB), `/docs/06-technology-stack.md` (TypeScript control plane, Go realtime, polyglot workers), `/docs/prototyping-interactivity.md` §7.4–§7.6.

### New Postgres tables (migrations `p10_prototyping.sql`, `p10_variables.sql`, `p10_forms.sql`, `p10_calculators.sql`, `p10_telemetry.sql`, `p10_quizzes.sql`, `p10_sequences.sql`, `p10_deep_links.sql`)

Exactly per `/docs/prototyping-interactivity.md` §7.5:

- `hotspots` (§7.5.1) — `deck_id`, `slide_id`, `shape`, `geometry JSONB`, `gesture_mask`, `target_type`, `target_ref JSONB`, `status`, `gin(geometry)`.
- `overlays` (§7.5.2) — `slide_id`, `type`, `size_strategy`, `anchor`, `open_trigger`, `close_trigger`, `persistent`, `schema`.
- `interaction_states` (§7.5.3) — `instance_id`, `state_machine JSONB`, `current_state`, `scope ∈ {session, slide, deck, persistent_session}`.
- `variables` (§7.5.4) — `(deck_id, name)` unique; `scope`, `type`, `default_value`, `visibility ∈ {deck_public, private, server_only}`.
- `variable_bindings` (§7.5) — `variable_id`, `target_kind`, `target_id`, `target_prop`, `transform`.
- `conditional_rules` (§7.5.5) — `(deck_id, scope_slide_id, priority DESC)` index; compiled `condition_expr JSONB`.
- `forms`, `form_submissions` (§7.5.6) — `form_id`, `submission_hook`, `schema`, autosave.
- `calculator_defs` (§7.5.7) — `graph JSONB` (DAG); `precision`, `rounding_mode ∈ {bankers, half_up, truncate}`.
- `device_frames` (§7.5.8) — `device_type`, `orientation`, `chrome_state`, `content_ref`.
- `prototype_sessions`, `prototype_events` (§7.5.9) — `seq BIGINT`, `sig_hmac BYTEA`, `prev_hash BYTEA`; UNIQUE `(session_id, seq)`.
- `deep_links` (§7.5.10) — `long_token`, `signature`, `expires_at`, `viewer_scope ∈ {anonymous, authenticated, scoped}`, `allowed_viewers JSONB`, `click_count`.
- `presentation_sequences` — `interval_ms`, `pause_on_event JSONB`, `loop`, `count`, `interruption_policy ∈ {ignore, queue, abort}`.
- `quizzes`, `quiz_attempts`, `quiz_results` — `question_type`, `passing_score`, `max_attempts`, `randomize`, `time_limit`, xAPI statement.
- `viewer_scoped_variables` (separate table, salted hash on `viewer_id_hash`) — privacy isolation (§7.7.1).

### New services

- **`services/prototype-runtime/`** (TypeScript + Hono) — REST + GraphQL surface for hotspots, overlays, variables, rules, bindings, forms, calculators, device frames, quizzes, sequences. Implements `VarStore`, `BindingsDAG`, `RuleEvaluator`, `ActionExecutor`, `ExpressionCompiler`. Embedded in editor and web-viewer via the package boundary (`@domio/prototype-runtime`).
- **`services/prototype-recorder/`** (TypeScript) — telemetry ingest service; integrity-chain validator; DSR endpoints; retention cron; PDPA compliance. Independent scaling for write-heavy load.
- **`services/deep-link-svc/`** (TypeScript) — encode/resolve/shorten; HMAC signing with key rotation; `kid` registry; revocation API.
- **`services/mcp/`** (Phase 13, this phase adds `prototyping/` tool subtree).
- **`workers/prototype-runtime/`** (Go) — BullMQ consumer for dangling-checker and sequence-warning timer.
- **`workers/formula-sandbox/`** (Web Worker inside `apps/`) — isolated formula evaluation; 8 MB memory cap; 5 ms per-frame budget.
- **`workers/prototype-recorder/`** (TypeScript) — session pruner; DSR erasure; cross-region storage enforcement.

### New packages

- **`packages/formula/`** — expression compiler + evaluator + builtin library (§7.3.2).
- **`packages/decimal128/`** — arithmetic, rounding, parse, format; shared with the data layer (#54).
- **`packages/deep-link/`** — encoder/decoder types + canonical payload version.
- **`packages/schema/src/prototyping/`** — generated TS types from JSON Schemas; semantic addressing helpers.
- **`packages/agent-schema/src/prototyping/`** — MCP-facing tool schemas with `slide[N].hotspot[id]` addressing.

### New CRDT additions

- Sub-document `prototype-runtime` per deck: variables, hotspots, overlays, rules, calculators, device frames, quizzes, sequences. Pinned in CRDT log with deck-version stamp.

### New event topics (NATS JetStream subjects)

- `prototype.events.{deck_id}` — every recorder event after integrity hash.
- `prototype.rule_fired.{deck_id}` — for analytics rollup (Phase 17).
- `prototype.variable_written.{deck_id}` — low-cardinality aggregate metric.
- `prototype.deep_link_resolved.{deck_id}` — auth/success metric.

### Migrations & data lifecycle

- Daily cron (`workers/prototype-recorder/src/session-pruner.ts`): hard-delete sessions past `retention_until` and cascade events within 24 h.
- DSR cron: remove both raw and derived data within 24 h of request.
- 30-day HMAC key rotation with 7-day overlap window for `deep_link_svc`.

### Security primitives

- HMAC keys stored in secrets manager (`/docs/07-security-planning.md` §7.3).
- PII redaction client-side; consent banner; DSR endpoints.
- Rule sandbox isolation in dedicated worker.
- Telemetry integrity chain (HMAC + chained hash).
- Audit log entry on every deep-link resolve and every rule fire above severity threshold.

---

## 6. Verification

| Feature     | Test                                                                                                                 | Expected result                                                                    | Owner               |
| ----------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------- |
| #96         | Author draws a hotspot on a slide, releases, picks target slide                                                      | Hotspot visible in Connections panel; tap in prototype preview navigates to target | Editor FE           |
| #96         | Author targets a deleted slide                                                                                       | Hotspot flagged `dangling: true`; "Broken connection" panel offers one-click fix   | Editor FE           |
| #96         | Hotspot drawn over a constrained element                                                                             | Geometry stored in normalized coords; resolves correctly at runtime                | Runtime             |
| #97         | Author builds a branching graph with cycle A→B→C→A                                                                   | Connections panel flags cycle; runtime caps traversal at `max_hops_per_session`    | Editor FE / Runtime |
| #97         | Multi-start deck — two slides marked `is_start`                                                                      | Connections panel warns; exactly one is `default_start`                            | Editor FE           |
| #97         | Replay with deterministic seed                                                                                       | Re-walked path is byte-identical to recorded `path_stack`                          | Runtime / Recorder  |
| #98         | Open a modal from inside another modal up to depth 5                                                                 | All five open with z-order `last-opened-on-top`; 6th rejected                      | Runtime             |
| #98         | Modal closed → focus returned to invoker; `aria-modal` set; `aria-describedby` set                                   | axe-core pass; manual keyboard-only pass                                           | FE / A11y           |
| #99         | Toggle a button; `onTransition` fires `default → pressed → default`                                                  | VarStore subscribers notified; animation replayed                                  | Runtime             |
| #99         | Brand-locked component with locked state machine                                                                     | Junior role cannot edit transitions; inline error                                  | FE / Permissions    |
| #100        | Toggle `$pricingTier` variable; conditional rule `if $pricingTier == annual → show annualPricing` fires              | Element visibility flips in < 16 ms                                                | Runtime             |
| #100        | Author pastes `eval("alert(1)")` into rule expression                                                                | Compile-time reject; UI red squiggle                                               | Compiler            |
| #100        | Circular binding A → B → A                                                                                           | Validation reject; runtime fallback `cyclic_update_aborted`                        | Runtime             |
| #100        | Formula divides by zero                                                                                              | Output `0` with `was_zero_division: true`; visible badge                           | Runtime             |
| #101        | Form input `email` validation: empty submit                                                                          | Submit blocked; first failing field focused with `aria-invalid`                    | FE / A11y           |
| #101        | File upload > 5 MB                                                                                                   | Rejected with inline error                                                         | FE / Security       |
| #101        | Locale `bn-BD`: date picker renders Bangla numerals and localized calendar                                           | Locale-correct rendering                                                           | FE / i18n           |
| #102        | Drag a slider in an ROI calculator                                                                                   | Output charts update in < 16 ms; recompute ≤ 5 ms for ≤ 100 nodes                  | Runtime             |
| #102        | Paste `1e308` into a `number` input                                                                                  | Rejected with "value too large" inline error                                       | Runtime             |
| #102        | Calculator DAG with a cycle                                                                                          | Author-time reject; runtime never executes                                         | Runtime             |
| #103        | Author places an iPhone 15 Pro frame on a slide; hotspot over screen calls `simulate_device_tap(x_pct=50, y_pct=30)` | Iframe receives `pointerdown`/`pointerup` at mapped coords                         | Runtime             |
| #103        | External content source unreachable                                                                                  | "source unreachable" overlay; hotspot no-op                                        | Runtime             |
| #103        | Frame orientation rotated from portrait → landscape                                                                  | 250 ms rotate animation; safe-area insets recomputed                               | Runtime             |
| #104        | Author shares prototype test link; viewer runs a 5-min session                                                       | Recorder streams 5 K events; HMAC integrity verified                               | Recorder            |
| #104        | Researcher opens dashboard → replay                                                                                  | Deck replays exactly with variable inspector                                       | FE                  |
| #104        | PII field `email` filled in `opt_out` mode                                                                           | Telemetry payload contains `***`                                                   | FE / Recorder       |
| #104        | DSR request: `DELETE /v1/me/telemetry_sessions/{id}`                                                                 | Session + events removed within 24 h                                               | Recorder            |
| #104        | Reorder/delete an event in the log post-hoc                                                                          | HMAC chain mismatch alert fires                                                    | Security            |
| #105        | Quiz MCQ with 1 correct                                                                                              | Score variable updates; pass → next-module slide; fail → remediation slide         | Runtime             |
| #105        | Drag-to-match by keyboard only (Tab + arrows + Enter)                                                                | Connections established; submit succeeds                                           | FE / A11y           |
| #105        | xAPI statement emitted for a quiz attempt                                                                            | External LRS receives and validates statement                                      | Runtime             |
| #106        | Author declares a sequence of 5 slides with `interval_ms = 4000`                                                     | Auto-advance runs; pause control always visible                                    | Runtime             |
| #106        | `prefers-reduced-motion: reduce`                                                                                     | Sequence disabled by default                                                       | Runtime             |
| #106        | Tab backgrounded mid-sequence                                                                                        | Clock paused; resumes on visibility                                                | Runtime             |
| #107        | Author clicks Share State at slide 7 with Bear case + half-filled form                                               | Recipient opens link → slide 7, Bear active, form draft restored, toast ≤ 1.5 s    | Deep-link svc       |
| #107        | Token expired                                                                                                        | "this link has expired, open at default?"                                          | Deep-link svc       |
| #107        | Variable in snapshot deleted from deck                                                                               | "Some variables from this link aren't in the current version" banner               | Deep-link svc       |
| #107        | Resolve latency in-region                                                                                            | ≤ 300 ms p95                                                                       | Deep-link svc       |
| MCP         | Agent invokes `create_hotspot` for `slide[3].hotspot[cta_pricing]`                                                   | Hotspot created; audit-trail entry "Agent: Claude via MCP — added hotspot"         | MCP                 |
| MCP         | Agent invokes `set_variable` for `$pricingTier = annual`                                                             | Variable write succeeds; bindings reactive update                                  | MCP / Runtime       |
| MCP         | Agent without `modify_state` calls `set_variable`                                                                    | Rejected with `403`                                                                | MCP / Auth          |
| Compliance  | PDPA retention: 90-day default                                                                                       | Expired sessions/events hard-deleted within 24 h                                   | Compliance          |
| Compliance  | BD-PDPA consent tier `opt_out`                                                                                       | No PII in raw telemetry; only aggregates                                           | Compliance          |
| Performance | Hotspot hit-test                                                                                                     | ≤ 0.1 ms p99                                                                       | Perf                |
| Performance | Rule eval batch (100 rules)                                                                                          | ≤ 5 ms p99                                                                         | Perf                |
| Performance | Calculator DAG recompute (100 nodes)                                                                                 | ≤ 5 ms p99                                                                         | Perf                |
| Performance | Deep-link decode                                                                                                     | ≤ 5 ms p99 for ≤ 4 KB tokens                                                       | Perf                |
| Performance | Telemetry ingest                                                                                                     | ≥ 5 K events/sec/region p99                                                        | Perf                |

---

## 7. Risks & Open Decisions

| Risk                                                                                                                                                      | Mitigation                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Variable store and conditional-rule engine are shared infrastructure for Phases 12, 13, 14, 15, 16, 17, 20, 21 — a wrong API here is expensive to change. | Schema freeze at end of M1.1 / M2.1; review board including Phase 12 / 13 / 16 / 17 leads; JSON Schemas published early.                           |
| Rule expression sandbox escape (QuickJS / Web Worker misconfig)                                                                                           | Pin known-good version; defense-in-depth: compile-time AST whitelist + runtime per-frame budget + memory cap; external fuzzing vendor in Phase 22. |
| Telemetry volume blow-up at 100% sampling with viral sharing (#155, #173)                                                                                 | Configurable sampling per deck (`1/n`); storage budget enforcement with oldest-first drop; retention knob default 90 days.                         |
| Deep-link tampering / replay attacks                                                                                                                      | HMAC signing with 30-day rotation + 7-day overlap; single-use link via `click_count <= 1`; revocation API.                                         |
| Hotspot hit-test on constrained elements after responsive scale                                                                                           | Geometry stored in normalized `[0..1]`; resolved at runtime against rendered rect; re-test on every constraint change.                             |
| `prefers-reduced-motion` interaction with auto-advance (#106) and overlays (#98)                                                                          | Default-off; explicit opt-in by author; always-visible pause control; axe-core checks.                                                             |
| LLM-graded short-answer quizzes (#105) — confidence calibration                                                                                           | Confidence threshold default 0.7 with human review queue below; cost cap per deck; toggleable per quiz.                                            |
| Device-frame external content source security (#103 → F81)                                                                                                | iframe sandbox `sandbox="allow-scripts allow-same-origin allow-forms"`; org allowlist; auth passthrough JWT; CSP `frame-ancestors`.                |
| xAPI / SCORM LRS provider selection (#105)                                                                                                                | Open question; ship pluggable LRS adapter interface; default to Yet Analytics SCORM Cloud reference impl.                                          |
| Quiz randomized attempt ordering must be deterministic per session but fair across attempts                                                               | Server-side shuffle keyed by `session_id`; persist ordering in `quiz_attempts` for replay.                                                         |
| Concurrent edits to variables (#99 + #213 co-presenting)                                                                                                  | Last-write-wins per variable; CRDT semantics; "merged with edit" toast on conflict.                                                                |
| Device-frame iframe cache staleness (#103 + #137 offline)                                                                                                 | Key by frame URL + content hash + last-modified; explicit refresh policy in the deck settings.                                                     |
| Audio/video associated with quizzes (#105 → #93 reduced-motion)                                                                                           | Captions/transcripts mandatory; QA pass per release.                                                                                               |
| Telemetry integrity chain storage cost                                                                                                                    | Compress `payload JSONB` (zstd); HMAC + prev_hash stored as `BYTEA`; archive cold sessions to object storage.                                      |
| Cross-deck deep links                                                                                                                                     | Deferred to v2 with cross-deck knowledge graph (#219); current deep links are single-deck only.                                                    |
| Open question: xAPI / SCORM provider selection                                                                                                            | Ship adapter interface + reference LRS.                                                                                                            |
| Open question: NL-patch decomposition into tool calls (M8.2)                                                                                              | Begin with template-based decomposition; LLM-driven decomposition deferred to Phase 22 polish.                                                     |

---

## 8. Demo

**Demo: "Sales playbook with an ROI calculator and prototype test"**

1. **Build (editor).** Open a 7-slide pitch deck. On slide 3, draw a hotspot over the "Pricing" CTA button; target = slide 5. Draw a second hotspot over "Try calculator" targeting a new slide 6.
2. **Branching graph.** Open Connections panel (Cmd/Ctrl+Shift+K). Graph view shows slide 3 → 5, 3 → 6. Run **Validate graph** — passes. Add an edge slide 6 → 7 conditional on `$calcResult > 100000`.
3. **Variables + rules.** Open Variables panel; create `$pricingTier` (enum `monthly | annual`, deck scope) and `$seats` (integer 1–500, deck scope, default 10). Create rule `if $pricingTier == annual → show annualDiscount`. Create rule `if $seats > 50 → show enterpriseBadge`.
4. **Calculator (slide 6).** Insert Calculator; form mode. Inputs: `team_size` (slider 1–500), `loaded_salary` ($50k–$300k default $120k), `hours_saved_per_week` (0–20 default 4), `weeks_per_year` (default 50). Outputs: `annual_savings`, `five_year_savings`. Charts auto-bound. **Preview** — drag slider, chart updates in < 16 ms.
5. **Form (slide 4).** Insert form: `name`, `email`, `seats` (slider 1–500). Validation: required, email pattern. Wire `seats → $seats` binding.
6. **Device frame (slide 5).** Insert iPhone 15 Pro frame; content = slide 5 sub-region. Add hotspot over the iPhone screen calling `simulate_device_tap(x_pct=50, y_pct=30)`. Preview → tap → iframe receives `pointerdown`.
7. **Overlay.** Add a tooltip on slide 5 over the "Annual savings" number; opens on hover.
8. **Component state machine.** Use a smart "Toggle" component; flip it. State `default → toggled_on`; `$pricingTier` writes `annual`.
9. **Auto-advance.** On the closing slide, declare a sequence `interval_ms = 5000` over slides 7 → end. Run reduced-motion check → sequence disabled.
10. **Quiz.** On slide 4, add a 3-question MCQ quiz; pass → slide 5; fail → remediation slide.
11. **Deep link.** At the end of the demo, click **Share state** at slide 6 with `$pricingTier = annual` and the form half-filled. Open the link on a different browser tab → lands at slide 6 with Bear/Annual scenario + form draft restored.
12. **Telemetry.** Author opens Share → Prototype Test Link → copies URL. Viewer (analyst role) clicks the link → consent banner appears → record runs. Analyst opens dashboard → replay shows the analyst's session with variable inspector and event palette.
13. **MCP.** From the MCP agent sandbox, call `create_hotspot` with semantic address `slide[3].hotspot[cta_pricing]`. Audit trail entry: "Agent: Claude via MCP — added hotspot." Call `set_variable` for `$pricingTier = annual`. Verify reactive update.
14. **Accessibility.** Run axe-core on every preview surface that hosts a hotspot/overlay/form/calculator/quiz. Manual keyboard-only pass: every hotspot reachable, every form input navigable, focus trap returns correctly, drag-to-match has a keyboard alternative.
15. **Compliance.** Verify DSR endpoint removes both raw and derived data within 24 h. Verify retention cron removes 90-day-old sessions within 24 h. Verify `bn-BD` locale renders date picker with Bangla numerals.

---

## 9. Definition of Done

A feature #96–#107 ships only when:

- **Code merged.** All M1–M8 workstreams merged to `main`; CRDT sub-documents pinned.
- **Contracts versioned.** `contracts/openapi/v1/prototyping-*.yaml`, `contracts/json-schema/*.v1.json`, `contracts/mcp/prototyping.tools.json` published and semver-tagged; consumers migrated.
- **Tests pass.** Unit ≥ 80% line coverage on runtime modules; integration suite green; E2E Playwright suite green; property-based tests green; fuzz suite green; axe-core pass; compliance suite green.
- **Telemetry in place.** Prometheus metrics: `domio_prototype_hotspot_resolve_total`, `domio_prototype_rule_eval_latency_seconds_bucket`, `domio_prototype_variable_write_total`, `domio_prototype_form_submission_total`, `domio_prototype_calculator_recompute_latency_seconds_bucket`, `domio_prototype_deep_link_resolve_total`, `domio_prototype_telemetry_ingest_events_total`, `domio_prototype_quiz_attempt_total`. OpenTelemetry spans cover `interaction.tap → hotspot.resolve → overlay.open | navigate → slide.render → variable.write → bindings.recompute`. Structured logs redact PII.
- **Alerts wired.** Deep-link resolve p99 > 800 ms for 5 min; telemetry ingest drop > 1%; formula eval error rate > 0.1%; HMAC failure rate > 0.01%; replay-integrity hash mismatch.
- **Documentation updated.** Public docs portal updated; author changelog entry added; BD-PDPA compliance runbook updated; security review passed per `/docs/07-security-planning.md`.
- **MCP surface complete.** Every feature in #96–#107 has at least one MCP tool tested under capability-claim gating; tool-call transcript visible in audit trail.
- **Localization verified.** `en`, `bn`, `es`, `ja` (with Bangla numerals per §12.4 of pre-development-planning-guide).
- **Performance budgets met.** Hit-test ≤ 0.1 ms p99; rule eval ≤ 5 ms p99; DAG recompute ≤ 5 ms p99; deep-link decode ≤ 5 ms p99; resolve ≤ 300 ms p95 in-region.
- **Demo passed.** Demo script (Section 8) executes end-to-end in internal environment with all expected results.
- **Cross-team sign-off.** Schema review board (Phase 02 owner) approves the variable store and conditional-rule engine schemas; security reviewer (Phase 20) approves telemetry, deep-link, and sandbox designs; UX lead approves the Connections panel and Variables panel designs.
- **Status:** "Internal demo passed" → eligible for "Design partner demo passed."
