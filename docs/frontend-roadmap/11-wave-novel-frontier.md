# Wave 11 — Novel & Frontier Features

**Intent.** Every §15 (Novel & Frontier) and remaining §16 feature gets a polished, reachable UI. This wave is the "no one else has this" demo reel.

**Why it matters.** Frontier features are the wow-differentiation that closes enterprise deals. They also stress-test the platform in ways the rest of the roadmap doesn't.

---

## 1. Scope

- **§15 Novel & Frontier:** #205–219 (every feature).
- **§16 Agentic remaining gaps:** #230, #238.

---

## 2. Sub-phase map

### S11.1 — Presentation state timeline

**Features:** #205.

**Files to create:**
- `apps/dashboard/src/app/sessions/[id]/timeline/page.tsx`
- `apps/dashboard/src/components/timeline/{SessionTimeline,EventDetail,ScenarioDiff}.tsx`

**Build instructions:**
1. Per-session timeline shows every event: slide advance, scenario toggle, annotation, poll launch, Q&A submitted.
2. Click an event to see state snapshot at that moment.
3. Diff between any two events.
4. Replay the session in viewer mode.

---

### S11.2 — Living documents

**Features:** #206.

**Files to modify:**
- `apps/editor/src/components/living/LivingBadge.tsx`
- `apps/editor/src/components/living/UpdateStream.tsx`

**Build instructions:**
1. A "living" deck shows a live update badge: "Last refreshed 2 minutes ago."
2. Slide content updates as data refreshes.
3. Comments accumulate over time.
4. Version-history-per-section replaces "Q3 deck v2."

---

### S11.3 — Gaze-guided highlighting (presenter side)

**Features:** #207.

**Files to modify:**
- `apps/presenter/src/components/pip/GazeHighlight.tsx` (already in Wave 4; harden)

**Build instructions:**
1. WebGazer.js eye tracking on the presenter's webcam.
2. Spotlight follows gaze with a soft falloff.
3. Opt-in toggle; off by default.

---

### S11.4 — Gesture control

**Features:** #208.

**Files to create:**
- `apps/presenter/src/components/gesture/{GestureDetector,GestureMapEditor}.tsx`

**Build instructions:**
1. MediaPipe hand-pose detection on webcam.
2. Default map: open palm = advance, fist = back, swipe = jump to next section.
3. Editor lets presenter remap gestures to slide actions.

---

### S11.5 — Voice-triggered slide states

**Features:** #209.

**Files to create:**
- `apps/presenter/src/components/voice/{VoiceListener,PhraseRegistry,ConfirmationOverlay}.tsx`

**Build instructions:**
1. STT captures presenter voice ("let's look at the bear case").
2. Match against registered phrases.
3. Confirmation overlay asks "Switch to Bear case?" before applying.
4. Audit log captures every match.

---

### S11.6 — Ambient boardroom mode

**Features:** #210.

**Files to create:**
- `apps/presenter/src/components/ambient/{IdleDashboard,PreMeetingScreen}.tsx`

**Build instructions:**
1. Before a session starts, the audience display shows a live dashboard of the deck's data sources.
2. Brand-tinted background.
3. Transitions smoothly into the actual session when presenter connects.

---

### S11.7 — Two-way slides

**Features:** #211.

**Files to create:**
- `apps/presenter/src/components/two-way/{SlideBidirectionalPanel,NegotiationLog}.tsx`
- `apps/join-web/src/components/two-way/SliderBidirectional.tsx`

**Build instructions:**
1. A pricing slide has sliders that both presenter and audience can adjust from their own devices.
2. Convergence visualization: two markers (yours + theirs) animate toward a midpoint.
3. Each adjustment logged; final values saved to the deck.

---

### S11.8 — Deck inheritance trees

**Features:** #212.

**Files to create:**
- `apps/editor/src/components/inheritance/{InheritanceTree,PropagateDialog,SelectivePush}.tsx`

**Build instructions:**
1. Show every deck derived from a master.
2. Selective push: pick which slides update downstream.
3. Conflict resolver for slides that diverged.

