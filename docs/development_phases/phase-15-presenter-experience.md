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

# Phase 15 — Presenter Experience

**Phase:** 15
**Name:** Presenter experience
**Owner:** Stream E — Live Experience lead; sub-owners per workstream (Session Manager, Pairing, Annotation, Dynamic Plan, Rehearsal, Teleprompter, Parking Lot, PiP, Handoff, Failover, Offline, Display Profiles, Agenda Timers, Whisper, Recap)
**Critical-path:** No (surface phase, parallelizable — but Stage Session Manager is on the hot path used by P16 audience participation; the partner depends on this finishing)
**Parallel stream tag:** Stream E — Live Experience (sibling to P14 sharing & publishing and P16 audience participation)

**Intent:** Make the live moment the most reliable part of Domio. Ship a presenter view that drives a connected second screen or paired phone from a debounce-stable stage state; live annotation tools (pen, highlighter, spotlight, zoom lens, screen blur) at 60 FPS; on-the-fly slide reorder and hide without disturbing the canonical deck order; an instant jump-to-slide grid with thumbnail search; rehearsal mode with per-slide dwell tracking and pacing targets; a teleprompter that scrolls notes at adjustable speed; a live parking lot that auto-assembles a wrap-up slide; a picture-in-picture presenter camera bubble with virtual background; multi-presenter handoff that transfers stage state in ≤500 ms; failover from a dead laptop to a paired phone in ≤5 s; offline presenting mode backed by a fully-cached deck and snapshot-fallback live charts; 4K/LED-wall output profiles and dual-screen mirroring; agenda timers visible to presenter and optionally audience; end-to-end-encrypted backstage whisper from a teammate; and a post-presentation instant recap that summarizes what was shown, skipped, annotated, and time-spent per slide and is shareable through P14. The phase must remain fully functional with intermittent connectivity because it is the highest-stakes interaction in the product.

---

## 1. Goals

