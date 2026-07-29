# Section 9 — Presenter Experience (Features 126–141)

> **Scope:** This document is the deep technical plan for the presenter surface of Domio: dual-screen presenter view, phone-as-remote pairing, live annotation, on-the-fly slide reordering and hiding, rehearsal pacing, teleprompter mode, parking lot capture, PiP presenter camera, multi-presenter handoff, failover, offline cached presenting, 4K/LED output profiles, agenda timers, backstage whisper, and post-session recap. The presenter surface must remain fully functional with intermittent connectivity because it is the highest-stakes interaction in the product.

> **Cross-references:** [editor-canvas.md](editor-canvas.md) for scene graph and CRDT foundation; [animation-transitions.md](animation-transitions.md) for trigger and transition execution; [prototyping-interactivity.md](prototyping-interactivity.md) for variable/prototype state; [ai-copilot.md](ai-copilot.md) for rehearsal coach; [audience-participation.md](audience-participation.md) for participation channels; [analytics.md](analytics.md) for the post-session recap; [agentic-interfaces.md](agentic-interfaces.md) for state introspection and command surface.

---

## 9.0 Status & Assumptions

- Status: implementation-ready design. Open items are listed in §9.11.
- Assumptions: the deck is a versioned structured document (see [04-system-architecture.md](04-system-architecture.md)); the presenter participates in the same CRDT session as the editor; offline cache hits ≥99% for any deck authored in the last 30 days.
- Numbering: FR IDs follow `FR-PRE-<n>`, NFR IDs follow `NFR-PRE-<n>`.

---

## 9.1 Feature-by-Feature Mapping

### Feature 126 — Presenter view (current + next, notes, timer, audience preview, second screen / phone)

- **Intent:** Show the presenter the slide currently on stage, the next slide, speaker notes, an elapsed/remaining timer, a live preview of what the audience sees, and the ability to drive this from a second screen or paired phone.
- **Acceptance criteria:**
  - On a connected second screen, presenter view opens automatically via Display API or fallback window placement.
  - Notes pane updates within 200 ms of advance/retreat actions.
  - Elapsed timer accuracy ±250 ms; remaining timer accuracy ±1 s.
  - Audience preview mirrors the on-stage view within 250 ms when network RTT ≤ 100 ms.
- **Behavioral details / edge cases:**
  - When no second screen is detected, presenter view opens in a window the presenter can place beside the stage window.
  - When notes overflow the pane, a scrollable region appears with keyboard focus.
- **Dependencies:** [editor-canvas.md](editor-canvas.md) for notes storage; [audience-participation.md](audience-participation.md) for the audience preview channel.

### Feature 127 — Phone as remote + confidence monitor

- **Intent:** A phone paired via QR becomes a clicker, notes viewer, and laser pointer.
- **Acceptance criteria:**
  - Pairing via QR completes in ≤3 s on a 4G connection and in ≤500 ms on the same Wi-Fi.
  - Remote control commands (advance, retreat, jump-to-slide, blank screen) apply within 100 ms p95 over local Wi-Fi.
  - Notes viewer on phone reflects the current slide within 250 ms p95.
  - Laser pointer position on phone renders on stage within 60 ms p95.
- **Behavioral details / edge cases:**
  - Pairing protocol uses signed short-lived tokens with rotation; revoked tokens disconnect immediately.
  - If the phone disconnects, the presenter view falls back to keyboard and on-screen controls without losing state.
- **Dependencies:** §9.4 session manager.

### Feature 128 — Live annotation: pen, highlighter, spotlight, zoom lens, screen blur

- **Intent:** Allow the presenter to draw on top of the on-stage slide for emphasis.
- **Acceptance criteria:**
  - Pen stroke renders within 16 ms of pointer input at 60 FPS sustained.
  - Spotlight follows the presenter cursor with ≤32 ms lag.
  - Zoom lens renders at a configurable magnification (2×–16×) without remounting the slide.
  - Screen blur applies a Gaussian blur with adjustable radius.
- **Behavioral details / edge cases:**
  - Annotations are ephemeral by default; saving a slide captures annotations as overlay layers (see §9.5 data model).
  - Pressure sensitivity honored on devices that report it.
- **Dependencies:** [editor-canvas.md](editor-canvas.md) rendering pipeline; [animation-transitions.md](animation-transitions.md) for stage transitions.

### Feature 129 — On-the-fly slide reordering and hiding

