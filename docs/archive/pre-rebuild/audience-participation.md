# Section 10 — Audience Participation

**Scope:** Features 142–154 of the Domio product specification (the "turn viewers into participants" layer). This section turns a one-way deck into a two-way event: phones in pockets become input devices, the audience's reactions become signals the presenter can act on in real time, and the experience closes with personalized artifacts (handouts, translations, compliance records) bound to each attendee. The feature numbers below reference `feature-list.md`; cross-references to other sections use the same numbering convention.

The fundamental design tension in this section: **public, anonymous, mobile-first input at 10k+ concurrent participants per session**, while preserving **fairness** (one-person-one-vote, no bots), **integrity** (no spam, no profanity, no vote-buying), and **compliance** (attendance/engagement records that survive an audit). Every feature in 142–154 is shaped by that tension.

---

## 1. Feature-by-Feature Mapping

### F142 — Audience joins via QR on their phones (no app, instant)

**Definition.** A presenter in presenter mode generates a session-scoped QR code; any audience member points their phone camera, lands on a mobile-optimized web view, and is participating in seconds with zero app installation.

**Acceptance criteria.**

- A single QR is valid for the entire live session; participants who join mid-session land on the _current_ slide's interactive surface, not a stale snapshot.
- Join is viable on stock mobile Safari, mobile Chrome, and Samsung Internet; supports iOS Safari 15+ and Android Chrome 100+ as the floor.
- First interaction (handshake + join + first render) completes in under 2.5 seconds on a 4G connection.
- No app store redirect, no forced account creation, no install prompt at any point.
- The same QR works for anonymous and identified modes; the difference is which fields the participant is asked for (see §7 security).
- Re-joining on the same phone re-uses an existing participant identity when valid; does not silently create a new identity.
- Works on flaky networks: the join page itself is cached for offline rendering on subsequent visits during the same session.

**Behavioral details.**

- QR encodes a deep link of the form `https://<host>/j/<session_code>` where `session_code` is a 7-character base32 short-code (Crockford alphabet, checksum suffix) opaque to the user but resolvable by the join service.
- On landing, the participant web client (PWA, installable) opens a WebSocket to the participant session service (see §4), receives the current session state snapshot, then subscribes to deltas.
- The participant view has three modes that switch automatically based on the current slide: **viewer**, **respondent** (when an active widget exists on the current slide), and **inactive** (between active slides). Switching happens via server-pushed `slide_changed` events.
- The QR is rendered in presenter view, in a "share to room" modal, and on a printable slide export.

**Edge cases.**

- **QR scanned before session starts:** page shows a friendly "waiting for the session to begin" screen; once the presenter goes live, the page transitions automatically without a manual refresh.
- **QR scanned after session ends:** page shows the recap/handout flow if handouts are configured (F151), otherwise a "this session has ended" message.
- **Phone locked mid-session:** on unlock, the client re-subscribes and replays missed events from the cursor (server retains last 60 s of broadcast buffer per session).
- **QR scanning brings user to a non-mobile device:** the PWA falls back gracefully to a two-column desktop layout (live widget on the right, leaderboard / context on the left).
- **Session code collisions:** codes are pre-generated in pools of 10⁶ per region; collision probability per active session is < 10⁻⁹.
- **Camera permission denied:** show manual code-entry fallback (`Enter code on domio.live/join`).

---

### F143 — Live polls with real-time result charts on the slide

**Definition.** The presenter drops a poll widget on a slide (multiple-choice, multi-select, or rating), participants respond from their phones, and the slide's chart updates in front of the audience as results arrive.

**Acceptance criteria.**

- A poll widget is editable like any other element on the canvas (F1–F22): drag, resize, theme-bind, snap to grid.
- A poll can be set to start on slide-enter, on a presenter click, or on a timer (e.g., 30 s countdown).
- Results render on the presenter's slide within 1.5 s p95 of any vote being cast.
- Aggregations include count, percent (with explicit handling for "no response"), per-option breakdown, and (for rating polls) mean/median/distribution.
- A poll can be configured as anonymous or identified; in identified mode, individual responses are exposed to the presenter only (never broadcast back to participants).
- The same poll widget supports live re-polling (same question, new results) and comparison overlays (show "before vs after" for two polls on the same slide).

**Behavioral details.**

- Polls are defined in the deck schema as `widget_type: "poll"` with options array, prompt text, response shape, and presenter-only display options.
- When a poll goes live, the widget publishes a `poll_opened` event on the session channel with the poll id and the list of allowed options.
- Participant clients render the poll UI in respondent mode (see F142); on submit, they POST to the poll engine (see §4) and receive a confirmation.
- The poll engine broadcasts a `vote_aggregate` event with running totals after each vote; presenter clients animate the bar/percentage change.
- Closing a poll publishes `poll_closed`; the presenter can then optionally "reveal" results with a build animation.

**Edge cases.**

- **Vote before poll opens / after poll closes:** rejected with `poll_not_open`; UI shows "the poll hasn't started yet" / "the poll has closed".
- **Network drop mid-submit:** client retries with idempotency key; duplicate submits dedupe server-side (see §3 one-person-one-vote).
- **Tie at threshold:** if a poll is configured with a "winner advances" action and results are tied within tolerance, the presenter is prompted to extend or break the tie manually.
- **Zero votes received:** chart renders an empty-state with "waiting for responses" rather than a misleading 0/0 split.
- **Options edited mid-poll:** option labels and order are locked once the poll opens; any edits after open require presenter confirmation and invalidate prior votes only if explicitly chosen.
- **Multi-select abuse:** if a poll is multi-select, server enforces a maximum of N selections per option (configurable, default 1 per option) and an overall maximum (default all options for a "select all that apply" poll).

---

### F144 — Word clouds built live from audience input

**Definition.** A free-text input on a slide; each submitted word (or short phrase) becomes a tile in a continuously redrawn word cloud sized by frequency, with profanity moderation happening before display.

**Acceptance criteria.**

- Submission is single-tap on the participant phone: tap the input, type up to N characters (configurable, default 40), submit.
- Words are normalized (lowercase, strip punctuation, collapse whitespace, optional stop-word removal per locale) before counting.
- The cloud re-lays out at most every 1.5 s on the presenter view (debounced) and within 3 s p95 of any submission.
- Profanity moderation (see §3) blocks display of rejected words but does not block submission — participants see their word accepted; the audience simply does not see it.
- A "show all" toggle reveals individual submitted words to the presenter (anonymized) for moderation review.
- Per-slide word cloud cap is configurable (default 500 distinct words) with FIFO eviction once exceeded.

**Behavioral details.**

- The word cloud engine (see §4) maintains an in-memory `word → count` map per slide; backpressure to persistent storage happens on a 30 s cadence so a long session doesn't OOM the engine.
- The presenter view renders the cloud with a deterministic layout algorithm (e.g., Archimedean spiral placement with collision detection) seeded by a hash of the slide id, so consecutive updates don't jitter the entire layout.
- Word pairs / n-grams are supported as an option ("bigram mode"); the layout distinguishes single tokens from bigrams by weight class.
- The cloud is theme-aware: tile color follows the deck's design tokens (F37) with optional overrides; font sizing follows frequency.

**Edge cases.**

- **Burst submissions:** if submissions arrive faster than the layout can keep up, the engine coalesces updates into batches of up to 100 words or 1.5 s, whichever first.
- **Same word from same participant:** deduplicated within the active window (e.g., once per minute per participant per word) so a single participant can't dominate a cloud.
- **Very long submissions:** server splits on whitespace and counts each token independently; tokens exceeding a max length (default 24) are dropped.
- **Unicode / RTL:** all major scripts and bidirectional text must render; layout is per-token not per-character, so a single Arabic word and a single Chinese character both count as one token.
- **Moderator override:** presenter can manually hide a specific word from the public cloud (it remains in the audit log for compliance).
- **Stop-word list:** an editable per-deck stop-word list applied before counting; "the", "and", etc., are skipped in English by default.

---

### F145 — Q&A with upvoting and anonymous submission

**Definition.** A persistent Q&A panel accessible throughout the session; participants submit questions and upvote others' questions; the presenter sees a ranked queue and can mark questions as answered, deferred, or dismissed.

**Acceptance criteria.**

- Submissions are capped at 280 characters by default; configurable per session.
- Each participant can submit up to N questions per session (default 10) and upvote any other question up to 3 times total.
- The Q&A panel on the presenter's screen always shows top-ranked items first; rank = upvotes − downvotes + recency tiebreaker.
- Anonymous mode is default; identified mode (when configured) exposes the submitter's display name to the presenter only.
- A question can be in one of `pending`, `approved`, `answered`, `deferred`, `dismissed`, `flagged`; transitions are presenter-controlled except `flagged` (auto, on community report threshold).
- "Live parking lot" integration (F133): questions marked `deferred` are pinned to the wrap-up slide auto-assembly.

**Behavioral details.**

- The Q&A engine (see §4) maintains an ordered structure keyed by `session_id + slide_id_or_session` (questions can be slide-scoped or session-wide; default session-wide).
- Upvotes are stored as separate `qa_upvote` records (one per participant per question) so dedup and revoke are simple.
- The presenter panel supports bulk actions: "mark top 5 as answered", "defer all unanswered", "show only flagged".
- An optional moderation step (configurable per session) holds new submissions in a queue until the presenter approves them.

**Edge cases.**

- **Vote brigading:** if a single participant attempts to upvote the same question multiple times, only the first counts; subsequent calls return `already_voted` (idempotent).
- **Mass submission:** rate-limited per F147-style rate limiting pattern (default 1 submission per 10 s per participant).
- **Display-name collisions:** display names are suffixed with a discriminator only in presenter view; participants see their own name as entered.
- **Removal of a question:** a moderator can soft-delete (sets `dismissed`); the question is hidden from public view but the upvote audit trail is preserved.
- **Answered question upvoted again:** upvoting is allowed after answer; useful for "this needs more depth" signals.

---

### F146 — Live quizzes with leaderboards (Kahoot-grade, but inside your deck)

