# Wave 4 — Presenter Experience

**Intent.** Complete the `apps/presenter` surface so every §9 (Presenter Experience) feature is reachable, every §10 widget has a presenter-side control, and the presenter is the live control room for an entire session — including recording export, phone-as-remote, failover, multi-presenter handoff, and LED-wall output profiles.

**Why it matters.** Presenter is the highest-stakes live surface. The CEO clicking through a board meeting sees this app. A broken presenter is a deal lost.

---

## 1. Scope

- **§9 Presenter experience:** #126–141.
- **§10 Audience participation (presenter side):** #143, #145, #147, #150, #153 (presenter controls).
- **§12 Live delivery analytics surface:** #175 (basic presenter HUD).

---

## 2. Sub-phase map

### S4.1 — Presenter view shell + multi-monitor preview

**Features:** #126, #119.

**Files to modify:**
- `apps/presenter/src/components/PresenterView.tsx`
- `apps/presenter/src/components/MultiMonitorSelector.tsx`
- `apps/presenter/src/components/PresenterHUD.tsx`

**Build instructions:**
1. Presenter view shows: current slide, next slide preview, notes pane, timer, audience view preview, on any second screen or phone.
2. Multi-monitor selector lists detected displays; user picks which one is the audience screen.
3. Audience-screen output renders to the chosen display via `window.open` or Presentation API.
4. Confidence monitor (current notes + timer) on the presenter's laptop.
5. All controls keyboard-accessible (A = annotate, T = timer, P = plan, H = handoff).

**SOLID notes:**
- **S:** `PresenterView` is composition only; child components own their state.
- **D:** presenter view depends on `SessionService` interface; tests use a mock service.

**Acceptance:**
- Two-monitor setup: changing slides on laptop updates audience display within 50 ms.
- Confidence monitor stays visible even when audience display is fullscreen.

---

### S4.2 — Phone as remote + confidence monitor

**Features:** #127, #140.

**Files to create:**
- `apps/presenter/src/components/PhoneRemote.tsx`
- `apps/presenter/src/components/PhonePairingPanel.tsx`
- `apps/presenter/src/components/WhisperInbox.tsx`
- `apps/presenter/src/app/pair/[token]/page.tsx`