- **Intent:** The presenter can reorder or hide slides mid-presentation without disturbing the audience.
- **Acceptance criteria:**
  - Drag-reorder in presenter view commits within 150 ms p95 to both audience view and any paired phones.
  - Hiding a slide is reversible; hidden slides still appear in presenter view with a "hidden" badge.
  - Reorder does not change the canonical deck order unless the presenter saves the change.
- **Behavioral details / edge cases:**
  - Two presenters editing the order concurrently see a CRDT-merged result with last-writer-wins on visible position.
  - Saving the running order creates a versioned "session order" overlay that future presentations can replay.
- **Dependencies:** CRDT session; §9.5 dynamic plan.

### Feature 130 — Jump-to-slide grid with thumbnail search

- **Intent:** Mid-presentation, the presenter can quickly jump to any slide.
- **Acceptance criteria:**
  - Grid renders thumbnails for up to 500 slides in ≤300 ms.
  - Search filters as the presenter types; results appear within 100 ms.
  - Selecting a slide advances the stage within 200 ms p95.
- **Behavioral details / edge cases:**
  - Thumbnails use deck-state snapshot and live update when slides change.
  - Hidden slides are dimmed in the grid.
- **Dependencies:** §9.4 session manager; thumbnail service.

### Feature 131 — Rehearsal mode with per-slide time tracking and pacing targets

- **Intent:** Run a full dry run that tracks how long each slide is on screen and compares to pacing targets.
- **Acceptance criteria:**
  - Per-slide dwell time recorded with ±250 ms accuracy.
  - Pacing target per slide is settable (e.g., 60 s); variance is shown live.
  - Rehearsal summary is saved to the deck for later review.
- **Behavioral details / edge cases:**
  - Rehearsal runs do not affect analytics.
  - A rehearsal can be paused and resumed; total elapsed reflects sum of active intervals only.
- **Dependencies:** §9.5 rehearsal_run; [analytics.md](analytics.md) rehearsal analytics.

### Feature 132 — Teleprompter mode (scrolling notes overlay)

- **Intent:** Display speaker notes as a smoothly scrolling overlay readable from a distance.
- **Acceptance criteria:**
  - Scrolling speed is configurable in words-per-minute from 60 to 300.
  - Notes auto-advance in sync with slide transitions when configured.
  - Manual override (space/arrow keys) snaps scroll to a target word with ≤100 ms latency.
- **Behavioral details / edge cases:**
  - Mirror mode flips the text horizontally for use with a prompter glass.
  - Font size auto-adjusts based on display distance preset (room scale, broadcast).
- **Dependencies:** §9.5 teleprompter state; notes storage.

### Feature 133 — Live parking lot

- **Intent:** Audience questions raised during a session are pinned and a wrap-up slide auto-assembles them.
- **Acceptance criteria:**
  - New parking-lot items appear in presenter view within 250 ms p95.
  - Wrap-up slide regenerates within 1 s of pinning or unpinning an item.
  - Items can be reordered, marked answered, or deleted without disturbing pinned state.
- **Behavioral details / edge cases:**
  - A parking-lot entry persists across crashes and reconnects.
  - Items can be promoted into Q&A, polls, or agenda reminders.
- **Dependencies:** [audience-participation.md](audience-participation.md) ingestion; §9.5 parking_lot_item.

### Feature 134 — Picture-in-picture presenter camera bubble

- **Intent:** A small bubble on stage shows the presenter's camera with optional virtual background.
- **Acceptance criteria:**
  - Bubble position and size adjustable; presets: corner, banner, hidden.
  - Virtual background segmentation at ≥30 FPS on a mid-tier laptop.
  - Bubble respects aspect ratio (4:3, 16:9, circle) with configurable border and shadow.
- **Behavioral details / edge cases:**
  - Camera access requires explicit consent; revocation hides the bubble immediately.
  - Camera frames are processed locally; raw frames never leave the device.
- **Dependencies:** §9.5 pip_config; WebGL segmentation; device permissions.

### Feature 135 — Multi-presenter handoff

- **Intent:** Pass control of the presentation to a co-presenter anywhere in the world without disrupting the audience.
- **Acceptance criteria:**
  - Handoff completes in ≤500 ms p95 on a stable connection.
  - Stage state (slide, animation frame, variables) transfers to the recipient.
  - Audience view experiences ≤250 ms freeze at the moment of handoff.
- **Behavioral details / edge cases:**
  - Either presenter can reclaim control at any time.
  - If the recipient's network drops, control reverts to the original presenter.