**Definition.** Multi-question quiz mode with timer, scoring, and a live leaderboard that updates after each question; rendered on the slide and on participant phones.

**Acceptance criteria.**

- Quiz widget supports multiple-choice, true/false, and type-the-answer (with fuzzy-match grading).
- Each question has a configurable countdown timer (default 20 s; can be off).
- Scoring formula: base points (default 1000) + time bonus (`max(0, remaining_seconds) × bonus_per_second`, default 50/s).
- Leaderboard updates on the participant's phone and on the presenter view within 1 s of each question closing.
- Quiz state is persisted across reconnects: a participant who drops mid-quiz resumes at the next question without losing prior answers.
- Quiz pacing controls: auto-advance on close, manual advance, or "wait for slowest participant".
- Anti-cheat: question content is delivered at reveal time, not on join; participant clients cannot cache the question pool in advance.

**Behavioral details.**

- The quiz engine (see §4) is a state machine: `idle → countdown → accepting_answers → revealing → leaderboard → next` (loop) → `finished`.
- A question's content is gated by a `question_unlocked` event; the participant client renders an idle placeholder until that event arrives.
- The leaderboard displays the top N (default 10) plus the participant's own rank; full ranking is available on the participant's phone under a "see full standings" affordance.
- Quiz results are written to `quiz_attempt` records per (session, participant, question) with timing data, enabling per-question analytics and replay.

**Edge cases.**

- **Late answer:** answers submitted after the timer fires are rejected; server time is the source of truth, not client clock.
- **Tie at final leaderboard:** ties are broken by cumulative response time, then by first correct submission.
- **Network drop mid-question:** on reconnect, the participant receives the current question state and any unanswered prior questions are auto-marked `timeout`.
- **Quiz started before everyone joins:** optional grace period (default 5 s) before the first question opens; configurable per quiz.
- **Multiple quizzes in one session:** each quiz has its own leaderboard; the presenter can choose to carry scores forward or reset per quiz.
- **Question skipped:** if the presenter advances to the next question before the timer fires, the current question is marked `skipped`; late answers for it are rejected.

**Fairness considerations.** See §3 "leaderboard fairness" — scoring must be reproducible across reconnects (server-side score recompute from raw timestamps), and the leaderboard must be the same on every participant's phone (no client-side optimistic ranking).

---

### F147 — Emoji reactions floating over the presentation in real time

**Definition.** A reaction surface (always-on tray on participant phones) that sends short emoji taps that float across the presentation as small animated icons, like reactions in a live-stream chat.

**Acceptance criteria.**

- Reactions render as DOM/SVG elements overlaid on the presenter view (and on the audience broadcast if enabled).
- Per-participant rate limit (default 1 reaction per 1.5 s, configurable).
- Reactions are ephemeral: they animate in, peak, and fade out within 4–8 s depending on density.
- A reaction burst that exceeds the overlay render budget is aggregated server-side: "🔥 × 47" instead of 47 individual fires (see §3).
- The presenter can toggle reactions on/off globally, by type (e.g., disable ❤️ only), or restrict to identified participants only.
- A density heatmap view (presenter-only) shows reaction concentration across slide time, useful for finding emotional peaks.

**Behavioral details.**

- The reaction broadcaster (see §4) receives a `reaction` event per tap; it broadcasts an aggregate `{emoji, count, delta_ts}` to all subscribers every 250 ms.
- The overlay renderer composites emoji onto a transparent canvas/SVG layer on the presenter view; layout uses a deterministic seeded spawn position per emoji so heavy bursts don't all cluster in one corner.
- An optional "burst" mode is enabled for big moments (e.g., a "celebrate" button on the slide) that bypasses rate limits and plays a one-shot animation.

**Edge cases.**

- **Custom emoji (org-specific):** if the deck theme includes custom emoji, those are rendered as image sprites rather than unicode emoji to preserve brand consistency.
- **Disabling reactions mid-session:** any in-flight reactions finish their animation; new ones are rejected with `reactions_disabled`.
- **Skin-tone modifiers:** supported; rendered as unicode where possible, as paired-codepoint fallback otherwise.
- **Accessibility:** reactions are announced via aria-live polite on the participant's own phone only; never announced on the broadcast view (avoid noise for screen-reader users in the audience).

---

### F148 — Audience-driven navigation votes ("what should we cover next?")

**Definition.** The presenter offers a binary or N-ary choice between deck branches (F97); the audience votes and the winning branch is auto-advanced to (or the presenter is nudged).

**Acceptance criteria.**

- A navigation vote is a special-case poll with deck-state side effects: winning option triggers a slide transition (F91) or a branch (F97).
- Default quorum rule: vote closes when either (a) configured duration elapses, (b) `>= N%` of active participants have voted, or (c) presenter manually closes.
- When the quorum is met, the deck auto-advances to the winning option's target slide; presenter can override at any time.
- The slide choice exposed to the audience must always match the actual deck state — no vote on a slide that has been deleted or hidden in the meantime.
- The presenter can pre-configure quorum defaults per deck and override per vote.

**Behavioral details.**

- Navigation votes are recorded as a special `nav_vote` event type so analytics (F175) can distinguish them from regular polls.
- The quorum is computed over **currently-connected participants** (not lifetime participants), so late joiners or early leavers don't distort the denominator.
- The transition itself runs through the same animation engine as F91 so it inherits the presenter's transition choices for the source slide.
- A vote in progress is itself an interactive widget: the presenter can choose to display running tallies or hide them until close.

**Edge cases.**

- **Tie at quorum:** the vote enters `tie` state; the presenter is nudged to choose manually.
- **Quorum never met:** vote auto-closes at configured duration with the leading option as the result; if no option leads by a configured margin (default 5%), the presenter is nudged.
- **Vote referenced a deleted slide:** if the winning option's target slide is deleted/hidden between vote-open and vote-close, the vote is invalidated and the presenter is notified.
- **Branching interaction with F97 / F100 / F107:** nav votes respect variable state (F100) and deep-linkable state (F107) — voting resets variables according to the winning branch's `on_enter` actions.
- **Audience connectivity storm:** a high churn session can produce volatile denominators; the quorum algorithm uses a rolling 30 s connected-participant average to smooth this.

---

### F149 — Slider sentiment inputs ("how confident are you in this plan, 1–10?")

**Definition.** A continuous slider (numeric 1–N, default 1–10) on a slide; participants drag to a value; the slide's display aggregates into mean / median / distribution live.

**Acceptance criteria.**

- Slider responds to drag on touch devices (no jitter, no dead zones); tap-to-position also supported.
- Aggregation is server-authoritative: participants see their own slider value; the audience sees the aggregate (mean by default; switchable to median, mode, distribution histogram, or all of the above).
- Mean and median update within 1.5 s p95 of any value change.
- Each participant's current slider value can be changed (latest-write-wins, configurable rate limit of 1 change per 2 s).
- Slider sentiment supports both anonymous and identified modes; identified mode exposes individual values to the presenter (with consent banner on join).
- Aggregations can be saved as data variables (F100) and trigger downstream effects (e.g., low mean sentiment auto-opens a Q&A prompt).

**Behavioral details.**

- The sentiment collector (see §4) maintains per-slide `slider_id → value` state plus running aggregates (count, sum, sum-of-squares, sorted reservoir for median).
- For median computation at scale, a P²-quantile estimator or t-digest is used; recomputation is O(log N) per insert.
- Aggregation is broadcast to subscribers on a debounced cadence (default 500 ms) with the latest snapshot, so rapid updates don't flood the channel.

**Edge cases.**

- **All participants at the same value:** distribution histogram collapses to a single bar; rendering should not break.
- **Out-of-range values:** server clamps to `[min, max]`; out-of-range submits return `value_out_of_range` and the client UI snaps to nearest valid.
- **Single participant:** mean = median = their value; UI handles N=1 cleanly.
- **Identified mode consent:** if a participant declines identification, they fall back to anonymous mode automatically; the slider still records their value anonymously.

---

### F150 — Raise-hand queue for hybrid/remote meetings

**Definition.** A persistent "raise hand" affordance on the participant phone; a queue on the presenter's screen shows raised hands in order; the presenter can lower hands, reorder, and "call on" the next participant.

**Acceptance criteria.**

- Tapping "raise hand" toggles the participant's hand state (raised ↔ lowered).
- The presenter queue is ordered by raise time (FIFO) by default; presenter can pin, reorder, or merge identical-namer hands.
- The presenter can "call on" the next hand, which triggers a notification on that participant's phone and (optionally) promotes them to speaker in the meeting-tool integration (F188).
- A hand auto-lowers after a configurable timeout (default 5 minutes idle) and on session end.
- A "lower all" action clears the queue; the action is logged for moderation.
- Optional: a per-participant hand counter shown to the presenter ("this person has raised their hand 3 times this session").

**Behavioral details.**

- The raise hand queue (see §4) is backed by a sorted set keyed by raise timestamp; promotion ("call on next") atomically pops the head and notifies the participant.
- The presenter panel shows the queue with avatar (if identified), display name, raise time, and per-hand dwell time.
- On a Zoom/Meet/Teams integration, "call on" triggers the provider's "promote to panelist" API; failure falls back to a UI-only promotion (notification only).

**Edge cases.**

- **Identical-name collisions:** display names are disambiguated with last-2-of-join-id suffix in the presenter view.
- **Race on "call on next":** if two presenter tabs (co-presenter) both click "next", the server enforces atomicity; only one promotion succeeds; the other gets a "already promoted" response.
- **Re-raise after auto-lower:** allowed; raises are re-counted; the participant's counter increments.
- **Lower-all during a promotion:** if the promoted participant's hand is part of a lower-all sweep, they are still considered promoted for that turn.

---

### F151 — Per-audience-member personalized handout links sent automatically at the end

**Definition.** When the session ends, each participant receives a unique URL to a personalized handout: their Q&A submissions, the slides they lingered on, polls they answered, and a copy of any resources the presenter attached.

**Acceptance criteria.**

