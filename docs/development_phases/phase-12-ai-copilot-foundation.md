# Phase 12 — AI Copilot Foundation

**Phase:** 12
**Name:** AI copilot foundation
**Owner(s):** Stream D tech lead (AI platform); shared UX writer with Stream D designer
**Critical path:** No (deepening phase, parallelizable)
**Parallel stream:** **Stream D — AI & agents**
**Intent:** Build the user-facing AI layer of Domio: an orchestrator that routes every generative action through a pluggable model-adapter layer, a versioned prompt template library, and a suite of generation / analysis / coaching features (full-deck generation, doc-to-deck with citations, data-to-story, slide designer, redesign, copy assistant, image generation, voice-to-deck, rehearsal coach, Q&A prep, summarization, audience-adaptive versions, layout repair, accessibility AI, chart selection, semantic search, freshness checking). This phase delivers the **user-visible** AI capabilities; the agent-facing MCP surface and programmable interfaces are deliberately deferred to P13, but the AI plumbing built here is structured so that P13 can wire MCP tools on top without re-platforming.

---

## 1. Goals

- **G1.** Ship a single, policy-aware AI orchestrator (router + planner + executor) that every P12 feature calls through, with deterministic per-`ai_run` records for every step. (Features: #108, #109, #110, #111, #112, #113, #114, #115, #116, #117, #118, #119, #120, #121, #122, #123, #124, #125.)
- **G2.** Stand up a model-adapter layer that lets any feature target OpenAI, Anthropic, Google, or open-weight models interchangeably, with secrets isolated in a vault and per-tenant keying. (Cross-cuts all P12 features.)
- **G3.** Ship the full prompt-to-deck flow with an explicit outline-approval gate; the user always sees and edits the structure before slides are rendered. (Feature #108.)
- **G4.** Land doc-to-deck with **first-class citations** that survive schema rewrites and remain verifiable end-to-end (PDF / DOCX / Notion export ingest). (Feature #109.)
- **G5.** Land data-to-story narrative generation with live-bound charts (no copy-pasted numbers), a "why this chart" rationale, and per-claim uncertainty surfacing. (Features #110, #123, #238.)
- **G6.** Land the coaching layer — rehearsal coach (vision + speech, on-device where possible), speaker-notes generator, anticipated Q&A — behind a per-session consent gate that never retains raw biometric data by default. (Features #115, #116, #117, #118.)

---

## 2. Scope

### 2.1 In scope (features)

| Feature | Title | Notes |
|---:|---|---|
| #108 | Full deck generation from a prompt / doc / transcript | Outline-first, approval gate, designed slides after approval |
| #109 | Doc-to-deck with citations | PDF / DOCX / Notion export ingest, citation as first-class object |
| #110 | Data-to-story narrative generation | Statistical findings → story arc → live-bound charts |
| #111 | AI slide designer (prompt-to-layout) | 4 distinct options, "more like option N" |
| #112 | AI slide redesign | Light vs. full, content-preserving, brand-aware |
| #113 | Copy assistant | Shorten, punch-up, tone, translate (100+ langs) |
| #114 | AI image generation + background removal | Style-locked to brand, two-layer moderation |
| #115 | Voice-to-deck | ASR + diarization + transcript edit + outline |
| #116 | Speaker notes generator | Terse / detailed / executive variants, ≤ 90s TTS |
| #117 | AI rehearsal coach | Camera/mic with consent, on-device metrics, gaze + filler |
| #118 | AI anticipated Q&A | Audience profile aware, board-prep weighting |
| #119 | Smart summarization | Executive summary slide + TL;DR one-pager |
| #120 | Audience-adaptive versions | 5-min / technical / executive / sales / customer |
| #121 | Layout repair engine | Detect + auto-fix overlap / overflow / alignment / contrast |
| #122 | Accessibility AI | Alt-text, reading-order, captions, contrast |
| #123 | AI chart-selection recommender | Rule-based + LLM-assisted, explainable |
| #124 | Semantic deck search | Workspace-wide, hybrid keyword + vector |
| #125 | AI content freshness checker | Per-citation threshold, re-fetch via data connection |

### 2.2 Out of scope (explicit)

- **MCP server, MCP tool surface, deck-as-code YAML/JSON, deckctl CLI, agent pipelines, dry-run, simulation, deck diffing.** These are **Phase 13**. The orchestrator built here **must** keep its internal interface structured enough that P13 can mount these tools without rework.
- **Cross-deck knowledge graph (#219)** beyond a workspace-scoped vector index — that ships in P21.
- **Auto-update shared slides from governance flows (#186)**, content-expiry automation (#187) — these are P18/P20.
- **Live voice translation for audiences (#153)** — P16.
- **AI meeting listener (#214)** — P21.

---

## 3. Dependencies

### 3.1 Upstream (must be complete)

- **P00 — Repo, contracts, dev env.** Provides the monorepo skeleton, contracts package, proto definitions, and CI bootstrap.
- **P01 — Observability, CI/CD, infra baseline.** Provides OpenTelemetry SDK, structured-log conventions, secret manager wiring, CI gate. **Critical**: the model-adapter layer reads secrets from the manager that P01 sets up.
- **P02 — Deck schema & scene-graph foundation.** Provides `contracts/schema/deck.schema.json`, `packages/schema`, `slide` / `element` primitives that P12 writes into.
- **P03 — Canvas editor MVP.** Provides the editor shell into which the Copilot panel is mounted.
- **P04 — CRDT & presence.** Required so that AI-generated slide inserts do not collide with a live editor session.
- **P05 — Persistence, versioning, branches.** Provides `deck_version` storage and the version-history diff viewer that records AI runs.

### 3.2 Downstream (this phase unblocks)

- **P13 — Agentic & MCP.** Consumes the orchestrator's internal tool surface, mounts it over MCP, and adds `lint_deck` / `simulate` / `diff_decks` as callable MCP tools. The `ai_run` audit trail becomes the substrate for `agent_audit_event`.
- **P15 — Presenter experience.** The rehearsal coach (#117) is shipped here but its metrics are surfaced in presenter view (#126) and recap (#141).
- **P17 — Analytics & engagement intelligence.** AI-generated content is tagged in analytics so engagement can be correlated with generation provenance.
- **P18 — Collaboration & workflow.** Suggestion-mode handoff for agent / AI edits (#227) is built on the audit + dry-run substrate that P12 plants here.
- **P20 — Security & enterprise.** Rehearsal data handling, PII redaction, content-moderation audit, retention policies land as enterprise policy overlays on the substrate built here.

---

## 4. Workstreams

### 4.1 WS-D1 — Orchestrator + Model-Adapter Layer (foundational)

**Tasks (in order):**

1. **T-D1.1 — Repo scaffold.** Create `/services/ai-orchestrator` (Go), `/packages/model-adapter` (TS), `/packages/prompt-registry` (TS), `/workers/ai-tasks` (Go, queue worker). Wire them into the monorepo and CI.
2. **T-D1.2 — `ModelAdapter` interface.** Author the TS interface in `packages/model-adapter/src/index.ts` per `/docs/ai-copilot.md` §4.3. Implement the capability registry, error envelope, retry/backoff middleware.
3. **T-D1.3 — Provider adapters.** Implement adapters for OpenAI, Anthropic, Google, and at least one open-weight provider (e.g., a self-hosted vLLM endpoint) under `packages/model-adapter/src/providers/`. Each adapter wraps auth, rate-limit parsing, and content-moderation headers.
4. **T-D1.4 — Router.** Implement the policy-aware router in `services/ai-orchestrator/internal/router`. The router selects capability, applies cost-cap and rate-limit gates, and emits one `ai_run` per step.
5. **T-D1.5 — Planner / Executor.** Implement the planner (decompose a request into steps) and executor (run steps with retries, fallbacks, streaming) per `/docs/ai-copilot.md` §4.2. The executor is the only component that talks to providers.
6. **T-D1.6 — `prompt_template` registry.** Stand up `packages/prompt-registry`. Initial templates per `/docs/ai-copilot.md` §4.6. Each template has `version`, `model_class_hint`, `input_schema`, `output_schema`, and a `eval_set_id` pointer.
7. **T-D1.7 — Secret-manager integration.** Provider keys live in HashiCorp Vault (or AWS Secrets Manager). The adapter layer reads keys via `services/ai-orchestrator/internal/secretbroker`; downstream code never sees a raw key.
8. **T-D1.8 — Eval harness.** Stand up `/workers/ai-eval` with a golden-set runner and an LLM-as-judge harness per `/docs/ai-copilot.md` §9.5.

**Files / packages touched**

- `/services/ai-orchestrator/` (new)
- `/workers/ai-tasks/` (new)
- `/workers/ai-eval/` (new)
- `/packages/model-adapter/` (new)
- `/packages/prompt-registry/` (new)
- `/contracts/openapi/v1/ai.yaml` (new — job submit, stream, status)
- `/contracts/proto/domio/v1/ai.proto` (new — internal gRPC between orchestrator and adapters)

**Contracts added / consumed**

- **Added:** `POST /v1/ai/jobs`, `GET /v1/ai/jobs/{id}/stream`, `GET /v1/ai/jobs/{id}`, `GET /v1/prompts/{template_id}`.
- **Consumed:** `deck.schema.json` (P02), `slide` element contract (P02), `version_event` (P05).

**Tests written**

- Adapter unit tests (per provider, mocked).
- Router policy tests (PII redaction, content moderation, cost cap).
- Planner decomposition tests with golden intents.
- Executor retry / fallback / partial-success tests.
- Eval harness canary tests on each prompt-template version bump.

**Definition of Done (WS-D1)**

- [ ] All four providers reachable from staging through the adapter.
- [ ] An end-to-end `ai_job` for `outline.generate` succeeds, streams events, and persists an `ai_run` per step.
- [ ] Secret rotation in Vault propagates without adapter code changes.
- [ ] Eval harness blocks the rollout when a prompt-template version regresses on its golden set.

---

### 4.2 WS-D2 — Generation Core (features 108–114)

**Tasks (in order):**

1. **T-D2.1 — Outline generator.** Implement `outline.from_prompt` in `services/ai-orchestrator/internal/planner/outline.go`. Returns `Outline { slides: [{ intent, layout_hint, content_blocks, data_bindings, citation_refs, confidence }] }`.
2. **T-D2.2 — Outline approval gate.** UI in `/apps/editor/src/copilot/OutlineApproval.tsx`. Drag-reorder, edit titles, delete, change chart type, then "Approve & Generate" → enqueues per-slide render jobs.
3. **T-D2.3 — Slide renderer.** `services/ai-orchestrator/internal/renderer/slide.go`. Per-slide render uses the structured outline and writes a new `deck_version` (P05 contract).
4. **T-D2.4 — Doc ingestion pipeline.** `/workers/ingest-docs`. PDF (text + OCR fallback via Tesseract), DOCX (mammoth), Notion (block tree). Outputs `source` + `chunks` tables (per `/docs/ai-copilot.md` §5).
5. **T-D2.5 — Citation tracker.** `services/ai-orchestrator/internal/citations`. Maintains the slide→citation mapping and survives edits; surfaces citation coverage per deck.
6. **T-D2.6 — Data-to-story analyzer.** `/workers/data-analysis`. Runs statistical pass (correlations, trends, outliers) inside a sandboxed worker with row-level security; produces `Findings`.
7. **T-D2.7 — Spreadsheet bindings.** Per P08 live-data contracts: `bind_data_source` is reused so generated slides stay live-bound rather than copy-pasted numbers.
8. **T-D2.8 — Slide designer.** `services/ai-orchestrator/internal/designer`. Generates 4 layout options; diversity check ensures they're structurally distinct.
9. **T-D2.9 — Redesign engine.** `services/ai-orchestrator/internal/redesign`. Light vs. full mode; content preservation verified by a diff before/after.
10. **T-D2.10 — Copy assistant.** `services/ai-orchestrator/internal/copy`. Shorten / punch-up / tone / translate; layout-preservation check.
11. **T-D2.11 — Image generation + bg-removal.** `services/ai-orchestrator/internal/image`. Provider dispatch with fallback; post-gen moderation; provenance metadata stored.

**Files / packages touched**

- `/services/ai-orchestrator/internal/planner/` (new)
- `/services/ai-orchestrator/internal/renderer/` (new)
- `/services/ai-orchestrator/internal/citations/` (new)
- `/services/ai-orchestrator/internal/designer/` (new)
- `/services/ai-orchestrator/internal/redesign/` (new)
- `/services/ai-orchestrator/internal/copy/` (new)
- `/services/ai-orchestrator/internal/image/` (new)
- `/workers/ingest-docs/` (new)
- `/workers/data-analysis/` (new)
- `/apps/editor/src/copilot/` (new — OutlineApproval, CitationPanel, DataStoryOutline, DesignerOptions, CopyAssistantPanel, ImageGenerator)
- `/apps/editor/src/copilot/__tests__/`

**Contracts added / consumed**

- **Added:** `POST /v1/sources/{id}/ingest`, `GET /v1/slides/{id}/citations`, `POST /v1/ai/image`, `POST /v1/ai/image/{id}/remove-background`.
- **Consumed:** `deck.schema.json` (P02), `data_source` (P08), `brand_kit` (P07), `component` (P06).

**Tests written**

- Outline-from-prompt goldens (10 intents × 3 brands).
- Citation round-trip: regenerate a slide and assert citations survive.
- Designer diversity check: no two options share a layout template.
- Redesign content-preservation: text/data/citations byte-equal after light redesign.
- Image moderation: refusal cases for trademarks, public figures, CSAM.
- Doc-ingest on each format (PDF text, PDF scanned, DOCX, Notion export).

**Definition of Done (WS-D2)**

- [ ] Outline→Approve→Render flow runs end-to-end in staging.
- [ ] Doc-to-deck produces a deck where 100% of numeric claims carry at least one citation.
- [ ] Data-to-story output stays live-bound: refreshing the source updates the slide.
- [ ] Image generation rejects trademark / public-figure prompts with a logged moderation verdict.

---

### 4.3 WS-D3 — Voice, Notes, Q&A, Summarization (features 115–120)

**Tasks (in order):**

1. **T-D3.1 — ASR worker.** `/workers/asr`. Streaming provider with diarization; partials committed on debounce; multi-language auto-detect.
2. **T-D3.2 — Voice-to-deck pipeline.** Combines ASR → segmentation → `outline.from_voice` (variant of `outline.from_prompt`). User can edit the transcript before outline.
3. **T-D3.3 — Speaker notes generator.** `services/ai-orchestrator/internal/notes`. Three variants (terse / detailed / executive); duration check via TTS.
4. **T-D3.4 — Q&A generator.** `services/ai-orchestrator/internal/qa`. Structured output: `{ question, rationale, suggested_answer, difficulty }`. Board-prep weighting.
5. **T-D3.5 — Summarizer.** `services/ai-orchestrator/internal/summary`. Executive-summary slide + TL;DR one-pager; content-faithfulness check (every claim grounded in an existing slide).
6. **T-D3.6 — Audience-variant generator.** `services/ai-orchestrator/internal/variants`. Produces a derived `deck_version`; diff between source and variant is queryable.

**Files / packages touched**

- `/workers/asr/` (new)
- `/services/ai-orchestrator/internal/notes/` (new)
- `/services/ai-orchestrator/internal/qa/` (new)
- `/services/ai-orchestrator/internal/summary/` (new)
- `/services/ai-orchestrator/internal/variants/` (new)
- `/apps/editor/src/copilot/VoiceRecorder.tsx`
- `/apps/editor/src/copilot/SpeakerNotesPanel.tsx`
- `/apps/editor/src/copilot/QAPanel.tsx`
- `/apps/editor/src/copilot/AudienceVariantPicker.tsx`

**Contracts added / consumed**

- **Added:** `POST /v1/ai/voice/transcribe`, `POST /v1/ai/notes`, `POST /v1/ai/qa`, `POST /v1/ai/summary`, `POST /v1/ai/variants`.
- **Consumed:** `slide_blueprint` (WS-D2), `deck_version` (P05), `audience_profile` (P15 — pre-stub).

**Tests written**

- ASR accuracy ≥ 95% WER on held-out clean-English set.
- Voice-to-deck outline matches the shape contract of text-prompt outline.
- Notes duration check rejects a generated script > 90s on TTS estimate.
- Q&A: board-prep weighted set contains ≥ 1 financially-flavored question per slide with $/margin/revenue keywords.
- Summary: every claim in the executive summary is grounded in an existing slide (assertion-based test).

**Definition of Done (WS-D3)**

- [ ] Voice-to-deck produces a draft deck within 60s for a 3-minute input clip.
- [ ] Notes generator respects variant selection and never exceeds the duration budget.
- [ ] Summarizer writes a TL;DR one-pager that round-trips as a printable PDF.

---

### 4.4 WS-D4 — Rehearsal Coach (feature 117)

**Tasks (in order):**

1. **T-D4.1 — Consent & retention UI.** `/apps/editor/src/presenter/RehearsalConsent.tsx`. PDPA-aligned grammar; per-session opt-in for camera, mic, retention days; visible kill-switch.
2. **T-D4.2 — Browser-side pipeline.** `/packages/rehearsal-runtime` (TS). MediaRecorder → WebAudio analyser for ASR filler-word stream; TensorFlow.js MediaPipe FaceMesh for gaze; per-slide tracking via slide-change events. Only derived metrics upload.
3. **T-D4.3 — Rehearsal metrics service.** `services/ai-orchestrator/internal/rehearsal`. Persists metrics only (no raw media unless user opted in with a retention window).
4. **T-D4.4 — Dashboard.** `/apps/editor/src/presenter/RehearsalDashboard.tsx`. Pace, filler count, eye-contact %, stumble points, per-slide replay.
5. **T-D4.5 — Privacy controls.** `services/ai-orchestrator/internal/rehearsal/privacy`. One-click delete all rehearsal data per session and per workspace; biometric data never identifies the user.

**Files / packages touched**

- `/packages/rehearsal-runtime/` (new — WebGL + WebAssembly bundle)
- `/services/ai-orchestrator/internal/rehearsal/` (new)
- `/apps/editor/src/presenter/RehearsalConsent.tsx`
- `/apps/editor/src/presenter/RehearsalDashboard.tsx`
- `/apps/editor/src/presenter/RehearsalReplay.tsx`

**Contracts added / consumed**

- **Added:** `POST /v1/ai/rehearsal/sessions`, `PATCH /v1/ai/rehearsal/sessions/{id}`, `DELETE /v1/ai/rehearsal/sessions/{id}`, `POST /v1/ai/rehearsal/sessions/{id}/metrics`.
- **Consumed:** `presenter_session` (P15 — pre-stub), `deck_version` (P05).

**Tests written**

- Consent UI: cannot record without explicit opt-in (programmatic guard).
- On-device mode: raw video bytes never leave the browser (network-tap test).
- Metrics persistence: deleting a session removes the record and any retained raw media.
- Gaze estimation accuracy on the test face-mesh fixture.

**Definition of Done (WS-D4)**

- [ ] Rehearsal session can be created, run, and deleted without any raw media persisting by default.
- [ ] The dashboard surfaces concrete, actionable feedback per slide.
- [ ] Camera-denied path falls back to audio-only metrics without breaking the flow.

---

### 4.5 WS-D5 — Maintenance & Quality (features 121–125)

**Tasks (in order):**

1. **T-D5.1 — Layout-repair detection rules.** `services/ai-orchestrator/internal/layout/rules/`. Overflow, overlap, alignment, contrast, broken bindings, missing alt text.
2. **T-D5.2 — Layout-repair AI-assisted fix.** Small LLM proposes layout adjustments; each proposal carries a confidence score.
3. **T-D5.3 — Accessibility engine.** Alt-text generation (vision model, structured output), reading-order check, caption generation for video/audio, WCAG AA contrast.
4. **T-D5.4 — Chart-selection recommender.** Rule-based first (data shape → chart type); LLM-assisted when intent is ambiguous. Returns `{chart_type, rationale, example_layout}`.
5. **T-D5.5 — Semantic index pipeline.** Embedding worker `/workers/semantic-index`. pgvector with `ivfflat` index; per-workspace; incremental on slide save + nightly full rebuild.
6. **T-D5.6 — Semantic search service.** `services/ai-orchestrator/internal/search`. Hybrid keyword + vector; permission boundaries enforced; ≤ 1s p95 for 10K-slide workspaces.
7. **T-D5.7 — Freshness checker.** `services/ai-orchestrator/internal/freshness`. Per-source `last_verified_at`; configurable thresholds; auto re-fetch via data connection.

**Files / packages touched**

- `/services/ai-orchestrator/internal/layout/` (new)
- `/services/ai-orchestrator/internal/accessibility/` (new)
- `/services/ai-orchestrator/internal/chartselect/` (new)
- `/services/ai-orchestrator/internal/search/` (new)
- `/services/ai-orchestrator/internal/freshness/` (new)
- `/workers/semantic-index/` (new)
- `/apps/editor/src/copilot/LayoutRepairPanel.tsx`
- `/apps/editor/src/copilot/AccessibilityPanel.tsx`
- `/apps/editor/src/copilot/ChartPicker.tsx`
- `/apps/editor/src/copilot/SemanticSearch.tsx`
- `/apps/editor/src/copilot/FreshnessPanel.tsx`

**Contracts added / consumed**

- **Added:** `POST /v1/ai/lint/layout`, `POST /v1/ai/accessibility/audit`, `POST /v1/ai/chart/recommend`, `GET /v1/ai/search`, `POST /v1/ai/freshness/check`.
- **Consumed:** `deck_version` (P05), `data_source` (P08), `asset` (P03), `theme` (P07).

**Tests written**

- Layout-repair rule coverage tests on a fixture deck with 50 seeded issues.
- Alt-text length bound (≤ 280 chars), no "image of…" prefix, decorative detection.
- Caption WER on clean-audio fixture ≥ 95%.
- Chart-selection rationale always present and consistent with the rule set.
- Semantic search NDCG@10 ≥ 0.85 against held-out queries.
- Freshness: citation older than the threshold is flagged; re-fetch resets the score.

**Definition of Done (WS-D5)**

- [ ] Layout repair detects and proposes fixes for every issue class in the matrix.
- [ ] Accessibility audit returns ≥ 95% caption accuracy on clean audio.
- [ ] Semantic search meets p95 ≤ 1s for a 10K-slide workspace.
- [ ] Freshness check flags citations beyond the workspace threshold and offers a "refresh" action.

---

## 5. Architecture & Data

### 5.1 New tables (PostgreSQL)

All tables inherit `created_at`, `updated_at`, `created_by`, `updated_by`, `ai_run_id`, `agent_session_id`. Full DDL is in `/docs/ai-copilot.md` §5.

| Table | Purpose | Migrations file |
|---|---|---|
| `ai_job` | Queued generation request; idempotency-keyed | `migrations/2026_07_ai_job.sql` |
| `ai_run` | One attempt of an `ai_job`, plus per-step records | `migrations/2026_07_ai_run.sql` |
| `citation` | First-class citation record with snippet, location, confidence | `migrations/2026_07_citation.sql` |
| `slide_citation` | Many-to-many slide ↔ citation ↔ claim | `migrations/2026_07_slide_citation.sql` |
| `source` | Ingested document with chunks | `migrations/2026_07_source.sql` |
| `image_generation_request` | Image-gen audit with prompt, model, moderation | `migrations/2026_07_igr.sql` |
| `rehearsal_session` | Per-session metrics + consent flags + retention | `migrations/2026_07_rehearsal.sql` |
| `qa_pair` | Per-slide anticipated Q&A | `migrations/2026_07_qa_pair.sql` |
| `summary` | Executive summary + TL;DR per deck | `migrations/2026_07_summary.sql` |
| `audience_variant` | Derived decks with diff summary | `migrations/2026_07_audience_variant.sql` |
| `freshness_record` | Per-source freshness score | `migrations/2026_07_freshness.sql` |
| `semantic_index_entry` | pgvector rows; mirrored relationally for traceability | `migrations/2026_07_semantic.sql` |

### 5.2 New services / workers

- `/services/ai-orchestrator` — Go service, exposes HTTP `/v1/ai/*` and internal gRPC. Houses router, planner, executor, and the per-feature generators (notes, qa, summary, variants, layout, accessibility, search, freshness, rehearsal, citations).
- `/workers/ai-tasks` — Go queue worker. Consumes `ai_job` records, fans out per-step runs, writes `ai_run` rows.
- `/workers/ingest-docs` — Python worker. PDF / DOCX / Notion parsing + OCR fallback.
- `/workers/data-analysis` — Python worker. Sandboxed statistical pass; row-level-security aware.
- `/workers/asr` — Go worker. Streaming ASR with diarization.
- `/workers/semantic-index` — Go worker. Embedding + pgvector upsert.
- `/workers/ai-eval` — Python worker. Eval harness (golden sets + LLM-as-judge).

### 5.3 New packages

- `/packages/model-adapter` — TS, `ModelAdapter` interface + provider implementations.
- `/packages/prompt-registry` — TS, versioned prompt templates with input/output JSON Schemas.
- `/packages/rehearsal-runtime` — TS, browser-side WebGL/WebAssembly bundle for gaze + filler detection.

### 5.4 New contracts (per `/contracts/openapi/v1/ai.yaml`)

- `POST /v1/ai/jobs`, `GET /v1/ai/jobs/{id}/stream`, `GET /v1/ai/jobs/{id}`
- `POST /v1/sources/{id}/ingest`
- `GET /v1/slides/{id}/citations`
- `POST /v1/ai/image`, `POST /v1/ai/image/{id}/remove-background`
- `POST /v1/ai/voice/transcribe`
- `POST /v1/ai/notes`, `POST /v1/ai/qa`, `POST /v1/ai/summary`, `POST /v1/ai/variants`
- `POST /v1/ai/rehearsal/sessions`, `PATCH ...`, `DELETE ...`, `POST .../metrics`
- `POST /v1/ai/lint/layout`, `POST /v1/ai/accessibility/audit`, `POST /v1/ai/chart/recommend`
- `GET /v1/ai/search`, `POST /v1/ai/freshness/check`
- `GET /v1/prompts/{template_id}`

### 5.5 Master-doc references

- **System architecture:** `/docs/04-system-architecture.md` — modular monolith with the `ai-*` modules registered as a vertical.
- **Data & DB design:** `/docs/05-data-database-design.md` — Postgres as system of record; pgvector for the semantic index.
- **Tech stack:** `/docs/06-technology-stack.md` — Go for the orchestrator + workers, TypeScript for adapter and UI, Python for ingestion + analysis + eval.
- **Security:** `/docs/07-security-planning.md` — vault for secrets, per-tenant keying, PII redaction at the orchestrator boundary.
- **AI Copilot:** `/docs/ai-copilot.md` — the canonical reference for every feature in P12.

---

## 6. Verification

| Feature | Test | Expected result | Owner |
|---:|---|---|---|
| #108 | Submit prompt "Q3 board update, 12 slides, optimistic"; wait for outline | Outline rendered with editable slides, no slides rendered until Approve | WS-D2 |
| #108 | Approve outline; wait for render | 12 slides rendered in ≤ 60s wall-clock; citations attached where claims are made | WS-D2 |
| #108 | Toggle workspace setting "auto-approve outline" | Slides render without explicit approval; audit log records the flag | WS-D2 |
| #109 | Upload PDF, DOCX, Notion export; each generates a deck | Each slide has ≥ 1 citation; citations panel lists chunk, page, snippet | WS-D2 |
| #109 | Delete source doc after generation | Citations remain with flag "(source no longer available)" | WS-D2 |
| #110 | Connect Sheets source with `analysis_intent="revenue trend"` | Outline labels each slide with the underlying finding; charts are data-bound | WS-D2 |
| #110 | Refresh source data | Slide numbers update; chart is re-rendered, not re-typed | WS-D2 |
| #111 | Prompt "comparison of 3 pricing tiers, playful" | 4 distinct layouts returned; no two share a template | WS-D2 |
| #111 | Request "more like option 2" | 4 variants biased toward option 2's structure | WS-D2 |
| #112 | Run light redesign on a slide | Diff shows only spacing/alignment changes; text, data, citations preserved | WS-D2 |
| #112 | Run full redesign on a brand-locked slide | System refuses to touch the locked region; flags manual edit | WS-D2 |
| #113 | Translate slide to Spanish with glossary override | Back-translation similarity ≥ 0.85; glossary terms unchanged | WS-D2 |
| #113 | Translate to Arabic | Layout flips on affected element; no overflow | WS-D2 |
| #114 | Generate "abstract hero illustration for a SaaS deck" | Style-locked image returned; provenance stored | WS-D2 |
| #114 | Prompt "photo of Taylor Swift" | Refused with logged moderation verdict | WS-D2 |
| #114 | Upload portrait; remove background | Transparent PNG; no jagged edges on hair (visual diff fixture) | WS-D2 |
| #115 | Record 3-min audio in browser | Outline within 60s; transcript editable before outline | WS-D3 |
| #115 | Multi-speaker audio | Diarization separates speakers; user marks "main" speaker | WS-D3 |
| #116 | Generate notes for a data-heavy slide | Variant=terse/detailed/executive honored; duration ≤ 90s TTS | WS-D3 |
| #117 | Start rehearsal; deny camera | Falls back to audio-only metrics; consent record stored | WS-D4 |
| #117 | Complete rehearsal; view dashboard | Pace, filler, eye-contact %, stumble points shown; raw media absent | WS-D4 |
| #117 | Click "delete all rehearsal data" | All `rehearsal_session` and any retained media removed | WS-D4 |
| #118 | Run Q&A with audience_profile="board" | ≥ 1 financially-flavored question per slide with $/margin/revenue keywords | WS-D3 |
| #119 | Run summarizer on a 30-slide deck | Executive summary slide + TL;DR PDF generated; every claim grounded in an existing slide | WS-D3 |
| #120 | Generate "5-min" variant | Derived deck with `diff_summary`; re-derive after source change requires explicit user action | WS-D3 |
| #121 | Run layout repair on a deck with 50 seeded issues | Issues classified; fix proposal per issue with confidence; per-slide accept/reject | WS-D5 |
| #122 | Run accessibility audit | Every image has alt text (or marked decorative); captions ≥ 95% WER; contrast issues flagged | WS-D5 |
| #123 | Recommend chart for a 12-row time series | Line chart recommended with "trend over time" rationale | WS-D5 |
| #124 | Search "churn" across a 10K-slide workspace | p95 ≤ 1s; results respect permission boundaries | WS-D5 |
| #125 | Citation older than 90 days | Flagged as stale; "refresh" action re-fetches via data connection | WS-D5 |

---

## 7. Risks & Open Decisions

| Risk | Mitigation |
|---|---|
| Model-adapter interface drifts as providers evolve | Pin adapter spec to a semver; every provider adapter carries a `compatibility_test` run in CI against a golden prompt |
| Provider concentration risk (quality/cost favors one vendor) | Multi-provider from day one; per-workspace budget split enforced; per-workspace tier allows opting into additional providers |
| Citation reliability on OCR'd PDFs | OCR'd chunks carry a `(OCR, low confidence)` marker and are not used unless user confirms |
| Rehearsal biometric leakage | On-device pipeline by default; raw media only on opt-in with explicit retention window; constant-time deletion API |
| Cost overrun on long decks | Per-`ai_job` `max_cost_cents`; per-workspace monthly cap; circuit breaker per provider |
| Prompt injection via doc ingest | Document content wrapped in `<untrusted_document>` with channel separation; classifier flags suspicious patterns; citation-only output constraint (per `/docs/ai-copilot.md` §7.3) |
| Bangladesh PDPA localization for AI-processed data | Confirm with counsel whether rehearsal data / voice-to-deck audio / AI-generated content are subject to localization. Until confirmed, the data residency configuration is opt-in per workspace and defaults to the workspace's residency setting |
| Browser support matrix for rehearsal | Camera/mic fallback to audio-only when WebGL or MediaPipe unavailable |
| Eval regression on prompt-template changes | Eval harness blocks rollout on golden-set regression; LLM-as-judge plus periodic human sampling |
| Outline approval UX may feel slow for power users | "Auto-approve outline" workspace setting plus per-slide "regenerate" affordance |

**Open decisions to close before P12 starts:**

- O-D1. Per-workspace default `max_cost_cents` for an `ai_job` (recommendation: 100 cents).
- O-D2. Whether the rehearsal consent modal uses PDPA-aligned grammar in the default English copy (recommendation: yes, with localized variants in Bangla before any Bangladesh launch).
- O-D3. Embedding model class for the semantic index (recommendation: high-quality embedding model with a multilingual variant for non-English decks).
- O-D4. Default freshness thresholds: 30 days for live data, 180 days for cited claims (recommendation: configurable per workspace, defaults above).

---

## 8. Demo

**Goal.** Prove P12 is shippable in an internal environment.

**Setup.**

- Internal staging with: a workspace `Acme HQ`, 3 seeded decks (Q3 Board, Pricing 2026, Onboarding), 1 ingested PDF (`Q3 Board Report`), 1 connected Google Sheet (`Sales by Region`), 1 brand kit (`Acme Bold`).
- Two provider adapters live (OpenAI, Anthropic); open-weight adapter turned off for the demo.
- Vault populated with provider keys; per-workspace budget = 1000 cents.

**Script (≈ 20 minutes).**

1. **Deck from prompt (#108).** Open `Q3 Board`, click `Copilot → New from prompt`. Type "Q3 board update for SaaS co, 12 slides, optimistic tone". Outline appears in ~6s. Drag-reorder two slides, change chart type on slide 5. Click `Approve & Generate`. 12 slides render in ~50s. Open slide 7; show the citation chip and click to the source chunk.
2. **Doc-to-deck with citations (#109).** Drop the `Q3 Board Report` PDF into the Copilot. Outline appears with each slide tagged "cited from section X.Y". Approve. Open the sources panel on slide 4; show three citations with page numbers and snippets. Mark one as `disputed`; show the badge change.
3. **Data-to-story (#110).** Connect `Sales by Region`. Click `Copilot → Data to story`. The narrative outline shows each slide with its underlying finding. Approve. Open slide 3; show the bound chart and click the data binding to show the SQL.
4. **Image generation (#114).** On slide 9, click `Generate image`. Prompt "abstract hero for AI analytics, Acme brand". Image renders with provenance visible. Try the disallowed prompt "photo of a famous person" — show the refusal and audit log entry.
5. **Voice-to-deck (#115).** Start a new deck. Click `Voice-to-deck`. Record a 90-second audio. Outline appears in ~30s. Edit the transcript to fix one ASR error; regenerate the outline.
6. **Rehearsal coach (#117).** Open the `Pricing 2026` deck. Click `Presenter → Rehearsal`. Consent modal shown; opt in to camera + mic, default retention. Run through 4 slides. Show dashboard: pace 142 wpm on slide 2, "um" filler 11 times on slide 3, eye contact 78%. Click `Delete all rehearsal data`. Confirm zero rows in `rehearsal_session`.
7. **Layout repair + accessibility (#121, #122).** Open `Onboarding`; show a slide with text overflow + a missing-alt image. Run `Lint → Repair`. Show the issue list; accept the layout fix. Run `Accessibility audit`. Show alt text generated, captions queued, contrast pass.
8. **Semantic search + freshness (#124, #125).** From the workspace home, search "churn". Show ranked slides with snippets. Open a deck with a 6-month-old citation; show the freshness badge. Click `Refresh`; show the re-fetched number and reset timestamp.

**Done criteria for the demo.**

- Every step above completes without manual intervention outside the documented UX.
- The audit log contains at least one row per feature exercised.
- No unhandled exceptions in the orchestrator's structured logs.

---

## 9. Definition of Done

- [ ] All features #108–#125 ship behind per-workspace feature flags with defaults off for risky features (image gen, voice-to-deck, rehearsal coach).
- [ ] Contracts `/contracts/openapi/v1/ai.yaml` and `/contracts/proto/domio/v1/ai.proto` are versioned (`v1.0.0`); backward-compatible changes only in `v1.x`; breaking changes require `v2`.
- [ ] All P12 unit, integration, and E2E tests pass in CI (target: ≥ 85% line coverage in `services/ai-orchestrator`, ≥ 90% in `packages/model-adapter`).
- [ ] Eval harness green on every prompt-template version; regression blocks rollout.
- [ ] OpenTelemetry traces flow from client → orchestrator → provider for every feature exercised in the demo.
- [ ] Structured logs include `run_id`, `job_id`, `workspace_id`, `model_class`, `latency_ms`, `tokens`, `cost_cents`; PII is hashed/redacted.
- [ ] Per-workspace cost cap and per-job `max_cost_cents` enforced; circuit breaker per provider verified.
- [ ] Vault integration verified: rotating a provider key requires no code change in any adapter.
- [ ] Rehearsal consent flow documented as PDPA-aligned (subject to O-D2).
- [ ] WCAG 2.2 AA check on the AI Copilot UI itself (axe-core in CI plus one manual pass).
- [ ] Threat-model review completed; top risks from `/docs/ai-copilot.md` §7.7 either mitigated or explicitly accepted.
- [ ] Load test: 100 concurrent outline generations, p95 ≤ 8s for text-only slides.
- [ ] `/docs/ai-copilot.md` updated where P12 implementation diverges from the spec.
- [ ] Internal demo passed end-to-end per §8.

---

**End of Phase 12.**