- **Dependencies:** §9.4 session manager; §9.5 handover_state.

### Feature 136 — Presenter failover (laptop dies → phone resumes)

- **Intent:** If the presenting device fails, a paired phone resumes at the exact slide and state.
- **Acceptance criteria:**
  - Recovery time from failure detection to resumed presentation ≤5 s p95.
  - State includes current slide, animation frame, prototype variables, agenda timer, parking lot, and PiP config.
- **Behavioral details / edge cases:**
  - Failover state is replicated continuously via WebRTC data channel and via push heartbeat to a control plane for cross-network resume.
  - If the phone is also unavailable, an automated voice prompt guides the audience while the system attempts recovery.
- **Dependencies:** §9.4 failover service; §9.5 failover_state.

### Feature 137 — Offline presenting mode with data snapshot fallback

- **Intent:** A presentation can run entirely from a cached deck even with no internet, including live charts from the latest snapshot.
- **Acceptance criteria:**
  - Offline presentation load time ≤2 s from cache on a mid-tier laptop.
  - Live charts use the most recent snapshot with a "snapshot from HH:MM" indicator.
  - When connectivity returns, the system reconciles any pending local edits.
- **Behavioral details / edge cases:**
  - The cache includes assets, fonts, scripts, and encrypted state necessary to present.
  - Snapshots are immutable and time-stamped; selecting the snapshot is per-deck.
- **Dependencies:** [editor-canvas.md](editor-canvas.md) offline cache; [live-data-charts.md](live-data-charts.md) snapshots.

### Feature 138 — 4K/LED-wall output profiles and dual-screen mirroring

- **Intent:** Output at very high resolutions and pixel-perfect aspect ratios for LED walls.
- **Acceptance criteria:**
  - Output profiles for 1080p, 1440p, 4K, 8K, and user-defined resolutions up to 16K wide.
  - Color profiles: sRGB, Display P3, Rec. 2020; HDR where supported.
  - Dual-screen mirroring configurable: clone, extend, audience-only.
- **Behavioral details / edge cases:**
  - Bandwidth estimation warns the presenter if the device cannot sustain the chosen profile.
  - HDR requires explicit opt-in and is suppressed in dark environments to avoid color shifts.
- **Dependencies:** §9.5 display_profile; renderer capability detection.

### Feature 139 — Countdown/agenda timers

- **Intent:** Timers that count down for agenda items and overall session length, visible to the presenter or audience.
- **Acceptance criteria:**
  - Timer accuracy ±1 s over a 60-minute interval.
  - Multiple timers (agenda, hard stop, soft stop) run concurrently.
  - Audience-visible timers respect brand kit (see [theming-branding.md](theming-branding.md)) and reduced-motion preference.
- **Behavioral details / edge cases:**
  - Timers persist across handoff and failover.
  - Timer events generate analytics signals.
- **Dependencies:** §9.5 agenda_timer.

### Feature 140 — Backstage whisper

- **Intent:** A teammate sends the presenter private notes mid-presentation.
- **Acceptance criteria:**
  - Whispers delivered to the presenter view within 500 ms p95.
  - End-to-end encrypted between sender and presenter; the control plane cannot read content.
  - Whisper history is reviewable after the session and exportable with consent.
- **Behavioral details / edge cases:**
  - Whispers can trigger macros (advance, hide slide) when the sender is authorized.
  - If the presenter is offline, queued whispers are surfaced on reconnect.
- **Dependencies:** §9.5 whisper_message; §9.7 key management.

### Feature 141 — Post-presentation instant recap

- **Intent:** After the session, the system summarizes what was shown, skipped, annotated, and time spent per slide.
- **Acceptance criteria:**
  - Recap generated within 5 s of session end.
  - Includes per-slide dwell time, annotations saved, slides skipped, audience interaction summary, and any parking-lot items left.
  - Exportable as a PDF or shareable link (subject to [sharing-publishing.md](sharing-publishing.md) policy).
- **Behavioral details / edge cases:**
  - Recap honors retention policy and residency settings.
  - Recap is editable (the presenter can add notes) before sharing.
- **Dependencies:** §9.5 recap_summary; [analytics.md](analytics.md) sessionization.

---

## 9.2 UX Flows

The flows below cover presenter view setup, rehearsal, live presenting, handoff, failover, and recap. Each describes the trigger, primary actor, happy path, key states, and failure paths.

### 9.2.1 Presenter view setup

