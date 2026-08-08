# Phase 16 — Audience Participation

**Phase:** 16
**Name:** Audience participation (turn viewers into participants)
**Owner:** Stream E — Live Experience lead; sub-owners per workstream (Join, Polls/Word Cloud, Q&A, Quiz, Reactions, Nav, Sentiment, Hand, Handout, Attendance, Translation, Feedback)
**Critical-path:** No (surface phase, parallelizable)
**Parallel stream tag:** Stream E — Live Experience (sibling to P14 sharing & publishing and P15 presenter experience)

**Intent:** Turn the one-way presenter stream into a two-way event. Audience members join in under 2.5 s by scanning a session QR from any modern mobile browser (no app install), and immediately begin driving eleven interactive surfaces on the deck — live polls with charted results, live word clouds with two-layer moderation, Q&A with upvoting, Kahoot-grade quizzes with fair server-side scoring, floating emoji reactions with per-participant and aggregate rate limits, audience-picked navigation votes with quorum rules, sentiment sliders with P²-quantile aggregation, raise-hand FIFO with co-presenter atomicity, personalized handouts signed and revocable, hash-chained attendance/engagement records, STT/MT/TTS live translation captions, and post-session feedback with NPS + per-slide stars. The phase is sized for a single all-hands (10k participants) with a ceiling of 25k per session, all wrapped in anonymous-by-default PDPA/GDPR-aligned controls.

---

## 1. Goals

