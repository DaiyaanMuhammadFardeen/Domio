# Wave 5 — Audience Participation

**Intent.** Complete the `apps/join-web` audience surface so every §10 (Audience Participation) feature is reachable, integrate every widget into a clean widget renderer, add kiosk mode, live captions + translation, GDPR consent, and accessibility accommodations. Pair with Wave 4 to make presenter-side controls.

**Why it matters.** Audience participation is the "live" differentiator over PowerPoint. A broken join flow, a missing widget, or a hard-to-find QR code is the difference between a memorable session and a dead one.

---

## 1. Scope

- **§10 Audience participation:** #142–154 (every feature).
- **§15 Novel/frontier:** #218 (kiosk mode).

---

## 2. Sub-phase map

### S5.1 — Join flow polish + multi-language

**Features:** #142, #156.

**Files to modify:**

- `apps/join-web/src/app/page.tsx`
- `apps/join-web/src/app/j/[code]/page.tsx`
- `apps/join-web/src/components/JoinForm.tsx`
- `apps/join-web/src/components/SessionHeader.tsx`

**Build instructions:**

1. Join form accepts: 6-digit code, optional name, optional email, locale.
2. After join, user lands on a session header showing slide preview + widget area.
3. Locale picker auto-detects from `Accept-Language`; user can override; persisted in `domio-locale`.
4. QR scan from the presenter's audience screen is the primary entry; the join form is the fallback.

**SOLID notes:**

- **S:** `JoinForm` is presentation; session lookup goes through `SessionService` (Wave 1 service layer).
- **D:** join-web depends on `SessionService` interface.

**Acceptance:**

- Join succeeds on flaky networks with retry + offline queue.
- Locale switching reloads all widget messages without losing join state.

---

### S5.2 — Widget renderer: 8 widget kinds, all wired

**Features:** #143, #144, #145, #146, #147, #148, #149, #150.

**Files to create/modify:**

- `apps/join-web/src/runtime/widgets/WidgetRenderer.tsx`
- `apps/join-web/src/runtime/widgets/{Poll,WordCloud,QA,Quiz,EmojiReaction,NavVote,Sentiment,RaiseHand}.tsx`
- `apps/join-web/src/runtime/widgets/registry.ts`

**Build instructions:**

1. `WidgetRenderer` reads the current widget descriptor and dispatches to the matching concrete component via the registry.
2. Each widget connects to its engine (`services/poll-engine`, `services/word-cloud-engine`, etc.) via WS.
3. Widgets render mobile-first; layouts reflow for tablet/desktop.
4. Optimistic UI for submission; reconcile on ack.

**SOLID notes:**

- **O:** adding a new widget kind is one entry in the registry + one renderer file.
- **L:** every widget implements `{ render(props, state), submit(input) }`.
- **D:** `WidgetRenderer` depends on the registry abstraction.

**Acceptance:**

- All 8 widget kinds render correctly with real backend traffic.
- Latency from submission to display ≤ 300 ms.

---

### S5.3 — Personalized handouts

**Features:** #151.

**Files to create:**

- `apps/join-web/src/app/h/[token]/page.tsx`
- `apps/join-web/src/components/HandoutResolver.tsx`

**Build instructions:**

1. After session ends, every participant receives a link `/h/{token}` containing the per-user handout: attended slides, personalized notes, call-to-action.
2. Resolver fetches the handout descriptor from `services/handout-generator`.
3. PDF export available.

---

### S5.4 — Attendance + engagement

**Features:** #152.

**Files to create:**

- `apps/join-web/src/runtime/attendance/{Heartbeat,EngagementTracker}.ts`

**Build instructions:**

1. WebSocket heartbeat every 5 s while session is active.
2. Engagement score: a rolling measure of widget interactions, dwell time, and rejoin count.
3. Privacy-respecting: opt-out toggle in session header; GDPR DSAR endpoint honors deletion.

---

### S5.5 — Live translation captions

**Features:** #153.

**Files to create:**

- `apps/join-web/src/components/Captions.tsx`
- `apps/join-web/src/runtime/captions/{SttClient,MtClient,TtsClient}.ts`

**Build instructions:**

1. Presenter's voice is captured by `services/stt-provider`.
2. Translated via `services/mt-provider` into user's locale.
3. TTS via `services/tts-provider` reads the translation; user can choose captions-only / audio-only / both.
4. Locale picker drives the language.

**Acceptance:**

- Caption latency from speaker utterance ≤ 2 s.
- TTS latency ≤ 1 s after caption finalization.

---

### S5.6 — Post-session feedback + per-slide ratings

**Features:** #154.

**Files to modify:**

- `apps/join-web/src/app/feedback/[session_id]/page.tsx`
- `apps/join-web/src/components/feedback/{StarRating,NpsInput,PerSlideRating,NoteInput}.tsx`

**Build instructions:**