1. User opens a deck in the editor and clicks "Present".
2. System detects displays; prompts the presenter to choose stage display or windowed stage.
3. Presenter view opens on the secondary display or as a window; phone pairing QR is shown.
4. Phone scans QR; presenter view shows "Phone connected".

States: no secondary display, single display, presentation mode fullscreen, windowed mode, phone disconnected, phone connected.

### 9.2.2 Rehearsal

1. User clicks "Rehearsal".
2. Presenter view enters rehearsal mode; per-slide timer starts on first advance.
3. As slides advance, dwell time is recorded; variance against pacing targets is shown.
4. On exit, a rehearsal summary is saved with a date stamp.

### 9.2.3 Live presenting

1. Presenter advances slides via clicker, phone, or keyboard.
2. Annotations draw on stage; PiP shows the camera; agenda timer counts down.
3. Audience interactions (Q&A, polls) surface in presenter view and parking lot.
4. On-the-fly reorder or hide changes the running order without affecting canonical deck order.

### 9.2.4 Multi-presenter handoff

1. Co-presenter clicks "Take over" in their paired session.
2. System serializes current state to a transfer token; recipient restores state.
3. Stage freezes briefly; then resumes under the new presenter.

### 9.2.5 Failover

1. Presenting device loses network or power.
2. Phone detects the loss (heartbeat misses) and offers to take over.
3. Phone restores the last replicated state and resumes the presentation.

### 9.2.6 Recap

1. Session ends or presenter clicks "End".
2. Recap generator composes a summary from session events.
3. Presenter can edit annotations, then save or share.

---

## 9.3 Functional & Non-Functional Requirements

| FR/NFR ID | Description | Target |
|---|---|---|
| FR-PRE-01 | Presenter view shows current/next/notes/timer/preview on second screen or window | required |
| FR-PRE-02 | Phone pairing via QR, clicker, notes, laser pointer | required |
| FR-PRE-03 | Live annotation: pen, highlighter, spotlight, zoom, blur | required |
| FR-PRE-04 | On-the-fly slide reorder and hide | required |
| FR-PRE-05 | Jump-to-slide grid with thumbnail search | required |
| FR-PRE-06 | Rehearsal mode with dwell tracking | required |
| FR-PRE-07 | Teleprompter mode | required |
| FR-PRE-08 | Live parking lot with auto wrap-up slide | required |
| FR-PRE-09 | PiP presenter camera with virtual background | required |
| FR-PRE-10 | Multi-presenter handoff | required |
| FR-PRE-11 | Presenter failover (laptop → phone) | required |
| FR-PRE-12 | Offline cached presenting with data snapshot fallback | required |
| FR-PRE-13 | 4K/LED output profiles and dual-screen controls | required |
| FR-PRE-14 | Agenda/countdown timers | required |
| FR-PRE-15 | Backstage whisper (E2E encrypted) | required |
| FR-PRE-16 | Post-session recap with edit/share | required |
| NFR-PRE-PERF-1 | Annotation render lag p95 | ≤16 ms at 60 FPS |
| NFR-PRE-PERF-2 | Remote control latency p95 (LAN) | ≤100 ms |
| NFR-PRE-PERF-3 | Pairing handshake p95 | ≤3 s |
| NFR-PRE-PERF-4 | Handoff completion p95 | ≤500 ms |
| NFR-PRE-PERF-5 | Failover recovery time p95 | ≤5 s |
| NFR-PRE-PERF-6 | Stage advance latency p95 | ≤150 ms |
| NFR-PRE-PERF-7 | PiP segmentation FPS (mid laptop) | ≥30 FPS |
| NFR-PRE-RELI-1 | Stage uptime over 60-min session | ≥99.9% with active failover |
| NFR-PRE-OFFL-1 | Offline cache hit rate (recent decks) | ≥99% |
| NFR-PRE-A11Y-1 | Presenter view keyboard-only operation | 100% reachable |
| NFR-PRE-A11Y-2 | Screen reader support for presenter view | WCAG 2.2 AA |
| NFR-PRE-I18N-1 | Teleprompter and notes rendering locale | locales defined in [03-ux-interface-planning.md](03-ux-interface-planning.md) |
| NFR-PRE-SEC-1 | Whisper encryption | E2E between sender and presenter |
| NFR-PRE-SEC-2 | PiP camera frames | never leave device |
| NFR-PRE-PRIV-1 | Recap PII | redacted by default per [11-legal-compliance-bangladesh.md](11-legal-compliance-bangladesh.md) |
| NFR-PRE-OBS-1 | Per-event structured logging | 100% of stage events |
| NFR-PRE-OBS-2 | OpenTelemetry traces | every presenter session |

