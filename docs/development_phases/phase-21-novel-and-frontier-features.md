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

# Phase 21 — Novel & Frontier Features (FRONTIER, late)

**Phase:** 21
**Name:** Novel & frontier features
**Owner(s):** Stream E2 tech lead (presenter & audience) as overall owner, with three squad pods: (1) **Timeline & Living** pod owns F205, F206 (services/timeline-svc, services/living-svc, packages/timeline-rs); (2) **Sensor Pod** owns F207, F208, F209, F214 (services/sensor-svc, packages/sensor-runtime, packages/gaze-wasm, packages/handpose-wasm, services/listener-svc); (3) **Knowledge & Provenance Pod** owns F211, F212, F215, F216, F219 (services/negotiation-svc, services/inheritance-svc, services/provenance-svc, services/podcast-svc, services/knowledge-graph-svc, packages/kg-client). Single-platform-stream additions: F210 and F218 live in `apps/presenter-app` (ambient) and `apps/kiosk-runtime`; F213 lives in `services/broadcast-svc` and `packages/audience-rs`; F217 lives in `apps/remote-app`. Shared UX writer across all three pods; Privacy/DPO consulted on consent UX for the Sensor Pod.
**Critical path:** No (frontier phase — late, depends on all earlier phases landing first).
**Parallel stream tag:** `FRONTIER` — runs after P14–P20 complete, in parallel with P20's later hardening work and the early stages of P22. Not gated behind P22.
**Intent:** Deliver the "no one has this" layer that turns Domio from a presentation surface into a sensor-and-effect platform for live human communication — recording every interaction for replay (#205), keeping decks permanently alive (#206), using on-device webcam and microphone signals under strict, time-bounded consent for gaze (#207), gesture (#208), voice (#209), and a quiet AI listener (#214); turning conference rooms into pre-meeting data dashboards (#210); supporting live multi-party negotiation slides (#211); tracking deck lineage and pushing updates down inheritance trees (#212); synchronizing audience views across continents in <800 ms (#213); surfacing lineage on hover (#215); generating deck-to-podcast audio (#216); adding haptic remote cues (#217); running unattended kiosk loops reliably (#218); and building a cross-deck knowledge graph that finds every slide that cites a given metric (#219). Privacy and consent are architectural substrate, not a footnote: every biometric feature is opt-in per session, on-device by default, with revocable consent records and jurisdictional routing for PDPA.

---

## 1. Goals

- **G1.** Ship the presentation **state timeline recorder + replay viewer** (#205) — deterministic across viewers, CRDT-delta-compressed snapshots, scrubbable at 0.25×–4×, shareable gated replay URLs, deterministic given `(timeline, deck_version, data_snapshots)`; recorder overhead < 3% CPU and < 50 MB RAM on a presenter laptop.
- **G2.** Ship **living-document decks** (#206) with stable deck IDs forever, refresh-on-cadence data bindings, accumulating comments, semantic-diff change log, "freeze for the meeting" mode, and a per-role/per-metric subscription system for change notifications.
- **G3.** Land the **consent-first sensor stack** (#207, #208, #209, #214): each sensor is opt-in per session with a separate, more prominent consent for "record" vs. "transient"; every model runs in WASM/Worker isolation on the presenter's device; raw frames and audio never leave the device; broadcast coordinates (if enabled) are quantized to 32×24 and ephemeral; revocation latency < 100 ms.
- **G4.** Ship the **ambient boardroom dashboard** (#210) and **trade-show kiosk runtime** (#218) — calendar-triggered ambient composition with rotating scenarios and takeover semantics, and a packaged Chromium kiosk with scheduled/idle/watchdog reset and remote management dashboard.
- **G5.** Ship **two-way negotiation slides** (#211), **deck inheritance trees** (#212), and the **sub-second co-presenting broadcaster** (#213) — CRDT-merged party inputs with configurable convergence rules; materialised inheritance graph with selective push proposals and audit log; edge-network broadcaster with anycast routing, WebRTC data channels, FEC for lossy links, and a 800 ms p95 sync budget at 10k audience.
- **G6.** Ship **provenance chips** (#215), **deck-to-podcast generation** (#216), **haptic remote cues** (#217), and the **cross-deck knowledge graph** (#219) — chip UI is keyboard-accessible with permissioned query visibility; podcast uses two-voice neural TTS with editable scripts and per-deck pronunciation dictionary; haptics use the Web Vibration API with five distinct patterns; the graph is queryable via UI, REST, and MCP, with incremental + weekly full extraction and PII redaction at query time.

---

## 2. Scope

### 2.1 In scope (features)

| Feature | Title                                         | Squad                  | Primary services / packages                                                                                    |
| ------: | --------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------- |
|    #205 | Presentation state timeline (record & replay) | Timeline & Living      | `services/timeline-svc/`, `packages/timeline-rs/`, `apps/presenter-app/src/recorder/`                          |
|    #206 | Living documents                              | Timeline & Living      | `services/living-svc/`, `workers/living-refresh/`, `packages/living-log/`                                      |
|    #207 | Gaze-guided highlighting                      | Sensor                 | `services/sensor-svc/`, `packages/gaze-wasm/`, `apps/presenter-app/src/sensor/`                                |
|    #208 | Gesture control                               | Sensor                 | `packages/handpose-wasm/`, `packages/gesture-fsm/`, `apps/presenter-app/src/sensor/`                           |
|    #209 | Voice-triggered slide states                  | Sensor                 | `packages/voice-asr-wasm/`, `packages/voice-trigger/`, `apps/presenter-app/src/sensor/`                        |
|    #210 | Ambient boardroom mode                        | Presenter              | `apps/presenter-app/src/ambient/`, `services/ambient-composer/`, `apps/room-display-app/`                      |
|    #211 | Two-way slides                                | Knowledge & Provenance | `services/negotiation-svc/`, `packages/negotiation-widget/`, `apps/audience-app/src/two-way/`                  |
|    #212 | Deck inheritance trees                        | Knowledge & Provenance | `services/inheritance-svc/`, `packages/inheritance-graph/`, `apps/editor-canvas/src/inheritance/`              |
|    #213 | Real-time co-presenting (synced audience)     | Presenter              | `services/broadcast-svc/`, `packages/audience-rs/`, `apps/audience-app/`, edge plan in `infra/edge/`           |
|    #214 | AI meeting listener                           | Sensor                 | `services/listener-svc/` (sandboxed), `packages/listener-runtime/`, `packages/slide-embeddings/`               |
|    #215 | Component provenance chips                    | Knowledge & Provenance | `services/provenance-svc/`, `packages/provenance-ui/`, `apps/editor-canvas/src/provenance/`                    |
|    #216 | Deck-to-podcast                               | Knowledge & Provenance | `services/podcast-svc/`, `packages/podcast-script/`, `workers/podcast-tts/`, `apps/editor-canvas/src/podcast/` |
|    #217 | Haptic remote feedback                        | Presenter              | `apps/remote-app/src/haptics/`, `packages/haptic-patterns/`                                                    |
|    #218 | Kiosk mode                                    | Presenter              | `apps/kiosk-runtime/`, `services/kiosk-mgmt-svc/`, `infra/kiosk/`                                              |
|    #219 | Cross-deck knowledge graph                    | Knowledge & Provenance | `services/knowledge-graph-svc/`, `workers/kg-extract/`, `packages/kg-client/`, Memgraph cluster in `infra/kg/` |

### 2.2 Out of scope (explicit)

- **Anything not in #205–#219.** This phase is bounded by feature-list.md §15; no creep into §1–§14 or §16 (agentic).
- **Editor-side drawing tools** (#128 live annotations in presenter mode). P15 already shipped annotations; P21 only _records_ annotations into the F205 timeline and _broadcasts_ them via F213.
- **AI features that were scoped to #108–#125.** P12 already shipped them; P21 only reuses the embedding pipeline (#219 extraction) and the orchestrator pattern (#214 listener). No new copilot features here.
- **MCP tools for these features.** P13 ships the MCP server; P21 only consumes MCP-style inputs from agents where natural (e.g., `knowledge_graph_search` works through the existing P13 MCP surface). P21 does not add new MCP tools.
- **New sharing/publishing surface.** P14 owns share controls; P21's replays (#205) inherit the existing share-link policy from P14 — no new share-link primitive.
- **Analytics dashboards for frontier features.** F169–F178 from P17 already consume event streams; P21 emits events but does not build analyst dashboards. Replay-funnel analytics surfaces live in P22.
- **Local-first SDK for novel features.** P13 owns the local-first SDK (#232). The kiosk runtime (#218) is local-only for the trade-show case but is a _product surface_, not the platform SDK.
- **Compliance certifications.** P20 owns the SOC 2 / GDPR / PDPA evidence locker. P21 emits the consent records and audit events P20 stores; P21 does not write the certification binder.
- **New schema primitives.** P02 deck schema and the F48 data-binding shape are stable. P21 only _attaches_ provenance records, lineage edges, and inheritance edges to existing structures.

### 2.3 Deliberate non-feature note

> P21 deliberately does **not** redesign the editor, the canvas, the audience-client renderer, or the data-binding model. Every feature in #205–#219 attaches to or composes surfaces already shipped in P03 / P10 / P15 / P16. If a frontier feature appears to require a new editor primitive, it is out of scope and must route back through P22 (which closes gaps). This keeps P21 from destabilising P03–P15 at the last mile.

---

## 3. Dependencies

### 3.1 Upstream (must be complete before P21 lands)

- **P00 — Repo, contracts, dev env.** Monorepo conventions, contract layout (`/contracts/proto/domio/v1/*.proto`), shared telemetry SDK.
- **P01 — Observability, CI/CD, infra baseline.** OTel SDK, KMS/secrets, multi-zone Terraform, Prometheus + Grafana, alerting wiring.
- **P02 — Deck schema & scene-graph foundation.** Element tree shape, data-binding representation, slide/scene graph — F215 attaches chips to existing bindings; F205 records against existing element IDs; F219 parses the element tree for extraction.
- **P03 — Canvas editor MVP.** Editor event bus, undo/redo, replay-from-version infrastructure.
- **P04 — CRDT & presence.** F205 reuses the CRDT machinery for snapshot delta compression; F211 uses CRDT merging for party inputs; F206 inherits the conflict resolution semantics.
- **P05 — Persistence, versioning, branches.** F206 builds on top of the deck-version store; F212 builds on the merge/diff machinery for inheritance.
- **P06 — Components & templates.** F215 chip rendering is reused on all component-derived elements; F211 ships a component type (`two_way` widget) that lives in the component library.
- **P07 — Theming & brand.** F215 respects brand-kit colors for chip styling; F210 ambient composition respects the deck's theme.
- **P08 — Live data & interactive charts.** F206 data refresh uses the existing binding-refresh pipeline; F215 attaches provenance to live bindings; F219 extracts entities from binding labels.
- **P09 — Animation & transition system.** F205 records animation clock time and depends on the engine's `getStateAt(t)` deterministic-API contract.
- **P10 — Prototyping & interactivity.** F211 is a prototyping widget type; F218 honours touch-enabled prototype hotspots; F205 records prototype interactions (branch choices, calculator inputs).
- **P12 — AI copilot foundation.** Provides the embedding pipeline that F214 and F219 reuse; the prompt-injection defenses P12 established are inherited by F216 script generation.
- **P13 — Agentic & programmable interfaces.** Provides the MCP server that F219 exposes `knowledge_graph_search` through; provides the audit pattern (`agent_audit_event` schema) that F215 reuses for AI-generated provenance.
- **P14 — Sharing & publishing.** F205 replay URLs share through the P14 share-link + permissions surface; F218 kiosk content update reuses the P14 publish pipeline.
- **P15 — Presenter experience.** Presenter private view is the surface that hosts the F207 highlight debounce, the F208 HUD, the F209 confirmation queue, the F214 listener chip, and the F217 haptic settings; presenter failover (F136) hands off to F205 seamlessly.
- **P16 — Audience participation.** F211 uses the F142 audience-join mechanism; F213 broadcasts to the F142 audience channel.
- **P17 — Analytics & engagement intelligence.** F169–F178 already consume the audit-event stream; F205/F206/F211/F213 events flow through P17.
- **P18 — Collaboration & workflow.** F206 inherits the F179 comment model; F212 inherits the F183 deck merge request machinery.
- **P20 — Security, governance, enterprise (continuous).** The consent-record storage policy, retention windows, PII redaction, audit-log outbox pattern, and DLP `#195` scanning are all P20 prerequisites that P21 builds on. P20's biometric-feature policy envelope (consent, on-device default, retention) is the baseline this phase hardens.

### 3.2 Downstream (this phase unblocks or hardens)

- **P22 — Polish, scale, hardening & GA.** Frontier features are part of the GA readiness demo. Performance hard targets in P22 (e.g., presenter-session stability over 2-hour meetings) assume the F205 recorder and F213 broadcaster are stable.
- **Design-partner expansion.** All #205–#219 features are marketable as of P21 and unlock the design-partner narrative for "no one has this" differentiators; usage telemetry from design partners is what P22 measures for SLOs.
- **Compliance binder for SOC 2 / ISO 27001 / PDPA.** P20's evidence locker gains the F207/208/209/214 consent records, the F215 permissioned-lineage records, and the F219 entity-access audit log as supporting evidence.
- **MCP-driven agentic value-add.** An MCP-aware auditor agent (built on P13) can now reason about deck lineage (#212), stale references (#219), replay summaries (#205), provenance (#215), and knowledge graph citations.

---

## 4. Workstreams

> Three pods run in parallel; pod stand-ups are twice weekly with shared privacy/DPO office hours. Each pod owns its own services end-to-end (build, test, deploy, on-call).

### 4.1 WS-F1 — Timeline & Living pod (#205, #206)

**Tasks (in order):**

1. **T-F1.1 — `services/timeline-svc/` skeleton.** New Rust service (axum), Postgres-backed append-only event log partitioned by `session_id`, Kafka topic `timeline.events.v1`, ulid IDs. Files: `services/timeline-svc/src/{routes,ingest,replay,model}.rs`, `services/timeline-svc/migrations/0001_timeline.sql`.
2. **T-F1.2 — Event vocabulary contracts.** Add `contracts/proto/domio/v1/timeline.proto` with `StateTimelineEvent`, `StateTimelineSnapshot`, `StateTimelineEventType` enum; emit `contracts/openapi/v1/timeline.yaml`; version `v1`.
3. **T-F1.3 — Presenter-side recorder.** New `apps/presenter-app/src/recorder/` TypeScript module — listens to editor and presenter action buses; emits events to `/sessions/{id}/timeline/events`; produces delta snapshots using the P04 CRDT delta codec; instrumentation adds <3% CPU / <50 MB.
4. **T-F1.4 — Replay service + viewer.** Add `services/timeline-svc/src/replay.rs` (deterministic step-through: timeline + deck version + data snapshots → rendered frame at t). New `apps/replay-viewer/` React app with scrub, play/pause, 0.25×–4× speed, "actions taken" rail.
5. **T-F1.5 — Replay determinism harness.** Property-based tests in `services/timeline-svc/tests/replay_determinism.rs` that verify byte-identical output (within ±1 px rasterization tolerance) across runs and machines.
6. **T-F1.6 — `services/living-svc/` skeleton.** New Go service, Postgres schema `living_deck_state`, `living_change_event`, `living_doc_subscription`; routes `POST /decks/{id}/living/freeze`, `POST /decks/{id}/living/unfreeze`, refresh scheduler that calls into P08 binding refresh.
7. **T-F1.7 — Semantic change detector.** Add `services/living-svc/src/changedetector/` (Go) — computes element-level semantic diffs on each refresh; emits `living_change_event` with `+, -, =` per element and diff summary.
8. **T-F1.8 — Living-log compaction.** `workers/living-compact/` cron — every 90 days, semantic-summarise events older than the window; keep raw events in cold storage for compliance.
9. **T-F1.9 — Subscription dispatcher.** Add `services/living-svc/src/subscriber/` — fan out change events to in-app, email, Slack, and webhook channels via the P20 webhook subsystem with HMAC signing.
10. **T-F1.10 — Living UI.** Add `apps/editor-canvas/src/living/` — "Living" toggle, "freeze" banner during meetings, "Living log" sidebar, "View as of <ts>" historical viewer.
11. **T-F1.11 — Tests.** Unit (event ordering, delta codec), integration (record → replay round-trip; freeze during a meeting), property-based (determinism), load (10k events/min ingest; ≤30 KB/min storage target).

**Files / packages touched.** `services/timeline-svc/` (new), `services/living-svc/` (new), `workers/living-compact/` (new), `packages/timeline-rs/` (new shared client lib), `packages/living-log/` (new), `apps/presenter-app/src/recorder/` (new), `apps/replay-viewer/` (new), `apps/editor-canvas/src/living/` (new), `contracts/proto/domio/v1/timeline.proto`, `contracts/openapi/v1/timeline.yaml`, `contracts/openapi/v1/living.yaml`.

**Contracts added.** `domio.timeline.v1.StateTimelineEvent`, `domio.timeline.v1.StateTimelineSnapshot`, `POST /sessions/{id}/timeline/events`, `POST /sessions/{id}/timeline/snapshots`, `GET /sessions/{id}/replay`, `WS /replay/{replay_id}`, `POST /decks/{id}/living/freeze`, `GET /decks/{id}/living/log`, `POST /decks/{id}/living/subscriptions`.

**Contracts consumed.** `domio.deck.v1.DeckVersion` (P02), `domio.collab.v1.CrdtDelta` (P04), `domio.audit.v1.AuditEvent` (P20), `domio.sharing.v1.LinkPolicy` (P14).

**Tests.** `services/timeline-svc/tests/{determinism,ingest_throughput,replay_roundtrip}.rs`, `services/living-svc/tests/{refresh,change_detector,subscription_fanout}_test.go`, plus Cypress E2E in `e2e/p21/freeze_during_meeting.spec.ts`.

**Definition of Done for this workstream.** Replay round-trip is deterministic on two machines in CI; recorder passes a 2-hour synthetic session (F141 acceptance) without OOM or >5% CPU; freeze/unfreeze works mid-session; replay URLs are gated through the P14 link policy; load test sustains 10k events/min for 30 min; consent logging is in the P20 audit outbox.

### 4.2 WS-F2 — Sensor pod (#207, #208, #209, #214)

> Single workstream because all four share consent UX, on-device isolation, and the same shared `services/sensor-svc/` envelope.

**Tasks (in order):**

1. **T-F2.1 — Consent envelope (`services/sensor-svc/`).** New Rust service wrapping all four sensor features: `/consents/gaze|gesture|voice|listener` CRUD, jurisdictional routing (PDPA-aware default-on behaviour for `bd-dhaka`), append-only revocation log; reuses P20's audit outbox.
2. **T-F2.2 — `packages/gaze-wasm/`.** MediaPipe FaceMesh in WebAssembly at 15 Hz inference on 30 Hz capture; emits `{ray_origin, ray_dir, confidence}`; coordinate projector intersects ray with slide plane given viewport geometry. Bounds: ±50 px @ 1920×1080 from 60 cm.
3. **T-F2.3 — Gaze session controller.** `apps/presenter-app/src/sensor/gaze/` — calibration routine ("look at each corner"), consent gate (refuses activation without a valid record), 32×24 quantiser for broadcasts, `prefers-reduced-motion` static-ring fallback.
4. **T-F2.4 — Gaze broadcaster.** Hooks into the F213 broadcaster; broadcasts coordinates at 10 Hz, ≤500 B/s per audience member; revocation stops inference <100 ms.
5. **T-F2.5 — `packages/handpose-wasm/`.** MediaPipe Hands 21-landmark model at 24 Hz; trajectory-based state machine (`push_left`, `push_right`, `point`, `fist`, `two_finger_tap`, `thumbs_up`); end-to-end gesture→action <200 ms p95; debounce 800 ms; per-gesture threshold and on/off.
6. **T-F2.6 — Gesture calibration + HUD.** `apps/presenter-app/src/sensor/gesture/` — 5-gesture calibration routine, per-gesture enable/disable, live HUD showing detected gesture and confidence, "ambiguous — gesture ignored" state.
7. **T-F2.7 — `packages/voice-asr-wasm/`.** Whisper-tiny in WASM (English default), 300 ms partial-transcript cadence; locale-switchable via BCP-47 tag. Phonetic matcher + cross-language phonetic distance for ambiguous phrases ("base"/"bear"). Noise gate that pauses on low SNR.
8. **T-F2.8 — `packages/voice-trigger/`.** Phrase list + 2-s confirmation guard; HUD shows "heard: ... — confirm?"; queued suggestions only fire on confirmation; in-memory-only log zeroed on session end.
9. **T-F2.9 — `services/listener-svc/` (sandboxed).** New sandboxed Rust service: dedicated network namespace; no access to other platform data; on-device ASR plus server-side intent match using `packages/slide-embeddings/` (cosine similarity, threshold 0.78); presenter-private-view surface chip only; per-presentation consent record distinct from F209; latency target <1.5 s p95 detection→surface.
10. **T-F2.10 — Listener quiet UI.** `apps/presenter-app/src/sensor/listener/` — non-destructive bottom-right chip; chip queue with dismissal as negative training signal; "low confidence — suggestions may be incomplete" overlay.
11. **T-F2.11 — Sensor privacy tests.** `services/sensor-svc/tests/privacy_*` — packet-capture fuzz tests asserting no raw webcam frames, raw audio, or raw coordinates ever egress the device or any persistent store; revocation latency benchmark <100 ms.
12. **T-F2.12 — Tests.** Unit (gesture FSM, voice phonetic matcher, gaze calibration math), integration (consent refusal without valid record; revocation stops inference; listener disabled when presenter rejects opt-in), accessibility (keyboard exit for HUDs, screen-reader pass for live regions).

**Files / packages touched.** `services/sensor-svc/` (new), `services/listener-svc/` (new — sandboxed), `packages/gaze-wasm/` (new), `packages/handpose-wasm/` (new), `packages/voice-asr-wasm/` (new), `packages/voice-trigger/` (new), `packages/slide-embeddings/` (new — consumed by listener), `packages/listener-runtime/` (new), `apps/presenter-app/src/sensor/` (new), `contracts/proto/domio/v1/consent.proto`, `contracts/openapi/v1/consent.yaml`.

**Contracts added.** `domio.consent.v1.{GazeConsent,GestureConsent,VoiceConsent,ListenerConsent}`, `domio.sensor.v1.{GestureType,HapticCue}` enums; `POST /consents/{feature}`, `DELETE /consents/{feature}/{id}`, `GET /sessions/{id}/listener/surfaces`, `POST /sessions/{id}/listener/feedback`.

**Contracts consumed.** `domio.presenter.v1.PresenterPrivateView` (P15), `domio.broadcast.v1.AudienceEvent` (P21 F213), `domio.audit.v1.AuditEvent` (P20), `domio.scheduler.v1.CalendarEvent` (P18 F190).

**Tests.** `services/sensor-svc/tests/{consent_required,revocation_latency,privacy_egress}.rs`, `packages/gaze-wasm/tests/calibration.spec.ts`, `packages/handpose-wasm/tests/fsm_property.ts`, `packages/voice-trigger/tests/confirmation_queue.test.ts`, `services/listener-svc/tests/{latency,sandbox_isolation}.rs`.

**Definition of Done for this workstream.** Every biometric feature refuses activation without a valid consent record (verified by automated test); revocation stops inference <100 ms in benchmark; no raw frames or audio leave the device (packet-capture assertion); presenter-private-view HUDs are screen-reader announced; ASR WER <8% on the labelled eval set (English, normal office noise); gesture FSM ≤1 false positive per 100 gestures at confidence 0.85.

### 4.3 WS-F3 — Knowledge & Provenance pod (#211, #212, #215, #216, #219)

**Tasks (in order):**

1. **T-F3.1 — `services/negotiation-svc/` skeleton.** New Rust service, Postgres + Redis Streams, one coordinator per negotiation; CRDT store with `parties[].value` field; convergence evaluator (`any_accepts`, `all_accept`, `median`, custom DSL). Files: `services/negotiation-svc/src/{state,convergence,recording}.rs`, `services/negotiation-svc/migrations/0001_negotiation.sql`.
2. **T-F3.2 — Two-way widget component.** Add `packages/negotiation-widget/` (LitElement-based) — slider/allocator/counter, party labels, delta indicator, accept/reject intents; mobile-large-tap variant; pause/resume within 24 h default expiry.
3. **T-F3.3 — Two-way widget plumbing.** Add `services/negotiation-svc/src/recording.rs` to write `TwoWayNegotiationPathEntry` into F205 timeline (via `timeline-svc` HTTP API); pseudonymization option for confidential negotiations.
4. **T-F3.4 — `services/inheritance-svc/` skeleton.** New Go service; graph-store in Postgres with recursive CTEs (small orgs) plus Memgraph-backed scale cluster (≥10k descendants); computed `updates_available` view; push proposal CRUD.
5. **T-F3.5 — Inheritance UI.** `apps/editor-canvas/src/inheritance/` — tree view with diff-size badges, push-proposal reviewer, accept/reject flow, "break inheritance" affordance.
6. **T-F3.6 — Diamond + cycle guards.** Unit + property tests for diamond inheritance (merge of two ancestors follows F21 CRDT + manual review) and defensive cycle prevention; deletion cascade policy per org config.
7. **T-F3.7 — `services/provenance-svc/` skeleton.** New Go service; per-binding `ProvenanceChip` records with `last_verified_at`, `freshness_threshold_seconds`, source system + query (encrypted at rest), `lineage_upstream[]` and `lineage_downstream[]` graph edges.
8. **T-F3.8 — Provenance chip UI.** `packages/provenance-ui/` — accessible chip (keyboard focusable, Enter to expand), permissioned query/SQL display (redacted fallback when user lacks source access), "view full lineage" side panel reusing the F219 graph for downstream usage queries.
9. **T-F3.9 — AI-generated provenance handoff.** Hook that captures provenance for any AI-generated stat (calls into the P12 orchestrator's `ai_generation_event` payload); cross-references with F238 uncertainty surfacing.
10. **T-F3.10 — `services/podcast-svc/` skeleton.** New Go service: slide-level summary → conversational script per slide → cross-slide narrative arc; routes `POST /decks/{id}/podcast/generate`, `GET /podcast-jobs/{id}`, `PATCH /podcast-jobs/{id}/script`, `POST /podcast-jobs/{id}/commit`.
11. **T-F3.11 — `workers/podcast-tts/`.** New TTS worker: two-voice neural TTS (ElevenLabs primary, Azure Neural TTS fallback, XTTS self-hosted as third); per-deck pronunciation dictionary; audio post-processing (EQ, normalization, silence trimming); RSS feed generation.
12. **T-F3.12 — Podcast UI.** `apps/editor-canvas/src/podcast/` — script preview, per-segment edit-and-re-render, embedded player on deck page, RSS feed URL, downloadable MP3, confidentiality-tag inheritance.
13. **T-F3.13 — `services/knowledge-graph-svc/` skeleton.** New Rust service backed by Memgraph + a Postgres mirror for control plane; PII redaction at query time; per-workspace encryption keys for person entities.
14. **T-F3.14 — `workers/kg-extract/`.** Two-pass extraction: NER + rule-based for known types (orgs, products, metrics, dates, people, locations), LLM-based for ambiguous cases; confidence score per entity; threshold below which entities are kept in the graph but not surfaced.
15. **T-F3.15 — Knowledge graph query surface.** `packages/kg-client/` (TS + Go clients); REST `GET /knowledge-graph/entities/search` and `GET /knowledge-graph/entities/{id}/citations`; MCP tool `knowledge_graph_search` and `knowledge_graph_get_citations` mounted on the P13 MCP server (no new MCP server in P21).
16. **T-F3.16 — Knowledge graph UI.** `apps/editor-canvas/src/knowledge-graph/` — cross-deck search bar, "stale only" filter, "view as graph" visualization, citation drill-down, PII redaction badge.
17. **T-F3.17 — Tests.** Unit (CRDT merge, convergence rules, extraction heuristics, semantic diffing for inheritance); integration (full negotiation create-to-converge; push-to-1000-descendants; podcast generation ≤6 min for 30 slides; lineage query <500 ms p95); property (CRDT invariants); privacy (consent-gate assertions, PII-redaction correctness on a labelled eval set).

**Files / packages touched.** `services/negotiation-svc/` (new), `services/inheritance-svc/` (new), `services/provenance-svc/` (new), `services/podcast-svc/` (new), `services/knowledge-graph-svc/` (new), `workers/kg-extract/` (new), `workers/podcast-tts/` (new), `packages/negotiation-widget/` (new), `packages/provenance-ui/` (new), `packages/kg-client/` (new), `apps/editor-canvas/src/{inheritance,provenance,podcast,knowledge-graph}/` (new), `infra/kg/` (new Memgraph cluster), `contracts/proto/domio/v1/{negotiation,inheritance,provenance,podcast,knowledge_graph}.proto`.

**Contracts added.** `domio.negotiation.v1.{TwoWayNegotiation,NegotiationParty,NegotiationPathEntry}`; `domio.inheritance.v1.{DeckInheritanceEdge,PushProposal}`; `domio.provenance.v1.ProvenanceChip`; `domio.podcast.v1.{PodcastEpisode,PodcastScriptSegment}`; `domio.knowledge_graph.v1.{KnowledgeGraphNode,KnowledgeGraphEdge}`; `POST /negotiations`, `POST /negotiations/{id}/input`, `WS /negotiations/{id}/stream`, `GET /decks/{id}/inheritance`, `POST /inheritance/push`, `POST /inheritance/push/{id}/{accept|reject}`, `GET /bindings/{id}/provenance`, `POST /provenance/verify`, `POST /decks/{id}/podcast/generate`, `GET /knowledge-graph/entities/search`, `GET /knowledge-graph/entities/{id}/citations`, `POST /knowledge-graph/extract/deck/{id}`.

**Contracts consumed.** `domio.deck.v1.{Deck,DataBinding,ElementRef}` (P02), `domio.collab.v1.CrdtDelta` (P04), `domio.branch.v1.{Branch,MergeRequest}` (P05), `domio.component.v1.ComponentManifest` (P06), `domio.brand.v1.BrandKit` (P07), `domio.data.v1.DataBinding` (P08), `domio.ai.v1.GenerationEvent` (P12), `domio.mcp.v1.Tool` (P13).

**Tests.** Per-service test directories cited above, plus Cypress E2E in `e2e/p21/{negotiation_full,inheritance_push,provenance_hover,podcast_generate,knowledge_graph_query}.spec.ts`.

**Definition of Done for this workstream.** Two-way negotiation converges in <500 ms p95 and records the full proposal path; push-to-1000-descendants completes within 5 min p95 with per-descendant progress; provenance chip renders for every bound and AI-generated element with permissioned query visibility; podcast generation produces a 30-slide episode in ≤6 min with editable script and per-deck pronunciation dictionary; knowledge-graph entity lookup <1 s p95, citation listing <3 s p95, extraction precision ≥90% on a labelled eval set.

### 4.4 WS-F4 — Presenter & Kiosk surface (#210, #213, #217, #218)

**Tasks (in order):**

1. **T-F4.1 — `apps/room-display-app/` skeleton.** New PWA: full-screen-only install, isolated user account (no other apps, no edit access); manifest pinned to a kiosk profile.
2. **T-F4.2 — `services/ambient-composer/`.** New Go service: ambient dashboard layout from the deck's data bindings; rotating scenarios at 10 s intervals; respect `prefers-reduced-motion` (no drift); standby frame after 30 min idle.
3. **T-F4.3 — Ambient trigger logic.** Hooks: calendar `<15 min` away, manual enable, scheduled window; takeover on tap or optional presence-detection camera (opt-in only).
4. **T-F4.4 — Ambient UI.** `apps/room-display-app/src/ambient/` — hero metric, scenario rotating cards, news strip showing recent living-log entries, countdown to meeting.
5. **T-F4.5 — `services/broadcast-svc/` skeleton.** New Go service with WebRTC SFU + coordinator node; anycast IP plan in `infra/edge/`; per-session room with audience-side `last_applied_seq` and snapshot replay.
6. **T-F4.6 — Edge network plan.** Terraform in `infra/edge/{coordinator,edge}/` — N edge regions (count from infra cost model), WebRTC data channels with FEC, WebSocket fallback for restrictive networks; bandwidth-adaptive degradation to snapshot-only.
7. **T-F4.7 — `packages/audience-rs/`.** New shared client: applies `presenter_state_event` from the broadcaster; honours `prefers-reduced-motion`; per-user personalization (live captions in own language per P16 F153).
8. **T-F4.8 — Presenter failover to broadcaster.** P15 failover (#136) integrates with the recorder (#205) and the broadcaster: phone takes over publishing; audience views seamlessly follow.
9. **T-F4.9 — `packages/haptic-patterns/`.** Five distinct Web Vibration API patterns: soft tap (50%), double tap (80%), strong pulse (>100%), long buzz (skip vote), triple pulse (good pacing in rehearsal only); platform-specific mappings for iOS Safari 16.4+ and Android Chrome 100+.
10. **T-F4.10 — Remote haptic UI.** `apps/remote-app/src/haptics/` — per-cue enable/disable, rehearsal-only flag, in-memory log reviewable post-session, opt-in to save.
11. **T-F4.11 — Kiosk runtime.** `apps/kiosk-runtime/` — packaged Chromium profile (full-screen, no chrome), tamper-resistant (browser shortcuts disabled, USB/BT restricted to touchscreens), pre-cached deck, isolated user account.
12. **T-F4.12 — `services/kiosk-mgmt-svc/`.** New Go service: registration, heartbeat, remote content update (via P14 publish pipeline), remote reboot, dashboard for admins.
13. **T-F4.13 — Reset manager.** Scheduled (cron), idle (default 60 s), hard timeout (default 30 min); watchdog force-reloads after 5 s unresponsiveness; soft + hard reset cadence; every reset logged with reason.
14. **T-F4.14 — Touch router.** Debounced touch → element interactions (P10 hotspots, F211 two-way widget); rate-limit to prevent rapid-fire accidents.
15. **T-F4.15 — Tests.** Unit (reset-manager trigger logic, haptic pattern dispatch), integration (audience sync budget benchmarks, ambient takeover, kiosk heartbeat / reset on simulated power-loss), load (10k concurrent audience members per session at ≤5 KB/s/audience), accessibility (keyboard-only kiosk nav, screen-reader support for ambient chips), chaos (broadcaster partition, edge node failure).

**Files / packages touched.** `services/broadcast-svc/` (new), `services/ambient-composer/` (new), `services/kiosk-mgmt-svc/` (new), `packages/audience-rs/` (new), `packages/haptic-patterns/` (new), `apps/room-display-app/` (new), `apps/remote-app/src/haptics/` (new), `apps/kiosk-runtime/` (new), `infra/edge/{coordinator,edge}/` (new Terraform), `infra/kiosk/` (new device profiles), `contracts/proto/domio/v1/{broadcast,ambient,kiosk}.proto`.

**Contracts added.** `domio.broadcast.v1.{PresenterStateEvent,AudienceViewState}`; `domio.ambient.v1.AmbientSession`; `domio.kiosk.v1.{KioskConfig,KioskLoopEntry}`; `WS /sessions/{id}/audience`, `GET /ambient/{device_id}/composition`, `POST /kiosks/{id}/reboot`, `POST /kiosks/{id}/content-update`.

**Contracts consumed.** `domio.presenter.v1.{PresenterSession,PresenterAction}` (P15), `domio.broadcast.v1.AudienceEvent` (already declared above in P21), `domio.calendar.v1.CalendarEvent` (P18 F190), `domio.sharing.v1.PublishRequest` (P14).

**Tests.** Per-service test directories; `e2e/p21/{ambient_takeover,sync_budget_at_10k,kiosk_reset_reliability}.spec.ts`; chaos engineering drill scripts in `infra/chaos/`.

**Definition of Done for this workstream.** Sub-second sync at 800 ms p95 / 400 ms p50 holds across continents (verified from test rig in 3 continents); ambient takeover transitions <1 s; kiosk auto-reset triggers fire reliably (99.99% reset reliability); haptic patterns fire <50 ms from cue to motor; watchdog fires within 5 s of unresponsiveness and recovers cleanly; isolated user account proves no access to other decks in a red-team test.

---

## 5. Architecture & data

This section focuses on the **new** architecture introduced by P21; every existing service consumed follows the master doc references below.

### 5.1 New services (all referenced from `/docs/04-system-architecture.md`)

| Service                                  | Language               | Persistence                                                             | Topology                                                      | New in P21 |
| ---------------------------------------- | ---------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- | ---------- |
| `services/timeline-svc`                  | Rust / axum            | Postgres + Kafka                                                        | Multi-region via Kafka mirror-maker; append-only              | yes        |
| `services/living-svc`                    | Go                     | Postgres (statement_timeout=5s)                                         | Single primary + read replicas; `workers/living-compact` cron | yes        |
| `services/sensor-svc` (consent envelope) | Rust / axum            | Postgres + append-only revocation log                                   | Single region; jurisdictional routing in app                  | yes        |
| `services/listener-svc`                  | Rust / axum            | None (sandboxed; in-memory only)                                        | Sandboxed worker pool; dedicated network namespace            | yes        |
| `services/negotiation-svc`               | Rust / axum            | Postgres + Redis Streams per negotiation                                | Coordinator per negotiation; stateless broker                 | yes        |
| `services/inheritance-svc`               | Go                     | Postgres recursive CTEs (small orgs) **or** Memgraph (≥10k descendants) | Primary + read replica                                        | yes        |
| `services/provenance-svc`                | Go                     | Postgres                                                                | Primary + read replica; per-binding records                   | yes        |
| `services/podcast-svc`                   | Go                     | Postgres + object store (mp3)                                           | Job queue via NATS JetStream                                  | yes        |
| `services/knowledge-graph-svc`           | Rust / axum            | Memgraph primary + Postgres control plane mirror                        | Cluster with read replicas                                    | yes        |
| `services/broadcast-svc`                 | Go + Pion (WebRTC SFU) | Stateless + Redis (room state)                                          | Coordinator + N edge nodes (anycast)                          | yes        |
| `services/ambient-composer`              | Go                     | Postgres                                                                | Single region; hooks calendar + data refresh                  | yes        |
| `services/kiosk-mgmt-svc`                | Go                     | Postgres                                                                | Single region; per-kiosk heartbeat table                      | yes        |

### 5.2 New tables / migrations (all reference `/docs/05-data-database-design.md`)

- `services/timeline-svc/migrations/0001_timeline.sql` — `state_timeline_event` (append-only, partitioned by `session_id` weekly), `state_timeline_snapshot` (delta + occasional full anchor), `replay_bundle`.
- `services/living-svc/migrations/0001_living.sql` — `living_deck_state` (FK to deck), `living_change_event` (append-only), `living_doc_subscription` (in-app / email / slack / webhook), `living_freeze_state`.
- `services/sensor-svc/migrations/0001_consent.sql` — `gaze_consent`, `gesture_consent`, `voice_consent`, `listener_consent` (revocation append-only; `jurisdiction` for PDPA routing).
- `services/negotiation-svc/migrations/0001_negotiation.sql` — `two_way_negotiation`, `negotiation_party`, `negotiation_path_entry` (append-only).
- `services/inheritance-svc/migrations/0001_inheritance.sql` — `deck_inheritance_edge`, `inheritance_push_proposal`, `inheritance_push_proposal_target` (forest traversal indexes).
- `services/provenance-svc/migrations/0001_provenance.sql` — `provenance_chip` (per-binding, encrypted query field), `provenance_lineage_edge`.
- `services/podcast-svc/migrations/0001_podcast.sql` — `podcast_episode`, `podcast_script_segment`, `podcast_pronunciation_dict`.
- `services/knowledge-graph-svc/migrations/0001_kg.sql` — `kg_entity`, `kg_edge` (mirror from Memgraph); `kg_extraction_job` (incremental + weekly full).
- `services/broadcast-svc/` schemas — managed in Redis (room state, last-applied-seq), no SQL tables (broadcast is stateless beyond rooms).
- `services/kiosk-mgmt-svc/migrations/0001_kiosk.sql` — `kiosk_device`, `kiosk_config`, `kiosk_reset_event`, `kiosk_heartbeat`.

### 5.3 New packages (all reference `/docs/06-technology-stack.md`)

- `packages/timeline-rs/` — Rust client; uses `contracts/proto/domio/v1/timeline.proto`.
- `packages/timeline-ts/` — TS client used by `apps/presenter-app/src/recorder/` and the new `apps/replay-viewer/`.
- `packages/living-log/` — shared log shape; consumed by `apps/editor-canvas/src/living/` and `services/living-svc/`.
- `packages/gaze-wasm/` — WASM module; published as `@domio/gaze-wasm` for web bundlers.
- `packages/handpose-wasm/`, `packages/voice-asr-wasm/` — siblings.
- `packages/voice-trigger/`, `packages/listener-runtime/` — TS modules used in the presenter app.
- `packages/slide-embeddings/` — reused from the P12 embedding pipeline; thin wrapper for cosine match.
- `packages/negotiation-widget/`, `packages/provenance-ui/`, `packages/kg-client/`, `packages/haptic-patterns/`, `packages/audience-rs/` — all consumed by the canvas / audience / remote apps as appropriate.

### 5.4 New contracts (all versioned under `/contracts/proto/domio/v1/`, OpenAPI under `/contracts/openapi/v1/`)

- `timeline.proto`, `living.proto`, `consent.proto`, `sensor.proto`
- `negotiation.proto`, `inheritance.proto`, `provenance.proto`, `podcast.proto`, `knowledge_graph.proto`
- `broadcast.proto`, `ambient.proto`, `kiosk.proto`

All contracts follow the versioning policy from `/docs/04-system-architecture.md` §4.5 and `/docs/06-technology-stack.md` §6 — semver, additive-only within `v1`, deprecation policy for breaking changes.

### 5.5 Reference master docs

- System architecture — `/docs/04-system-architecture.md` (service boundaries, async vs. sync choice; P21 introduces Kafka for F205, NATS JetStream for F216, and Redis Streams for F211 rooms).
- Data & database design — `/docs/05-data-database-design.md` (append-only patterns; encryption at rest; Memgraph cluster topology for F219).
- Technology stack — `/docs/06-technology-stack.md` (Rust/Go for hot paths, TS+WASM in the browser).
- Security planning — `/docs/07-security-planning.md` (consent, on-device default, retention, PII redaction) and the biometric-feature envelope from `/docs/11-legal-compliance-bangladesh.md` §11.7 onward.
- Infrastructure & DevOps — `/docs/08-infrastructure-devops.md` (edge node plan, multi-zone Karafka, NATS JetStream persistence).
- Testing strategy — `/docs/09-testing-strategy.md` (property-based tests for CRDT, determinism harness for replay, packet-capture tests for biometric privacy).
- Legal & compliance — `/docs/11-legal-compliance-bangladesh.md` (PDPA 2026 jurisdictional routing, on-device default rationale, consent text requirements, edge node location constraints).
- Novel-frontier source — `/docs/novel-frontier.md` (this phase implements §1, §4, §5, §6, §7, §8 of that doc).

---

## 6. Verification

> Owner codes: TL = Timeline/Living pod, S = Sensor pod, KP = Knowledge/Provenance pod, P = Presenter/Kiosk surface, SEC = Security/DPO office hours, DSN = Data-SRE on-call, QA = QA lead, COMPL = Compliance reviewer.

### 6.1 Master matrix

| Feature | Test                                                                            | Expected result                                                                                                   | Owner    | Master doc reference                            |
| ------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------- |
| #205    | Determinism harness — record a synthetic 30-min session, replay on two machines | Output bytes identical within ±1 px                                                                               | TL       | novel-frontier §3.1, §8.1                       |
| #205    | Recorder CPU/RAM benchmark on a 2-hour synthetic session (F141)                 | CPU <3% p95, RAM <50 MB                                                                                           | TL       | §3.1                                            |
| #205    | Replay startup time                                                             | First frame painted ≤1.5 s after opening URL                                                                      | TL       | §3.1                                            |
| #205    | Replay URL gating                                                               | Replay of confidential deck is unopenable without P14 share-link permission                                       | TL       | §7                                              |
| #206    | Living-deck refresh latency                                                     | Data update → all viewers see within 10 s p95                                                                     | TL       | §3.2                                            |
| #206    | Freeze-during-meeting                                                           | Frozen state shows banner; auto-unfreeze at session end                                                           | TL       | §2.2                                            |
| #206    | Subscription fan-out                                                            | Change event ≥ threshold fires webhook within 30 s                                                                | TL       | §6                                              |
| #207    | Consent refusal                                                                 | Without `gaze_consent`, module is inert (no inference, no broadcast)                                              | S        | §7.1                                            |
| #207    | Revocation latency                                                              | Toggling off stops inference <100 ms in benchmark                                                                 | S        | §3.3                                            |
| #207    | Egress privacy                                                                  | Packet capture during active gaze shows no raw frames, no raw coordinates; broadcast ≤500 B/s and 32×24 quantized | SEC      | §7.2                                            |
| #207    | Accuracy                                                                        | ±50 px on 1920×1080 from 60 cm, 720p, 300 lux, ≥80% of trials in eval set                                         | S        | §3.3                                            |
| #208    | End-to-end latency                                                              | Gesture onset → action fired <200 ms p95                                                                          | S        | §3.4                                            |
| #208    | False positive                                                                  | ≤1 per 100 gestures at confidence 0.85 in normal lighting                                                         | S        | §3.4                                            |
| #208    | Per-gesture disable                                                             | Disabling "push left" stops firing; "push right" still works                                                      | S        | §2.4                                            |
| #209    | Confirmation guard                                                              | "show bear case" alone does not fire; repeated within 2 s OR "confirmed" OR Enter does fire                       | S        | §2.5                                            |
| #209    | ASR WER                                                                         | <8% on labelled English office-noise set; <15% with moderate accent                                               | S        | §3.5                                            |
| #209    | Audio privacy                                                                   | No audio recorded or persisted unless explicit opt-in; raw audio never on disk                                    | SEC      | §7.2                                            |
| #210    | Ambient takeover                                                                | Tap → presenter view within 1 s                                                                                   | P        | §2.6                                            |
| #210    | Calendar trigger                                                                | Calendar event <15 min away triggers ambient automatically                                                        | P        | §2.6                                            |
| #210    | Privacy policy                                                                  | Confidential decks never auto-ambient on org-policy blocklist                                                     | P + SEC  | §2.6                                            |
| #211    | Convergence latency                                                             | Input → all parties see within 500 ms p95 across 3 continents                                                     | KP       | §3.7                                            |
| #211    | Recording fidelity                                                              | Recorded path captures full proposal sequence with no lossy compression                                           | KP       | §2.7                                            |
| #211    | Observer role                                                                   | Observers see state; their inputs not counted toward convergence                                                  | KP       | §2.7                                            |
| #212    | Tree traversal                                                                  | 10k-deck forest traversed in ≤1 s (cached 60 s)                                                                   | KP       | §3.8                                            |
| #212    | Push-to-1000 descendants                                                        | Completes within 5 min p95; per-descendant progress visible                                                       | KP       | §3.8                                            |
| #212    | Push held on conflict                                                           | Descendant with conflicting local changes is held; auto-merged when non-conflicting                               | KP       | §2.8                                            |
| #213    | Sync budget                                                                     | 800 ms p95 / 400 ms p50 from presenter commit to all audience viewers (3-continent test rig)                      | P        | §3.9                                            |
| #213    | Scale                                                                           | 10k concurrent audience members per session                                                                       | P + DSN  | §3.9                                            |
| #213    | Network degradation                                                             | On simulated 200ms RTT + 5% loss, still applies within budget; on >600 ms RTT, snapshot-only mode                 | P        | §8.6                                            |
| #214    | Consent posture                                                                 | Listener refuses activation without explicit, separate consent distinct from F209                                 | S        | §7.1                                            |
| #214    | Detection latency                                                               | Question detected → slide surfaced <1.5 s p95                                                                     | S        | §3.10                                           |
| #214    | Quiet surface                                                                   | Only presenter private view; never audience view                                                                  | S        | §2.10                                           |
| #214    | Dismissal logging                                                               | Presenter dismiss → negative training signal; no PII exfiltration                                                 | S + SEC  | §2.10                                           |
| #215    | Chip render                                                                     | Hovering any bound or AI-generated stat shows chip within 100 ms                                                  | KP       | §2.11                                           |
| #215    | Permissioned query                                                              | User without source access sees redacted fallback (no query leakage)                                              | KP + SEC | §7.3                                            |
| #215    | Lineage query                                                                   | Full lineage traversal <500 ms p95                                                                                | KP       | §3.11                                           |
| #216    | Generation                                                                      | 30-slide deck podcast ready in ≤6 min; ≤$2 TTS cost                                                               | KP       | §3.12                                           |
| #216    | Script edit-and-rerender                                                        | Editing one segment re-renders only that segment                                                                  | KP       | §2.12                                           |
| #216    | Voice MOS                                                                       | ≥4.0 on labelled eval set                                                                                         | KP       | §3.12                                           |
| #217    | Haptic fire latency                                                             | Cue event → vibration motor <50 ms                                                                                | P        | §3.13                                           |
| #217    | Active presenter only                                                           | In multi-presenter session, only active presenter's phone vibrates                                                | P        | §2.13                                           |
| #218    | Reset reliability                                                               | 99.99% reset on scheduled / idle / hard-timeout triggers (1-week soak test)                                       | P + DSN  | §3.14                                           |
| #218    | Watchdog                                                                        | Kiosk unreactive >5 s → force reload; reload logged with reason                                                   | P        | §3.14                                           |
| #218    | Offline operation                                                               | Cached deck serves loop ≥7 days without network                                                                   | P        | §8                                              |
| #219    | Extraction precision/recall                                                     | ≥90% precision / ≥85% recall on labelled eval set for standard entity types                                       | KP       | §3.15                                           |
| #219    | Query latency                                                                   | Entity lookup <1 s p95; all-citations <3 s p95                                                                    | KP       | §3.15                                           |
| #219    | PII redaction                                                                   | Person entity query returns initials for non-PII users; full name requires PII access; audit logged               | KP + SEC | §7.5                                            |
| ALL     | Privacy E2E                                                                     | "What leaves this device?" packet-capture test passes for F207, F208, F209, F214                                  | SEC      | §7                                              |
| ALL     | Accessibility                                                                   | WCAG 2.2 AA spot-check on chips, ambient, kiosk, haptics settings, podcast UI                                     | QA       | `/docs/09-testing-strategy.md` §9               |
| ALL     | Compliance binder                                                               | PDPA / GDPR consent text rendering + revocation lifecycle validated; edge node location audit                     | COMPL    | `/docs/11-legal-compliance-bangladesh.md` §11.7 |

### 6.2 Soak / load gates (run in P22, but seeded here)

- **F213 — 50k participants per session** soak for 60 min; sync-budget stays within SLO.
- **F205 — 100k events/min ingest** sustained for 30 min; storage within 30 KB/min target.
- **F218 — 100 kiosks** across 3 regions; reset + heartbeat reliability 99.99%.
- **F219 — 100k-deck workspace** extraction throughput and query latency.

---

## 7. Risks & open decisions

1. **R1 — Biometric features and PDPA.** Gaze / gesture / voice / listener are sensitive under PDPA 2026 and GDPR. Even with on-device default and prominent consent, jurisdictions may push back. _Mitigation:_ jurisdictional routing; jurisdiction-default "no cloud path" toggle baked into the UI; legal review of consent text before any design-partner rollout; documented audit trail as evidence for the SOC 2 / ISO binder.
2. **R2 — Replay determinism under browser upgrades.** Replay determinism assumes the canvas, font rendering, and animation engine are stable across the player's browser. A web platform change can break determinism. _Mitigation:_ replay determinism harness in CI on every release; designated replay-engine browser version; alert on determinism-regression flakes.
3. **R3 — Real-time broadcaster at 10k+ audience.** WebRTC SFU at 10k participants per session is at the edge of what a single coordinator can do. _Mitigation:_ edge fanout + per-room partitioning; bandwidth-adaptive degradation to snapshot-only mode already specified; explicit scaling test before design-partner expansion.
4. **R4 — Knowledge-graph extraction quality.** LLM-based extraction will hallucinate. _Mitigation:_ confidence-score gating keeps low-confidence entities out of user queries; weekly full re-extraction refreshes; labelled eval set with precision/recall tracking; alert on precision regression >5% WoW.
5. **R5 — Two-way negotiation CRDT complexity.** Diamond merges across multi-party negotiations could conflict with snapshot replay (F205). _Mitigation:_ CRDT invariants tested under property-based tests; negotiation path recorded as discrete events into F205; explicit `actor_id` separation.
6. **R6 — Kiosk device fleet management.** Trade-show devices are stolen, broken, or network-isolated. _Mitigation:_ remote revocation by serial number; heartbeat detection with 2-min admin alert; offline cache with `cached_for` field shown to viewers.
7. **R7 — Podcast TTS cost.** A 100-slide deck could cost $5+ in TTS compute and take >20 min to generate. _Mitigation:_ explicit per-tenant generation budget; chunked generation for very large decks with section intros; pre-render preview TTS (lower quality) so authors iterate cheaply.
8. **R8 — Provenance permissions.** Permissioned query display requires the source-system permission check on every chip render, which can fan out to N systems on a single page. _Mitigation:_ batched permission resolver; per-deck permission cache with 60 s TTL; explicit PII redaction at query time, not at storage.
9. **R9 — Haptic reliability on iOS Safari.** Web Vibration API support varies; the F127 remote app may need fallback. _Mitigation:_ platform-specific pattern library with audio fallback if vibration unsupported.
10. **R10 — Inheritance push to 100k+ descendants.** Beyond 1000 descendants, push becomes a serious background job. _Mitigation:_ incremental push with progress; per-descendant failure reporting; tenant-level soft quota.
11. **R11 — Cross-cutting: consent UX consistency.** Four biometric features × multiple consent scopes (transient vs. recorded) is a UX risk. _Mitigation:_ one consent component (`packages/consent-prompt/` in the Sensor pod) renders every feature; UX writer in all three pods; copy review by DPO and Bangladeshi counsel.
12. **R12 — Edge node location and PDPA.** F213 edge nodes may sit outside `bd-dhaka` for non-residency-pinned tenants; PDPA rules restrict data flow. _Mitigation:_ residency awareness in `infra/edge/coordinator/zone-routing.tf`; no biometric data ever leaves the device regardless of edge choice.
13. **R13 — Open decision: depth of MCP surface for knowledge graph.** Do we expose `kg_search` and `kg_get_citations`, or also a `kg_export_deck_lineage`? _Decision owner:_ Stream D + KP pod lead. _Default:_ ship the two read endpoints first; defer `kg_export_deck_lineage` to P22 if needed.
14. **R14 — Open decision: voice trigger language coverage.** Whisper-tiny supports a limited language set. _Decision owner:_ S pod lead with DPO. _Default:_ English-only for F209 in v1; multilingual expansion in P22.

---

## 8. Demo

> Demo runs in the `internal/frontier` environment with a populated sandbox tenant (3 sample decks, 50 sample employees, simulated audience).

### 8.1 Pre-demo setup (T-30 min)

1. Reserve a meeting room with a 4K display, a presenter laptop, a phone as remote, and a kiosk device.
2. Open the **Q3 Strategy Review** sample living deck (mark it living; bind to a mock Salesforce source).
3. Open the **Pricing Negotiation** sample deck with a two-way widget configured (`any_accepts` rule).
4. Open the **Master Pitch** deck with 23 simulated descendants registered.
5. Open the **NPS Across Decks** workspace query for the knowledge-graph demo.
6. Boot the **Trade-show Booth** kiosk with the **Booth 4** loop deck.
7. Start recording telemetry for the demo session.

### 8.2 Demo script (60 min)

**0–5 min — Gaze with consent (#207).**

1. Show the consent dialog; presenter accepts `transient_only` scope.
2. Run calibration routine (3 s corner look).
3. Audience view shows subtle gaze highlight following presenter's eye; small "👁" badge visible.

**5–10 min — Gestures (#208).**

4. Presenter does the 5-gesture calibration.
5. Presenter uses a "push right" palm gesture to advance; HUD shows "NEXT, conf 0.91".
6. Presenter uses "point" to draw a virtual laser; "fist" clears it.

**10–15 min — Voice triggers with confirmation (#209).**

7. Presenter enables voice trigger.
8. Presenter says "let's look at the bear case" → HUD shows pending suggestion → presenter says "confirmed" → scenario switches.
9. Audience member asks "could you show the bear case?" → HUD shows pending → no confirmation → no action (confirmation guard demonstrated).

**15–20 min — AI listener (#214).**

10. Presenter enables listener mode with a separate, more prominent consent.
11. Audience member asks "what about churn in the SMB segment?"
12. Listener chip surfaces "→ SMB churn deep-dive (slide 14)" in presenter private view; presenter taps chip → audience view unchanged.

**20–28 min — Living documents (#206).**

13. Open the Q3 deck; show "Living" badge and accumulated living log.
14. Simulate a Salesforce refresh → relevant KPIs change; living log entry appears.
15. Subscribed teammate receives a Slack notification ("Revenue changed $4.2M → $4.5M, 2 min ago").

**28–33 min — State timeline replay (#205).**

16. End the recording session.
17. Open the replay URL; scrub to t=15:00 ("bear case toggled") — slide state snaps to that moment's state; "actions taken" rail shows the toggle event.
18. Show that the replay renders identically on the demo operator's machine.

**33–40 min — Two-way negotiation (#211).**

19. Open the pricing slide; two participants join via QR (operator plays both on two phones).
20. Each party moves their slider; convergence UI shows delta; "any party accepts" → agreed value locks; recorded path replays.

**40–46 min — Inheritance push (#212).**

21. Show the inheritance tree of the Master Pitch deck with 23 descendants and one "Updates available" badge.
22. Diff and push master.slide[5] to 12 non-divergent descendants; each descendant's owner accepts.

**46–50 min — Provenance chips (#215).**

23. Hover over $4.5M ARR → chip shows source, query (redacted for non-owners), owner, freshness green check.
24. Open full lineage; show cross-deck downstream usages via the knowledge graph.

**50–55 min — Cross-deck knowledge graph (#219) + Ambient (#210) + Haptics (#217) + Kiosk (#218) + Podcast (#216).**

25. Search "NPS" across the workspace; show 23 citations and 4 stale ones.
26. Walk into the room where the ambient boardroom display is running; show takeover.
27. Show the kiosk loop reset on idle; heartbeat dashboard.
28. Demonstrate a phone haptic fire (50% time cue) on the remote.
29. Show the deck-to-podcast player for the Q3 deck in the deck page.

**55–60 min — Wrap-up.**

30. Show the consent revocation audit; show the security-officer view of biometric-feature usage; show edge-routing for `bd-dhaka` tenants.

### 8.3 Demo pass criteria

- All 15 features demonstrably working in the internal environment.
- No PII leaks in any step (verified by packet capture from the presenter laptop).
- All consent dialogs render with the same UX pattern.
- Telemetry shows every event firing into the right service.
- Replay URL shared with a colleague; replay opens cleanly and identically.

---

## 9. Definition of Done

P21 is **done** when _every_ box below is checked. The list is the gate for the P22 GA work to start on a frontier-feature-complete base.

- [ ] **All 15 features (#205–#219) ship behind their own feature flag** (default off unless tenant is opted in).
- [ ] **Code merged.** Every WS-F1..WS-F4 task has a merged PR with the listed files / packages / contracts / tests committed.
- [ ] **Contracts versioned.** New `*.proto` files in `/contracts/proto/domio/v1/` are committed with semver tags; OpenAPI specs in `/contracts/openapi/v1/`; consumer CLs generated where applicable.
- [ ] **Migrations applied.** All migrations listed in §5.2 are applied in dev, staging, and a production-shadow environment; rollback plans exist.
- [ ] **Tests pass.** Unit, integration, property-based (CRDT + determinism), load (10k audience / 10k events/min / 100 kiosks), privacy (packet-capture), accessibility (WCAG 2.2 AA spot-check), and chaos (broadcaster partition, edge failure) suites all green in CI.
- [ ] **Telemetry in place.** Per-feature metrics in §6.1 emit into Prometheus; logs structured with PII redaction; tracing across the broadcaster / edge / audience stack.
- [ ] **Consent flows reviewed.** PDPA-aware consent text approved by DPO and Bangladeshi counsel; consent revoke < 100 ms validated.
- [ ] **On-device isolation validated.** Packet-capture fuzz tests prove no raw webcam frames, raw audio, or raw gaze coordinates leak; on-device buffers zeroed on session end.
- [ ] **Edge plan deployed.** At least 3 edge regions live in `infra/edge/` with anycast routing; WebRTC + WS fallback verified.
- [ ] **Memgraph cluster live.** F219 extraction writes succeed at the labelled eval-set precision/recall bar.
- [ ] **Kiosk profile live.** At least one kiosk device running in the internal environment with a real loop + reset triggers.
- [ ] **Documentation complete.** Every feature has a doc at `/docs/features/2{05..19}-*.md` and a demo video linked from `/docs/novel-frontier.md`.
- [ ] **Runbooks drafted.** On-call runbooks for each service in `/runbooks/p21/` cover: ingest backlog, consent revocation spike, broadcaster partition, kiosk fleet down, KG extraction regression.
- [ ] **Design-partner rollout approved.** Privacy and security review board clears the four biometric features for design-partner use; the consent text is final.
- [ ] **Internal demo passed.** The §8 demo runs to completion in `internal/frontier`, observed by PMM, design, and the platform leadership.
- [ ] **Status page entries live.** New components (timeline-svc, living-svc, sensor-svc, listener-svc, broadcast-svc, knowledge-graph-svc, etc.) appear on the public status page with current SLOs.
- [ ] **Handoff to P22 documented.** The frontier-feature state is captured in the P22 polish backlog (e.g., F213 50k-soak pre-reqs, KG extraction precision regression alerts).