**Build instructions:**
1. QR in presenter view; on scan, opens `/pair/[token]` in the user's phone browser.
2. Phone surface: clicker (advance/back), laser pointer (tap = pointer at current slide coordinates), notes viewer, teleprompter overlay.
3. Whisper channel: a teammate visiting `/whisper/[token]` types a private message; presenter sees it in `WhisperInbox` as a non-blocking toast.
4. Haptic on phone (vibrate API) at configured pacing checkpoints (#217).

**Acceptance:**
- Phone clicker + desktop slide advance are in sync at sub-second.
- Whisper message delivered while presenter is mid-sentence.

---

### S4.3 — Live annotation tools

**Features:** #128.

**Files to create/modify:**
- `apps/presenter/src/components/annotation/{Pen,Highlighter,Spotlight,ZoomLens,Blur}.tsx`
- `apps/presenter/src/components/annotation/AnnotationLayer.tsx`

**Build instructions:**
1. Toggle annotation mode with `A`. Pen + highlighter are stroke tools.
2. Spotlight: dim everything except a circular region around the cursor.
3. Zoom lens: magnifier that follows the cursor.
4. Screen blur: blur a region (for "look but don't reveal" demos).
5. Annotations persist as an annotation layer on the slide; presenter can save and re-show on next advance.

**Acceptance:**
- Annotations render on both audience display and confidence monitor.
- Eraser deletes strokes within a hit radius.

---

### S4.4 — On-the-fly reorder + hide

**Features:** #129, #133, #130.

**Files to create:**
- `apps/presenter/src/components/plan/{LivePlanEditor,ParkingLot}.tsx`

**Build instructions:**
1. Slide plan editor shows the upcoming deck with drag-reorder; reorder persists as session-scoped state (not on the deck itself).
2. Hide slides from presenter view; audience never sees them.
3. "Jump to slide" grid with thumbnail search.
4. Parking lot: audience questions (via Q&A widget) appear here; one-click "make wrap-up slide."

---

### S4.5 — Rehearsal mode + pacing targets

**Features:** #131, #132.

**Files to create:**
- `apps/presenter/src/components/rehearsal/{PacingConfig,RehearsalRecorder}.tsx`

**Build instructions:**
1. Set per-slide target time; rehearsal tracks actual vs. target.
2. After rehearsal, show a heatmap of time per slide.
3. Teleprompter overlay at adjustable scroll speed (existing; ensure wired to real notes).

---

### S4.6 — PiP camera + virtual background

**Features:** #134, #207.

**Files to create:**
- `apps/presenter/src/components/pip/{PiPBubble,VirtualBackgroundSelector}.tsx`
- `apps/presenter/src/components/pip/GazeHighlight.tsx`

**Build instructions:**
1. PiP bubble: webcam feed overlaid on the slide; position draggable; size adjustable.
2. Virtual background via canvas+MediaPipe segmentation.
3. Gaze-guided highlighting (opt-in): WebGazer.js tracks presenter's eye position; a subtle spotlight follows on the slide.

**Acceptance:**
- PiP bubble renders on both displays.
- Gaze highlighting does not drift when presenter looks away from camera.

---

### S4.7 — Multi-presenter handoff

**Features:** #135, #125.

**Files to create:**
- `apps/presenter/src/components/handoff/{HandoffDialog,HandoffTokenInput}.tsx`

**Build instructions:**
1. Presenter A clicks "Hand off" → generates a handoff token; Presenter B enters token on their device.
2. On accept: state (slide idx, scenario, variables) transfers atomically; audience display stays on the same slide during transition.
3. Handoff log captured for audit.

---

### S4.8 — Failover (presenter on phone)

**Features:** #136.

**Files to create:**
- `apps/presenter/src/components/failover/{FailoverBanner,ResumeFromPhone}.tsx`

**Build instructions:**
1. If presenter laptop loses session, audience display shows "Resuming…" placeholder.
2. Phone-as-remote detects the dropout and offers "Resume from here"; on click, session resumes with the same slide + state.
3. Resume token lives in `services/presenter-session/src/failover`.

---

### S4.9 — Offline mode + snapshot fallback

**Features:** #137.

**Files to create:**
- `apps/presenter/src/runtime/offline/{OfflineCache,SnapshotFallback}.tsx`

**Build instructions:**
1. On session start, all slides + assets cached to IndexedDB.
2. Live charts: data snapshot taken at last successful refresh; displayed with a "stale" badge if offline.
3. Connection-loss banner with "Reconnect" button.

---

### S4.10 — 4K / LED-wall output + display profiles

**Features:** #138.

**Files to create:**
- `apps/presenter/src/components/display-profile/{ProfilePicker,OutputMirrorControls}.tsx`

**Build instructions:**
1. Profile picker: presets for 1080p, 4K, ultrawide 21:9, LED-wall custom resolution.
2. Dual-screen mirroring controls (mirror / extend / audience-only).
3. Resolution auto-detected from display; manual override.

---

### S4.11 — Countdown / agenda timers

**Features:** #139, #132.

**Files to create:**
- `apps/presenter/src/components/timer/{AgendaTimer,SoftHardAlerts}.tsx`

**Build instructions:**
1. Per-segment agenda timer (e.g. "5 min intro, 15 min demo, 5 min Q&A").
2. Soft alert (yellow) at 80% of segment, hard alert (red) at 100%.
3. Toggle to show timer to audience or to presenter only.

---

### S4.12 — Post-recap + recording export

**Features:** #141, #162.

**Files to create:**
- `apps/presenter/src/components/recap/{RecapPage,RecordingExportButton}.tsx`

**Build instructions:**
1. After session, recap page shows: slides shown, slides skipped, annotations, time per slide, audience participation events.
2. Recording export button submits to `services/recording-orchestrator`; progress tracked; download link on completion.

---

### S4.13 — Time budget alerts + rewind + auto-follow

**Features:** #124, #132, #133, #134.

**Files to modify:**
- `apps/presenter/src/components/timer/TimeBudgetAlerts.tsx` (new)
- `apps/presenter/src/components/AutoFollowPresenter.tsx` (new)
- `apps/presenter/src/components/Rewind30s.tsx` (new)

**Build instructions:**
1. Configurable soft/hard thresholds per slide.
2. Rewind-30s: button + keyboard shortcut `Cmd+[`.
3. Auto-follow presenter: when presenter is on the same screen as the audience display, follow their cursor onto slides.

---

### S4.14 — Quiet mode + audience heatmap in presenter view

**Features:** #135, #126.

**Files to modify:**
- `apps/presenter/src/components/QuietMode.tsx`
- `apps/presenter/src/components/AudienceHeatmapOverlay.tsx`

**Build instructions:**
1. Quiet mode toggle silences all toasts + whispers during sensitive moments.
2. Audience heatmap overlays participation events on the current slide.

---

## 3. SOLID injection

### Presenter module map
```
apps/presenter/src/
├── app/
│   ├── session/[id]/page.tsx
│   └── pair/[token]/page.tsx
├── components/
│   ├── PresenterView.tsx
│   ├── annotation/, handoff/, failover/, pip/, plan/, rehearsal/, recap/, timer/, whisper/, parking-lot/, display-profile/
├── runtime/
│   └── offline/
├── lib/  (services from Wave 1)
└── store/
```

### Rule: presenter is live-only
The presenter app is read+command for live state; it never edits deck content. All scene-graph edits go through CRDT commands sent to the realtime gateway, not direct DOM manipulation. This ensures presenter actions are recorded.

---

## 4. Out of scope

- Audience widget renderer (Wave 5 — `apps/join-web`).
- AI rehearsal coach (Wave 6 — feedback from `services/ai-orchestrator`).
- Analytics on sessions (Wave 7 — `apps/dashboard`).

---

## 5. DoD checklist

- [ ] Every §9 feature reachable from presenter view.
- [ ] Every §10 widget has a presenter control.
- [ ] Multi-monitor setup validated with two physical displays.
- [ ] Phone clicker latency ≤ 200 ms.
- [ ] Failover round-trip ≤ 3 s.
- [ ] Recording export produces a downloadable MP4.
- [ ] All presenter components keyboard-accessible.
- [ ] No `window.alert` fallbacks; every failure shows a recoverable toast.