---

## 9.4 Architecture

The presenter surface is composed of services in the editor control plane and a thin client-side presenter runtime.

### 9.4.1 Components

- **Presenter Session Manager.** Owns the running session: deck, slide index, animation frame, prototype variables, agenda timers, parking lot, PiP config. Source of truth for stage state.
- **Second-Screen Discovery.** Detects connected displays via Display API; falls back to window placement. Negotiates which window is stage and which is presenter view.
- **Phone Remote Pairing Service.** Issues short-lived signed tokens for phone pairing; supports WebRTC data channels and WebSocket fallback.
- **Annotation Engine.** Captures pen/highlighter strokes; renders overlays; persists saved strokes as overlay layers.
- **Dynamic Plan Manager.** Applies reorders/hides on top of the canonical deck order without mutating it.
- **Rehearsal Mode Tracker.** Records dwell times and pacing variance; saves rehearsal runs to the deck.
- **Teleprompter Service.** Renders scrolling notes; supports auto-advance with slide transitions.
- **Parking Lot Service.** Aggregates pinned audience questions; generates wrap-up slide on demand.
- **PiP Renderer.** WebGL-based background segmentation; renders camera bubble on the stage.
- **Multi-Presenter Handover.** Serializes and transfers session state between paired presenters.
- **Failover Service.** Continuously replicates state to paired phone(s); orchestrates takeover on heartbeat miss.
- **Offline Cache.** Service-worker-managed deck cache with encrypted state, assets, and snapshots.
- **Display Profile Manager.** Applies output profiles (resolution, color space, HDR) per active display.
- **Agenda Timer.** Manages multiple concurrent timers with persistence across handoff and failover.
- **Whisper Channel.** End-to-end encrypted messaging between a co-presenter and the active presenter.
- **Recap Generator.** Composes post-session summary from session events; editable and shareable.

### 9.4.2 Sequence — Live stage advance

1. Presenter triggers advance via clicker/phone/keyboard.
2. Presenter Runtime computes the next slide and animation entry point.
3. Annotation overlay and PiP bubble remain mounted across transitions.
4. Stage WebSocket broadcasts the new slide identity to audience view and paired phones.
5. Reconnect-capable audience participants receive a CRDT-style update.

### 9.4.3 Sequence — Multi-presenter handoff

1. Recipient requests takeover.
2. Session Manager serializes current state to a transfer token.
3. Recipient restores state, performs self-test (assets loaded, audio device ready).
4. Stage freezes briefly while both presenters agree on lock handoff.
5. Recipient takes control; original presenter becomes audience + co-pilot.

### 9.4.4 Sequence — Failover

1. Heartbeat between primary and phone missed beyond threshold.
2. Phone initiates failover: loads last replicated state from local cache and a control-plane relay.
3. Phone restores assets, animations, and agenda timer.
4. Stage resumes on phone; audience view reconciles; primary may rejoin later.

---

## 9.5 Data Model

All tables are Postgres with multi-tenant isolation via `tenant_id` and row-level security. State-bearing tables are append-mostly with explicit version columns for replay.