- Handouts are generated within 60 s of session end and dispatched to each participant.
- Each handout URL is single-use (per recipient), with optional expiration (default 30 days post-session).
- Handout content includes: deck PDF (or web-archive export), personalized annotations (the participant's own Q&A, votes, slider values), and any presenter-attached resources.
- Email delivery is the default; in-app notification + share-link fallback if email is unavailable.
- The handout respects identification level: anonymous participants get a handout with their own anonymous inputs but no identity-binding link; identified participants get a handout tied to their identity.
- Handout generation can be disabled per session or per participant.

**Behavioral details.**

- The handout generator (see §4) reads from the session's data lake (see §5) at session end and builds per-participant artifacts.
- Personalization is opt-out-able: a participant can choose "send me a generic handout" instead.
- Resources are deduplicated across participants — the same PDF is generated once and served from object storage; only the personalized metadata wrapper is per-recipient.
- Handout URLs are signed and short-lived; revocation is supported (presenter can void all handouts for a session).

**Edge cases.**

- **Email bounces:** the participant is shown the handout URL in their app next time they open the participant view, if still in TTL.
- **Identified-mode consent revoked before handout:** the handout is generated in anonymous mode for that participant; their identity is not bound.
- **Handout for a participant who joined but never voted:** still generated; shows their join/leave times and a "you joined this session" stamp.
- **Compliance hold:** if a legal hold (F198) is in effect on the session, handout generation is suspended and re-emitted under legal review, not auto-sent.
- **Very long sessions:** if session duration exceeds N hours (configurable, default 8 h), handout generation is split across multiple background jobs to avoid one giant artifact.

---

### F152 — Attendance and engagement capture for training/compliance use cases

**Definition.** Per-session and per-participant records of join/leave times, slide dwell, interactions (votes, questions, raises), and reactions — designed to satisfy training and compliance use cases (FCA, HIPAA-adjacent training logs, regulated-industry CEU tracking, etc.).

**Acceptance criteria.**

- Attendance is captured automatically from join/leave events; manual check-in is supported as a backup.
- Engagement record is tamper-evident: append-only, hash-chained, and timestamped by a trusted clock.
- Per-slide dwell time is recorded with start/end timestamps; gaps > N seconds (configurable, default 30 s) are flagged as potential disengagement.
- Attendance + engagement records are exportable as CSV / JSON / SCORM 2004 4th Edition packages for LMS ingestion.
- Records are retained per the configured retention policy (default 7 years for compliance use cases; configurable down to 30 days for non-compliance).
- Records are access-controlled: only authorized roles (admin, compliance officer) can read them; presenter cannot edit after session end.

**Behavioral details.**

- The attendance logger (see §4) writes append-only records to a compliance log store; hash chaining is per-session (each record references the previous record's hash).
- Engagement score (a derived metric) combines dwell, interactions, and reaction density; the formula is documented and version-pinned (so changing the formula doesn't invalidate prior records).
- SCORM packages are generated per session and include the deck content, the attendance/engagement XML, and a launch URL that the LMS can deep-link to.
- Audit log entries are emitted for every read of attendance records.

**Edge cases.**

- **Clock skew on participant devices:** server clock is authoritative for join/leave; client-reported times are stored as `client_reported_at` for diagnostics but not used for compliance.
- **Mid-session identity switch:** a participant changing display name or anonymity status mid-session is recorded as a `participant_state_changed` event; old and new identities are linked by stable `participant_id`.
- **SCORM package version:** the generator can emit both SCORM 1.2 and SCORM 2004 (4th Ed); package selection is per-session.
- **Legal hold interaction:** a legal hold freezes attendance records from deletion even if retention would otherwise expire them.
- **No-participant session:** if the session ran with zero participants (presenter rehearsal), no attendance records are written; the session itself is recorded as a rehearsal.

---

### F153 — Live translation captions of the presenter's voice on audience devices

**Definition.** As the presenter speaks, each participant's phone shows real-time captions in their selected language — STT in the source language, MT to the target, then TTS optional playback.

**Acceptance criteria.**

- Latency target: end-to-end caption appears on participant phone within 4 s p95 of presenter utterance.
- Source language auto-detected (default English); supported target languages at launch: 12 (English, Bangla, Hindi, Arabic, Spanish, French, Mandarin, Portuguese, Russian, Japanese, Korean, German).
- Caption text renders on the participant phone only by default; an opt-in toggle displays captions on the broadcast view as well (one language at a time, set by presenter).
- The participant can pick their language once on join and switch any time during the session.
- TTS playback (optional) reads captions aloud; speed adjustable; respects OS-level TTS settings.
- The translation pipeline degrades gracefully on errors: if MT is unavailable for a language pair, falls back to the source captions in the original language.

**Behavioral details.**

- The translation pipeline (see §4) has three stages: STT (presenter's audio captured from the meeting-tool integration or in-app mic), MT, and (optional) TTS.
- Audio chunks are ~2 s; the pipeline is streaming; partial captions appear word-by-word.
- The participant client buffers up to 30 s of captions to handle momentary network drops; captions don't disappear during drops.
- Per-participant language preference is stored on the participant record and applied on subsequent sessions with the same presenter (with consent).

**Edge cases.**

- **Multiple speakers:** if the meeting-tool integration feeds a multi-channel audio stream, STT runs on the active speaker channel (the presenter); cross-talk is filtered where possible.
- **Profanity / brand-sensitive terms:** STT output is passed through the same moderation pipeline as word-cloud input (see F144, §3) before translation, to prevent brand damage.
- **Low-confidence STT:** low-confidence regions are marked with a "…" indicator on the caption; the participant can tap to see the raw STT result.
- **Language not supported:** the participant is shown a clear "your language isn't available for this session — captions will show in <source_language>" message.
- **Long silence:** caption stream pauses; a "waiting for speech" indicator is shown to the participant.
- **PII in captions:** if the STT output contains what looks like PII (emails, phone numbers, IDs), the pipeline can be configured to mask it before caption broadcast (configurable per session).

---

### F154 — Post-session feedback forms with per-slide ratings

**Definition.** After the session ends, each participant sees a feedback form (overall NPS-style score + per-slide 1–5 ratings + free-text comments) prefilled where possible from their engagement.

**Acceptance criteria.**

- Feedback form is short by default (NPS + top 3 moments + free-text); expanded form available on opt-in.
- Per-slide rating is shown as a quick-tap row of stars (1–5) for each slide the participant viewed.
- Free-text comments are passed through profanity moderation (see F144, §3) before storage.
- Feedback is anonymous by default; identified feedback is opt-in.
- Form can be skipped (a "no thanks" option); skipped rate is tracked but not the reason.
- Aggregated feedback (without individual identifiers) is shown to the presenter on the session recap.

**Behavioral details.**

- The feedback collector (see §4) renders the form on session end; participants who leave early see it the next time they open the participant app within the configured window (default 7 days).
- Per-slide ratings are prefilled with engagement-based heuristics (e.g., a slide where the participant reacted heavily defaults to 5★; they can override).
- Free-text feedback is aggregated with simple keyword extraction; raw text is shown only to authorized roles.
- Feedback is bound to the session id; per-participant binding is opt-in (default anonymous = no binding).

**Edge cases.**

- **No active participant at session end:** no feedback form is sent; the presenter sees a "no participants joined" empty state in recap.
- **Form already submitted:** re-opening the form shows a "you've already given feedback — thank you" state.
- **Form abandoned mid-way:** partial submissions are saved as drafts; the participant can resume.
- **Presenter asks for identified feedback:** the form explicitly says "your name will be visible to the presenter" before the rating row; opt-in only.

---

## 2. UX Flows

### 2.1 Joining via QR

The dominant audience entry point. Designed for low-friction, high-trust.

```
[Presenter in presenter view]
        │
        │  click "Show session QR"
        ▼
[QR displayed on projector]
        │
        │  audience member scans
        ▼
[Phone camera → deep link]
        │
        │  load /j/<code>
        ▼
[Mobile web app boots]
        │
        │  WebSocket handshake
        │  receive session_snapshot
        ▼
[Idle viewer mode]
        │  presenter advances slide
        ▼
[Active respondent mode if widget exists]
        │
        │  participant interacts
        ▼
[Confirmation + return to viewer mode]
```

Key UX rules:

- Zero state on the participant phone is **never empty**: even before the presenter starts, the participant sees a "joining..." then "you're in — stand by" frame, never a blank white page.
- The QR itself carries a session code only (no PII, no deck id, no presenter id); the deep link resolves at the join service.
- A short, friendly onboarding overlay explains "you're about to join a live session" with two buttons: **Join** and **Join anonymously**. The latter is the default; the former appears when the presenter has identified-mode enabled.

### 2.2 Voting in Polls

```
[Participant phone, viewer mode]
        │
        │  poll_opened event received
        ▼
[Poll widget animates in]
        │
        │  tap an option
        ▼
[Optimistic highlight + POST /polls/:id/vote]
        │
        │  server accepts
        ▼
[Confirmation checkmark]
        │
        │  can change vote until poll_closes (configurable)
        ▼
[Poll closes]
        │
        │  results reveal animation on presenter's slide
        ▼
[Participant view returns to viewer mode]
```

### 2.3 Contributing to Word Cloud

```
[Participant phone, viewer mode]
        │
        │  word_cloud_opened event
        ▼
[Single text input + submit button appears]
        │
        │  type up to N chars → submit
        ▼
[POST /wordclouds/:id/words]
        │
        │  server normalizes, counts, moderates
        ▼
[Participant sees "thanks — your word is in the cloud"]
        │
        │  moderator-rejected: "thanks — your word is in the cloud"
        │  (UI is identical; presenter decides visibility)
        ▼
[Cloud re-lays out on presenter view every ≤1.5 s]
```

### 2.4 Submitting Q&A

```
[Participant phone, persistent Q&A tab]
        │
        │  tap "Ask a question"
        ▼
[Text field + submit]
        │
        │  POST /qa/:session_id/questions
        ▼
[Question appears in "My questions" section]
        │
        │  visible to presenter in queue
        │  visible to other participants if "public Q&A" is on (default)
        ▼
[Other participants can upvote]
        │
        │  each participant: up to 3 upvotes total
        ▼
[Presenter ranks, marks answered, defers, dismisses]
```

### 2.5 Leaderboard Quiz

```
[Quiz widget on slide; presenter clicks "Start quiz"]
        │
        │  quiz_engine: idle → countdown
        ▼
[Participant phone shows countdown 3, 2, 1...]
        │
        │  question_unlocked
        ▼
[Question + options render; timer starts]
        │
        │  participant taps answer
        ▼
[POST /quizzes/:id/attempts]
        │
        │  server records timestamp + answer
        ▼
[Reveal: ✓ or ✗ + correct answer]
        │
        │  leaderboard snapshot sent
        ▼
[Participant phone updates rank]
        │
        │  loop to next question
        ▼
[Final leaderboard shown + persisted]
```

### 2.6 Raise Hand Queue

```
[Participant phone, persistent hand button]
        │
        │  tap
        ▼
[Hand raised state: glowing hand icon]
        │
        │  presenter sees queue update
        ▼
[Presenter clicks "Call on next"]
        │
        │  participant phone vibrates + notification
        │  optional: promote to panelist via meeting-tool API
        ▼
[Participant lowers hand manually or presenter lowers]
```

### 2.7 Sentiment Sliders

```
[Slider widget on slide]
        │
        │  participant drags slider
        ▼
[POST /sliders/:id/value (rate-limited 1/2s)]
        │
        │  server recomputes aggregate (P² quantile for median)
        ▼
[Broadcast aggregate snapshot every 500 ms]
        │
        │  all participants see updated mean/median/histogram
        ▼
[On slide exit, slider widget closes]
```

### 2.8 Personalized Handouts at End

```
[Session ends (presenter clicks "End" or last slide exits)]
        │
        │  session_ended event broadcast
        ▼
[Participant phone shows "session complete — your handout is ready"]
        │
        │  tap "view handout"
        ▼
[GET /handouts/:signed_token]
        │
        │  renders personalized PDF + metadata
        ▼
[Optional: "send me a copy" → email dispatched]
        │
        │  optional: "send me generic version" (drops identifying metadata)
        ▼
[Handout URL expires per TTL]
```

### 2.9 Feedback Form

```
[Session ends; handout flow OR direct "give feedback" prompt]
        │
        │  tap "Give feedback"
        ▼
[Form renders: NPS + per-slide stars + free text]
        │
        │  prefilled where engagement heuristics apply
        ▼
[Submit]
        │
        │  POST /feedback/:session_id
        ▼
[Thank-you state; presenter sees aggregated view in recap]
```

---

## 3. Functional and Non-Functional Requirements

### 3.1 QR join URL design and TTL

**URL shape.** `https://<region>.domio.live/j/<session_code>?r=<route_hint>`

- `region` is a regional subdomain (e.g., `apac.domio.live`) for latency optimization and for any future localization-aware routing.
- `session_code` is 7 characters of Crockford base32 (Crockford alphabet excludes I, L, O, U to reduce visual ambiguity), with the last character being a checksum (mod 32 over the prior 6).
- `r` is an optional route hint for the join service (e.g., an affinity token from a previous session); absent on first scan.

**TTL.** The QR code itself has the same TTL as the session: a session QR is valid from session creation (which can be minutes to days before the live start) until session archival (default 7 days post-session end, configurable down to 24 h or up to 90 days for training use cases).

**Re-scan behavior.** Re-scanning the same QR mid-session does not create a new participant; the existing `participant_id` (stored in `localStorage`) is re-used if still valid (within session TTL). Re-scan after session end opens the recap/handout flow (F151).

### 3.2 Real-time channel scaling (10k+ concurrent participants per session)

**Target.** Support 10,000 concurrent participants per session with sub-3-second vote-to-render latency p95. Design for 25,000 as the ceiling per session (one large all-hands).

**Architecture.** See §4 — a horizontally-scalable participant session service fronted by an edge pub/sub layer. Key choices:

- **WebSocket fan-out** from a per-session primary to all subscribed participants.
- **Edge pub/sub** (e.g., a managed pub/sub like Ably, Pusher, or self-hosted NATS + edge workers) to absorb the fan-out; the session primary is not the fan-out point.
- **Per-session shard:** if a session exceeds N participants (default 5,000), the session is split into multiple shards for fan-out but maintains a single logical session id for client-facing operations.
- **Backpressure:** if a participant's connection is slow, the channel sends fewer intermediate frames (aggregate snapshots instead of per-event); the participant catches up via state sync on reconnect.

### 3.3 Poll vote integrity (one-person-one-vote with bot resistance)

**One-person-one-vote.**

- Each `poll_vote` row is keyed on `(poll_id, participant_id)` with a unique constraint.
- A second vote from the same participant either (a) replaces the prior vote (default for polls allowing changes) or (b) is rejected (default for "final vote" polls).
- Identity is the `participant_id` issued at join, not the IP/device fingerprint.

**Bot resistance.**

- A CAPTCHA or invisible-challenge is required for the first vote per participant in a session; configurable to required-every-vote for high-stakes polls.
- A honeypot field on the vote form catches dumb bots.
- Per-IP and per-ASN rate limits in addition to per-participant limits.
- A vote-volume spike detector flags sessions with abnormal vote patterns and prompts presenter review.
- Identified mode is opt-in and requires email/SSO verification before counted votes are honored (anonymous mode is always honored for participation but votes are not counted in identified tallies unless verified).

**Edge cases.**

- A participant joining from two devices (e.g., phone + laptop) gets two `participant_id`s; the system detects this via cookie + IP and offers to merge with the participant's consent.
- Vote-buying (compensated participation): bot-resistance pattern detection flags sessions with abnormally consistent response timing; presenter is notified.

### 3.4 Word cloud profanity moderation

**Two-layer approach.**

1. **Blocklist layer (synchronous):** a configurable word/phrase blocklist (org-level + deck-level + per-session) blocks obvious profanity and brand-sensitive terms. Updates are pulled from a moderation service on session open.
2. **ML moderation layer (asynchronous):** a small text-classification model flags borderline content for presenter review; flagged words are not displayed publicly until a presenter decision.

**What the participant sees.** Always the same: "thanks — your word is in the cloud." This is deliberate — refusing to display a word to a participant reveals moderation policy and invites gaming. The presenter sees the moderation queue.

**Audit trail.** Every submitted word is stored in the audit log with `moderation_status ∈ {approved, blocked, flagged, presenter_overridden}`. Compliance officers can reconstruct any session's word cloud input.

**Stop-word lists.** Per-deck stop-word lists applied before counting (English defaults: `the, a, an, and, or, but, of, in, on, at, to, for, with, is, are, was, were, be, been, being`). Locale-specific stop-words for non-English sessions.

### 3.5 Q&A upvoting ranking

**Ranking formula.** `rank_score = upvotes - downvotes + recency_bonus`

- `recency_bonus` decays linearly: a question submitted in the last 60 s gets +1; older questions get less.
- The exact decay function is configurable per session; default parameters favor recent-but-not-too-recent.

**Tiebreaker.** Earlier-submitted question ranks higher.

**Anti-brigading.**

- Per-participant upvote cap (default 3 total, configurable).
- Same IP/device fingerprint detected → second identity is rate-limited on upvoting.
- Coordinated upvote detection (multiple accounts voting the same way at the same time) flags the question for presenter review.

**Public vs presenter view.**

- Public view shows rank, text, age, and (if identified mode) display name.
- Presenter view adds: submitter identity (if identified), upvote roster, flag history.

### 3.6 Leaderboard fairness

**Reproducibility.** Scores are computed server-side from raw timestamps; leaderboard snapshots are authoritative; client-side optimistic rankings are not allowed to diverge from server state for more than 250 ms (next sync).

**Clock authority.** Server clock only; client-reported times are for diagnostics, never for scoring.

**Anti-cheat.**

- Question content is delivered at reveal time, not on join (no caching of the question pool).
- Answers are submitted over the same authenticated channel as join; the join-time token signs the answer.
- Bot-resistance per F143 applies (CAPTCHA on quiz join for high-stakes quizzes).
- Late answers (after the timer) are rejected server-side.

**Tiebreaker.** Cumulative response time across all questions; then first-correct submission.

### 3.7 Emoji rate limiting

- **Per-participant:** 1 reaction per 1.5 s (configurable per session).
- **Per-session aggregate:** if total reaction rate exceeds N/sec (default 500/sec for 10k participants), the broadcaster switches to aggregate mode ("🔥 × 47" instead of 47 individual fires).
- **Per-emoji:** each emoji has its own bucket so spamming 🔥 doesn't suppress ❤.

### 3.8 Navigation voting quorum

- **Default quorum:** 30% of currently-connected participants OR configured duration (default 30 s), whichever first.
- **Quorum denominator** = 30 s rolling average of connected participants (smooths churn).
- **Tie handling:** the presenter is nudged to choose; no auto-resolution.
- **Quorum never met:** vote auto-closes with leading option as winner if leading margin ≥ 5%; otherwise presenter nudge.

### 3.9 Slider aggregation

- **Mean / median / distribution** all computed server-side.
- **Median at scale** uses a P²-quantile estimator (O(1) memory) or a t-digest (O(log N)) for high accuracy.
- **Update cadence:** aggregate snapshot broadcast every 500 ms (debounced); individual slider movements not broadcast (privacy).
- **Identified mode opt-in:** participants can opt to have their individual slider value visible to the presenter; default anonymous.

### 3.10 Raise hand queue ordering

- **FIFO by raise time** is the default.
- **Co-presenter edits:** atomic via single-writer; presenter queue edits are serialized through the session primary.
- **Pin/reorder:** allowed for presenter only.
- **Auto-lower timeout:** 5 minutes idle (configurable).

### 3.11 Personalized handout link generation

- **URL shape:** `https://<region>.domio.live/h/<signed_token>` — token is HMAC-signed with the session id + participant id + TTL.
- **TTL:** default 30 days; configurable per session.
- **Revocation:** all handout URLs can be voided per session (for retraction use cases).
- **Personalization:** each handout includes the participant's interactions, attached resources (shared PDF/links), and the deck export (PDF or web-archive).
- **Compliance mode:** if a legal hold (F198) is in effect, handout URLs are not emitted; the presenter is told why.

### 3.12 Attendance / engagement capture for compliance

- **Append-only, hash-chained** records (each record references the prior record's hash per session).
- **Trusted server clock** for all timestamps.
- **Export formats:** CSV, JSON, SCORM 1.2, SCORM 2004 (4th Edition).
- **Retention:** default 7 years (configurable down to 30 days).
- **Access control:** attendance records read-restricted to authorized roles (admin, compliance officer); presenter cannot edit after session end.
- **Read audit:** every read of attendance records is itself logged.

### 3.13 Live translation STT/TTS pipeline

- **Latency target:** end-to-end caption within 4 s p95.
- **Streaming:** audio chunks of ~2 s; partial captions word-by-word.
- **Source language auto-detection:** default English; supports 12 target languages at launch.
- **Moderation hook:** STT output passed through same moderation as word cloud (see §3.4).
- **PII masking:** configurable per session — emails/phones/IDs masked before broadcast.
- **Graceful degradation:** MT unavailable → fall back to source-language captions.
- **Optional TTS:** per-participant toggle; respects OS TTS settings.

### 3.14 Feedback aggregation

- **Per-slide stars:** 1–5 each; aggregated as mean per slide.
- **NPS:** standard 0–10; aggregated with classic NPS formula (% promoters − % detractors).
- **Free-text moderation:** same pipeline as word cloud (see §3.4).
- **PII handling:** free-text is scanned for PII; presenter sees masked version; raw version only accessible to authorized roles.
- **Aggregation cadence:** live during feedback window (default 7 days post-session); presenter sees running totals.

---

## 4. Architecture

### 4.1 Component overview

```
                                    ┌─────────────────────┐
                                    │  Presenter (laptop) │
                                    │   presenter view    │
                                    └──────────┬──────────┘
                                               │ WSS
                                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Edge pub/sub layer                          │
│   (managed pub/sub or self-hosted NATS + edge workers)            │
│   - per-session topics                                            │
│   - per-shard fan-out                                             │
└─────┬───────────────────────┬───────────────────────┬─────────────┘
      │                       │                       │
      ▼                       ▼                       ▼
┌─────────────┐       ┌─────────────────┐     ┌──────────────────┐
│ Participant │       │ Participant     │     │ Participant      │
│ session     │       │ session         │     │ session          │
│ shard 1     │       │ shard 2         │     │ shard 3          │
└─────┬───────┘       └────┬────────────┘     └────┬─────────────┘
     │                    │                       │
     ▼                    ▼                       ▼
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│ Participants│    │ Participants │    │ Participants │
│ (phones)    │    │ (phones)     │    │ (phones)     │
└─────────────┘    └──────────────┘    └──────────────┘

Subsystems (horizontal services, scale independently):
- poll engine
- word cloud engine (with moderation)
- Q&A engine
- quiz engine (with scoring)
- reaction broadcaster
- navigation vote collector
- sentiment collector
- raise hand queue
- handout generator
- attendance logger
- translation pipeline
- feedback collector
```

### 4.2 Participant session service

The per-shard stateful service that holds the live session state for one shard of participants.

**Responsibilities.**

- Maintain session state (current slide, active widgets, participant roster).
- Authenticate WebSocket connections (via session code + participant token).
- Forward events from the pub/sub layer to connected participants.
- Aggregate and emit snapshots for catch-up on reconnect.

**State.** Hot state (current slide, active polls, participant roster) is in-memory; cold state (full session history) is in the session store. Snapshots are flushed every 5 s.

**Sharding.** Sessions are sharded by `session_id` + shard index; shard assignment is stable for the session lifetime. A session coordinator service handles cross-shard queries (e.g., session-wide leaderboard).

### 4.3 Real-time channel (WebSocket fan-out + edge pub/sub)

The transport layer. Each participant subscribes to the session's channel; the channel is fanned out via edge workers to all subscribed participants.

**Per-event flow.**

1. Presenter (or participant) emits an event (e.g., `vote_cast`).
2. The originating service publishes to the session's pub/sub topic.
3. Edge workers receive the event and forward it to all WebSocket connections on the topic.
4. The originating service also broadcasts aggregate snapshots (e.g., `vote_aggregate`) on a separate topic for participants to render.

**Backpressure.** If a participant's connection is slow, edge workers drop intermediate frames and send the latest snapshot; the participant catches up via state sync on reconnect.

**Disconnection.** A participant disconnecting cleans up their state (e.g., their hand is auto-lowered after 30 s if not reconnected).

### 4.4 Poll engine

**Responsibilities.**

- Accept `vote_cast` events, enforce one-person-one-vote.
- Broadcast `vote_aggregate` snapshots on debounce.
- Support poll lifecycle: `draft → open → closed → revealed`.

**Storage.** `poll` and `poll_vote` tables (see §5); aggregates computed on-the-fly from `poll_vote` rows for accuracy, cached for 1 s.

**Per-poll isolation.** Each poll has its own queue to prevent cross-poll contention.

### 4.5 Word cloud engine (with moderation)

**Responsibilities.**

- Tokenize, normalize, and count submissions.
- Apply moderation (blocklist + ML).
- Compute word frequency map and broadcast cloud snapshots.
- Handle stop-word lists per locale.

**Storage.** `word` table per (session, slide); moderation status tracked per word; eviction policy per slide cap.

**Moderation integration.** Synchronous blocklist check on submit; async ML flag on a 5 s loop; presenter review queue for flagged words.

### 4.6 Q&A engine

**Responsibilities.**

- Manage question CRUD with state transitions.
- Compute rank scores (upvotes − downvotes + recency).
- Handle moderation (auto-flag at report threshold; presenter approval queue).
- Persist for live "parking lot" (F133).

**Storage.** `qa_item` and `qa_upvote` tables; ordered by computed rank.

### 4.7 Quiz engine with scoring

**Responsibilities.**

- Drive state machine: `idle → countdown → accepting_answers → revealing → leaderboard → next → finished`.
- Score attempts (base + time bonus).
- Generate leaderboard snapshots.
- Enforce anti-cheat (question gating, server clock authority, replay-resistance).

**Storage.** `quiz_question`, `quiz_attempt`, `quiz_score` tables; per-participant score recomputable from raw attempts.

### 4.8 Reaction broadcaster

**Responsibilities.**

- Rate-limit per participant and per emoji.
- Aggregate bursts when global rate exceeds threshold.
- Broadcast `{emoji, count}` snapshots every 250 ms.

**Storage.** Ephemeral; reactions are not persisted beyond the broadcast window.

### 4.9 Navigation vote collector

**Responsibilities.**

- Special-case poll engine with deck-state side effects.
- Compute quorum (rolling 30 s connected average).
- Trigger deck auto-advance on quorum met (or presenter override).

**Storage.** `nav_vote` table; quorum state ephemeral.

### 4.10 Sentiment collector

**Responsibilities.**

- Maintain per-slider state and aggregate statistics.
- Compute mean / median (P² quantile) / distribution histogram.
- Broadcast snapshot every 500 ms.

**Storage.** `sentiment_input` table for audit; aggregates ephemeral.

### 4.11 Raise hand queue

**Responsibilities.**

- Sorted set keyed by raise timestamp.
- Atomic "call on next" (single-writer enforces atomicity across co-presenters).
- Auto-lower on idle timeout (default 5 min).
- Optional meeting-tool promotion API integration (F188).

**Storage.** `raise_hand` table for audit; queue ephemeral.

### 4.12 Handout generator

**Responsibilities.**

- On session end, generate per-participant handouts.
- Personalize with participant's interactions and attached resources.
- Sign URLs with TTL.
- Dispatch via email + in-app + share-link.

**Storage.** Handout artifacts in object storage; metadata in `handout_link` table.

### 4.13 Attendance logger

**Responsibilities.**

- Append-only, hash-chained records.
- Emit SCORM packages for LMS ingestion.
- Retention enforcement; legal hold integration.

**Storage.** Compliance log store (append-only); SCORM packages in object storage.

### 4.14 Translation pipeline

**Responsibilities.**

- Capture presenter audio (from meeting-tool integration or in-app mic).
- STT in source language (auto-detected).
- MT to participant's target language.
- Optional TTS playback.
- Moderate STT output (blocklist + PII masking).
- Stream partial captions word-by-word.

**Storage.** Ephemeral by default; configurable retention for compliance.

### 4.15 Feedback collector

**Responsibilities.**

- Render feedback form per session.
- Aggregate per-slide ratings, NPS, free-text.
- Moderate free-text (blocklist + ML).
- Export aggregated feedback to presenter recap.

**Storage.** `feedback_response` table; presenter sees aggregates only by default.

---

## 5. Data Model

### 5.1 participant

```sql
CREATE TABLE participant (
  id              UUID PRIMARY KEY,
  session_id      UUID NOT NULL REFERENCES session(id),
  display_name    TEXT NOT NULL,
  is_anonymous    BOOLEAN NOT NULL DEFAULT TRUE,
  is_identified   BOOLEAN NOT NULL DEFAULT FALSE,
  user_id         UUID REFERENCES user(id), -- null for anonymous
  join_token      TEXT NOT NULL, -- HMAC for re-join
  locale          TEXT, -- preferred language code (e.g., 'en-US', 'bn-BD')
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at         TIMESTAMPTZ,
  client_meta     JSONB, -- device, browser, app version
  ip_hash         TEXT, -- hashed for privacy
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_participant_session ON participant(session_id);
CREATE UNIQUE INDEX idx_participant_join_token ON participant(join_token);
```

### 5.2 session_membership

The join table that tracks per-session participant state.

```sql
CREATE TABLE session_membership (
  id                 UUID PRIMARY KEY,
  session_id         UUID NOT NULL REFERENCES session(id),
  participant_id     UUID NOT NULL REFERENCES participant(id),
  joined_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at            TIMESTAMPTZ,
  is_connected       BOOLEAN NOT NULL DEFAULT TRUE,
  last_heartbeat_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  shard_index        INT NOT NULL DEFAULT 0,
  UNIQUE (session_id, participant_id)
);
CREATE INDEX idx_session_membership_session ON session_membership(session_id);
CREATE INDEX idx_session_membership_participant ON session_membership(participant_id);
```

### 5.3 poll

```sql
CREATE TABLE poll (
  id              UUID PRIMARY KEY,
  session_id      UUID NOT NULL REFERENCES session(id),
  slide_id        UUID NOT NULL REFERENCES slide(id),
  prompt          TEXT NOT NULL,
  options         JSONB NOT NULL, -- [{id, label, ...}]
  response_shape  TEXT NOT NULL, -- 'single_choice' | 'multi_choice' | 'rating'
  allow_change    BOOLEAN NOT NULL DEFAULT TRUE,
  is_anonymous    BOOLEAN NOT NULL DEFAULT TRUE,
  state           TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'open' | 'closed' | 'revealed'
  opened_at       TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_poll_session ON poll(session_id);
CREATE INDEX idx_poll_slide ON poll(slide_id);
```

### 5.4 poll_vote

```sql
CREATE TABLE poll_vote (
  id              UUID PRIMARY KEY,
  poll_id         UUID NOT NULL REFERENCES poll(id),
  participant_id  UUID NOT NULL REFERENCES participant(id),
  option_ids      JSONB NOT NULL, -- for multi_choice, array; for single, single value
  rating_value    INT, -- for rating polls
  cast_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key TEXT NOT NULL,
  UNIQUE (poll_id, participant_id),
  UNIQUE (poll_id, idempotency_key)
);
CREATE INDEX idx_poll_vote_poll ON poll_vote(poll_id);
CREATE INDEX idx_poll_vote_participant ON poll_vote(participant_id);
```

### 5.5 word

```sql
CREATE TABLE word (
  id                  UUID PRIMARY KEY,
  session_id          UUID NOT NULL REFERENCES session(id),
  slide_id            UUID NOT NULL REFERENCES slide(id),
  participant_id      UUID NOT NULL REFERENCES participant(id),
  raw_text            TEXT NOT NULL,
  normalized_text     TEXT NOT NULL,
  moderation_status   TEXT NOT NULL DEFAULT 'pending',
  -- 'approved' | 'blocked' | 'flagged' | 'presenter_overridden'
  moderation_meta     JSONB,
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_word_session_slide ON word(session_id, slide_id);
CREATE INDEX idx_word_normalized ON word(session_id, slide_id, normalized_text);
CREATE INDEX idx_word_moderation ON word(moderation_status) WHERE moderation_status != 'approved';
```

### 5.6 qa_item

```sql
CREATE TABLE qa_item (
  id              UUID PRIMARY KEY,
  session_id      UUID NOT NULL REFERENCES session(id),
  slide_id        UUID REFERENCES slide(id), -- null = session-wide
  participant_id  UUID NOT NULL REFERENCES participant(id),
  text            TEXT NOT NULL,
  state           TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' | 'approved' | 'answered' | 'deferred' | 'dismissed' | 'flagged'
  upvotes         INT NOT NULL DEFAULT 0,
  downvotes       INT NOT NULL DEFAULT 0,
  rank_score      REAL NOT NULL DEFAULT 0,
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_qa_session ON qa_item(session_id);
CREATE INDEX idx_qa_rank ON qa_item(session_id, rank_score DESC, submitted_at ASC);
CREATE INDEX idx_qa_state ON qa_item(session_id, state);
```

```sql
CREATE TABLE qa_upvote (
  id              UUID PRIMARY KEY,
  qa_item_id      UUID NOT NULL REFERENCES qa_item(id),
  participant_id  UUID NOT NULL REFERENCES participant(id),
  direction       TEXT NOT NULL, -- 'up' | 'down'
  voted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (qa_item_id, participant_id, direction)
);
```

### 5.7 quiz_question

```sql
CREATE TABLE quiz_question (
  id              UUID PRIMARY KEY,
  session_id      UUID NOT NULL REFERENCES session(id),
  slide_id        UUID NOT NULL REFERENCES slide(id),
  prompt          TEXT NOT NULL,
  shape           TEXT NOT NULL, -- 'multiple_choice' | 'true_false' | 'type_answer'
  options         JSONB,
  correct_answer  JSONB NOT NULL,
  timer_seconds   INT NOT NULL DEFAULT 20,
  base_points     INT NOT NULL DEFAULT 1000,
  bonus_per_sec   INT NOT NULL DEFAULT 50,
  ordinal         INT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quiz_question_session ON quiz_question(session_id, ordinal);
```

### 5.8 quiz_attempt

```sql
CREATE TABLE quiz_attempt (
  id              UUID PRIMARY KEY,
  quiz_question_id UUID NOT NULL REFERENCES quiz_question(id),
  participant_id  UUID NOT NULL REFERENCES participant(id),
  answer          JSONB NOT NULL,
  is_correct      BOOLEAN NOT NULL,
  score           INT NOT NULL DEFAULT 0,
  response_ms     INT NOT NULL, -- time from question_unlocked to answer submission
  submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  idempotency_key TEXT NOT NULL,
  UNIQUE (quiz_question_id, participant_id),
  UNIQUE (quiz_question_id, idempotency_key)
);
CREATE INDEX idx_quiz_attempt_participant ON quiz_attempt(participant_id);
CREATE INDEX idx_quiz_attempt_question ON quiz_attempt(quiz_question_id);
```

### 5.9 reaction

```sql
CREATE TABLE reaction (
  id              UUID PRIMARY KEY,
  session_id      UUID NOT NULL REFERENCES session(id),
  slide_id        UUID REFERENCES slide(id), -- null = anywhere
  participant_id  UUID NOT NULL REFERENCES participant(id),
  emoji           TEXT NOT NULL,
  is_custom       BOOLEAN NOT NULL DEFAULT FALSE,
  emitted_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Reactions are ephemeral; this table is for audit/retention; can be partitioned and dropped after N days
CREATE INDEX idx_reaction_session_slide ON reaction(session_id, slide_id, emitted_at);
```

### 5.10 nav_vote

```sql
CREATE TABLE nav_vote (
  id              UUID PRIMARY KEY,
  session_id      UUID NOT NULL REFERENCES session(id),
  source_slide_id UUID NOT NULL REFERENCES slide(id),
  target_slide_id UUID NOT NULL REFERENCES slide(id),
  participant_id  UUID NOT NULL REFERENCES participant(id),
  voted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  state           TEXT NOT NULL DEFAULT 'open',
  -- 'open' | 'closed' | 'tied' | 'invalidated'
  winning_target  UUID REFERENCES slide(id),
  closed_at       TIMESTAMPTZ
);
CREATE INDEX idx_nav_vote_session ON nav_vote(session_id, state);
```

### 5.11 sentiment_input

```sql
CREATE TABLE sentiment_input (
  id              UUID PRIMARY KEY,
  session_id      UUID NOT NULL REFERENCES session(id),
  slide_id        UUID NOT NULL REFERENCES slide(id),
  slider_id       TEXT NOT NULL, -- widget id within slide
  participant_id  UUID NOT NULL REFERENCES participant(id),
  value           REAL NOT NULL,
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sentiment_slider ON sentiment_input(session_id, slide_id, slider_id, recorded_at);
```

### 5.12 raise_hand

```sql
CREATE TABLE raise_hand (
  id              UUID PRIMARY KEY,
  session_id      UUID NOT NULL REFERENCES session(id),
  participant_id  UUID NOT NULL REFERENCES participant(id),
  raised_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  lowered_at      TIMESTAMPTZ,
  reason          TEXT, -- 'manual_lower' | 'auto_timeout' | 'lower_all' | 'session_end'
  call_on_at      TIMESTAMPTZ, -- when presenter called on this hand
  ordinal         INT NOT NULL -- order in queue at time of raise
);
CREATE INDEX idx_raise_hand_session_active ON raise_hand(session_id, lowered_at) WHERE lowered_at IS NULL;
```

### 5.13 handout_link

```sql
CREATE TABLE handout_link (
  id              UUID PRIMARY KEY,
  session_id      UUID NOT NULL REFERENCES session(id),
  participant_id  UUID NOT NULL REFERENCES participant(id),
  signed_token    TEXT NOT NULL,
  artifact_url    TEXT NOT NULL, -- object storage path
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_via    JSONB, -- ['email', 'in_app', 'share_link']
  UNIQUE (signed_token)
);
CREATE INDEX idx_handout_participant ON handout_link(participant_id);
CREATE INDEX idx_handout_expires ON handout_link(expires_at) WHERE revoked_at IS NULL;
```

### 5.14 attendance_record

```sql
CREATE TABLE attendance_record (
  id              UUID PRIMARY KEY,
  session_id      UUID NOT NULL REFERENCES session(id),
  participant_id  UUID NOT NULL REFERENCES participant(id),
  event_type      TEXT NOT NULL,
  -- 'join' | 'leave' | 'slide_view_start' | 'slide_view_end' | 'interaction'
  event_data      JSONB,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  prev_hash       TEXT NOT NULL, -- hash chain
  record_hash     TEXT NOT NULL,
  UNIQUE (session_id, participant_id, occurred_at, event_type)
);
CREATE INDEX idx_attendance_session ON attendance_record(session_id);
```

### 5.15 translation_request

```sql
CREATE TABLE translation_request (
  id              UUID PRIMARY KEY,
  session_id      UUID NOT NULL REFERENCES session(id),
  participant_id  UUID NOT NULL REFERENCES participant(id),
  source_language TEXT NOT NULL,
  target_language TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  retention_until TIMESTAMPTZ, -- null = no retention
  meta            JSONB
);
CREATE INDEX idx_translation_session ON translation_request(session_id);
CREATE INDEX idx_translation_participant ON translation_request(participant_id);
```

### 5.16 feedback_response

```sql
CREATE TABLE feedback_response (
  id                  UUID PRIMARY KEY,
  session_id          UUID NOT NULL REFERENCES session(id),
  participant_id      UUID NOT NULL REFERENCES participant(id),
  overall_nps         INT, -- 0-10
  per_slide_ratings   JSONB, -- {slide_id: 1..5}
  free_text           TEXT,
  moderation_status   TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' | 'approved' | 'blocked' | 'presenter_overridden'
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, participant_id)
);
CREATE INDEX idx_feedback_session ON feedback_response(session_id);
```

---

## 6. APIs and Contracts

### 6.1 REST + WebSocket hybrid

The participant surface is **REST for mutations** (vote, submit, score, translate, leave) and **WebSocket for state push** (slide changes, aggregate snapshots, widget lifecycle).

REST surface (representative):

```
POST   /sessions/:code/join              # join session, get participant_token
POST   /sessions/:code/leave              # explicit leave (otherwise idle-timeout)
POST   /polls/:id/vote                    # cast vote (idempotent)
POST   /polls/:id/retract                 # retract vote
POST   /wordclouds/:id/words              # submit word(s)
POST   /qa/:session_id/questions          # submit Q&A
POST   /qa/:question_id/upvote            # upvote/downvote
POST   /quizzes/:id/attempts              # submit quiz answer (idempotent)
POST   /reactions                         # emit reaction
POST   /nav_votes/:id/cast                # cast navigation vote
POST   /sliders/:id/value                 # set slider value
POST   /hands                             # raise/lower hand
GET    /handouts/:signed_token            # retrieve personalized handout
POST   /feedback/:session_id              # submit feedback
GET    /sessions/:code/state              # fetch current state snapshot
```

WebSocket surface (representative events, all server → client unless noted):

```
client → server:
  hello { session_code, participant_token }
  heartbeat { ts }
  ack { last_event_id }

server → client:
  session_snapshot { ... }
  slide_changed { slide_id, widgets }
  poll_opened { poll_id, prompt, options, ... }
  poll_vote_aggregate { poll_id, totals }
  poll_closed { poll_id }
  word_cloud_opened { cloud_id, max_chars }
  word_cloud_snapshot { cloud_id, words }
  qa_snapshot { questions }
  quiz_countdown { question_id, seconds }
  quiz_question_unlocked { question_id, prompt, options }
  quiz_attempt_received { question_id }
  quiz_reveal { question_id, correct_answer }
  quiz_leaderboard { top_n, my_rank }
  reaction_aggregate { emoji, count }
  nav_vote_opened { vote_id, options, quorum }
  nav_vote_aggregate { vote_id, totals }
  nav_vote_resolved { vote_id, winner, target_slide_id }
  slider_aggregate { slider_id, mean, median, histogram }
  hand_queue_update { queue }
  hand_called { participant_id }
  translation_caption { text, language, partial }
  session_ended { reason }
  handout_ready { signed_token }
```

### 6.2 Endpoint contracts (representative)

`POST /sessions/:code/join`

```json
// request
{
  "display_name": "Alex",
  "locale": "en-US",
  "client_meta": { "device": "mobile", "os": "iOS 17", "app_version": "1.2.3" },
  "idempotency_key": "uuid"
}

// 200 response
{
  "participant_id": "uuid",
  "participant_token": "opaque",
  "session_id": "uuid",
  "is_anonymous": true,
  "shard_index": 0,
  "websocket_url": "wss://apac.domio.live/s/<session_id>?token=<token>"
}

// 409 if already joined → returns existing participant_id (re-join)
```

`POST /polls/:id/vote`

```json
// request
{
  "participant_id": "uuid",
  "option_ids": ["opt-1"],   // or ["opt-1","opt-3"] for multi
  "rating_value": null,        // 1..N for rating polls
  "idempotency_key": "uuid"
}

// 200 response
{ "vote_id": "uuid", "accepted_at": "ts" }
// 409 if poll closed
// 409 if participant already voted and allow_change=false
// 422 if option_ids invalid
```

`POST /qa/:question_id/upvote`

```json
// request
{ "participant_id": "uuid", "direction": "up", "idempotency_key": "uuid" }
// 200 response
{ "new_upvotes": 4, "new_downvotes": 1, "rank_score": 3.7 }
// 409 if already voted in this direction (idempotent)
// 403 if cap (3) reached
```

`POST /quizzes/:id/attempts`

```json
// request
{
  "participant_id": "uuid",
  "question_id": "uuid",
  "answer": { "type": "choice", "value": "opt-2" },
  "idempotency_key": "uuid"
}
// 200 response
{
  "attempt_id": "uuid",
  "is_correct": true,
  "score": 1450,
  "response_ms": 3214
}
// 409 if quiz question closed (timer expired or presenter advanced)
```

`POST /sliders/:id/value`

```json
// request
{ "participant_id": "uuid", "value": 7.5, "idempotency_key": "uuid" }
// 200 response
{ "accepted_at": "ts" }
// 422 if value out of range
// 429 if rate-limited (1 change per 2s default)
```

`POST /hands`

```json
// request
{ "participant_id": "uuid", "action": "raise" | "lower" }
// 200 response
{ "state": "raised" | "lowered", "queue_position": 3 }
```

`GET /handouts/:signed_token`

```json
// 200 response
{
  "deck_export_url": "https://...",
  "personalized_annotations": { ... },
  "attached_resources": [...],
  "expires_at": "ts"
}
// 401 if token invalid or expired
// 410 if revoked
```

### 6.3 Error envelope

All REST errors return RFC-7807 problem-detail JSON:

```json
{
  "type": "https://docs.domio.live/errors/poll-not-open",
  "title": "Poll is not open",
  "status": 409,
  "detail": "The poll closed at 14:32:01 UTC.",
  "instance": "/polls/abc/vote",
  "code": "poll_not_open"
}
```

WebSocket errors use the same envelope on a `error` event.

---

## 7. Security

### 7.1 Bot resistance (CAPTCHA / honeypot)

**Invisible CAPTCHA on first interactive action.** Triggered on first vote / submission per session; only re-triggered if subsequent behavior is flagged. Implementation: hCaptcha or Turnstile (no Google reCAPTCHA — privacy and PDPA alignment).

**Honeypot field.** A hidden field on every form; bots that fill it are silently rejected.

**Rate limiting.** Per-participant, per-IP, per-ASN. Default limits documented in §3.

**Behavioral detection.** Bot-resistance ML flags participants with abnormal response patterns (sub-millisecond response times, perfect regularity across many questions, identical fingerprints across multiple sessions).

### 7.2 Anonymous vs identified mode

**Anonymous mode (default).**

- No PII collected beyond session-derived ephemeral participant_id.
- No display name shown to other participants; presenter sees display name (alias) only.
- No bound identity; participant re-joins as a new identity.
- PII handling: minimal; what little is collected (IP hash, device meta) is hashed and retained only for the session.

**Identified mode (opt-in per session).**

- Email or SSO verification required.
- Display name bound to identity; presenter sees real name.
- Vote/response attribution is auditable.
- PII handling: full PDPA/GDPR obligations apply (consent, retention, erasure).
- Identified mode requires explicit presenter toggle; participants can decline and fall back to anonymous mode within the session.

**Default.** Anonymous is the default and always permitted; identified is opt-in by presenter per session.

### 7.3 PII handling for handouts

**Personalization scope.** A handout contains:

- The participant's own interactions (their votes, questions, slider values, hand raises).
- Attached resources the presenter chose to include.
- The deck export (PDF or web-archive) — same content as everyone receives.

**No cross-participant data.** A handout never contains another participant's data.

**Identified mode binding.** In identified mode, the handout is bound to the verified identity; revocation of identity (per PDPA/GDPR) voids the handout link.

**Retention.** Default 30 days post-session; configurable per session; legal hold extends indefinitely.

**Right to erasure (PDPA/GDPR).** A participant can request erasure of their handout; on receipt of verified request, the handout artifact is deleted and the `handout_link` row marked `revoked`.

### 7.4 Translation data retention

**Default.** Translation requests are ephemeral; audio chunks and captions are not retained after the session ends.

**Configurable retention.** For compliance use cases (training sessions with regulated content), translation requests can be retained up to N days; the participant is informed via consent banner before joining.

**PII masking.** See §3.13 — STT output masked for PII before caption broadcast; configurable per session.

### 7.5 Accessibility for participants with disabilities

**WCAG target.** AA at launch; AAA where achievable.

**Specific accommodations for audience participation.**

- **Screen-reader support.** Each widget type has a screen-reader-friendly mode that announces widget state and changes via aria-live regions. Reactions are announced on the participant's own phone only (never broadcast) to avoid noise for screen-reader users in the audience.
- **Keyboard navigation.** All participant interactions are keyboard-operable (no mouse-only requirements); the mobile web app exposes a "switch to desktop mode" toggle for screen-reader users with Bluetooth keyboards.
- **Color independence.** No information conveyed by color alone; all charts include labels, patterns, or text alternatives.
- **Reduced motion.** Respects OS-level `prefers-reduced-motion`; reactions fall back to a non-animated indicator, slide transitions disable.
- **Captioning.** STT captions (F153) double as accessibility captions for deaf/hard-of-hearing participants; presenter can disable separate captions to avoid duplication.
- **High contrast.** Theme follows OS-level high-contrast setting; explicit "high contrast" override in settings.
- **Voice control.** Widget interactions (vote, raise hand) support voice-control labels for participants who use voice control software.
- **Localization.** See §3.13; the translation pipeline directly supports deaf participants who prefer a different language's captions.

---

## 8. Performance

### 8.1 Real-time fan-out scaling (10k+ participants)

**Target.** 10,000 concurrent participants per session; sub-3-second vote-to-render latency p95.

**Architecture.** See §4. Key scaling levers:

- **Edge pub/sub** absorbs fan-out; per-session primary publishes once, edge workers fan to N participants.
- **Per-session sharding** beyond 5,000 participants keeps individual shard connection counts manageable.
- **Aggregate broadcast** for high-volume events (reactions, sentiment); per-event broadcast for low-volume events (slide change, poll open).
- **Connection pooling** at edge workers; per-region co-location of participants.

**Bench.** Load-tested with Locust / k6 against a single region: target 10,000 connections sustained for 60 minutes with sub-3-second p95 latency on a 4 vCPU / 16 GB edge worker.

### 8.2 Aggregation update latency

**Targets.**

- Poll aggregate broadcast: < 1.5 s p95 from vote cast.
- Word cloud snapshot: < 3 s p95 from submission.
- Slider aggregate: < 1.5 s p95 from value change.
- Leaderboard snapshot: < 1 s p95 from quiz question close.

**Implementation.** Each engine maintains in-memory aggregates and broadcasts on a debounced cadence; the cadence is the dominant factor in latency.

### 8.3 Translation latency

**Target.** End-to-end caption within 4 s p95.

**Stages.**

- Audio capture → STT chunk: < 1 s p95.
- STT → MT: < 2 s p95.
- MT → broadcast: < 500 ms p95.
- Participant receive → render: < 500 ms p95.

**Pipeline choices.** Streaming STT (Deepgram, Whisper streaming, or self-hosted Whisper); MT (DeepL, Google, or self-hosted NLLB); all integrated via WebSocket streaming.

**Bottleneck mitigation.** Concurrent MT workers per language pair; backpressure-aware batching; partial captions sent as available.

---

## 9. Observability and Testing

### 9.1 Observability

**Metrics (per session, per service).**

- `audience.participants.connected` (gauge)
- `audience.events.published` (counter)
- `audience.events.delivered` (counter)
- `audience.events.dropped` (counter)
- `audience.aggregation.latency_ms` (histogram)
- `audience.fanout.duration_ms` (histogram)
- `audience.translation.latency_ms` (histogram)
- `audience.poll.vote_count` (counter)
- `audience.quiz.attempt_score` (histogram)
- `audience.handout.generation_duration_ms` (histogram)
- `audience.moderation.flagged_count` (counter)

**Logs.** Structured JSON per service; participant_id hashed at log emission; PII never logged.

**Traces.** Distributed tracing via OpenTelemetry; trace ID propagated from participant click through engine to broadcast.

**Alerts.**

- Fan-out delivery rate < 99% over 5 min → alert.
- Aggregation latency p95 > 5 s over 5 min → alert.
- Translation latency p95 > 6 s over 5 min → alert.
- Moderation backlog > 1,000 items → alert.

### 9.2 Testing

**Unit tests.** Each engine has unit tests for ranking, scoring, rate limiting, idempotency.

**Integration tests.** End-to-end flows in a test environment (join → vote → aggregate → handout).

**Load tests (k6 / Locust).**

- 10,000 concurrent participants sustained for 60 min — must hit latency targets.
- 25,000 concurrent participants (the ceiling) — must degrade gracefully.
- Burst tests: 5,000 simultaneous votes within 1 s.
- Sustained reaction flood: 500 reactions/sec for 10 min.
- Quiz stress: 10,000 concurrent quiz attempts within the same question window.

**Fairness tests.**

- Leaderboard reproducibility: reconnecting a participant mid-quiz must produce the same final score as a never-disconnected participant who answered identically.
- Quorum correctness: simulated churn (participants joining/leaving during a nav vote) must not cause the quorum to swing wildly.
- Tiebreaker: synthetic tied scores must always break the same way (by cumulative response time, then first-correct submission).

**Security tests.**

- Bot-resistance: a scripted bot attempting 1,000 votes/sec must be throttled within the first second.
- Honeypot: bot submissions to the honeypot field must be silently rejected.
- Identified mode bypass attempts: forged participant tokens must be rejected.
- Profanity moderation: a curated profanity test set must be 100% blocked at the blocklist layer.
- Handout token replay: an expired/revoked token must return 401/410.

**Accessibility tests.**

- Automated: axe-core / Pa11y on every participant web app screen.
- Manual: keyboard-only and screen-reader (VoiceOver, TalkBack, NVDA) passes per major flow.

---

## 10. Cross-Section Ties

### 10.1 Editor (section 1, F1–F22)

Poll, quiz, word cloud, Q&A, slider, raise-hand, and reaction widgets are all canvas elements. The editor's existing WYSIWYG tooling applies: drag, snap, theme-bind (F37), align (F3), group (F4), component-instance (F25–F27). The widget palette in the editor surfaces a new "Participation" category that drops any of these onto a slide.

The autosave model (F22) and CRDT-based conflict-free sync (F21) extend naturally to widget state — a quiz edited by two co-editors resolves deterministically. Branching/merging (F19, F183) handles deck variants with different participation configurations cleanly.

### 10.2 Prototyping state (section 7, F96–F107)

Navigation votes (F148) interact directly with branching presentations (F97): each nav vote option points to a branch target; variables (F100) reset on branch enter; deep-linkable slide states (F107) work with the personalized handout URL (F151) — a URL like `https://domio.live/h/<token>?state=bear-case` opens the personalized handout at a specific slide variant.

Form inputs inside slides (F101) feed variables; sliders in F101 and sentiment sliders in F149 share the same underlying widget engine. The quiz widget is itself a kind of mini-game mechanic (F105), and quizzes can be embedded in prototype user-testing mode (F104) with the click-recording extending to include quiz answers.

### 10.3 Presenter mode (section 9, F126–F141)

- Presenter view (F126) is the surface that renders poll results, word clouds, Q&A queues, leaderboards, slider aggregates, raise-hand queues, and the reaction overlay.
- Phone-as-remote (F127) is a separate, more privileged client that can also display participation surfaces (hand raised indicator, etc.).
- Live "parking lot" (F133) is implemented on top of the Q&A engine (F145); questions marked `deferred` flow into the wrap-up slide.
- Multi-presenter handoff (F135) and presenter failover (F136) include the participation state — a new presenter inherits the live Q&A queue, active polls, and current quiz state without reset.
- Rehearsal mode (F131) records per-slide time tracking; participation interactions are recorded against the same timeline for the presentation state timeline (F205).
- Post-presentation instant recap (F141) is enriched by participation data: attendance, polls answered, Q&A submitted, quiz score, reaction density per slide.

### 10.4 Analytics (section 12, F169–F178)

- **Per-viewer, per-slide analytics (F169)** naturally extends with participation: per-participant, per-slide, with the additional dimension of _what they did_ (vote, question, slider value).
- **Interactive element analytics (F170)** includes all participation widgets as interactive elements.
- **Presentation delivery analytics (F175)** is largely about live session participation: attendance, poll participation rate, question volume, quiz engagement.
- **Funnel view (F177)** for sales decks now includes "did they answer the qualification poll" as a funnel step.
- **Benchmarks (F178)** compare participation engagement against cohort averages.
- **CRM sync (F176)** writes back participation data (e.g., "answered poll Q3 'yes, evaluating in Q3'") to contact timelines.

### 10.5 Compliance / audit (section 14, F193–F204)

- **Audit logs (F196)** capture every participation action: votes, Q&A submissions, upvotes, quiz attempts, raises, handout generation.
- **SOC 2 / GDPR compliance tooling (F197)** is satisfied by the append-only, hash-chained attendance record store (F152).
- **Legal hold (F198)** freezes participation data (including handout generation per F151) from deletion.
- **Webhooks (F201)** fire on participation events: `poll.closed`, `quiz.finished`, `handout.ready`, `feedback.received`.
- **Headless rendering service (F204)** is used to generate the deck export portion of handouts (F151).
- **Brand governance (F194)** applies to participation widgets: a deck's brand-locked regions (F36) prevent editing of widget styling by juniors; the moderation blocklist (F144) can be org-wide.

### 10.6 Agentic interaction telemetry (section 16, F221–F240)

The MCP tool surface (F222) extends with participation-aware tools: `open_poll`, `close_poll`, `get_poll_results`, `get_qa_queue`, `mark_qa_answered`, `start_quiz`, `advance_quiz`, `get_leaderboard`, `submit_handout_config`, `get_attendance`, `get_feedback_summary`, `enable_translation`, `disable_translation`. Each tool call is logged in the agent audit trail (F227).

Agent-initiated participation: an AI meeting listener (F214) can detect a participant question about churn and trigger a presenter-side Q&A nudge. Cross-deck knowledge graph (F219) can identify participation patterns ("the same audience asked the same question 3 times this quarter — your deck has a gap"). Deck linting for agents (F237) flags participation widgets without configured rate limits or with moderation gaps.

The structured deck schema (F223) includes widget definitions for participation elements; the deck comprehension endpoint (F235) describes participation configuration in its structured output ("this deck has 2 polls, 1 quiz, and a Q&A; Q&A is anonymous, polls are identified").

---

**Document path:** `/home/daiyaan2002/Desktop/Projects/domio/docs/audience-participation.md`

**Coverage:** Section 10 (features 142–154), with the ten required dimensions covered:

1. Feature-by-feature mapping for all 13 features (142–154) with acceptance criteria, behavioral details, edge cases.
2. UX flows for QR join, polls, word cloud, Q&A, leaderboard quiz, raise hand, sentiment sliders, personalized handouts, feedback.
3. Functional and non-functional requirements including QR URL design + TTL, 10k+ scaling, poll integrity, word cloud moderation, Q&A ranking, leaderboard fairness, emoji rate limiting, nav voting quorum, slider aggregation, raise hand ordering, handout generation, attendance/engagement, translation pipeline, feedback aggregation.
4. Architecture for 14 subsystems (participant session, real-time channel, poll/word cloud/Q&A/quiz/reaction/nav/sentiment/raise hand/handout/attendance/translation/feedback engines).
5. Data model with 16 tables (`participant`, `session_membership`, `poll`, `poll_vote`, `word`, `qa_item`, `qa_upvote`, `quiz_question`, `quiz_attempt`, `reaction`, `nav_vote`, `sentiment_input`, `raise_hand`, `handout_link`, `attendance_record`, `translation_request`, `feedback_response`).
6. APIs and contracts: REST endpoints, WebSocket event surface, request/response examples, RFC-7807 error envelope.
7. Security: bot resistance, anonymous vs identified mode, PII for handouts, translation retention, accessibility.
8. Performance: fan-out scaling targets, aggregation latency, translation latency.
9. Observability and testing (load tests, fairness tests, security tests, accessibility tests).
10. Cross-section ties to sections 1, 7, 9, 12, 14, 16.