---

### S11.9 — Real-time co-presenting (synced audience views)

**Features:** #213.

**Files to create:**
- `apps/presenter/src/components/co-presenting/{SyncStatus,LatencyMonitor,AudienceMirror}.tsx`

**Build instructions:**
1. Multiple presenters can run the same session.
2. Audience displays stay synced to the most-recent advance.
3. Latency shown per audience region.

---

### S11.10 — AI meeting listener

**Features:** #214.

**Files to create:**
- `apps/presenter/src/components/ai-listener/{ListenerStatus,SlideSuggestion}.tsx`

**Build instructions:**
1. Opt-in STT listener during session.
2. On question match (e.g. "what about churn?"), surfaces relevant slide in presenter view.
3. Disable per session.

---

### S11.11 — Provenance chips

**Features:** #215.

**Files to modify:**
- `apps/editor/src/components/provenance/ProvenanceChip.tsx`
- `apps/editor/src/components/provenance/ProvenanceDrawer.tsx`

**Build instructions:**
1. Any stat on any slide shows a small "i" chip on hover.
2. Click → drawer shows: source system, query, owner, last-verified date, freshness badge.
3. Agent-readable via `services/ai-orchestrator/get_provenance`.

---

### S11.12 — Deck-to-podcast

**Features:** #216.

**Files to create:**
- `apps/editor/src/components/export/PodcastExport.tsx`
- `apps/editor/src/components/export/PodcastPreviewPlayer.tsx`

**Build instructions:**
1. AI generates a two-voice script from the deck + notes.
2. TTS renders to MP3.
3. Preview player in editor; download link on completion.

---

### S11.13 — Haptic remote feedback

**Features:** #217.

**Files to modify:**
- `apps/presenter/src/components/PhoneRemote.tsx` (already in Wave 4; add vibration API)

**Build instructions:**
1. Phone remote vibrates at configured pacing checkpoints.
2. Vibrate on slide advance; configurable patterns per slide.

---

### S11.14 — Kiosk mode (already in Wave 5; harden)

**Features:** #218.

**Files to create:**
- `apps/viewer/src/app/kiosk/[deckId]/page.tsx`

**Build instructions:**
1. Kiosk mode for trade-show loops: fullscreen, touch interactivity, auto-reset.
2. Admin PIN to exit.

---

### S11.15 — Cross-deck knowledge graph (full)

**Features:** #219.

**Files to create:**
- `apps/dashboard/src/app/graph/page.tsx` (already in Wave 7; expand)

**Build instructions:**
1. Graph view across all decks: entities (people, products, KPIs) with edges.
2. Click an entity → list of referencing slides across decks with freshness.
3. Filter by team, time range, entity type.

---

## 3. SOLID injection

### Module map
Frontier features are scattered — they're intended to live alongside their closest feature:
- Presentation state timeline → `apps/dashboard`
- Living documents → `apps/editor`
- Gaze / gesture / voice / ambient / co-presenting → `apps/presenter`
- Two-way → both `apps/presenter` and `apps/join-web`
- Deck inheritance → `apps/editor`
- AI listener → `apps/presenter`
- Provenance → `apps/editor`
- Podcast → `apps/editor`
- Haptic → `apps/presenter`
- Kiosk → `apps/viewer`
- Knowledge graph → `apps/dashboard`

### Rule: each frontier feature ships as opt-in
Every feature in this wave is opt-in via a settings toggle. Default is OFF for anything with privacy implications (gaze, voice listener, AI listener).

---

## 4. Out of scope

- Real research-grade ML (services are presumed complete).
- Hardware-specific optimizations.

---

## 5. DoD checklist

- [ ] Every §15 feature reachable.
- [ ] Every opt-in has a clear "what this does" explainer.
- [ ] Privacy toggles respected.
- [ ] Each feature has a 30-second demo recording in the marketing site (Wave 12).
- [ ] No frontier feature silently degrades the rest of the deck.