```sql
CREATE TABLE presenter_session (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  deck_id uuid NOT NULL,
  presenter_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  mode text NOT NULL CHECK (mode IN ('live','rehearsal','offline','multi_presenter','failover')),
  state jsonb NOT NULL,                    -- current slide, animation frame, prototype vars, timers
  agenda_timers jsonb NOT NULL,
  parking_lot jsonb NOT NULL,
  display_profile jsonb NOT NULL,
  pip_config jsonb NOT NULL,
  version bigint NOT NULL DEFAULT 1
);

CREATE TABLE second_screen (
  id uuid PRIMARY KEY,
  presenter_session_id uuid NOT NULL REFERENCES presenter_session(id),
  display_index int NOT NULL,
  role text NOT NULL CHECK (role IN ('stage','presenter','clone','extend')),
  resolution jsonb NOT NULL,                -- {w,h,refresh}
  color_profile text NOT NULL,
  hdr boolean NOT NULL DEFAULT false
);

CREATE TABLE remote_pairing (
  id uuid PRIMARY KEY,
  presenter_session_id uuid NOT NULL REFERENCES presenter_session(id),
  device_id uuid NOT NULL,
  token_hash bytea NOT NULL,                 -- SHA-256 of rotating token
  token_issued_at timestamptz NOT NULL,
  token_expires_at timestamptz NOT NULL,
  capabilities text[] NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','active','revoked','expired'))
);

CREATE TABLE annotation_layer (
  id uuid PRIMARY KEY,
  presenter_session_id uuid NOT NULL REFERENCES presenter_session(id),
  slide_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('pen','highlighter','spotlight','zoom','blur','saved')),
  geometry jsonb NOT NULL,                   -- strokes or shapes
  created_at timestamptz NOT NULL,
  ephemeral boolean NOT NULL DEFAULT true,
  saved_as_overlay_id uuid
);

CREATE TABLE dynamic_plan (
  presenter_session_id uuid PRIMARY KEY REFERENCES presenter_session(id),
  order jsonb NOT NULL,                      -- ordered slide IDs
  hidden text[] NOT NULL DEFAULT '{}',
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE rehearsal_run (
  id uuid PRIMARY KEY,
  presenter_id uuid NOT NULL,
  deck_id uuid NOT NULL,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  per_slide_ms jsonb NOT NULL,               -- {slide_id: ms}
  pacing_targets jsonb NOT NULL,             -- {slide_id: ms}
  total_ms bigint NOT NULL DEFAULT 0
);

CREATE TABLE teleprompter_state (
  presenter_session_id uuid PRIMARY KEY REFERENCES presenter_session(id),
  words_per_minute int NOT NULL,
  auto_advance boolean NOT NULL DEFAULT true,
  mirror boolean NOT NULL DEFAULT false,
  font_size text NOT NULL,
  scroll_offset bigint NOT NULL DEFAULT 0
);

CREATE TABLE parking_lot_item (
  id uuid PRIMARY KEY,
  presenter_session_id uuid NOT NULL REFERENCES presenter_session(id),
  audience_participant_id uuid,
  text text NOT NULL,
  status text NOT NULL CHECK (status IN ('open','answered','deferred','deleted')),
  pin_order int NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE pip_config (
  presenter_session_id uuid PRIMARY KEY REFERENCES presenter_session(id),
  position text NOT NULL,                    -- 'top-left','top-right','bottom-left','bottom-right','banner','hidden'
  shape text NOT NULL,                       -- 'rect','circle','rounded'
  width_px int NOT NULL,
  height_px int NOT NULL,
  virtual_background jsonb,                 -- {kind:'blur'|'image'|'video',ref:asset_id}
  border jsonb,
  shadow jsonb,
  consent_id uuid NOT NULL                   -- proof of camera consent
);

CREATE TABLE handover_state (
  id uuid PRIMARY KEY,
  presenter_session_id uuid NOT NULL REFERENCES presenter_session(id),
  from_presenter_id uuid NOT NULL,
  to_presenter_id uuid NOT NULL,
  transfer_token bytea NOT NULL,
  state_snapshot jsonb NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  result text NOT NULL CHECK (result IN ('pending','success','failure','reverted'))
);

CREATE TABLE failover_state (
  presenter_session_id uuid PRIMARY KEY REFERENCES presenter_session(id),
  primary_device_id uuid NOT NULL,
  paired_device_id uuid NOT NULL,
  last_heartbeat_at timestamptz NOT NULL,
  replicated_state jsonb NOT NULL,
  recovery_started_at timestamptz,
  recovery_completed_at timestamptz
);

CREATE TABLE offline_cache_entry (
  deck_id uuid NOT NULL,
  presenter_id uuid NOT NULL,
  encrypted_blob bytea NOT NULL,
  snapshot_at timestamptz NOT NULL,
  schema_version int NOT NULL,
  PRIMARY KEY (deck_id, presenter_id)
);

CREATE TABLE display_profile (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  name text NOT NULL,                        -- '1080p','4K','LED-8K','custom'
  width int NOT NULL,
  height int NOT NULL,
  refresh_hz int NOT NULL,
  color_profile text NOT NULL,
  hdr boolean NOT NULL DEFAULT false,
  bandwidth_estimate_mbps int
);

CREATE TABLE agenda_timer (
  id uuid PRIMARY KEY,
  presenter_session_id uuid NOT NULL REFERENCES presenter_session(id),
  label text NOT NULL,
  starts_at timestamptz,
  duration_ms bigint NOT NULL,
  remaining_ms bigint NOT NULL,
  visible_to text NOT NULL CHECK (visible_to IN ('presenter','audience','both')),
  status text NOT NULL CHECK (status IN ('idle','running','paused','done')),
  event_log jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE whisper_message (
  id uuid PRIMARY KEY,
  presenter_session_id uuid NOT NULL REFERENCES presenter_session(id),
  from_user_id uuid NOT NULL,
  ciphertext bytea NOT NULL,
  nonce bytea NOT NULL,
  ephemeral_pubkey bytea NOT NULL,
  created_at timestamptz NOT NULL,
  delivered_at timestamptz,
  read_at timestamptz,
  macro text                                  -- e.g. 'advance' if sender authorized
);

CREATE TABLE recap_summary (
  presenter_session_id uuid PRIMARY KEY REFERENCES presenter_session(id),
  per_slide_ms jsonb NOT NULL,
  slides_shown text[] NOT NULL,
  slides_skipped text[] NOT NULL,
  saved_annotations jsonb NOT NULL,
  parking_lot_open jsonb NOT NULL,
  audience_summary jsonb,                    -- pointer to analytics
  generated_at timestamptz NOT NULL,
  edited boolean NOT NULL DEFAULT false
);
```