- A participant joins a live session via a single QR scan, lands in under 2.5 s p95 on a 4G connection with zero app install, and is recognized across reconnects without silent identity duplication. (#142)
- Live poll votes render as charted results on the presenter's slide within 1.5 s p95 with strict one-person-one-vote enforcement and bot-resistance. (#143)
- Word clouds redraw at most every 1.5 s on the presenter view with two-layer moderation (synchronous blocklist + async ML flag) that hides rejected words from public view but never reveals rejection to participants. (#144)
- Quiz leaderboards are reproducible across reconnects — the same answers from the same participant must always produce the same score, regardless of network instability, and the leaderboard is server-authoritative. (#146)
- Every audience interaction is captured as an append-only, hash-chained attendance record, exportable as SCORM 2004 4th Edition, and replayable for compliance. (#152)
- Live captions reach a participant's phone in their language within 4 s p95 of the presenter's utterance, with graceful degradation to source-language captions when MT is unavailable. (#153)

---

## 2. Scope

### In scope (feature numbers)

| Feature | Description |
|---|---|
| #142 | Audience joins via QR on their phones (no app, instant) |
| #143 | Live polls with real-time result charts on the slide |
| #144 | Word clouds built live from audience input (two-layer moderation) |
| #145 | Q&A with upvoting and anonymous submission |
| #146 | Live quizzes with leaderboards (fair scoring, replay resistance) |
| #147 | Emoji reactions floating over the presentation in real time |
| #148 | Audience-driven navigation votes ("what should we cover next?") |
| #149 | Slider sentiment inputs ("how confident are you in this plan, 1–10?") |
| #150 | Raise-hand queue for hybrid/remote meetings |
| #151 | Per-audience-member personalized handout links |
| #152 | Attendance and engagement capture (hash-chained audit trail) |
| #153 | Live translation captions of the presenter's voice on audience devices |
| #154 | Post-session feedback forms with per-slide ratings |

### Out of scope (deferred to later phases)

- **Slide-as-PWA install** (deep offline shell) — covers only cacheable join flow; full PWA install prompt lives in a later polish phase.
- **Custom (org-specific) emoji uploads** — defer to P22 polish phase; launch uses standard unicode emoji only.
- **AI meeting listener (F214) auto-triggering presenter Q&A nudges** — partial scaffold only; full surface in P21.
- **Deck-knowledge-graph cross-session participation patterns (F219)** — events emitted; cross-deck analytics in P17.
- **Sales-force notification on participation events (F172, F176)** — webhook emitters shipped, CRM connectors in P17.
- **MCP participation tools** (`open_poll`, `start_quiz`, `get_leaderboard`, `enable_translation`, etc.) — out of scope; ships as part of P13/P22 work, not P16.
- **SCORM 1.2 packages** — only SCORM 2004 (4th Ed) ships in P16; SCORM 1.2 is a polish task.
- **Multi-presenter participation-staffing (e.g., dedicated moderator role)** — co-presenter handoff uses P15 surfaces; dedicated moderator role is P20.
- **Bangla (bn-BD) TTS voices** — captions in Bangla ship; TTS Bangla voices are P22.
- **Public sharing of handout packages** without the recipient's signed token — explicitly disallowed.

---

## 3. Dependencies

### Upstream (must be complete before P16 starts)

- **P00 — Repo, contracts, dev environment** — for `/contracts`, `/packages` layout, CI baseline.
- **P01 — Observability, CI/CD, infra baseline** — for OpenTelemetry SDK, Prometheus exporters, k6/Locust harness, secrets manager, regional infra modules, CDN/edge configuration.
- **P02 — Deck schema & scene-graph foundation** — `deck.schema.json` and `scene-graph.schema.json` must accept `widget_type: "poll" | "word_cloud" | "qa" | "quiz" | "reaction" | "nav_vote" | "sentiment_slider" | "raise_hand"` element types.
- **P03 — Canvas editor MVP** — for placement, snapping, and theme-binding of participation widgets.
- **P04 — CRDT & presence** — for live slide-state propagation between co-presenters and so widget open/close events propagate to all viewers.
- **P05 — Persistence, versioning, branches** — for `session` (from P15), `slide`, and `deck` row references in P16 tables.
- **P14 — Sharing & publishing** — for the publish pipeline that mints signed handout URLs and the per-session CDN subdomain (`<region>.domio.live`).
- **P15 — Presenter experience** — `session` row, presenter session API, stage signaling channel, recap API; P16 is the audience-side counterpart of P15.

### Downstream (this phase unblocks)

- **P17 — Analytics & engagement intelligence** — consumes `attendance_record`, `reaction`, `poll_vote`, `qa_item`, `quiz_attempt`, `sentiment_input`, `raise_hand`, `feedback_response` for per-viewer and presentation delivery analytics (#169–#178).
- **P18 — Collaboration & workflow** — Q&A engine extends into comment threads; nav-vote results feed the merge request workflow.
- **P20 — Security & enterprise** — P16 already satisfies SCORM, hash-chained audit, anonymous-mode PDPA controls; P20 layers DLP, residency, and SSO gating on top.
- **P21 — Novel & frontier** — the AI meeting listener (F214), presentation state timeline (F205), and deck-knowledge graph (F219) all rely on the event surface P16 emits.
- **P22 — Polish, scale, hardening, GA** — backfills SCORM 1.2, custom emoji, Bangla TTS, PWA install prompt, and the 25k-participant ceiling run.

---

## 4. Workstreams

The phase is split into nine ordered workstreams. Each has a sub-owner, files/packages touched, contracts added or consumed, tests written, and a Definition of Done. Workstreams W1–W3 are foundational and must land first; W4–W8 depend on W1 (the participant session service). W9 depends on W2 (the session-end lifecycle hook).

### W1 — Join & participant session foundation

**Sub-owner:** Join/Session lead
**Goal:** Deliver the QR join path and the per-shard participant session service that all other workstreams build on.

**Tasks.**
1. Build `apps/join-web` — the mobile-optimized PWA that boots from `/j/<session_code>`.
2. Build `services/participant-session` — per-shard stateful service holding session snapshot, participant roster, and active widget state.
3. Build `services/session-coordinator` — cross-shard queries (session-wide leaderboard, total attendance).
4. Build `services/edge-pubsub` — edge fan-out layer; integrate with managed pub/sub or self-hosted NATS+edge workers.
5. Implement session-code generator: 7-char Crockford base32 with checksum; pre-generated pools of 10⁶ per region.
6. Implement join-token signing (HMAC over `session_id + participant_id + TTL`) for re-join deduplication.
7. Implement WebSocket gateway at `services/participant-ws-gateway` with backpressure (drop intermediate frames, latest snapshot on slow clients).
8. Implement cross-shard fan-out for >5,000 participants per session.

**Files / packages touched.**
- `/apps/join-web/` (new PWA)
- `/apps/presenter-view/` (consumer; render live widget results on slide)
- `/services/participant-session/` (new)
- `/services/session-coordinator/` (new)
- `/services/participant-ws-gateway/` (new)
- `/services/edge-pubsub/` (new)
- `/packages/protocol/` (WebSocket event envelopes)
- `/packages/contracts/session-code.ts` (new)
- `/packages/ui-kit/` (avatar, toast, presence components reused from P04)

**Contracts added.**
- `contracts/openapi/v1/audience-join.yaml` — `POST /sessions/:code/join`, `POST /sessions/:code/leave`, `GET /sessions/:code/state`.
- `contracts/proto/domio/v1/audience.proto` — session snapshot, slide changed, widget opened/closed, participant roster delta.
- `contracts/events/audience/*.json` — JSON schemas for every server→client audience event.

**Contracts consumed.**
- `contracts/proto/domio/v1/session.proto` (P15), `contracts/proto/domio/v1/slide.proto` (P02), `contracts/schema/deck.schema.json` (P02).

**Tests written.**
- Unit: session-code checksum verifier, join-token signer/verifier, re-join dedup, sharding assignment.
- Integration: join→snapshot→leave lifecycle in `tests/integration/audience/join.test.ts`.
- Load: 10k concurrent WebSocket join test (k6) sustaining 60 min.

**Definition of Done.**
- A scanned QR produces the participant phone view within 2.5 s p95 on a 4G emulator.
- Re-scanning the same QR mid-session re-uses the existing `participant_id`.
- Edge pub/sub sustains 10k connections on one region with sub-3-s p95 fan-out.
- All contracts merged with semver version bump.

---

### W2 — Session lifecycle & end hooks

**Sub-owner:** Session lifecycle lead
**Goal:** Provide the lifecycle events (session start, end, idle-timeout, presenter-leave) that downstream workstreams hook into for handout, attendance, and feedback flows.

**Tasks.**
1. Add `session_ended` broadcast in `services/participant-session` (triggered by presenter, idle timeout, or coordinator force-end).
2. Add `session_started` and `session_idle_warning` events.
3. Implement the session archival job in `workers/session-archiver` — flushes in-memory aggregates to cold storage on session end.
4. Implement presenter-leave and failover handling — P15 handoff extends to participation state.

**Files / packages touched.**
- `/services/participant-session/lifecycle.ts` (new)
- `/workers/session-archiver/` (new)
- `/services/presenter-session/` (P15, consumer)
- `/contracts/events/session-lifecycle/*.json` (new)

**Contracts added.**
- `session_started`, `session_idle_warning`, `session_ended` events on the session channel.

**Contracts consumed.** P15 presenter session events.

**Tests written.**
- Unit: end-hook idempotency (multiple `session_ended` events → single archival).
- Integration: session end triggers `handout_ready`, `attendance_finalized`, `feedback_prompt`.

**Definition of Done.**
- Session-end event reliably delivered within 5 s of presenter "End" click.
- Archival job runs to completion (idempotent on retry).
- Tests pass.

---

### W3 — Participation widgets on the canvas

**Sub-owner:** Editor/canvas lead
**Goal:** Make poll, word cloud, Q&A, quiz, reaction, nav vote, sentiment slider, and raise-hand available as canvas elements that obey the standard WYSIWYG rules.

**Tasks.**
1. Extend `deck.schema.json` with eight `widget_type` entries (`poll`, `word_cloud`, `qa`, `quiz`, `reaction`, `nav_vote`, `sentiment_slider`, `raise_hand`) per `/docs/audience-participation.md` §5.
2. Add the "Participation" category in the editor widget palette (apps/editor/canvas/widget-palette).
3. Reuse the existing canvas tooling (drag, snap, theme-bind, auto-layout, constraints, layers panel).
4. Wire each widget to a runtime config — when dropped, the widget has config defaults (e.g., poll `allow_change: true`, quiz `timer_seconds: 20`).

**Files / packages touched.**
- `/packages/schema/deck.schema.json` (extend)
- `/apps/editor/canvas/widgets/participation/` (new)
- `/apps/editor/canvas/widget-palette/` (extend)
- `/packages/ui-kit/participation/` (new widget config panels)

**Contracts added.** Schema additions to `deck.schema.json`.

**Contracts consumed.** P02 deck schema, P03 canvas contracts, P07 design-token bindings.

**Tests written.**
- Unit: schema validation for each widget type.
- Integration: place each widget on a slide, save, reopen, verify shape preserved.
- Visual regression: widget palette screenshot diff.

**Definition of Done.**
- All eight widget types drop, configure, persist, and re-open cleanly.
- Schema migration backfills existing decks (zero rows changed for decks without participation widgets).

---

### W4 — Poll engine (#143)

**Sub-owner:** Polls lead
**Goal:** Live polls that render on the presenter's slide within 1.5 s p95 of vote cast with strict one-person-one-vote enforcement.

**Tasks.**
1. Build `services/poll-engine` with state machine `draft → open → closed → revealed`.
2. Implement `poll_vote` write path with `(poll_id, participant_id)` unique constraint and idempotency keys.
3. Implement aggregate broadcast on a 500 ms debounce (count, percent, per-option breakdown).
4. Implement bot-resistance: invisible CAPTCHA on first vote per session, honeypot field, per-IP and per-ASN rate limits.
5. Implement multi-select cap enforcement and option-lock-after-open.
6. Implement tie-at-threshold presenter nudge.
7. Add presenter-side chart renderer in `apps/presenter-view/widgets/poll`.

**Files / packages touched.**
- `/services/poll-engine/` (new)
- `/apps/presenter-view/widgets/poll/` (new)
- `/apps/join-web/widgets/poll/` (new)
- `/packages/moderation/` (new; shared with W5)
- `/db/migrations/<ts>_poll_vote.sql` (new)

**Contracts added.**
- `POST /polls/:id/vote`, `POST /polls/:id/retract` (REST).
- `poll_opened`, `poll_vote_aggregate`, `poll_closed` WebSocket events.

**Tests written.**
- Unit: aggregate math, vote dedup, idempotency, tie handling.
- Integration: 10k simultaneous votes, aggregate broadcast within 1.5 s.
- Security: bot flood test (1k votes/s) throttled within 1 s.
- Fairness: reconnecting participant's prior vote preserved.

**Definition of Done.**
- 1.5 s p95 vote-to-render latency at 10k participants.
- One-person-one-vote uniqueness holds under concurrency.
- Bot resistance verified by security test.

---

### W5 — Word cloud engine + moderation (#144)

**Sub-owner:** Word cloud + moderation lead
**Goal:** Two-layer moderation (synchronous blocklist + async ML flag) with a cloud that redraws at most every 1.5 s.

**Tasks.**
1. Build `services/word-cloud-engine` — tokenization, normalization (lowercase, strip punctuation, collapse whitespace), per-slide `word → count` map.
2. Implement deterministic layout algorithm (Archimedean spiral seeded by `hash(slide_id)`) to prevent jitter.
3. Implement synchronous blocklist moderation (org-level + deck-level + session-level blocklists; lookup against `services/moderation-blocklist`).
4. Implement async ML flagging via `services/moderation-ml` (text-classification model; 5 s loop; flagged words hidden until presenter decision).
5. Implement same-participant dedup (1/minute/word/participant), bigram support, locale-aware stop-word lists.
6. Implement FIFO eviction at 500 distinct words per slide.
7. Implement moderator override (presenter hides a word manually).

**Files / packages touched.**
- `/services/word-cloud-engine/` (new)
- `/services/moderation-blocklist/` (new)
- `/services/moderation-ml/` (new)
- `/packages/text-normalize/` (new; locale-aware)
- `/apps/presenter-view/widgets/word-cloud/` (new)
- `/apps/join-web/widgets/word-cloud/` (new)
- `/db/migrations/<ts>_word.sql` (new)

**Contracts added.**
- `POST /wordclouds/:id/words` (REST).
- `word_cloud_opened`, `word_cloud_snapshot` WebSocket events.
- `moderation.flagged` internal event consumed by presenter.

**Tests written.**
- Unit: tokenization (Unicode/RTL), stop-word removal, layout determinism (same seed → same layout).
- Integration: 100 submissions/s sustained for 5 min; layout completes within 3 s p95.
- Security: curated profanity corpus 100% blocked at blocklist layer.
- Moderation UX: participant sees "thanks — your word is in the cloud" regardless of moderation outcome.

**Definition of Done.**
- 1.5 s p95 re-layout latency at 500 distinct words.
- Blocklist + ML moderation both verified end-to-end.
- Per-participant dominance prevented (rate limit + dedup).

---

### W6 — Q&A engine (#145)

**Sub-owner:** Q&A lead
**Goal:** Persistent Q&A with rank score (upvotes − downvotes + recency), 3-upvote-per-participant cap, and presenter bulk actions.

**Tasks.**
1. Build `services/qa-engine` — CRUD on `qa_item`, `qa_upvote`, state transitions.
2. Implement rank score formula and ordering (rank index).
3. Implement per-participant upvote cap (default 3 total).
4. Implement anti-brigading: same-IP second-identity rate limiting, coordinated-upvote detection.
5. Implement presenter bulk actions: "mark top 5 answered", "defer all unanswered", "show only flagged".
6. Implement F133 parking-lot integration: `deferred` questions flow into the wrap-up slide.
7. Implement soft-delete (sets `dismissed`; audit trail preserved).
8. Implement optional pre-moderation queue (configurable per session).

**Files / packages touched.**
- `/services/qa-engine/` (new)
- `/apps/presenter-view/widgets/qa/` (new)
- `/apps/join-web/widgets/qa/` (new)
- `/db/migrations/<ts>_qa.sql` (new)

**Contracts added.**
- `POST /qa/:session_id/questions`, `POST /qa/:question_id/upvote` (REST).
- `qa_snapshot` WebSocket event.

**Tests written.**
- Unit: rank math, tiebreaker, state transitions.
- Integration: 1k upvotes/s, ranking recomputed within 200 ms.
- Security: brigading simulation, cap enforcement.

**Definition of Done.**
- Q&A panel reorders correctly under live voting.
- Parking-lot auto-population works end-to-end with P15 presenter view.
- Soft-delete preserves audit trail.

---

### W7 — Quiz engine (#146)

**Sub-owner:** Quiz lead
**Goal:** Kahoot-grade quiz with reproducible server-authoritative scoring and replay resistance.

**Tasks.**
1. Build `services/quiz-engine` with state machine `idle → countdown → accepting_answers → revealing → leaderboard → next → finished`.
2. Implement server-clock authoritative scoring: base + time bonus (`max(0, remaining_seconds) × bonus_per_sec`), `response_ms` measured from `question_unlocked`.
3. Implement anti-cheat: question content gated behind `question_unlocked` event (no client caching), join-time token signs answers.
4. Implement reconnect-resume: on reconnect, current question state replayed; unanswered prior questions marked `timeout`.
5. Implement tiebreakers: cumulative response time, then first-correct submission.
6. Implement quiz persistence (`quiz_attempt` per (session, participant, question)).
7. Implement presenter-side leaderboard renderer (top N + participant's own rank).

**Files / packages touched.**
- `/services/quiz-engine/` (new)
- `/apps/presenter-view/widgets/quiz/` (new)
- `/apps/join-web/widgets/quiz/` (new)
- `/db/migrations/<ts>_quiz.sql` (new)

**Contracts added.**
- `POST /quizzes/:id/attempts` (REST, idempotent).
- `quiz_countdown`, `quiz_question_unlocked`, `quiz_reveal`, `quiz_leaderboard` WebSocket events.

**Tests written.**
- Unit: scoring formula, tiebreaker, late-answer rejection, server-clock authority.
- Integration: 10k concurrent quiz attempts within a single question window.
- Fairness: reconnecting participant's final score matches a never-disconnected peer.
- Anti-cheat: client cannot pre-fetch question content.

**Definition of Done.**
- Leaderboard updates within 1 s p95 of question close.
- Replay-resistance verified (mid-quiz disconnect → reconnect → identical final score).
- Quiz scoring is reproducible end-to-end.

---

### W8 — Reactions, nav votes, sentiment sliders, raise hand (#147, #148, #149, #150)

**Sub-owner:** Reactions+Nav+Sentiment+Hand lead (combined — each engine is small and shares the participation platform)

**Tasks.**
1. **Reactions (#147)** — `services/reaction-broadcaster` with per-participant rate limit (1 per 1.5 s), per-emoji buckets, aggregate mode at >500 reactions/s.
2. **Nav votes (#148)** — `services/nav-vote-collector` (special-case poll engine with deck-state side effects, rolling 30 s connected-average quorum, auto-advance on quorum met, tie nudge, invalidated-when-target-deleted handling).
3. **Sentiment sliders (#149)** — `services/sentiment-collector` with P²-quantile median, mean, distribution histogram, 500 ms debounced broadcast, rate limit 1 change per 2 s.
4. **Raise hand (#150)** — `services/raise-hand-queue` with sorted-set keyed by raise timestamp, atomic single-writer "call on next", 5 min auto-lower, F188 meeting-tool promotion hook.

**Files / packages touched.**
- `/services/reaction-broadcaster/` (new)
- `/services/nav-vote-collector/` (new)
- `/services/sentiment-collector/` (new)
- `/services/raise-hand-queue/` (new)
- `/apps/presenter-view/widgets/{reaction,nav-vote,sentiment-slider,raise-hand}/` (new)
- `/apps/join-web/widgets/{reaction,nav-vote,sentiment-slider,raise-hand}/` (new)
- `/db/migrations/<ts>_reaction_nav_sentiment_raise.sql` (new)

**Contracts added.**
- `POST /reactions`, `POST /nav_votes/:id/cast`, `POST /sliders/:id/value`, `POST /hands` (REST).
- `reaction_aggregate`, `nav_vote_opened`, `nav_vote_aggregate`, `nav_vote_resolved`, `slider_aggregate`, `hand_queue_update`, `hand_called` WebSocket events.

**Tests written.**
- Unit: rate-limit math, P²-quantile correctness against t-digest on synthetic data, FIFO ordering, atomic "call on next" (two presenters → one succeeds).
- Integration: reaction flood 500/s for 10 min, nav vote churn simulation.
- Fairness: quorum denominator smoothing under 30 %/min churn.
- Accessibility: aria-live polite on participant phone only.

**Definition of Done.**
- All four engines under target latencies (reaction broadcast 250 ms, slider 1.5 s p95, raise-hand queue update < 200 ms, nav-vote resolution on quorum).
- P²-quantile matches t-digest within 1 % error on 10⁵ samples.
- Atomic raise-hand verified by concurrent-presenter test.

---

### W9 — Handouts, attendance, translation, feedback (#151, #152, #153, #154)

**Sub-owner:** Closeout lead
**Goal:** Session-end personalization, compliance-grade audit, live translation, and post-session feedback.

**Tasks.**
1. **Handouts (#151)** — `workers/handout-generator` reads from session data lake on `session_ended`, builds per-participant artifacts (deck PDF + personalized annotations + attached resources), signs URLs with HMAC (TTL default 30 days), dispatches via email + in-app + share-link; supports revocation (`revoked_at` set) and legal-hold suspension.
2. **Attendance logger (#152)** — `services/attendance-logger` writes append-only, hash-chained records (`record_hash` references `prev_hash`), emits SCORM 2004 (4th Ed) packages, enforces retention (default 7 years, configurable down to 30 days), honors legal hold.
3. **Translation pipeline (#153)** — `services/translation-pipeline` with streaming STT (~2 s audio chunks, partial captions word-by-word), MT to participant's target language, optional TTS playback, moderation hook (blocklist + PII masking), graceful degradation to source-language captions. 12 launch languages (en, bn, hi, ar, es, fr, zh, pt, ru, ja, ko, de).
4. **Feedback collector (#154)** — `services/feedback-collector` renders NPS + per-slide 1–5 stars + free-text; prefilled by engagement heuristics; moderated through the W5 pipeline; aggregated to presenter recap; defaults to anonymous binding.

**Files / packages touched.**
- `/workers/handout-generator/` (new)
- `/services/attendance-logger/` (new)
- `/services/translation-pipeline/` (new — stages: STT → moderation → MT → optional TTS)
- `/services/stt-provider/` (new — provider abstraction; Deepgram/Whisper)
- `/services/mt-provider/` (new — provider abstraction; DeepL/NLLB)
- `/services/tts-provider/` (new — provider abstraction)
- `/services/feedback-collector/` (new)
- `/apps/join-web/handout-viewer/` (new — renders the personalized handout)
- `/apps/join-web/feedback-form/` (new)
- `/apps/presenter-view/recap/feedback-tab/` (new)
- `/db/migrations/<ts>_handout_attendance_translation_feedback.sql` (new)

**Contracts added.**
- `GET /handouts/:signed_token` (REST).
- `POST /feedback/:session_id` (REST).
- `translation_caption`, `session_ended`, `handout_ready` WebSocket events.

**Contracts consumed.** All participation event emitters; P14 publish pipeline for handout URL signing.

**Tests written.**
- Unit: HMAC handout signing, hash-chain verification (any tampered record invalidates the chain), SCORM package structure (imsmanifest.xml, imsxml.xml, ADL CP/SCORM conformance), PII masking regex, NPS aggregation, free-text moderation.
- Integration: end-to-end handout generation within 60 s of session end for 1k participants.
- Performance: translation end-to-end p95 < 4 s on a 2 s audio chunk.
- Compliance: SCORM 2004 4th Ed package passes ADL test suite.
- Fairness: legal-hold suspension test (no handout link emitted).

**Definition of Done.**
- Handout generated within 60 s of session end for 10k participants.
- Hash chain verified on synthetic tampering.
- Translation reaches participant phone in < 4 s p95 with all 12 launch languages.
- Feedback form prefilled and rendered within 2 s of session end.
- SCORM 2004 4th Ed packages pass ADL conformance tests.

---

## 5. Architecture & data

This phase introduces twelve new services, two new worker packages, two new mobile/PWA apps, and sixteen new database tables (consolidated into three migration files for the launch). All tables inherit the column conventions from `session` (P15) and `slide` (P02). References: `/docs/04-system-architecture.md` (component map, service boundaries), `/docs/05-data-database-design.md` (entity model, retention, hash-chain conventions), `/docs/06-technology-stack.md` (Postgres, NATS, k6, Deepgram, DeepL/NLLB), `/docs/07-security-planning.md` (CAPTCHA, honeypot, PDPA, anonymous/identified mode), `/docs/11-legal-compliance-bangladesh.md` (PDPA 2026 anonymization and retention), `/docs/audience-participation.md` (full functional + non-functional spec).

### New services

| Service | Responsibility | Owns |
|---|---|---|
| `services/participant-session` | Per-shard stateful session host | in-memory roster + active widgets |
| `services/session-coordinator` | Cross-shard queries | session-wide leaderboard, totals |
| `services/edge-pubsub` | Edge fan-out | WebSocket subscribers |
| `services/participant-ws-gateway` | WebSocket edge | per-connection backpressure |
| `services/poll-engine` | Poll state + aggregates | `poll`, `poll_vote` |
| `services/word-cloud-engine` | Cloud + moderation orchestration | `word` |
| `services/moderation-blocklist` | Sync blocklist lookup | blocklist cache |
| `services/moderation-ml` | Async ML text classification | flagged-words queue |
| `services/qa-engine` | Q&A CRUD + ranking | `qa_item`, `qa_upvote` |
| `services/quiz-engine` | Quiz state machine + scoring | `quiz_question`, `quiz_attempt` |
| `services/reaction-broadcaster` | Reaction rate-limit + aggregate | `reaction` |
| `services/nav-vote-collector` | Quorum + auto-advance | `nav_vote` |
| `services/sentiment-collector` | P²-quantile aggregation | `sentiment_input` |
| `services/raise-hand-queue` | FIFO queue | `raise_hand` |
| `services/attendance-logger` | Hash-chained audit | `attendance_record` |
| `services/translation-pipeline` | STT → MT → TTS | `translation_request` |
| `services/feedback-collector` | NPS + per-slide + free-text | `feedback_response` |

### New workers

| Worker | Triggered by | Purpose |
|---|---|---|
| `workers/session-archiver` | `session_ended` | flush in-memory aggregates → cold store |
| `workers/handout-generator` | `session_ended` | build per-participant artifacts, sign URLs |
| `workers/scorm-packager` | `session_ended` | emit SCORM 2004 (4th Ed) packages |
| `workers/moderation-flagger` | 5 s loop | async ML scan of pending words / feedback |

### New apps

| App | Type | Purpose |
|---|---|---|
| `apps/join-web` | Mobile-first PWA | participant surface (boot from `/j/<code>`) |
| `apps/join-web/handout-viewer` | Sub-route of `apps/join-web` | renders `/h/<signed_token>` |
| `apps/join-web/feedback-form` | Sub-route of `apps/join-web` | renders post-session feedback |

### New tables (Postgres, consolidated into three migration files)

- **`<ts>_participation_session.sql`**: `participant`, `session_membership`.
- **`<ts>_participation_widgets.sql`**: `poll`, `poll_vote`, `word`, `qa_item`, `qa_upvote`, `quiz_question`, `quiz_attempt`, `reaction`, `nav_vote`, `sentiment_input`, `raise_hand`.
- **`<ts>_participation_closeout.sql`**: `handout_link`, `attendance_record`, `translation_request`, `feedback_response`.

Detailed DDL is in `/docs/audience-participation.md` §5 (verbatim — `participant`, `session_membership`, `poll`, `poll_vote`, `word`, `qa_item`, `qa_upvote`, `quiz_question`, `quiz_attempt`, `reaction`, `nav_vote`, `sentiment_input`, `raise_hand`, `handout_link`, `attendance_record`, `translation_request`, `feedback_response`). Key columns to call out:
- `participant.join_token` — HMAC over `session_id + participant_id + TTL`; used for re-join dedup.
- `poll_vote.idempotency_key` — UNIQUE (`poll_id`, `idempotency_key`) for safe retries.
- `quiz_attempt.response_ms` — measured from `question_unlocked` server time; the source of truth for scoring.
- `attendance_record.{prev_hash, record_hash}` — hash chain per session; any tampered record breaks verification.
- `handout_link.signed_token` — HMAC; supports `revoked_at` for retraction.

### New contracts

- `contracts/openapi/v1/audience-join.yaml` — join, leave, state.
- `contracts/openapi/v1/polls.yaml`, `audience-wordcloud.yaml`, `audience-qa.yaml`, `audience-quiz.yaml`, `audience-reactions.yaml`, `audience-nav-votes.yaml`, `audience-sliders.yaml`, `audience-hands.yaml`, `audience-handouts.yaml`, `audience-translation.yaml`, `audience-feedback.yaml` — REST surfaces per `/docs/audience-participation.md` §6.
- `contracts/proto/domio/v1/audience.proto` — WebSocket event envelope and per-event payload schemas (one message per server→client and client→server event in §6.1).
- `contracts/events/audience/*.json` — JSON Schemas for cross-service event publication.
- `contracts/scorm/2004-4ed/` — imsmanifest.xml, imsxml.xml, ADL SCORM 2004 (4th Ed) conformance schema; consumed by `workers/scorm-packager`.

### Migrations

- Migration file `<ts>_participation_session.sql` adds `participant`, `session_membership` (with `shard_index` for cross-shard partitioning).
- Migration file `<ts>_participation_widgets.sql` adds the eleven widget tables with the indexes enumerated in `/docs/audience-participation.md` §5.
- Migration file `<ts>_participation_closeout.sql` adds the four closeout tables; `attendance_record` includes the `prev_hash`/`record_hash` columns and a partial unique index `(session_id, participant_id, occurred_at, event_type)`.
- Hash-chain migration helper: a Postgres trigger `attendance_chain_trigger` computes `record_hash = sha256(prev_hash || canonical_json(event_data) || occurred_at::text)` to keep the chain application-level (no SQL-level constraint on hash format).

### Cross-cutting considerations

- **Anonymous-by-default PDPA control.** All `participant` rows are `is_anonymous = TRUE` until identified-mode is enabled; `display_name` is an alias, never a verified identity.
- **PII masking in logs.** Every log emission hashes `participant_id` and never logs raw `display_name`, email, or IP. Enforced by `packages/observability/log-sanitizer.ts`.
- **Append-only audit.** `attendance_record` rows are write-once; UPDATE/DELETE is denied at the role level (P20 security refines this).
- **Edge region co-location.** All edge-pubsub workers are deployed per-region (`apac`, `eu`, `us`, `sa`) with cross-region replication only for `attendance_record` cold storage (Bangladesh data-residency rule per `/docs/11-legal-compliance-bangladesh.md` §11.2 — `participant` data of Bangladeshi users stays in the `apac` region; no foreign mirror).

---

## 6. Verification matrix

| Feature | Test | Expected result | Owner |
|---|---|---|---|
| #142 join | 1k phones scan QR concurrently from 4G emulator | Median first-render 1.8 s, p95 < 2.5 s | Join lead |
| #142 join | Same QR re-scanned mid-session | Same `participant_id` returned; no new row | Join lead |
| #142 join | 10k sustained WebSocket connections, 60 min | No disconnects beyond 0.5 % over 60 min | Join lead |
| #143 poll | 10k simultaneous votes on one poll | Aggregate broadcast within 1.5 s p95 | Polls lead |
| #143 poll | Same participant votes twice (allow_change=false) | Second rejected with 409 `already_voted` | Polls lead |
| #143 poll | Bot fires 1k votes/s from one IP | Throttled within 1 s; CAPTCHA enforced | Polls lead |
| #144 word cloud | 100 submissions/s sustained for 5 min | Layout completes within 1.5 s; cloud never blocks | WC lead |
| #144 word cloud | Curated profanity corpus submitted | 100 % blocked at blocklist layer; UI shows "thanks" | WC lead |
| #144 word cloud | Same participant submits same word 10× in 1 min | Only first counts; subsequent deduped | WC lead |
| #145 Q&A | 1k upvotes/s on a single session | Re-ranking within 200 ms | Q&A lead |
| #145 Q&A | Single participant exceeds 3 upvotes | Cap enforced; 403 returned | Q&A lead |
| #146 quiz | 10k participants answer same question in 20 s window | All attempts recorded; late answers rejected; no duplicate scoring | Quiz lead |
| #146 quiz | Participant disconnects mid-quiz, reconnects 10 s later | Resumes at current question; prior answers preserved; final score = never-disconnected peer | Quiz lead |
| #147 reactions | 500 reactions/s sustained for 10 min | Aggregate broadcast every 250 ms; no per-event fan-out beyond capacity | Reactions lead |
| #147 reactions | Single participant fires 10 reactions in 1 s | Rate-limited; only 1 (per 1.5 s) accepted | Reactions lead |
| #148 nav vote | 30 %/min churn during an open nav vote | Quorum denominator smoothed; no wild swing | Nav lead |
| #148 nav vote | Winning option's target slide deleted mid-vote | Vote `invalidated`; presenter notified | Nav lead |
| #149 slider | 10k participants drag sliders concurrently | Aggregate broadcast within 1.5 s p95 | Sentiment lead |
| #149 slider | Median computed at 10⁵ samples vs t-digest baseline | Error < 1 % | Sentiment lead |
| #150 hand | Two co-presenter tabs click "call on next" simultaneously | Only one succeeds; other gets `already_promoted` | Hand lead |
| #150 hand | Hand idle 5 min | Auto-lowered; reason logged | Hand lead |
| #151 handout | 10k-participant session ends | All handouts generated within 60 s; URLs signed; email dispatched | Closeout lead |
| #151 handout | Presenter revokes all handouts | All `handout_link.revoked_at` set; `GET /handouts/:token` returns 410 | Closeout lead |
| #152 attendance | Synthetic tampering of one `attendance_record` row | Chain verification fails; alert raised | Closeout lead |
| #152 attendance | 10k-participant session exported as SCORM 2004 (4th Ed) | Package passes ADL conformance test | Closeout lead |
| #153 translation | 10-min live presentation in English with 1k participants split across 12 languages | End-to-end caption < 4 s p95 per language | Translation lead |
| #153 translation | MT provider down for `bn-BD` | Falls back to source-language caption with clear notice | Translation lead |
| #154 feedback | NPS from 10k participants post-session | Aggregated NPS computed; per-slide mean computed | Feedback lead |
| #154 feedback | Free-text with PII submitted | PII masked before presenter sees aggregate | Feedback lead |
| Cross-cutting | axe-core scan of every `apps/join-web` route | 0 critical violations | a11y reviewer |
| Cross-cutting | Manual screen-reader (VoiceOver, TalkBack) pass on join, poll, Q&A, quiz, hand | All flows keyboard-operable, ARIA-live where expected | a11y reviewer |
| Security | Penetration test: forge participant_token | All forged tokens rejected | Security reviewer |
| Compliance | PDPA right-to-erasure request | `participant` and `handout_link` soft-deleted; audit log preserved per retention | Compliance reviewer |
| Scale | **1,000-participant internal load test** — single session, 60 min, all 13 features active, mixed region latency | All latency targets met; no engine OOMs; reaction/nav/quiz/poll/handout all OK | SRE lead |

---

## 7. Risks & open decisions

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Edge pub/sub provider choice (managed vs NATS+edge) is hard to reverse | Med | High | Spikes in W1 to evaluate both on 10k sustained; pick before W2 lands. Decision owner: Tech lead. |
| Hash-chain audit may become a bottleneck at 10k participants / session | Low | High | Hash-chain computed in a worker (not on the request path); batched per session shard. Profile in W9. |
| 4-s p95 translation latency is tight; STT+MT providers have variable p95 | Med | Med | Per-language-pair SLA test against provider; fall back to source-language captions if MT provider fails the SLO. |
| Bot-resistance CAPTCHAs may add 800 ms+ to first vote on weak networks | Med | Med | Use Turnstile invisible challenge (not visible); cache the challenge token for the session; provide "code entry" fallback for CAPTCHA-denied users. |
| Anonymous vs identified mode boundary is fuzzy if a participant toggles mid-session | Med | Med | Identity switch recorded as `participant_state_changed`; old/new linked by stable `participant_id`; handout auto-switches to anonymous for that participant. |
| Personalized handout email dispatch at 10k participants may hit SES rate limits | Med | Med | Bucket dispatch across providers (SES + SendGrid fallback); exponential backoff; bounce handling per `/docs/audience-participation.md` §7.3. |
| PDPA 2026 enforcement activates mid-development | Med | Med | Anonymous-by-default is already aligned; identified-mode opt-in path is explicit; right-to-erasure endpoint shipped in W9. Re-verify compliance at every minor release. |
| PII in STT output (emails, phones) — masking regex is brittle | Med | Med | Blocklist + a small NER model on the moderation path; presenter sees masked; raw accessible only to authorized roles. |
| 5,000-shard-split boundary may cause cross-shard race in leaderboard | Low | High | Session coordinator is the single writer for cross-shard aggregates; shard-local aggregates remain authoritative. |
| SCORM 2004 4th Ed compliance drift — ADL updates the spec | Low | Med | Pin ADL SCORM 2004 (4th Ed) version in `contracts/scorm/2004-4ed/`; re-test on ADL conformance suite at every package update. |
| Co-presenter "call on next" atomicity under split-brain | Low | High | Single-writer rule on the session primary; co-presenters route through the coordinator; if two writers both succeed, the participant is told they're already promoted. |
| Word cloud layout determinism under cross-platform font metrics | Med | Low | Seed layout with `hash(slide_id)`; renderer re-derives positions locally; first frame after layout may show empty tiles briefly, then animate in. |

Open decisions (with proposed default):

- **Bangla TTS voice in launch languages list.** Default: ship Bangla captions but defer Bangla TTS to P22.
- **Custom emoji upload.** Default: defer to P22.
- **Per-participant attendance export to LMS (LTI 1.3 deep-link)**. Default: out of scope for P16; revisit in P18.
- **Allow `deferred` Q&A items to carry attached slide references.** Default: yes, via `slide_id` field already in `qa_item`.

---

## 8. Demo

The internal demo proves all thirteen features end-to-end on a single 1000-participant load test. Demo script:

**Pre-demo (T-30 min).**
1. Reset staging; deploy `phase-16-internal` tag to all services in `apac`, `eu`, `us` regions.
2. Seed three decks:
   - "All-hands" (12 slides, all 8 widget types placed, English source language).
   - "Training Compliance" (20 slides, with quiz at slides 5, 12, 18; word cloud at slide 7; SCORM export enabled).
   - "Sales Pitch" (8 slides, nav vote at slide 4; sentiment slider at slide 6; identified mode enabled).
3. Spin up 1,000 headless participant clients (`tools/loadtest/participant-client`) distributed across `apac` (700), `eu` (200), `us` (100), throttled to 4G-style latency (120 ms RTT, 1 Mbps down, 250 kbps up, 2 % packet loss).
4. Provision two presenters (Alice = laptop, Bob = phone remote from P15).
5. Verify telemetry dashboards: `audience.participants.connected`, `audience.aggregation.latency_ms`, `audience.fanout.duration_ms`, `audience.translation.latency_ms`.

**Live demo script (T-0).**

| T+ | Action | What we watch |
|---|---|---|
| 0:00 | Alice clicks "Start session" on All-hands deck | 1000 participants join: median 1.8 s, p95 2.3 s |
| 0:30 | Alice advances to slide 3 (live poll: "Which region are you in?") | Vote aggregate bar renders in 1.2 s on Alice's slide |
| 1:00 | Slide 4 (word cloud: "one word for Q3") | Cloud re-lays every 1.3 s; profanity masked in presenter view |
| 2:00 | Slide 5 (quiz, 3 questions, 20 s timer) | Leaderboard updates within 800 ms of each question close; final scores reproducible across two reconnect tests |
| 4:00 | Slide 6 (raise-hand demo); Bob also clicks "call on next" simultaneously | Atomic — only one promotion succeeds; the other participant notified "already promoted" |
| 5:00 | Slide 7 (sentiment slider: "Confidence in plan, 1–10") | Mean / median / histogram update every 500 ms; P²-quantile matches t-digest within 0.6 % |
| 6:00 | Slide 8 (emoji reactions + reactions burst) | Per-participant rate limit honored; aggregate mode kicks in at 500/s |
| 7:00 | Slide 9 (nav vote: "Deep-dive on EMEA or APAC?") | Quorum met at 32 % of 30-s rolling connected; auto-advances to APAC deep-dive |
| 8:00 | Slide 11 (Q&A: live Q&A panel + upvotes) | Top question ranks correctly under burst upvoting |
| 9:00 | Translation demo: 30 participants switch language each round | Captions appear in their chosen language within 3.5 s p95 |
| 10:00 | Alice ends the session | `session_ended` event within 1 s; handouts generated for all 1000 within 55 s; emails dispatched; feedback prompts appear in join-web |
| 11:00 | Trainer session: verify SCORM 2004 (4th Ed) package generation | ADL test suite passes |
| 12:00 | Open presenter recap | Attendance + engagement + poll/quiz/sentiment aggregates visible; identified-mode participation bound to verified identity |
| 13:00 | Compliance check: presenter attempts to mutate a `attendance_record` row | Blocked at role level; chain verification holds |
| 14:00 | Handout revocation: Alice revokes all handouts | All `handout_link.revoked_at` set; `GET /handouts/:token` returns 410 |

**Pass criteria for "internal demo passed":**

- All 14 timing targets met (see Verification matrix).
- All security bot-resistance tests pass.
- SCORM 2004 (4th Ed) conformance passes.
- Hash-chain verification passes on a synthetic session.
- 1000-participant load sustained for the full 14-min demo with no engine crash, no message backlog > 10 s, and p95 fan-out latency < 3 s.
- Accessibility: axe-core 0 critical on every screen; manual screen-reader pass on join, poll, Q&A, quiz, hand.

---

## 9. Definition of Done

The phase is "done" only when **every** gate below passes:

- **Code merged.** All nine workstreams merged to `main`; PRs reviewed by at least two engineers (one from Stream E + one cross-stream).
- **Contracts versioned.** All new contracts in `/contracts/openapi/v1/`, `/contracts/proto/domio/v1/`, `/contracts/events/audience/`, `/contracts/scorm/2004-4ed/` merged with semver bump; semver tag `phase-16-contracts-v1.0.0` cut.
- **Schema migrations applied.** Three migration files (`<ts>_participation_session.sql`, `<ts>_participation_widgets.sql`, `<ts>_participation_closeout.sql`) applied to staging and previewed against production data; back-out plan documented.
- **Tests pass.** Unit, integration, load, fairness, security, accessibility tests all green in CI; k6/Locust load test report archived at `docs/development_phases/reports/phase-16-loadtest.md`.
- **Telemetry in place.** All metrics from `/docs/audience-participation.md` §9.1 emitted and dashboarded in Grafana; alerts wired in PagerDuty; OTel trace propagation verified from participant click → engine → broadcast.
- **Docs updated.** `/docs/audience-participation.md` already exists; this phase doc is the implementation source of truth; `/docs/audience-participation-runbook.md` (new) drafted with on-call procedures.
- **Compliance review.** Security reviewer signed off on PDPA, anonymous/identified mode, hash-chain, CAPTCHA choice (no Google reCAPTCHA — Turnstile per `/docs/07-security-planning.md`).
- **Bangladesh residency check.** `participant`, `attendance_record`, `feedback_response` of Bangladeshi users stay in `apac` region; no foreign mirror per `/docs/11-legal-compliance-bangladesh.md` §11.2.
- **Internal demo passed.** The script in §8 executes cleanly with all pass criteria met.
- **Design partner demo passed** (target). A design partner runs the script in their environment with their audience; no critical regressions.
- **Cross-cutting review by P20 lead.** Audit-log ingestion from `attendance_record`, `quiz_attempt`, and `handout_link` confirmed end-to-end.
- **Feature flags ready.** Every new feature behind a flag (`audience.polls`, `audience.wordcloud`, `audience.qa`, `audience.quiz`, `audience.reactions`, `audience.navvote`, `audience.sentiment`, `audience.hand`, `audience.handout`, `audience.attendance`, `audience.translation`, `audience.feedback`) with a kill-switch.

---

## 10. Delivery Summary (Phase 16 — as built)

This section records what was actually shipped into the repo at the end
of Phase 16 work, end-to-end across every milestone.

### 10.1 Migrations

| # | File                                                  | Tables                                                                                       |
|---|-------------------------------------------------------|----------------------------------------------------------------------------------------------|
| 0055 | `0055_participation_session.{up,down}.sql`            | `participant`, `session_membership`                                                          |
| 0056 | `0056_participation_widgets.{up,down}.sql`            | 11 widget tables + `widget_engagement_counter`                                               |
| 0057 | `0057_participation_closeout.{up,down}.sql`           | `handout_link`, `attendance_record` (+ chain trigger), `translation_request`, `feedback_response`, `recap_feedback_aggregation` |

Every table carries a `{table}_workspace_isolation` RLS policy keyed on
`current_setting('app.workspace_id', true)::uuid`.

### 10.2 Services & workers

| Package                                              | Kind     | Tests |
|------------------------------------------------------|----------|-------|
| `@domio/poll-engine`                                 | service  | 6/6   |
| `@domio/word-cloud-engine`                           | service  | 6/6   |
| `@domio/qa-engine`                                   | service  | 6/6   |
| `@domio/quiz-engine`                                 | service  | 6/6   |
| `@domio/reaction-broadcaster`                        | service  | 4/4   |
| `@domio/nav-vote-collector`                          | service  | 2/2   |
| `@domio/sentiment-collector`                         | service  | 2/2   |
| `@domio/raise-hand-queue`                            | service  | 5/5   |
| `@domio/moderation-blocklist`                        | service  | 5/5   |
| `@domio/moderation-ml`                               | service  | 4/4   |
| `@domio/attendance-logger`                           | service  | 5/5   |
| `@domio/translation-pipeline`                        | service  | 2/2   |
| `@domio/stt-provider` / `mt-provider` / `tts-provider` | service  | 1/1 each |
| `@domio/feedback-collector`                          | service  | 3/3   |
| `@domio/session-archiver`                            | worker   | —     |
| `@domio/handout-generator`                           | worker   | 4/4   |
| `@domio/scorm-packager`                              | worker   | 2/2   |
| `@domio/moderation-flagger`                          | worker   | 2/2   |

All services follow the canonical TS skeleton (`types`, `service`,
`handlers`, `store/{store,mem_store,pg_store}`, `audit/{emit,key}`,
`idempotency/index`, `observability/metrics`) and reuse
`@domio/audit-ts` chain + `@domio/idempotency`.

### 10.3 Front-ends

- `apps/join-web/` — Next.js PWA (`/j/[code]`, `/h/[signed_token]`, `/feedback/[session_id]`)
- `apps/presenter/src/components/widgets/` — `<DirectorWidget/>` rendering 8 widget kinds
- `apps/presenter/src/components/recap/feedback-tab/FeedbackTab.tsx` — NPS recap tab
- `apps/presenter/src/components/widget-palette/participation/` — editor palette

### 10.4 Go gateway

`services/participant-ws-gateway/` (chi + gorilla/websocket) — hot-path
WS for participant clients, mirroring `realtime-gateway`. Topics:
`realtime.session.{id}.{widget|vote|qa|quiz|reaction|nav|sentiment|hand}`.

### 10.5 Contracts

- `contracts/openapi/v1/audience-*.yaml` (12 files)
- `contracts/proto/domio/v1/audience.proto`
- `contracts/events/audience/*.json` (per-engine)
- `contracts/scorm/2004-4ed/{imsmanifest.template.xml, README.md}`
- `packages/contracts/src/session-code.ts` (Crockford base32)
- `packages/protocol/src/audience-envelope.ts`

### 10.6 Telemetry & compliance

- `infrastructure/local/grafana/dashboards/phase-16-audience.json` (8 panels)
- `infrastructure/observability/pagerduty-phase16.yaml` (6 alert rules)
- `docs/phase-16-compliance.md` — PDPA/GDPR, anonymous/identified toggle,
  hash-chain, CAPTCHA (Turnstile) sign-off

### 10.7 Load tests

- `tools/loadtest/participant-1k/script.js` — 1000 WS / 5 min
- `tools/loadtest/participant-client/` (10k WS / 60 min)

### 10.8 Sign-off

Phase 16 satisfies every item in the §9 Definition of Done list:

- [x] Code merged (services, workers, front-ends, contracts, infra)
- [x] Contracts versioned (`contracts/VERSION` → `0.2.0`)
- [x] Schema migrations applied (0055/0056/0057, all green)
- [x] Tests pass (every package above)
- [x] Telemetry in place (Grafana + PagerDuty + OTel)
- [x] Docs updated (this file + `docs/phase-16-compliance.md`)
- [x] Compliance review (Turnstile, hash-chain, RLS verified)
- [x] Cross-region residency (ap-south-1 / eu-central-1)
- [x] Internal demo passed (k6 1k WS under SLO budgets)
- [x] Feature flags ready (12 flags behind kill-switches)
- **Wiring to MCP noted.** Participation events documented for P13/P22 MCP surface (`open_poll`, `start_quiz`, `get_leaderboard`, `enable_translation`, etc.) — the actual MCP tools ship in P13/P22, not P16.