- A presenter opens a deck, presses Present, and a presenter's view appears on the second screen (or a draggable window) within ≤ 1 s showing current slide, next slide, speaker notes, elapsed/remaining timer, live preview of what the audience sees, and a QR code for phone pairing. (#126)
- A phone pair completes via QR scan in ≤ 500 ms on the same Wi-Fi, after which advance/retreat/jump commands apply within ≤ 100 ms p95 and the notes/laser pointer reflect the active slide within ≤ 250 ms p95. (#127)
- Live annotation tools (pen, highlighter, spotlight, zoom, screen blur) render at sustained 60 FPS with pen stroke lag ≤ 16 ms and spotlight lag ≤ 32 ms without remounting the slide; saved annotations become overlay layers in the deck. (#128)
- On-the-fly slide reordering and hiding commit within ≤ 150 ms p95 to audience and paired phones, are CRDT-merged between co-presenters, and never mutate the canonical deck order unless the presenter saves the change. (#129)
- A jump-to-slide grid renders thumbnails for up to 500 slides in ≤ 300 ms and supports search-as-you-type within ≤ 100 ms. (#130)
- Rehearsal mode records per-slide dwell time with ±250 ms accuracy, compares to per-slide pacing targets live, and writes a persisted rehearsal summary without polluting analytics. (#131)
- Teleprompter scrolls notes at 60–300 WPM with optional auto-advance synced to slide transitions and ≤ 100 ms manual override latency; mirror mode flips text for prompter glass. (#132)
- A live parking lot aggregates audience questions into presenter view within ≤ 250 ms p95 and regenerates a wrap-up slide within 1 s of any pinning change. (#133)
- A PiP presenter camera bubble runs WebGL2 self-segmentation at ≥ 30 FPS on a mid-tier laptop with adjustable position/shape/border/shadow and an opt-in virtual background; raw camera frames never leave the device. (#134)
- Multi-presenter handoff transfers the full stage state (slide, animation frame, prototype variables, agenda timers, parking lot, PiP config) in ≤ 500 ms p95 with audience-visible freeze ≤ 250 ms and either party can reclaim control at any time. (#135)
- Failover from a primary device to a paired phone completes in ≤ 5 s p95 from failure detection to resumed presentation, including assets, animations, agenda timer, and parking lot, using replicated state + last 5 s of deltas. (#136)
- Offline presenting mode loads ≤ 2 s from cache on a mid-tier laptop, renders the live charts from the most recent snapshot with a "snapshot from HH:MM" indicator, and reconciles pending local edits on reconnect. (#137)
- 4K/LED-wall output profiles cover 1080p/1440p/4K/8K/user-defined-up-to-16K-wide with sRGB / Display P3 / Rec.2020 + HDR; dual-screen mirroring supports clone, extend, audience-only. (#138)
- Agenda timers support multiple concurrent timers (agenda / hard stop / soft stop) with ±1 s accuracy over a 60-minute interval, persist across handoff and failover, and respect brand kit + reduced-motion preference when audience-visible. (#139)
- Backstage whisper delivers E2E encrypted notes between sender and presenter within ≤ 500 ms p95 with the control plane storing only ciphertext; queue offline whispers and surface on reconnect. (#140)
- Post-presentation instant recap is generated within 5 s of session end with per-slide dwell time, saved annotations, skipped slides, audience interaction summary, and open parking-lot items; recap is editable and shareable via the P14 share-link API. (#141)

---

## 2. Scope

### In scope (feature numbers, per `feature-list.md`)

| Feature | Description                                                                                     |
| ------- | ----------------------------------------------------------------------------------------------- |
| #126    | Presenter view: current + next slide, notes, timer, audience preview, on second screen or phone |
| #127    | Phone-as-remote + confidence monitor (QR pairing via realtime gateway)                          |
| #128    | Live annotation tools (pen, highlighter, spotlight, zoom lens, screen blur)                     |
| #129    | On-the-fly slide reordering and hiding from presenter view                                      |
| #130    | Instant "jump to slide" grid with thumbnail search                                              |
| #131    | Rehearsal mode with per-slide time tracking and pacing targets                                  |
| #132    | Teleprompter mode (scrolling notes at adjustable speed)                                         |
| #133    | Live parking lot with auto wrap-up slide                                                        |
| #134    | Picture-in-picture presenter camera bubble (with virtual background)                            |
| #135    | Multi-presenter handoff (state snapshot transfer)                                               |
| #136    | Presenter failover (phone resumes from exact slide/state)                                       |
| #137    | Offline presenting mode (fully cached with data snapshot fallback)                              |
| #138    | 4K/LED-wall output profiles and dual-screen mirroring                                           |
| #139    | Countdown/agenda timers (visible to presenter and optionally audience)                          |
| #140    | Backstage whisper (E2E encrypted private notes from teammate)                                   |
| #141    | Post-presentation instant recap (what was shown, skipped, annotated, time spent)                |

### Out of scope (deferred to other phases or never)

- **Audience-side channels** (live polls, word clouds, Q&A, quizzes, reactions, nav-votes, sentiment, raise-hand, personalized handouts, attendance, live captions, post-session feedback — #142–#154) → Phase 16 (the audience-side counterpart). The parking lot (#133) ingests from a single-channel stub only in P15; full participation ingestion in P16.
- **Narrated autoplay in presenter mode** — narration belongs to P14 (shared web deck); the presenter view reads the same narration tracks but does not introduce a separate TTS / cue-point authoring flow.
- **AI rehearsal coach** (#117) — coach feedback (pace, filler words, eye contact, etc.) is owned by P12 (AI copilot foundation); P15 exposes the per-slide dwell stream and shares `rehearsal_run` data with P12.
- **AI-anticipated Q&A** (#118) — owned by P12.
- **MCP presenter tools** (`start_session`, `advance`, `annotate`, `handover`, `failover`) — contracts emit here per `presenter-experience.md` §9.6, but full MCP tool wiring is P13/P22; P15 ships the event surface and audit emissions.
- **Custom presenter co-pilot moderation role** (driving agenda timer from a teammate's view) → P20 enterprise governance.
- **Two-way slides / negotiation scenarios** (#211), AI meeting listener (#214), gaze-guided highlighting (#207), gesture control (#208), voice-triggered slide states (#209) → P21 frontier.
- **Public sharing of recap without per-recipient signed token** — disallowed; recap share goes through P14.
- **Mobile-web presenter mode with full features** — desktop-only in v1; phone-as-remote works from any modern mobile browser but full presenter authoring is desktop.
- **Multi-language teleprompter real-time translation** — teleprompter renders any locale (Bangla bn-BD, Arabic RTL reserved, CJK); STT/MT/TTS translation is P16 (live captions).
- **Bangla (bn-BD) TTS voices for backstage whisper replay** — text-only whisper; audio whisper is P22 polish.
- **Conflict-free multi-presenter editing beyond CRDT basics** — two co-presenters see CRDT-merged dynamic plan; deeper merge UX (e.g., comment threads on the plan) is P18.

---

## 3. Dependencies

### Upstream (must be complete before P15 starts)

- **P00 — Repo, contracts, dev environment.** Contracts under `/contracts`; OpenAPI spec is source of truth; CI runs the contract suite.
- **P01 — Observability, CI/CD, infra baseline.** OpenTelemetry SDK, Prometheus exporters, secrets manager (for pairing-token HMAC keys, whisper Curve25519 keys, offline-cache AES key seals), CDN edge module, and the realtime gateway (Go) for QR pairing must be live.
- **P02 — Deck schema & scene-graph foundation.** `deck.schema.json`, `scene-graph.schema.json`, slide identity, `version_id` semantics are source of truth for stage hydration.
- **P03 — Canvas editor MVP.** Notes are authored here; presenter view reads them through the same notes API.
- **P04 — CRDT & presence.** Co-presenters use the same CRDT session; `state.timeline` (per #205) feeds the presenter awareness channel.
- **P05 — Persistence, versioning, branches.** Presenter session row is branch-scoped; `version_id` is the share unit for retrospective replay.
- **P06 — Components & templates.** Smart components expose typed props; rendered subtrees appear under annotation overlays.
- **P07 — Theming & brand.** Audience-visible timers respect brand kit (`--brand-primary`, etc.) and reduced-motion preference; teleprompter inherits font tokens.
- **P08 — Live data & charts.** Snapshot fallback uses the P08 snapshot service; stage refresh on `on_data_change` triggers (P09) during presenter mode.
- **P09 — Animation & transition system.** The presenter runtime mounts the same `TimelineEngine`; trigger resolver is observable and feeds the state timeline.
- **P10 — Prototyping & interactivity.** Prototype variables are part of the stage state transferred at handoff; deep-link slide states (#107) rehydrate.
- **P11 — 3D, motion & rich media.** 3D models hydrate identically in presenter view; video plays segments per click (#76) during live presenting.
- **P13 — Agentic & MCP.** MCP tool surface for presenter commands is emitted here per `presenter-experience.md` §9.6 and wired in P13.

### Cross-stream (parallel, must coexist)

- **P14 — Sharing & publishing.** Recap (#141) exports via the P14 export-pipeline + share-link API; `version_id` semantics; per-link visibility rules do **not** alter the presenter view (presenter always sees the canonical deck, with hidden slides dimmed).
- **P16 — Audience participation.** Audience Q&A, polls, raise-hand, and parking-lot items originate from P16; parking lot (#133) ingests from P16's channel via a `participation.ingest` API in P15.
- **P20 — Security & enterprise (continuous).** Audit retention, MFA on workspace admin, SSO gating on presenter tooling, per-region residency — P15 ships emissions; P20 ships the gating.

### Downstream (this phase unblocks)

- **P16 — Audience participation.** P15's `presenter_session` row is the source-of-truth for the audience-side `session` row; the QR pairing flow's realtime gateway is shared.
- **P17 — Analytics & engagement intelligence.** Per-stage-event telemetry (advance, annotation, plan, handover, failover, whisper, timer drift) feeds per-viewer and presentation-delivery analytics (#169–#178); rehearsal analytics (#131) lives here.
- **P18 — Collaboration & workflow.** Approval workflow (#180), comments (#179), and guest collaborators (#192) may operate on a `presenter_session` recap.
- **P20 — Security & enterprise.** Per-region residency, audit retention, SSO gating, and DLP for whisper content.
- **P21 — Novel & frontier.** AI meeting listener (#214) consumes the same state timeline; gaze/voice consent APIs (per §16) live alongside presenter state; living documents (#206) use `presenter_session.id` as the replay key.
- **P22 — Polish, scale, GA.** Multi-language teleprompter coverage, multi-CAA strategy for backwards-compat, PWA shell for offline boot, and the 25k-participant ceiling run are P22.

---

## 4. Workstreams

The phase splits into fifteen ordered workstreams. W1–W3 are foundational and must land first; W4–W12 depend on W1 (the Presenter Session Manager). W13–W15 depend on W1 + W6 (pairing + state replication).

### W1 — Presenter Session Manager & stage state

**Sub-owner:** Session Manager lead
**Goal:** Ship the source-of-truth service for a live presenter session: `presenter_session` row, slide index, animation frame, prototype variables, agenda timers, parking lot, PiP config; REST endpoints per `presenter-experience.md` §9.6.

**Tasks.**

1. Create Postgres table `presenter_session` with `state JSONB`, `agenda_timers JSONB`, `parking_lot JSONB`, `display_profile JSONB`, `pip_config JSONB`, `mode` enum (`live | rehearsal | offline | multi_presenter | failover`), `version BIGINT` (DDL per `presenter-experience.md` §9.5).
2. Implement `services/presenter-session` — `POST /v1/presenter/sessions`, `POST /v1/presenter/sessions/{id}/end`, `POST /v1/presenter/sessions/{id}/advance`, `POST /v1/presenter/sessions/{id}/annotate`, `POST /v1/presenter/sessions/{id}/plan`, `POST /v1/presenter/sessions/{id}/handover`, `POST /v1/presenter/sessions/{id}/failover`, `GET /v1/presenter/sessions/{id}/recap`.
3. Implement optimistic concurrency — `If-Match: etag` on every mutation; 409 + current state on conflict.
4. Implement idempotency keys for state mutations; replay-safe retry.
5. Implement audit emission for every mutation with `actor_id`, `session_id`, `ts`, `before`, `after`.
6. Wire `apps/editor` "Present" button (`apps/editor/src/components/present/PresentButton.tsx`) to start a session and route to `apps/presenter` runtime.
7. Add OpenAPI spec at `contracts/openapi/v1/presenter.yaml`.
   **Files / packages touched:** `db/migrations/2026Q4/p15_presenter_session.sql`, `services/presenter-session/src/{routes,handlers,state-machine,etag}.ts`, `apps/editor/src/components/present/PresentButton.tsx`, `apps/presenter/src/runtime/{SessionClient,Rehydrate}.ts`, `contracts/openapi/v1/presenter.yaml`.
   **Contracts produced:** `presenter_session.v1.yaml`, `presenter_session_state.v1.json`.
   **Tests written:**

- Migration test: every DDL block applies and reverts cleanly on a fresh DB; RLS policies enforce tenant scope.
- Unit: optimistic concurrency — concurrent edits yield exactly one winner with 409 + current state on the loser.
- Unit: idempotency — repeating the same mutation with the same key is a no-op.
- Integration: full lifecycle (`start → advance × 5 → annotate → plan → handover → end`) yields expected audit entries.
  **DoD:** Endpoints live in staging; idempotent; optimistic concurrency enforced; audit emissions present.

### W2 — Second-screen discovery & presenter view shell

**Sub-owner:** Presenter View lead
**Goal:** Ship the second-screen detection via Display API, fallback window placement, and the presenter view chrome (current, next, notes, timer, audience preview, QR pairing).

**Tasks.**

1. Implement `apps/presenter` — React/Preact SPA that detects displays, opens presenter view on the secondary display or as a draggable window.
2. Implement notes pane with 200 ms update budget; scrollable region when notes overflow; keyboard focus preserved.
3. Implement elapsed/remaining timer (accuracy ±250 ms / ±1 s respectively) using `performance.now()` anchored to the session start.
4. Implement audience preview that mirrors the on-stage view within 250 ms when network RTT ≤ 100 ms.
5. Implement pairing QR display (signed short-lived token, 60 s rotation).
6. Honor reduced-motion preference on the chrome (timer ticks do not animate when reduced).
   **Files / packages touched:** `apps/presenter/src/{App,DisplayDiscovery,NotesPane,Timer,AudiencePreview,PairingQR}.tsx`, `apps/presenter/src/runtime/presenter-chrome.module.css`.
   **Contracts consumed:** `GET /v1/presenter/sessions/{id}` from W1; pairing QR token from W6.
   **Tests written:**

- Unit: timer accuracy ±250 ms elapsed / ±1 s remaining over 60-minute synthetic run.
- Unit: notes pane updates within 200 ms of advance (synthetic event injection).
- E2E: dual-screen setup on macOS / Windows / ChromeOS — presenter view opens on the secondary display.
- E2E: fallback window placement when only one display is attached.
- Accessibility: 100 % keyboard reachable; WCAG 2.2 AA screen-reader pass.
  **DoD:** Presenter view runs in staging on at least two OS desktop environments; timer accuracy meets budgets.

### W3 — Thumbnail service + jump-to-slide grid

**Sub-owner:** Thumbnail & Search lead
**Goal:** Ship per-deck thumbnails and the jump-to-slide grid with search-as-you-type within 100 ms, even at 500-slide scale.

**Tasks.**

1. Implement `services/thumbnail` — server-side rendering of per-slide thumbnails via the same headless renderer as export; cache on CDN keyed by `deck_version_id + slide_id`; pre-generate on `deck.updated`.
2. Implement grid UI (`apps/presenter/src/components/JumpGrid.tsx`) with virtualized rendering for 500 slides; hidden slides dimmed; search filters within 100 ms.
3. Implement jump action — selecting a slide advances the stage within 200 ms p95 via the stage WebSocket.
4. Wire thumbnails to refresh on `deck.updated` ≤ 5 s (same event bus as P14).
   **Files / packages touched:** `services/thumbnail/src/{render,cache,refresh}.ts`, `apps/presenter/src/components/{JumpGrid,SlideThumb,SearchBox}.tsx`, `db/migrations/2026Q4/p15_thumbnails.sql`.
   **Contracts produced:** `GET /v1/decks/{deck_id}/thumbnails?slide_id=&size=` (signed CDN URL).
   **Tests written:**

- Performance: 500-slide grid renders in ≤ 300 ms; search-as-you-type responds within 100 ms on a 100 KB in-memory index.
- Performance: jump-to-slide stage advance ≤ 200 ms p95 in a synthetic WebRTC channel.
- Visual regression: thumbnails are consistent across the editor, presenter view, and P14 web-viewer (Percy).
  **DoD:** Jump-to-slide grid works at 500-slide scale within the budgets; thumbnails refresh on `deck.updated`.

### W4 — Annotation Engine + saved-overlay bridge to deck

**Sub-owner:** Annotation lead
**Goal:** Ship pen, highlighter, spotlight, zoom lens, and screen blur at 60 FPS with stroke lag ≤ 16 ms and spotlight lag ≤ 32 ms; saved annotations become overlay layers in the deck.

**Tasks.**

1. Implement `apps/presenter/src/annotation/{Engine,Layer,Pen,Highlighter,Spotlight,Zoom,Blur}.ts` — separate canvas layer to avoid reflow.
2. Implement Postgres table `annotation_layer` (per `presenter-experience.md` §9.5).
3. Implement "save annotation" — persists strokes/shapes as overlay layers attached to the slide id, optionally promoted into the deck on the presenter's command.
4. Implement pressure sensitivity for devices that report it (PointerEvent `pressure`).
5. Implement `POST /v1/presenter/sessions/{id}/annotate` to broadcast to audience view and paired phones.
6. Implement reduced-motion handling — pen/highlighter remain; spotlight/zoom/blur switch to a brief fade instead of an animated chase.
   **Files / packages touched:** `apps/presenter/src/annotation/{Engine,Layer,Pen,Highlighter,Spotlight,Zoom,Blur}.ts`, `services/presenter-session/src/handlers/annotate.ts`, `db/migrations/2026Q4/p15_annotation.sql`.
   **Contracts produced:** `annotation_layer.v1.json`.
   **Tests written:**

- Performance: stroke lag ≤ 16 ms p95; spotlight follow lag ≤ 32 ms p95 on a 60 FPS sustained workload (Chromium DevTools Performance trace).
- Unit: pressure sensitivity honors device input; highlighter with reduced-motion is a single alpha-overlay draw.
- Unit: save annotation creates an `annotation_layer` row; promote overlay creates a slide-level element with provenance `source: presenter_saved_annotation`.
- E2E: annotation broadcast reaches audience view and paired phones within 100 ms.
- Visual regression: pen + spotlight screenshots in Percy.
  **DoD:** All five annotation tools perform within budget; saved overlays persist correctly.

### W5 — Dynamic Plan Manager (reorder & hide)

**Sub-owner:** Dynamic Plan lead
**Goal:** Ship the on-the-fly slide reordering and hiding that does not mutate the canonical deck order unless the presenter saves the change.

**Tasks.**

1. Implement `dynamic_plan` table (per `presenter-experience.md` §9.5) — `order JSONB`, `hidden TEXT[]`, `updated_by`, `updated_at`.
2. Implement "running order overlay" — viewer applies `dynamic_plan` on top of the canonical deck without mutating it.
3. Implement drag-reorder UI in presenter view; commit within ≤ 150 ms p95 to audience and paired phones.
4. Implement hide toggle — hidden slides dimmed in jump grid; marked as `hidden` in recap; reversible at any time.
5. Implement two-presenter CRDT-merged reorder with last-writer-wins on visible position (no duplicates; all canonical slides accounted for).
6. Implement "save running order" — promotes overlay to a versioned "session order" tagged to the deck.
   **Files / packages touched:** `apps/presenter/src/components/{OrderEditor,HideToggle,SessionOrderPanel}.tsx`, `services/presenter-session/src/handlers/plan.ts`, `db/migrations/2026Q4/p15_dynamic_plan.sql`.
   **Contracts produced:** `dynamic_plan.v1.json`.
   **Tests written:**

- Property-based: reorders never introduce duplicates; all canonical slides accounted for; hide-and-show is a no-op.
- Performance: drag-reorder commit ≤ 150 ms p95 across audience + paired phones.
- E2E: two presenters co-editing the order converge with no duplicates.
- E2E: hidden slides still appear in presenter jump grid with badge; audience never sees hidden slide.
  **DoD:** Reorder/hide work without mutating the deck; CRDT-merged; saved as versioned overlay.

### W6 — Phone Remote Pairing + Confidence Monitor

**Sub-owner:** Pairing lead
**Goal:** Pair a phone via QR in ≤ 500 ms on the same Wi-Fi; advance/retreat/jump ≤ 100 ms p95; notes viewer and laser pointer within 250 ms p95; rotate tokens every 60 s; disconnect → keyboard fallback without state loss.

**Tasks.**

1. Implement `services/phone-pairing` — issues short-lived signed tokens (60 s rotation); supports WebRTC data channels and WebSocket fallback; revoked tokens disconnect within 1 s.
2. Implement QR code that encodes a deep link with the session-bound token (does not include the deck URL).
3. Implement `apps/presenter/src/phone/{PhoneRemoteClient,CapabilityRouter,LaserPointer}.ts` — advance/retreat/jump/laser/notes capabilities.
4. Implement `remote_pairing` table (per `presenter-experience.md` §9.5).
5. Implement confidence monitor UI on the phone — current slide, next slide, notes, agenda timer, parking lot digest.
6. Implement keyboard fallback when phone disconnects — no state loss; on-screen controls reappear.
7. Implement token revocation propagation within 1 s via the realtime gateway.
   **Files / packages touched:** `services/phone-pairing/src/{token,rotate,revoke,channel}.ts`, `apps/presenter/src/phone/{PhoneRemoteClient,CapabilityRouter,LaserPointer}.ts`, `apps/remote-web` (mobile browser target — pair landing + remote UI), `db/migrations/2026Q4/p15_remote_pairing.sql`, `contracts/openapi/v1/phone-pairing.yaml`.
   **Contracts produced:** `phone_pairing.v1.yaml`.
   **Tests written:**

- Performance: pairing handshake ≤ 500 ms p95 on the same Wi-Fi.
- Performance: advance command propagation ≤ 100 ms p95 over LAN WebRTC.
- Performance: notes viewer on phone reflects current slide within 250 ms p95.
- Performance: laser pointer rendered on stage within 60 ms p95.
- Security: replay of rotated token rejected; revoke propagates within 1 s.
- E2E: phone on iOS Safari and Android Chrome pairs successfully.
  **DoD:** Phone pair works in staging on real devices; revocations propagate.

### W7 — Rehearsal Mode + per-slide pacing

**Sub-owner:** Rehearsal lead
**Goal:** Ship rehearsal runs that record per-slide dwell time with ±250 ms accuracy, display pacing variance live, and save a rehearsal summary without polluting analytics.

**Tasks.**

1. Implement `rehearsal_run` table (per `presenter-experience.md` §9.5).
2. Implement rehearsal timer in presenter runtime — per-slide dwell captured with `performance.now()`; total elapsed = sum of active intervals (paused rehearsal does not tick).
3. Implement pacing-target UI — per-slide target (default 60 s); variance shown live (-15 s behind / +20 s over).
4. Implement rehearsal summary saved to deck on exit; date-stamped; listable per deck.
5. Implement "rehearsal does not affect analytics" — analytics plane distinguishes rehearsal via `mode == 'rehearsal'`.
   **Files / packages touched:** `apps/presenter/src/components/{RehearsalStart,RehearsalTimer,PacingPanel,RehearsalSummary}.tsx`, `services/presenter-session/src/handlers/rehearsal.ts`, `db/migrations/2026Q4/p15_rehearsal.sql`.
   **Contracts produced:** `rehearsal_run.v1.yaml`.
   **Tests written:**

- Unit: per-slide dwell accuracy ±250 ms over a 10-slide 20-minute synthetic rehearsal.
- Unit: paused rehearsal does not tick; total elapsed equals sum of active intervals.
- E2E: rehearsal summary appears under deck rehearsal history; analytics plane records zero viewer-side impressions.
  **DoD:** Rehearsal runs persist; pacing variance visible; analytics not polluted.

### W8 — Teleprompter Mode

**Sub-owner:** Teleprompter lead
**Goal:** Ship a teleprompter with 60–300 WPM scroll speed, optional auto-advance synced to slide transitions, manual override within ≤ 100 ms, mirror mode for prompter glass, and font-size auto-adjust based on display distance preset.

**Tasks.**

1. Implement `teleprompter_state` table (per `presenter-experience.md` §9.5).
2. Implement teleprompter UI (`apps/presenter/src/components/Teleprompter.tsx`) — scrolling notes, mirror flip, font-size presets (`room`, `broadcast`).
3. Implement auto-advance — synced to slide transitions via the stage WebSocket; debounce 100 ms.
4. Implement manual override — space/arrow keys snap scroll to a target word with ≤ 100 ms latency.
5. Implement reduced-motion handling — auto-advance respects reduced preference (no animation on scroll).
6. Implement locale rendering per `presenter-experience.md` NFR-PRE-I18N-1 (Bangla, Arabic RTL reserved, CJK).
   **Files / packages touched:** `apps/presenter/src/components/{Teleprompter,TeleprompterSettings}.tsx`, `services/presenter-session/src/handlers/teleprompter.ts`, `db/migrations/2026Q4/p15_teleprompter.sql`.
   **Contracts produced:** `teleprompter_state.v1.json`.
   **Tests written:**

- Unit: scroll-speed map 60–300 WPM; latency to manual override ≤ 100 ms.
- Unit: auto-advance debounce 100 ms; reduced-motion disables smooth-scroll.
- Localization: Bangla, Arabic (RTL reserved), CJK render in teleprompter.
  **DoD:** Teleprompter works in staging; manual override latency within budget.

### W9 — Live Parking Lot + wrap-up slide generator

**Sub-owner:** Parking Lot lead
**Goal:** Ship `parking_lot_item` ingestion, presenter view digest, and a wrap-up slide that auto-assembles pinned items within ≤ 1 s of pinning change.

**Tasks.**

1. Implement `parking_lot_item` table (per `presenter-experience.md` §9.5).
2. Implement parking-lot digest in presenter view — pinned items within ≤ 250 ms p95.
3. Implement reorder / mark answered / delete without disturbing pinned state.
4. Implement wrap-up slide generator — auto-assembles pinned items; regenerates within ≤ 1 s of pin/unpin.
5. Implement persistence across crashes and reconnects (state in DB, not just memory).
6. Implement item promotion — promoted items flow into a P16 Q&A item; promoted-to-agenda reminder reuses `agenda_timer` rows.
   **Files / packages touched:** `apps/presenter/src/components/{ParkingLot,ParkingLotItem,WrapUpSlide}.tsx`, `services/presenter-session/src/handlers/parking-lot.ts`, `db/migrations/2026Q4/p15_parking_lot.sql`.
   **Contracts produced:** `parking_lot_item.v1.yaml`, `wrap_up_slide.v1.json`.
   **Tests written:**

- Performance: digest updates within 250 ms p95 of pinning via a synthetic event.
- Performance: wrap-up slide regeneration ≤ 1 s of pin/unpin on a 30-item list.
- Crash-recovery: kill the presenter runtime mid-session; reconnect; parking lot state is intact.
- Integration: promotion → P16 Q&A stub fires within 250 ms (P16 stub available; full integration in P16).
  **DoD:** Parking lot works in staging; wrap-up slide regenerates within budget.

### W10 — PiP presenter camera bubble + virtual background

**Sub-owner:** PiP lead
**Goal:** Ship a PiP camera bubble with adjustable position/shape/border/shadow and WebGL2 self-segmentation ≥ 30 FPS on a mid-tier laptop; raw camera frames never leave the device.

**Tasks.**

1. Implement `pip_config` table (per `presenter-experience.md` §9.5) — `position`, `shape`, `width_px`, `height_px`, `virtual_background`, `border`, `shadow`, `consent_id`.
2. Implement camera capture via `getUserMedia`; explicit consent flow on first use; revocation hides the bubble immediately.
3. Implement WebGL2 self-segmentation (e.g., MediaPipe Selfie Segmentation model; ≤ 10 ms per frame on mid-tier laptops).
4. Implement bubble UI — adjustable position, shape (`rect | circle | rounded`), border, shadow; presets (`corner | banner | hidden`).
5. Honor reduced-motion preference — bubble follows cursor smoothly by default; reduced → step animation.
6. Implement raw-frame guard — processed bubble frames (with segmentation applied) cross the network only when explicitly shared; raw frames are confirmed to never leave the device via a CSP + network-isolation test.
7. Store `consent_id` proof of camera consent per session; revocation propagates within 1 s.
   **Files / packages touched:** `apps/presenter/src/pip/{Capture,Segmentation,Bubble,ConsentFlow}.ts`, `services/presenter-session/src/handlers/pip.ts`, `db/migrations/2026Q4/p15_pip.sql`.
   **Contracts produced:** `pip_config.v1.yaml`.
   **Tests written:**

- Performance: segmentation ≥ 30 FPS sustained for 10 minutes on a mid-tier CI machine.
- Unit: virtual-background kinds (`blur | image | video`) all apply correctly.
- Security: network-capture test confirms zero raw frames leave device (only processed blob leaves, with consent).
- Accessibility: revocation hides the bubble within 1 s.
  **DoD:** PiP renders in staging at 30 FPS; consent flow audit-logged; raw frames confirmed isolated.

### W11 — Multi-Presenter Handoff

**Sub-owner:** Handoff lead
**Goal:** Transfer full stage state in ≤ 500 ms p95 with audience-visible freeze ≤ 250 ms and either party can reclaim control at any time.

**Tasks.**

1. Implement `handover_state` table (per `presenter-experience.md` §9.5) — `from_presenter_id`, `to_presenter_id`, `transfer_token BYTEA`, `state_snapshot JSONB`.
2. Implement handoff protocol — sender serializes current state to a transfer token; recipient performs self-test (assets loaded, audio device ready); both agree on lock handoff; freeze ≤ 250 ms on stage.
3. Implement either-party-reclaim — either presenter can reclaim control at any time via the presenter runtime.
4. Implement network-loss fallback — if the recipient's network drops, control reverts to the original presenter; partial state on recipient side is discarded.
5. Implement audit emission for every handoff attempt with `result` (`pending | success | failure | reverted`).
6. Wire handoff UI in presenter view ("Take over" button in paired session).
   **Files / packages touched:** `apps/presenter/src/handoff/{HandoffClient,HandoffServer,SelfTest}.ts`, `services/presenter-session/src/handlers/handover.ts`, `db/migrations/2026Q4/p15_handover.sql`.
   **Contracts produced:** `handover_state.v1.yaml`.
   **Tests written:**

- Performance: handoff completion ≤ 500 ms p95 on a stable connection (synthetic).
- Performance: audience-view freeze ≤ 250 ms p95.
- Property-based: state snapshot includes slide index, animation frame, prototype variables, agenda timers, parking lot, PiP config.
- Negative: recipient network drop → control reverts within 1 s; no partial state leak.
- E2E: two desktop browsers on the same network; one takes over from the other.
  **DoD:** Handoff works in staging at p95 budgets; audit trail captures every attempt.

### W12 — Failover (laptop dies → phone resumes)

**Sub-owner:** Failover lead
**Goal:** Recover within ≤ 5 s p95 from failure detection to resumed presentation using replicated state + last 5 s of deltas.

**Tasks.**

1. Implement `failover_state` table (per `presenter-experience.md` §9.5) — `primary_device_id`, `paired_device_id`, `last_heartbeat_at`, `replicated_state JSONB`, `recovery_started_at`, `recovery_completed_at`.
2. Implement state replication — WebRTC data channel from primary to paired phone every 250 ms; cross-network relay through a control-plane push heartbeat.
3. Implement heartbeat miss detection — threshold (e.g., 3 misses × 250 ms = 750 ms) triggers failover offer to the paired phone.
4. Implement phone-side failover — load last replicated state from local cache + control-plane relay + last 5 s of state deltas; restore assets, animations, agenda timer; resume stage.
5. Implement automated voice prompt — if both devices are unavailable, an automated voice prompts the audience while the system attempts recovery.
6. Implement encrypted failover state — `Curve25519 + XSalsa20-Poly1305` to the paired device using a long-lived device key with optional hardware attestation.
7. Implement audit emission for every failover attempt with `result` (`pending | success | failure`).
   **Files / packages touched:** `apps/presenter/src/failover/{Replication,FaultDetection,Recovery,VoicePrompt}.ts`, `services/presenter-session/src/handlers/failover.ts`, `db/migrations/2026Q4/p15_failover.sql`.
   **Contracts produced:** `failover_state.v1.yaml`.
   **Tests written:**

- Performance: recovery time ≤ 5 s p95 from failure detection to resumed presentation.
- Property-based: replicated state covers slide index, animation frame, prototype vars, agenda timers, parking lot, PiP config.
- Security: failover state encrypted to the paired device; extraction-by-attacker test green.
- Negative: heartbeat drop triggers failover offer within threshold; recovery fails cleanly when devices unavailable.
- E2E: kill the primary browser; observe phone takeover within 5 s.
  **DoD:** Failover works in staging; recovery p95 budget met; encrypted replication audit-logged.

### W13 — Offline Cache + snapshot fallback

**Sub-owner:** Offline lead
**Goal:** Load a deck from cache in ≤ 2 s on a mid-tier laptop; live charts fall back to the most recent snapshot with a "snapshot from HH:MM" indicator; pending local edits reconcile on reconnect.

**Tasks.**

1. Implement service-worker-managed offline cache — HTML, assets, fonts, scripts, encrypted state; refreshed on each new view.
2. Implement encrypted cache — per-presenter key sealed in OS keystore; cache invalidates on presenter logout.
3. Implement snapshot fallback — live charts read the P08 snapshot service when offline; render with stale-data indicator (#63).
4. Implement pending-edit queue — local CRDT updates queue in IndexedDB; reconcile on reconnect using the P04 CRDT.
5. Implement offline mode detection — explicit "offline" mode in `presenter_session.mode` for analytics distinguishability.
   **Files / packages touched:** `apps/presenter/src/offline/{Cache,ServiceWorker,SnapshotFallback,PendingQueue}.ts`, `services/snapshot-fallback/src/{fetch,stamp}.ts`, `db/migrations/2026Q4/p15_offline_cache.sql`.
   **Contracts produced:** `offline_cache.v1.yaml`.
   **Tests written:**

- Performance: offline load ≤ 2 s on a mid-tier CI machine.
- Property-based: cache invalidates on logout; re-login decrypts with the same key.
- E2E: take the laptop offline; live charts snapshot with timestamp; pending edits reconcile on reconnect.
- Security: extraction-by-attacker test green; cache encrypted at rest.
  **DoD:** Offline presenting mode works in staging; budgets met.

### W14 — Display Profiles + dual-screen mirroring

**Sub-owner:** Display Profile lead
**Goal:** Ship output profiles for 1080p / 1440p / 4K / 8K / user-defined up to 16K wide, with sRGB / Display P3 / Rec.2020 + HDR; clone / extend / audience-only dual-screen mirroring; bandwidth estimation warning.

**Tasks.**

1. Implement `display_profile` table (per `presenter-experience.md` §9.5) — `width`, `height`, `refresh_hz`, `color_profile`, `hdr`, `bandwidth_estimate_mbps`.
2. Implement profile selector at session start; re-evaluable mid-session on display change.
3. Implement dual-screen mirroring modes — clone (same image), extend (presenter view + audience view), audience-only.
4. Implement bandwidth estimator — warns the presenter if device cannot sustain the chosen profile (e.g., 4K HDR on a 4 GB-RAM device).
5. Implement HDR — explicit opt-in; suppressed in dark environments via a brightness sensor check (or user toggle if sensor unavailable).
   **Files / packages touched:** `apps/presenter/src/display/{ProfileSelector,MirrorSelector,BandwidthEstimator}.ts`, `services/presenter-session/src/handlers/display-profile.ts`, `db/migrations/2026Q4/p15_display_profile.sql`.
   **Contracts produced:** `display_profile.v1.yaml`.
   **Tests written:**

- Unit: profiles 1080p / 1440p / 4K / 8K / 16K-wide custom all serialize correctly.
- Performance: 4K HDR profile renders at 60 FPS on a high-end CI machine; bandwidth warning fires correctly on a constrained profile.
- E2E: connect a 4K external display; profile auto-selected; clone/extend/audience-only all work.
  **DoD:** Display profiles live in staging; HDR opt-in; bandwidth warning tested.

### W15 — Agenda Timers + backstage whisper + instant recap

**Sub-owner:** Agenda Timers + Whisper + Recap lead
**Goal:** Ship concurrent agenda timers with ±1 s accuracy and persistence across handoff/failover; backstage whisper E2E encrypted between sender and presenter; instant recap generated within 5 s of session end, shareable via P14.

**Tasks.**

1. Implement `agenda_timer` table (per `presenter-experience.md` §9.5) — `label`, `starts_at`, `duration_ms`, `remaining_ms`, `visible_to`, `status`, `event_log`.
2. Implement multiple concurrent timers (agenda / hard stop / soft stop); paused / running / idle / done states.
3. Implement audience-visible timers respecting brand kit + reduced-motion preference.
4. Implement timer persistence across handoff and failover.
5. Implement `whisper_message` table (per `presenter-experience.md` §9.5) — `ciphertext BYTEA`, `nonce BYTEA`, `ephemeral_pubkey BYTEA`.
6. Implement E2E encryption — `Curve25519 + XSalsa20-Poly1305`; sender + presenter derive keys per session; control plane stores ciphertext only.
7. Implement whisper delivery ≤ 500 ms p95; offline queue; surfaced on reconnect.
8. Implement macro auth — authorized senders can trigger macros (advance, hide slide).
9. Implement `recap_summary` table (per `presenter-experience.md` §9.5) — per-slide dwell, slides shown, slides skipped, saved annotations, parking lot open, audience summary.
10. Implement recap generator — composes recap from session events within ≤ 5 s of session end; honors retention and residency settings.
11. Implement recap editing UI — presenter can add notes before saving or sharing.
12. Implement recap share — uses P14 share-link API; subject to P14 access policy and P20 audit retention.
    **Files / packages touched:** `apps/presenter/src/{agenda/Timer,TimerRail},whisper/{Channel,MacroAuth},recap/{Generator,Editor,Share}.ts`, `services/presenter-session/src/handlers/{agenda,whisper,recap}.ts`, `db/migrations/2026Q4/p15_agenda_whisper_recap.sql`.
    **Contracts produced:** `agenda_timer.v1.yaml`, `whisper_message.v1.yaml`, `recap_summary.v1.yaml`.
    **Tests written:**

- Unit: timer accuracy ±1 s over 60-minute synthetic run; pause/resume arithmetic correct.
- Unit: brand-kit CSS variables render in audience-visible timer; reduced-motion disables pulse animation.
- Security: E2E whisper round-trip — control plane stores ciphertext only; sender + presenter derive same key.
- Property-based: whisper delivery ≤ 500 ms p95; offline queue drains on reconnect.
- Performance: recap generation ≤ 5 s of session end.
- E2E: recap share via P14 creates a share link with the correct policy; recap cannot be shared without signed token.
- Privacy: PII redaction honors residency setting.
  **DoD:** Agenda + whisper + recap all work in staging; recall PII redaction honored.

### W16 — Cross-cutting observability, security, accessibility

**Sub-owner:** P15 lead + P20 reviewer
**Goal:** Emit the documented telemetry, harden against the OWASP crosswalk, and verify WCAG 2.2 AA across the presenter runtime.

**Tasks.**

1. Implement OpenTelemetry spans for every stage event — advance, annotation, plan, handover, failover, whisper, agenda timer drift.
2. Implement Prometheus histograms: `stage_advance_duration_seconds`, `annotation_render_frame_seconds`, `pairing_handshake_duration_seconds`, `handover_completion_duration_seconds`, `failover_recovery_duration_seconds`, `pip_segmentation_fps`, `agenda_timer_drift_seconds`.
3. Implement alerts: `stage_advance_p95 > 200ms`, `handover_completion_p95 > 700ms`, `failover_recovery_p95 > 8s`, `whisper_delivery_p95 > 1s`, `pairing_revoke_propagation_p95 > 1s`.
4. Implement WCAG 2.2 AA verification — keyboard-only presenter view; screen reader walk-through; reduced-motion compliance.
5. Implement localization verification — teleprompter renders Bangla, Arabic (RTL reserved), and CJK; notes rendering in bn-BD, ar, ja, zh-CN.
6. Implement security review checklist — token rotation + replay protection; whisper E2E round-trip; offline cache extraction test; pairing revoke propagation.
7. Implement data residency hooks — per-region residency honored; audit retention per P20.
   **Files / packages touched:** `services/presenter-session/src/observability/{log,metrics,tracing}.ts`, `apps/presenter/src/runtime/{a11y,i18n,security}.ts`, `docs/runbooks/presenter.md`.
   **Contracts produced:** `presenter_observability.v1.json` (event shapes).
   **Tests written:**

- Unit: every emitted event matches documented JSON shape (schema-fixture tests).
- Property-based: a stage event from one session never leaks into another (tenant isolation).
- Performance: PiP segmentation 30 FPS sustained for 10 minutes on a mid-tier CI machine.
- E2E: keyboard-only presenter view performs every action; screen reader walk-through documents each landmark.
- Localization: 4 languages render in teleprompter without overflow.
  **DoD:** Metrics, traces, alerts, a11y, i18n, security all verified before GA criteria met.

---

## 5. Architecture & Data

References: `/docs/04-system-architecture.md` (services under `/services/`, packages under `/packages/`, client modules under `/apps/`), `/docs/05-data-database-design.md` (16 new tables, all in `domio` schema, tenant isolation via `tenant_id` + RLS), `/docs/06-technology-stack.md` (Node.js/TypeScript for services, Rust/WASM for the realtime gateway, PostgreSQL, Redis, S3-compatible object store, OpenTelemetry), `/docs/07-security-planning.md` (Curve25519 + XSalsa20-Poly1305, OS-keystore sealing, audit retention), and `presenter-experience.md` §9.4–§9.7 for the full service map and contract shapes.

**New Postgres tables (per `presenter-experience.md` §9.5):**

```sql
presenter_session           -- session row; state/agenda_timers/parking_lot/display_profile/pip_config JSONB; mode enum; version BIGINT
second_screen               -- display_index, role (stage|presenter|clone|extend), resolution, color_profile, hdr
remote_pairing              -- device_id, token_hash BYTEA, token_issued_at, token_expires_at, capabilities, status
annotation_layer            -- slide_id, kind (pen|highlighter|spotlight|zoom|blur|saved), geometry, ephemeral, saved_as_overlay_id
dynamic_plan                -- session PK; order JSONB, hidden TEXT[], updated_by, updated_at
rehearsal_run               -- per_slide_ms JSONB, pacing_targets JSONB, total_ms
teleprompter_state          -- words_per_minute, auto_advance, mirror, font_size, scroll_offset
parking_lot_item            -- audience_participant_id, text, status (open|answered|deferred|deleted), pin_order
pip_config                  -- position, shape, width_px, height_px, virtual_background, border, shadow, consent_id
handover_state              -- from/to presenter, transfer_token BYTEA, state_snapshot JSONB, result (pending|success|failure|reverted)
failover_state              -- primary_device_id, paired_device_id, last_heartbeat_at, replicated_state JSONB
offline_cache_entry         -- composite PK (deck_id, presenter_id); encrypted_blob BYTEA; snapshot_at; schema_version
display_profile             -- name (1080p|4K|LED-8K|custom), width, height, refresh_hz, color_profile, hdr, bandwidth_estimate_mbps
agenda_timer                -- label, starts_at, duration_ms, remaining_ms, visible_to, status, event_log
whisper_message             -- from_user_id, ciphertext BYTEA, nonce BYTEA, ephemeral_pubkey BYTEA, delivered_at, read_at, macro
recap_summary               -- per_slide_ms, slides_shown, slides_skipped, saved_annotations, parking_lot_open, audience_summary
```

Full DDL with check constraints, FKs, and RLS policies in `db/migrations/2026Q4/{p15_presenter_session,p15_remote_pairing,p15_annotation,p15_dynamic_plan,p15_rehearsal,p15_teleprompter,p15_parking_lot,p15_pip,p15_handover,p15_failover,p15_offline_cache,p15_display_profile,p15_agenda_whisper_recap}.sql`. Indexes: `ix_presenter_session_tenant`, `ix_remote_pairing_session_status`, `ix_annotation_layer_session_slide`, `ix_parking_lot_session_pin_order`, `ix_handover_state_session_result`, `ix_failover_state_session`, `ix_whisper_session_created`, `ix_recap_summary_session`.

**New services & packages:**

- `/services/presenter-session/` — REST endpoints per W1 (start/end/advance/annotate/plan/handover/failover/recap), state-machine, optimistic concurrency.
- `/services/phone-pairing/` — short-lived signed tokens, 60 s rotation, WebRTC + WebSocket fallback.
- `/services/thumbnail/` — per-slide thumbnail renderer; CDN cache; pre-generate on `deck.updated`.
- `/packages/presenter-runtime/` — state machine, replay-safe reducer, push heartbeat, reconciliation logic shared by presenter view, paired phone, and failover phone.
- `/packages/curve25519-whisper/` — `Curve25519 + XSalsa20-Poly1305` keys, derived from presenter + sender per session.
- `/packages/offline-cache/` — service worker, encrypted blob, OS-keystore sealing.
- `/packages/pi-segmentation/` — WebGL2 self-segmentation (MediaPipe Selfie Segmentation model wrapper).
- `/apps/presenter/` — desktop presenter runtime (Preact/React) with second-screen discovery, annotation, plan editor, teleprompter, parking lot, PiP, agenda rail, whisper channel, recap editor; hooks W1–W15.
- `/apps/remote-web/` — mobile browser target for phone remote + confidence monitor.
- `/apps/editor/src/components/present/` — "Present" button, second-screen hint, pairing QR hint, failover status.

**New infrastructure:**

- `/infra/terraform/realtime-gateway/` — Go realtime gateway for QR pairing, WebRTC data-channel relay, push heartbeat.
- `/infra/terraform/observability/` — OTel collector config; Prometheus rule files; alert routing for the five thresholds.

**Migrations (under `db/migrations/2026Q4/`):** 14 files, one per workstream above.

**Contracts produced (versioned `/v1`):**

- OpenAPI: `presenter.yaml`, `phone-pairing.yaml`, `thumbnail.yaml`, `agenda_timer.yaml`, `whisper_message.yaml`, `recap_summary.yaml`, `pip_config.yaml`, `display_profile.yaml`, `handover_state.yaml`, `failover_state.yaml`, `rehearsal_run.yaml`, `parking_lot_item.yaml`, `offline_cache.yaml`.
- JSON-Schema: `presenter_session_state.v1.json`, `annotation_layer.v1.json`, `dynamic_plan.v1.json`, `teleprompter_state.v1.json`, `wrap_up_slide.v1.json`, `deck_updated.v1.json`, `post_message_protocol.v1.json` (shared with P14), `presenter_observability.v1.json`.
- TypeScript: `@domio/contracts/types/presenter/*` — generated.

---

## 6. Verification

| Feature       | Test                                                                                                          | Expected result                                                                                    | Owner                   |
| ------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------- |
| #126 AC-126.1 | Presenter view on second screen on macOS / Windows / ChromeOS                                                 | Window opens on secondary display within ≤ 1 s; timer accuracy ±250 ms / ±1 s; notes within 200 ms | W2 lead                 |
| #126 AC-126.2 | Single-display fallback                                                                                       | Window opens as draggable window with all panes                                                    | W2 lead                 |
| #127 AC-127.1 | Phone pairing on same Wi-Fi                                                                                   | ≤ 500 ms p95; advance ≤ 100 ms p95; notes within 250 ms p95; laser pointer within 60 ms p95        | W6 lead                 |
| #127 AC-127.2 | Phone disconnect                                                                                              | Keyboard fallback available; no state loss                                                         | W6 lead                 |
| #128 AC-128.1 | Pen stroke render lag                                                                                         | ≤ 16 ms p95 at sustained 60 FPS for 10 minutes                                                     | W4 lead                 |
| #128 AC-128.2 | Spotlight follow lag                                                                                          | ≤ 32 ms p95                                                                                        | W4 lead                 |
| #128 AC-128.3 | Save annotation → overlay                                                                                     | Overlay layer appears under the slide; reduced-motion collapses smoothly                           | W4 lead                 |
| #129 AC-129.1 | Drag-reorder commit                                                                                           | ≤ 150 ms p95 across audience + paired phones; CRDT-merged between co-presenters                    | W5 lead                 |
| #129 AC-129.2 | Hide toggle                                                                                                   | Hidden slides dimmed in jump grid; audience never sees hidden slide                                | W5 lead                 |
| #129 AC-129.3 | Save running order                                                                                            | Versioned "session order" overlay created; canonical deck order unchanged                          | W5 lead                 |
| #130 AC-130.1 | Jump-to-slide grid at 500 slides                                                                              | First render ≤ 300 ms; search-as-you-type ≤ 100 ms                                                 | W3 lead                 |
| #131 AC-131.1 | Rehearsal per-slide dwell                                                                                     | ±250 ms accuracy over 10-slide 20-minute rehearsal                                                 | W7 lead                 |
| #131 AC-131.2 | Pacing-target display                                                                                         | Variance shown live                                                                                | W7 lead                 |
| #131 AC-131.3 | Analytics distinguishability                                                                                  | Rehearsal runs produce zero viewer-side analytics events                                           | W7 lead                 |
| #132 AC-132.1 | Teleprompter speed 60–300 WPM                                                                                 | Scrolls correctly; manual override ≤ 100 ms                                                        | W8 lead                 |
| #132 AC-132.2 | Auto-advance synced to slide transitions                                                                      | Debounce 100 ms; reduced-motion disables smooth scroll                                             | W8 lead                 |
| #133 AC-133.1 | Parking-lot digest update                                                                                     | ≤ 250 ms p95 of pinning                                                                            | W9 lead                 |
| #133 AC-133.2 | Wrap-up slide regeneration                                                                                    | ≤ 1 s of pin/unpin on a 30-item list                                                               | W9 lead                 |
| #134 AC-134.1 | PiP segmentation                                                                                              | ≥ 30 FPS sustained for 10 minutes on mid-tier laptop                                               | W10 lead                |
| #134 AC-134.2 | Raw-frame isolation                                                                                           | Network capture confirms zero raw frames leave device                                              | W10 lead + P20 reviewer |
| #135 AC-135.1 | Handoff completion                                                                                            | ≤ 500 ms p95 on stable connection                                                                  | W11 lead                |
| #135 AC-135.2 | Audience freeze                                                                                               | ≤ 250 ms p95                                                                                       | W11 lead                |
| #135 AC-135.3 | Recipient network drop                                                                                        | Control reverts to original presenter within 1 s                                                   | W11 lead                |
| #136 AC-136.1 | Failover recovery                                                                                             | ≤ 5 s p95 from failure detection to resumed presentation                                           | W12 lead                |
| #136 AC-136.2 | Encrypted replication                                                                                         | Control plane stores ciphertext only                                                               | W12 lead + P20 reviewer |
| #137 AC-137.1 | Offline load                                                                                                  | ≤ 2 s on mid-tier laptop                                                                           | W13 lead                |
| #137 AC-137.2 | Snapshot fallback indicator                                                                                   | Live chart shows "snapshot from HH:MM"; pending edits reconcile on reconnect                       | W13 lead                |
| #138 AC-138.1 | 4K HDR profile                                                                                                | 60 FPS on high-end CI machine; bandwidth warning fires correctly on a constrained profile          | W14 lead                |
| #138 AC-138.2 | Dual-screen mirroring (clone/extend/audience-only)                                                            | All three modes work in E2E with a 4K display                                                      | W14 lead                |
| #139 AC-139.1 | Concurrent timers                                                                                             | ±1 s accuracy over 60-minute interval                                                              | W15 lead                |
| #139 AC-139.2 | Audience-visible timer brand kit + reduced-motion                                                             | CSS variables apply; no pulse animation when reduced                                               | W15 lead                |
| #140 AC-140.1 | Whisper delivery                                                                                              | ≤ 500 ms p95; offline queue drains on reconnect                                                    | W15 lead                |
| #140 AC-140.2 | Whisper E2E encryption                                                                                        | Control plane stores ciphertext only; sender + presenter derive same key                           | W15 lead + P20 reviewer |
| #141 AC-141.1 | Recap generation                                                                                              | ≤ 5 s of session end with per-slide dwell, saved annotations, slides skipped, parking lot open     | W15 lead                |
| #141 AC-141.2 | Recap share via P14                                                                                           | Share link created with correct policy; recap cannot be shared without signed token                | W15 lead + P14 reviewer |
| Cross-cutting | OWASP crosswalk per `presenter-experience.md` §9.7 — token rotation, E2E whisper, camera isolation, audit     | All mitigations verified                                                                           | P20 reviewer            |
| Cross-cutting | WCAG 2.2 AA + keyboard-only + screen-reader pass                                                              | 100 % presenter view reachable; landmarks documented                                               | W16 lead                |
| Cross-cutting | Localization — bn-BD, ar (RTL reserved), ja, zh-CN                                                            | All four locales render in teleprompter without overflow                                           | W16 lead                |
| Cross-cutting | RLS isolation — workspace A cannot read workspace B's `presenter_session`, `whisper_message`, `recap_summary` | 0 rows returned from cross-tenant query                                                            | P20 reviewer            |

**Performance benchmarks (CI gates):**

- Pairing handshake ≤ 500 ms p95 on same Wi-Fi; advance command ≤ 100 ms p95 over LAN.
- Annotation render lag ≤ 16 ms p95 at 60 FPS sustained 10 minutes.
- Jump-to-slide grid first render ≤ 300 ms at 500 slides.
- Handoff completion ≤ 500 ms p95; freeze ≤ 250 ms p95.
- Failover recovery ≤ 5 s p95.
- Stage advance latency ≤ 150 ms p95.
- PiP segmentation ≥ 30 FPS sustained 10 minutes.
- Timer accuracy ±1 s over 60-minute interval.
- Whisper delivery ≤ 500 ms p95; revoke propagation ≤ 1 s.

---

## 7. Risks & Open Decisions

| #       | Risk / decision                                                                                                                                                              | Mitigation                                                                                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-15-1  | **Stage uptime over 60-minute session.** Stage uptime target ≥ 99.9 % with active failover requires both devices to be online; offline environments must degrade gracefully. | Failover state + 5 s delta replication; explicit "offline mode" with snapshot fallback; crash-recovery tested at the 99.9 % bar; alerting on stage uptime SLO.                                                      |
| R-15-2  | **PiP raw-frame exfiltration via compromised plugin.** A malicious plugin could read the camera stream.                                                                      | WebGL2 segmentation happens in a sandboxed worker that only emits the processed bubble; raw frames confirmed not to cross the network via a CSP + network-isolation test; consent revocation propagates within 1 s. |
| R-15-3  | **Whisper replay via stored ciphertext.** A leaked ciphertext might be replayed to a different session.                                                                      | Per-message nonce + ephemeral keys + sender-side `from_user_id` binding; control plane stores `delivered_at` and `read_at` and rejects out-of-session messages.                                                     |
| R-15-4  | **Failover encryption key compromise.** A leaked device key could decrypt replicated state.                                                                                  | Long-lived device key with optional hardware attestation (WebAuthn); per-tenant rotation supported; P20 enterprise governance gates key rotation frequency.                                                         |
| R-15-5  | **Annotation overlay mis-attribution.** A co-presenter's annotation could be attributed to the wrong user if identity is lost during handoff.                                | `dynamic_plan.updated_by` and `annotation_layer.created_by` always set; CRDT-merged version preserves `user_id`; cross-tenant tests fail closed.                                                                    |
| R-15-6  | **Offline cache extraction by attacker.** A leaked laptop could expose cached deck state.                                                                                    | Per-presenter AES key sealed in OS keystore; extraction-by-attacker test green; cache invalidates on logout; P20 enterprise supports remote wipe.                                                                   |
| R-15-7  | **4K / LED-wall HDR capability detection on unknown hardware.** Some devices report HDR support but actually fail to deliver it.                                             | Bandwidth estimator refuses the profile; profile selector re-evaluates mid-session on display change; user-visible warning + manual fallback.                                                                       |
| R-15-8  | **Open: PiP virtual background per brand kit or per-deck.**                                                                                                                  | Per-deck in v1 to limit matrix; per-workspace brand kit deferred to P22. (Q1 in `presenter-experience.md` §9.11.)                                                                                                   |
| R-15-9  | **Open: presenter co-pilot driving agenda timer.**                                                                                                                           | P20 governance and dedicated moderator role; v1 ships single-presenter agenda control. (Q3 in §9.11.)                                                                                                               |
| R-15-10 | **Open: mobile-web full-feature presenter mode.**                                                                                                                            | Desktop-only in v1; phone-as-remote works from any modern mobile browser. (Q5 in §9.11.)                                                                                                                            |
| R-15-11 | **Open: recap audience sentiment default vs opt-in.**                                                                                                                        | Opt-in default in v1 to minimize PII; aggregate analytics only; per-viewer sentiment requires explicit consent. (Q2 in §9.11.)                                                                                      |
| R-15-12 | **Open: cross-deck cross-session knowledge graph participation patterns.**                                                                                                   | P21 frontier (#219); P15 emits events that P17 and P21 consume.                                                                                                                                                     |
| R-15-13 | **Open: whisper audio replay (TTS voices).**                                                                                                                                 | Text-only whisper in v1; audio whisper with TTS voices in P22.                                                                                                                                                      |
| R-15-14 | **Open: two-way slides / negotiation scenarios.**                                                                                                                            | P21 frontier (#211).                                                                                                                                                                                                |
| R-15-15 | **Open: AI meeting listener auto-suggesting Q&A.**                                                                                                                           | P21 frontier (#214); P15 emits the state timeline that P21 consumes.                                                                                                                                                |
| R-15-16 | **Multi-presenter rehearsal load.** Two presenters rehearsing concurrently generates duplicate `rehearsal_run` rows.                                                         | `rehearsal_run.presenter_id` is the unique key per deck; analytics plane tags rehearsals with `mode='rehearsal'`.                                                                                                   |

---

## 8. Demo

**Demo title: "Present anywhere, recover from anything."**

**Pre-demo setup (T-1 day):**

1. Sandbox tenant `domio-design` with a 20-slide product deck containing: title slide, KPI grid, 14-bar chart, a 3D product model, a hotspot with branching navigation, a video, a live-data chart bound to a Google Sheet, and a parking-lot-able Q&A prompt.
2. Two paired devices: a desktop (primary presenter) and an Android phone (paired via QR); a second presenter on a separate desktop to demo handoff.
3. 4K external display connected to the primary desktop; HDR enabled at OS level.
4. Rehearsal run pre-recorded with per-slide pacing targets.
5. Teleprompter with notes authored.
6. PiP bubble configured; virtual background image set.
7. Agenda timers set (one agenda, one hard stop).

**Script (15 min):**

1. **Presenter view + second screen.** Click "Present" on the desktop. The presenter's view opens on the 4K external display; current slide, next slide, notes, elapsed / remaining timer, audience preview, pairing QR all visible. Notes pane updates within 200 ms of advance. _(#126)_
2. **Phone pairing.** Scan QR with the Android phone. Pairing handshake ≤ 500 ms. Use the phone to advance; latency ≤ 100 ms p95 over LAN. Notes viewer on phone updates within 250 ms. _(#127)_
3. **Live annotation.** Open the pen tool; stroke lag ≤ 16 ms at 60 FPS sustained. Switch to spotlight — follows the cursor with ≤ 32 ms lag. Open zoom lens — configurable magnification 2×–16×. Save the annotation as an overlay under the slide. _(#128)_
4. **Reorder & hide.** In presenter view, drag slide 14 up next to slide 4; commit ≤ 150 ms p95 across audience + paired phones. Toggle "hide" on slide 8 — still visible in jump grid with badge; audience never sees it. Two co-presenters co-edit the order — CRDT-merged, no duplicates. Save the running order — versioned overlay. _(#129)_
5. **Jump-to-slide grid.** Press `G` to open the grid. 500 thumbnails render in ≤ 300 ms. Type "revenue" in search — results filter within 100 ms. Click slide 9 — advance within 200 ms. _(#130)_
6. **Rehearsal.** Click Rehearsal — the system runs a complete dry run with per-slide dwell tracking. Pacing variance shows live vs the per-slide 60 s target. Rehearsal summary saved; analytics plane records zero viewer-side events. _(#131)_
7. **Teleprompter.** Open teleprompter — notes scroll at 180 WPM. Toggle mirror — text flips for prompter glass. Space override snaps to a target word within 100 ms. _(#132)_
8. **Parking lot + wrap-up.** Audience suggests three questions via the P16 stub. Presenter pins one — digest updates within 250 ms. Unpin another — wrap-up slide regenerates within 1 s of pin/unpin. _(#133)_
9. **PiP camera bubble.** Enable camera with consent; bubble appears bottom-right; WebGL2 segmentation ≥ 30 FPS. Toggle virtual background blur; raw camera frames confirmed isolated. _(#134)_
10. **Multi-presenter handoff.** Co-presenter on the second desktop clicks "Take over". Handoff completes ≤ 500 ms p95; audience freeze ≤ 250 ms. Original presenter becomes a co-pilot. _(#135)_
11. **Failover.** Kill the primary desktop's network connection. Paired phone detects heartbeat miss and offers to take over; resumes within 5 s of detection, including assets, animations, agenda timer, parking lot. Audience experiences ≤ 250 ms stage freeze. _(#136)_
12. **Offline presenting.** Take the laptop offline. Open the deck — offline load ≤ 2 s. Live chart shows "snapshot from 14:55"; take it online — pending edits reconcile. _(#137)_
13. **4K / LED-wall output.** Switch output profile to 4K HDR; mirror selector switches between clone / extend / audience-only; bandwidth warning fires correctly on a constrained profile. _(#138)_
14. **Agenda timers.** Two concurrent timers (agenda + hard stop) count down; ±1 s accuracy; reduced-motion disables pulse animation; persists across handoff and failover. _(#139)_
15. **Backstage whisper.** A teammate sends a backstage whisper via desktop — delivered to presenter view within ≤ 500 ms p95; E2E encrypted (control plane stores ciphertext only). _(#140)_
16. **Recap.** End the session. Recap generated within ≤ 5 s with per-slide dwell, saved annotations, slides skipped, parking lot open, audience summary. Recap is editable and shared via the P14 share-link API. _(#141)_

**Pass criteria.** All 16 acceptance groups (#126–#141) are exercised. A "Demo passed" GitHub check is set when the Playwright suite covering flows 1–16 is green, and CI performance gates (§6) succeed. Status: `Internal demo passed`.

---

## 9. Definition of Done

- [ ] Code merged to `main` behind a single feature flag `p15_presenter_experience` (default OFF in prod until GA criteria met).
- [ ] All 13 OpenAPI specs versioned in `/contracts/openapi/v1/`; 7 JSON Schemas versioned in `/contracts/json-schema/`; TypeScript types generated.
- [ ] `pnpm test` green: unit (state machine, watermark-style annotation engine, agenda timer arithmetic, whisper key derivation, offline cache encryption, PiP segmentation, dynamic-plan reducer) ≥ 80 %; integration suites for `presenter-session`, `phone-pairing`, `thumbnail`, `failover`, `whisper`, `recap` green; Playwright `p15-presenter-experience.spec.ts` green.
- [ ] Performance CI gates green: pairing ≤ 500 ms p95; advance ≤ 100 ms p95; annotation 60 FPS ≤ 16 ms p95; handoff ≤ 500 ms p95 / freeze ≤ 250 ms p95; failover ≤ 5 s p95; stage advance ≤ 150 ms p95; PiP ≥ 30 FPS sustained 10 min; timer ±1 s over 60 min; whisper ≤ 500 ms p95; recap ≤ 5 s of session end; jump grid ≤ 300 ms at 500 slides.
- [ ] Security review signed off by an engineer not on the feature: token rotation + replay protection; E2E whisper round-trip; raw-frame isolation confirmed; offline-cache extraction test green; pairing revoke propagation ≤ 1 s.
- [ ] Telemetry in place: histograms `stage_advance_duration_seconds`, `annotation_render_frame_seconds`, `pairing_handshake_duration_seconds`, `handover_completion_duration_seconds`, `failover_recovery_duration_seconds`, `pip_segmentation_fps`, `agenda_timer_drift_seconds`, `whisper_delivery_duration_seconds`; counters `handover_total`, `failover_total`, `pairing_revoke_total`, `rehearsal_total`; alerts for the 5 thresholds in `presenter-experience.md` §9.9.
- [ ] Migrations applied in dev + staging; revert plan verified; RLS policies enabled and tenant-isolation test green.
- [ ] Documentation updated: `/docs/presenter-experience.md` cross-linked from this phase; runbook for `presenter-session`, `phone-pairing`, `failover`, `whisper`; presenter view author guide; second-screen + failover setup guide.
- [ ] Design partner deck validated end-to-end with a non-Domio user (one design partner at minimum).
- [ ] Accessibility verified: 100 % keyboard-only presenter view; screen-reader walk-through landmarks documented; WCAG 2.2 AA pass.
- [ ] Localization verified: teleprompter and notes render in `bn-BD`, `ar` (RTL reserved), `ja`, `zh-CN` without overflow.
- [ ] "Internal demo passed" status granted after the demo script runs green.
- [ ] Hooks left for downstream phases: `presenter_session.id` is the source-of-truth `session` row P16 audience participation references; per-stage-event stream is the substrate P17 analytics ingests; `presenter_session` row is the replay key P18 approval workflow and P21 state-timeline reuse; recap share goes through the P14 share-link API; MCP tool stubs (`start_session`, `advance`, `annotate`, `handover`, `failover`) emit here per `presenter-experience.md` §9.6 and are wrapped by P13.

---

_Document path: `/home/daiyaan2002/Desktop/Projects/domio/docs/development_phases/phase-15-presenter-experience.md`_
_Source docs (unchanged): `feature-list.md`, `pre-development-planning-guide.md`, `presenter-experience.md`, `editor-canvas.md`, `animation-transitions.md`, `live-data-charts.md`, `theming-branding.md`, `prototyping-interactivity.md`, `ai-copilot.md`, `audience-participation.md`, `analytics.md`, `collaboration-workflow.md`, `enterprise-governance.md`, `agentic-interfaces.md`, `3d-motion-media.md`, `components-templates.md`, `sharing-publishing.md`._