---

## 9.6 APIs & Contracts

All endpoints are versioned (`/v1/presenter/...`). Idempotency keys required for state mutations. Auth uses session-bound short-lived tokens.

### REST

- `POST /v1/presenter/sessions` — start a presenter session.
- `POST /v1/presenter/sessions/{id}/end` — end a session.
- `POST /v1/presenter/sessions/{id}/advance` — advance/retreat/jump.
- `POST /v1/presenter/sessions/{id}/annotate` — push annotation stroke or shape.
- `POST /v1/presenter/sessions/{id}/plan` — update dynamic plan (order/hide).
- `POST /v1/presenter/sessions/{id}/handover` — initiate multi-presenter handoff.
- `POST /v1/presenter/sessions/{id}/failover` — initiate failover to a paired device.
- `GET  /v1/presenter/sessions/{id}/recap` — fetch post-session recap.

### WebSocket / WebRTC

- `stage.v1` — stage updates broadcast to audience view and paired phones.
- `presenter.v1` — presenter view ↔ control plane for non-stage events (timers, parking lot).
- `phone.v1` — paired phone ↔ presenter runtime (low-latency commands, laser pointer, notes).
- `whisper.v1` — encrypted duplex channel between presenter and authorized co-presenter.

### Phone Pairing (example)

```json
{
  "pairing_token": "eyJhbGciOi...short_lived",
  "capabilities": ["advance","retreat","jump","laser","notes"],
  "expires_at": "2026-07-29T10:30:00Z"
}
```

### Recap (response fragment)

```json
{
  "per_slide_ms": {"slide-1": 32000, "slide-2": 41000},
  "slides_shown": ["slide-1","slide-2"],
  "slides_skipped": ["slide-7"],
  "saved_annotations": [...],
  "parking_lot_open": [{"id":"...", "text":"..."}]
}
```

---

## 9.7 Security

- **Pairing tokens.** Short-lived, signed with the presenter's keypair; tokens rotated every 60 s; revocation propagates within 1 s.
- **Whisper encryption.** Curve25519 + XSalsa20-Poly1305; the control plane stores ciphertext only; keys derived from presenter + sender per session.
- **PiP camera frames.** Processed entirely on device; only processed bubble frames (with segmentation applied) cross the network, never raw frames.
- **Offline cache encryption.** Each cached deck encrypted with a per-presenter key; key material is sealed in OS keystore; cache invalidates on presenter logout.
- **State replication.** Failover state encrypted to the paired device using a long-lived device key with optional hardware attestation.
- **Audit.** All stage events (advance, annotation save, handover, failover) generate append-only audit entries (see [07-security-planning.md](07-security-planning.md)).
- **Threats covered:** impersonation of presenter view by malicious actor, replay of pairing tokens, exfiltration of camera frames via compromised plugin, theft of offline cache, denial of service against stage.

---

## 9.8 Performance

- Annotation rendering must hold 60 FPS; use a separate canvas layer for annotations to avoid reflow.
- Stage advance is a single message with the slide identity and animation cue; the runtime preloads the next slide's assets.
- Pairing QR codes encode a deep link with a session-bound token; do not include the deck URL directly.
- Handoff freezes the stage for ≤250 ms; choose a transition (e.g., brief black) and inform the audience.
- Failover uses the most recent replicated state plus the last 5 s of state deltas to close any gap.
- PiP segmentation uses WebGL2 with an optimized ML model (e.g., MediaPipe Selfie Segmentation); target ≤10 ms per frame on mid-tier laptops.
- Display profile selection runs at session start and can be re-evaluated mid-session when the presenter changes displays.