1. Star rating, NPS, per-slide rating (1–5), free-text note.
2. Submit to `services/feedback-collector`; success screen with optional personalized handout link.

---

### S5.7 — Trivia mode (multi-round quiz) + team mode

**Features:** #149, #150.

**Files to create:**

- `apps/join-web/src/runtime/widgets/TriviaRunner.tsx`
- `apps/join-web/src/runtime/widgets/TeamMode.tsx`

**Build instructions:**

1. Quiz supports multi-round with timer + bonus questions.
2. Team mode: participants join a team; per-team leaderboard.
3. Streak/power-up: 3-correct-in-a-row awards a 1.5× multiplier.

---

### S5.8 — Kiosk mode

**Features:** #218.

**Files to create:**

- `apps/join-web/src/app/kiosk/[sessionId]/page.tsx`
- `apps/join-web/src/components/kiosk/{AutoReset,IdleScreen,FullscreenLock}.tsx`

**Build instructions:**

1. Kiosk locks fullscreen, disables system navigation (fullscreen + pointer-lock + keyboard-block).
2. Idle screen after 30 s of inactivity shows the deck cover or a touch prompt.
3. Touch interactivity for polls + quizzes.
4. Auto-reset to first slide after a configurable idle period.

**SOLID notes:**

- **I:** kiosk surface implements a narrow `KioskSurface` interface, decoupled from the regular join-web flow.

**Acceptance:**

- Kiosk cannot be exited without admin PIN.
- Touch interactions register reliably at 60 fps.

---

### S5.9 — Captions accessibility + low-bandwidth fallback

**Features:** #156, #157.

**Files to create:**

- `apps/join-web/src/components/AccessibilityPrefs.tsx`
- `apps/join-web/src/runtime/transport/LowBandwidthFallback.ts`

**Build instructions:**

1. Accessibility prefs: caption font size, caption position, high-contrast mode, reduced-motion.
2. Low-bandwidth fallback: when WS cannot connect within 3 s, fall back to long-poll at 5 s intervals.
3. Show a "Slow connection" banner; widgets still functional.

---

### S5.10 — GDPR consent screen + anonymous mode

**Features:** #159, #160.

**Files to create:**

- `apps/join-web/src/components/consent/ConsentScreen.tsx`
- `apps/join-web/src/components/consent/AnonymousModeToggle.tsx`

**Build instructions:**

1. Consent screen on join: list data being collected; user can opt in/out per category.
2. Anonymous mode: replaces name with a randomly assigned handle; engagement score still tracked but not tied to identity.
3. Consent choice persisted in session storage; re-prompted only when policy changes.

---

### S5.11 — Bingo / word race + bracket / tournament

**Features:** #148.

**Files to create:**

- `apps/join-web/src/runtime/widgets/{Bingo,WordRace}.tsx`
- `apps/join-web/src/runtime/widgets/Tournament.tsx`

**Build instructions:**

1. Bingo: 5×5 grid; tiles auto-fill as participants submit words matching the prompt.
2. Word race: first-N submissions win.
3. Tournament: bracket view; round-of-16, quarters, semis, final; quizzes per round.

---

## 3. SOLID injection

### Join-web module map

```
apps/join-web/src/
├── app/
│   ├── page.tsx                      # join entry
│   ├── j/[code]/page.tsx             # live widget renderer
│   ├── feedback/[session_id]/page.tsx
│   ├── h/[token]/page.tsx            # handout
│   └── kiosk/[sessionId]/page.tsx
├── components/
├── runtime/
│   ├── widgets/                      # 8 widget kinds + trivia + team + bingo + tournament
│   ├── attendance/                   # heartbeat, engagement
│   ├── captions/                     # stt, mt, tts clients
│   └── transport/                    # ws + long-poll fallback
├── lib/  (services)
└── store/
```

### Rule: every widget is a leaf module

Adding `bingo` widget does not touch `WidgetRenderer` beyond a registry entry. The widget engine owns its transport, state, and UI. Widgets are testable in isolation with mocked WS servers.

---

## 4. Out of scope

- Live captions in presenter view (Wave 4 covers presenter-side chrome; captions are audience-side, here).
- Analytics on participation (Wave 7).
- AI moderation UI (Wave 8).

---

## 5. DoD checklist

- [ ] Every §10 feature reachable from join-web.
- [ ] All 8 widget kinds + extensions (trivia, team, bingo, tournament) wired.
- [ ] Kiosk mode tested on a physical touchscreen.
- [ ] Captions latency ≤ 2 s.
- [ ] GDPR consent screen tested with EU and CA jurisdictions.
- [ ] Low-bandwidth fallback tested with Chrome DevTools throttling.
- [ ] Accessibility preferences reflected across all widget surfaces.
- [ ] No dummy fallback; if a widget engine is unreachable, the widget renders an actionable empty state.