---

## 9.9 Observability & Testing

- Structured logs for every stage event (advance, annotation, plan, handover, failover, whisper delivery).
- Metrics: stage advance latency, annotation render frame time, pairing handshake latency, handover completion time, failover recovery time, PiP segmentation FPS, agenda timer drift.
- Traces: each presenter session carries a trace ID propagated to audience participants and analytics events.
- Alerts: stage advance p95 > 200 ms, handover completion p95 > 700 ms, failover recovery p95 > 8 s, whisper delivery p95 > 1 s.
- Testing:
  - Unit: reducer for dynamic plan, annotation compression, agenda timer arithmetic, whisper key derivation.
  - Integration: pairing over WebRTC, handover with simulated network partition, failover with heartbeat drop, offline mode with synthetic snapshot.
  - E2E: dual-screen mode on multiple platforms; phone pairing across iOS/Android browsers; LED-wall output profile on a sample 4K target.
  - Property-based: dynamic plan reorder invariants (no duplicates, all canonical slides accounted for).
  - Performance: stage advance throughput under 10 concurrent audience channels; PiP segmentation at 30 FPS sustained for 10 minutes; failover recovery time distribution.
  - Security: token rotation and replay protection; whisper E2E round trip; offline cache extraction test.
  - Accessibility: keyboard-only presenter view; screen reader walk-through; reduced-motion compliance.
  - Localization: notes rendering in Bangla, Arabic (RTL reserved), and CJK.

---

## 9.10 Cross-Section Ties

| Concern | Section |
|---|---|
| Scene graph, CRDT foundation | [editor-canvas.md](editor-canvas.md) |
| Animation transitions during stage advance | [animation-transitions.md](animation-transitions.md) |
| Prototype variables, conditional state | [prototyping-interactivity.md](prototyping-interactivity.md) |
| Rehearsal coach, anticipated Q&A | [ai-copilot.md](ai-copilot.md) |
| Audience channels for parking lot | [audience-participation.md](audience-participation.md) |
| Recap data and engagement metrics | [analytics.md](analytics.md) |
| Brand-aware timers and themes | [theming-branding.md](theming-branding.md) |
| Export of recap and handouts | [sharing-publishing.md](sharing-publishing.md) |
| Approval workflow before sharing recap | [collaboration-workflow.md](collaboration-workflow.md) |
| Tenant isolation, audit retention | [enterprise-governance.md](enterprise-governance.md) |
| Live data freshness on stage | [live-data-charts.md](live-data-charts.md) |
| Agentic state introspection, scripted presenter commands | [agentic-interfaces.md](agentic-interfaces.md) |
| 3D scenes and video during presentation | [3d-motion-media.md](3d-motion-media.md) |
| Smart components used on stage | [components-templates.md](components-templates.md) |

---

## 9.11 Open Questions / Out of Scope

- Q1: should PiP segmentation support custom backgrounds per brand kit, or is per-brand sufficient?
- Q2: should the recap include audience sentiment (see [audience-participation.md](audience-participation.md)) by default, or require opt-in?
- Q3: do we need a "presenter co-pilot" mode where a teammate can drive the agenda timer for the active presenter?
- Q4: should the post-session recap be shareable as a public link via [sharing-publishing.md](sharing-publishing.md) per deck, or only via export?
- Q5: is presenter mode supported on mobile-web (full features), or only on desktop browsers and paired phones?

Out of scope (handled elsewhere):
- Audience-side personalization (see [audience-participation.md](audience-participation.md)).
- Slide design and editing (see [editor-canvas.md](editor-canvas.md)).
- Live data binding semantics (see [live-data-charts.md](live-data-charts.md)).

---

## 9.12 Definition of Done

A presenter-experience feature is done when:

- Feature ID is mapped to FR/NFR IDs and acceptance criteria are testable.
- UX flow, empty/loading/error/offline/conflict states, and keyboard/screen reader behavior are documented.
- API and event contracts are stable with versioning policy.
- Data model is migrated and tenant-scoped.
- Security controls (token rotation, encryption, audit) are in place and tested.
- Performance budgets are met on the documented hardware matrix.
- Observability hooks emit the documented metrics, logs, and traces.
- Cross-section dependencies have integration tests with their owning sections.
- Localization and accessibility verification are recorded.
- Recap and analytics integration is verified end to end.