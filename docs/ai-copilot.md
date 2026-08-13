# Section 8 — AI Copilot (Features 108–125) and Agentic Extension Points

> Scope: feature specification, UX flows, architecture, data model, APIs, security, performance, observability, and cross-section ties for Domio's AI Copilot layer. References back to feature numbers in `/home/daiyaan2002/Desktop/Projects/domio/feature-list.md` and to the planning guide in `/home/daiyaan2002/Desktop/Projects/domio/pre-development-planning-guide.md`.

---

## 1. Feature-by-Feature Mapping

### Feature 108 — Full Deck Generation from a Prompt, Doc, or Meeting Transcript

- **Inputs accepted:** free-text prompt (`"a 12-slide Q3 board update for a SaaS co, two product lines, optimistic tone"`), uploaded document (PDF/DOCX/Notion export via feature 109), recorded meeting transcript (uploaded audio + transcript, or pasted transcript), or a structured `agent.brief` JSON (section 16, #221 MCP).
- **Output deck contract:** a `deck_version` with ordered `slide_blueprints`, each containing `intent`, `layout_hint`, `content_blocks`, `data_bindings`, `citation_refs`, and `confidence` per claim. Generation is staged — outline first, approval gate, then rendered slides — because hallucinated structure is expensive to undo.
- **Acceptance criteria**
  1. Given a prompt, system returns an editable outline (titles, bullets, suggested charts, data sources) within 8 seconds for the outline stage.
  2. User explicitly approves outline; on approval, system produces designed slides in ≤ 60 seconds for a 10-slide deck.
  3. Outline format is human-editable in the canvas — users can drag, reorder, delete, and re-author any slide before approval.
  4. Re-generation of any single slide is supported without regenerating the whole deck.
  5. The system never silently generates slides without outline approval unless the user toggles "auto-approve outline" (workspace-level setting).
- **Behavioral details**
  - The prompt is normalized into a `Brief` object (audience, goal, length, tone, brand, data sources, constraints).
  - The planner produces an `Outline` with explicit assertions (e.g., "this slide will cite the Q3 P&L sheet row 7") which are then verified post-generation.
  - The generator uses template-aware layout selection (feature 23) — it does not invent layouts from scratch.
- **Edge cases**
  - **Conflicts between prompt and brand-locked regions (#36):** brand-locked slides are flagged with a lock icon in the outline; user must either accept the lock or override with workspace-admin permission.
  - **Empty / hostile prompts:** system rejects empty prompts with a coaching prompt; prompts classified as prompt injection (see §7) are rejected with audit log entry.
  - **Truncated source documents:** outline stage continues with whatever is parsed; missing sections are flagged in the outline.
  - **Models unavailable fallback:** if the primary text model is down, the orchestrator routes to a fallback provider and notifies the user of reduced capability (e.g., "image generation unavailable").

### Feature 109 — Doc-to-Deck with Citations

- **Inputs:** PDF, DOCX, Notion export (Markdown/HTML), or pasted Markdown, up to 50 MB.
- **Pipeline:** ingest → extract text + structure → chunk → retrieve → plan → render with citation references.
- **Acceptance criteria**
  1. Every claim on a generated slide is traceable to a chunk in the source document with a stable `citation_id`.
  2. The "sources" panel attached to each slide lists the chunk text, document location (page/section), and a click-through to the highlighted source region.
  3. Unsupported claims are not inserted; if the planner wants to assert a fact it cannot cite, the outline presents it as `[NEEDS CITATION]` and the user must supply or approve a manual citation.
  4. Citations survive edits — re-rendering a slide does not silently drop a citation.
  5. The user can mark a citation as "verified" or "disputed."
- **Behavioral details**
  - Citations are first-class objects (§5) so they survive schema-level rewrites.
  - Pluggable extractors support PDF (text + OCR fallback for scanned PDFs), DOCX (paragraph + table preservation), Notion export (block tree).
  - Citation confidence is surfaced: a citation that came from an OCR'd scan of low quality is marked "(OCR, low confidence)".
- **Edge cases**
  - **Scanned PDF with no embedded text:** OCR pipeline runs; user is told which pages were OCR'd.
  - **Conflict between two sources:** both citations are kept; the slide shows a "sources differ" tooltip.
  - **Source document deleted after generation:** citations remain (cached text) but flagged "(source no longer available)".

### Feature 110 — Data-to-Story Narrative Generation

- **Inputs:** connected data source (Sheets, Airtable, Postgres, Snowflake — feature 48), with optional `analysis_intent` ("explain revenue trend over Q3").
- **Method:** statistical analysis pass (correlations, trend detection, outlier detection, segment comparison) produces a structured `Findings` list; the narrative planner turns the top `N` findings into a story arc (Setup → Tension → Resolution → Asks); the renderer maps each finding to a chart type and layout.
- **Acceptance criteria**
  1. The generated narrative explicitly states which finding drives each slide.
  2. The chart chosen for each finding is appropriate (e.g., trend over time uses a line chart, not a pie chart) — validated against a chart-selection rule set (feature 123).
  3. Numbers on the slide are bound to the underlying query, not pasted as text; refreshing the data updates the slide.
  4. The user can see "why this chart" inline — a tooltip explains the reasoning.
  5. Confidence per claim is surfaced (feature 238) — a finding driven by a single outlier is flagged low-confidence.
- **Behavioral details**
  - The narrative is constrained to only the data the user has access to; row-level security from the source is preserved.
  - Findings are deterministic where possible (same data + same intent → same findings) — randomness is opt-in.
- **Edge cases**
  - **Insufficient data:** the system reports "not enough rows / variance to find a meaningful trend" and offers a narrative template instead.
  - **Conflicting signals (revenue up, churn up):** both are surfaced; the user chooses which to lead with.
  - **Sensitive data in the source:** PII fields are auto-excluded from narrative generation unless explicitly opted in.

### Feature 111 — AI Slide Designer (Prompt-to-Layout)

- **Inputs:** a description of one slide (`"comparison of 3 pricing tiers, playful tone"`), with optional reference image upload and brand tokens.
- **Output:** 4 layout options, each rendered as a thumbnail with editable properties.
- **Acceptance criteria**
  1. The 4 options are genuinely distinct (not minor color variants), validated by a diversity check.
  2. Each option is fully editable after selection — no "this is AI output, accept it as-is" lock.
  3. Layouts respect brand tokens (#37) and template constraints.
  4. The user can request "more like option 2" — system produces 4 variants biased toward option 2's structure.
- **Edge cases**
  - **Reference image brand conflict:** user is warned if the reference image violates brand guidelines.
  - **Over-constrained prompts:** user is asked to relax one constraint.

### Feature 112 — AI Redesign

- **Inputs:** a selected slide (or multiple slides) marked for redesign.
- **Output:** redesigned versions preserving content (text, data, source claims) but improving layout, typography, visual hierarchy, and brand alignment.
- **Acceptance criteria**
  1. Content (text, data, citations) is preserved verbatim. The system produces a diff that confirms content preservation.
  2. The redesign passes the layout-repair checks (feature 121).
  3. The user can pick a "light" or "full" redesign (light = spacing/alignment only; full = structure change).
  4. Brand-locked regions (#36) are not modified.
- **Edge cases**
  - **Slide with mixed elements (text + chart + table):** the redesign preserves the chart and table semantics.
  - **Data-bound elements:** bindings are preserved across the redesign.

### Feature 113 — Copy Assistant

- **Capabilities:** shorten-to-bullet, punch-up headlines, fix tone, translate (100+ languages), preserve layout.
- **Acceptance criteria**
  1. Translation preserves meaning and formatting (no overflow, no broken numbers) — overflow is detected and re-flowed.
  2. Tone adjustments are deterministic for the same input + same tone parameter.
  3. Translation is bound to workspace language settings; voice/glossary overrides are respected.
  4. Translated text is marked as `translated_into` so downstream re-translation is traceable.
  5. Layout preservation is measured — translated text that overflows is shrunk to fit (with user consent) or flagged for manual edit.
- **Behavioral details**
  - A glossary is per-workspace, with brand names and product terms locked.
  - Translation quality is measured by a back-translation BLEU/chrF and a meaning-preservation check (feature 70 below).
- **Edge cases**
  - **Right-to-left languages (Arabic, Hebrew):** layout direction is flipped on the affected element; cascading children are re-flowed.
  - **Translation that loses humor or idiom:** the system flags the slide with "may not capture nuance" tooltip.

### Feature 114 — AI Image Generation and Background Removal

- **Image generation:** text-to-image for canvas fills, hero art, illustration, and icon variants.
- **Background removal:** foreground segmentation on uploaded images.
- **Acceptance criteria**
  1. Generated images are style-locked to the active brand kit (color palette, illustration style).
  2. Every generated image has a `model_version` and `prompt` stored (provenance) for audit.
  3. Faces of public figures and trademarked characters are blocked.
  4. Background removal preserves foreground fidelity (no jagged edges on hair, transparent PNG output).
  5. Image generation respects content moderation (see §7).
- **Behavioral details**
  - Policy is enforced at the orchestrator level, not just at the provider — a belt-and-suspenders approach.
  - Style transfer is implemented via prompt conditioning + style reference image.
- **Edge cases**
  - **Provider rate-limit:** fallback queue with a "ready in ~3 min" notification.
  - **Generated image is on-brand but off-tone:** user can flag for global tuning.

### Feature 115 — Voice-to-Deck

- **Inputs:** recorded audio (3+ minutes typical) via in-browser recorder; supports any browser-supported codec.
- **Pipeline:** ASR → speaker diarization → segmentation → outline generation.
- **Acceptance criteria**
  1. ASR accuracy on clean English is ≥ 95% (measured on a held-out set).
  2. The resulting outline is the same shape as a text-prompt outline (feature 108).
  3. The user can edit the transcript before outline generation.
  4. Audio is not retained after transcription (default retention policy; user can opt in to retain).
- **Edge cases**
  - **Strong accent / non-English:** ASR switches to the detected language and the user is told.
  - **Multiple speakers:** each speaker's contribution is shown; the user can mark which is the "main" speaker for narrative purposes.

### Feature 116 — AI Speaker Notes Generation

- **Inputs:** slide content (text, data, charts).
- **Output:** speaker notes (the "what to say" script) per slide, with optional variants (terse / detailed / executive).
- **Acceptance criteria**
  1. Notes stay under 90 seconds of speaking time per slide (validated by TTS duration estimate).
  2. Notes do not assert facts not on the slide without an explicit citation.
  3. Notes are editable in-place; edits are preserved across re-generation.
  4. Variant selection (terse / detailed / executive) is honored.
- **Edge cases**
  - **Data-heavy slide:** the script explains the chart, not just the title.
  - **Empty slide:** system suggests content or asks for direction.

### Feature 117 — AI Rehearsal Coach

- **Inputs:** webcam video + microphone audio during a practice run.
- **Outputs:** per-slide metrics — pace (wpm), filler words, eye contact (gaze at camera), time per slide, stumble points.
- **Acceptance criteria**
  1. The user explicitly opts in to camera/mic — no recording without a per-session consent banner.
  2. The recording is processed locally where possible (WebGL + WebAudio); only derived metrics are sent to the server.
  3. The user can delete the rehearsal session and all derived metrics with one click.
  4. The dashboard shows concrete, actionable feedback (e.g., "you said 'um' 17 times on slide 4").
  5. Privacy is preserved — biometric data is never used to identify the user; only metrics are stored.
- **Behavioral details**
  - Coach is non-judgmental — the UI frames feedback as "X% of presenters do Y; here is how you compare."
  - The user can annotate slides during rehearsal; the AI notes where they paused.
- **Edge cases**
  - **Poor lighting:** eye contact metric is skipped with a "couldn't compute" reason.
  - **Heavy accent:** pace is measured but not flagged.
  - **Camera denied:** system falls back to audio-only metrics.

### Feature 118 — AI-Anticipated Q&A

- **Inputs:** deck content + audience profile (board, technical, customer).
- **Output:** a list of likely tough questions per slide, with suggested answers.
- **Acceptance criteria**
  1. Q&A per slide is generated within 30 seconds of deck approval.
  2. The user can mark a Q&A pair as "expected" or "surprise" for coaching purposes.
  3. Suggested answers cite the slide they reference or pull from speaker notes.
  4. The "board-prep" mode pre-weights financially-oriented questions.
- **Edge cases**
  - **Audience profile not set:** falls back to "general audience."
  - **Sparse deck:** system asks for topics to focus on.

### Feature 119 — Smart Summarization (Executive Summary + TL;DR One-Pager)

- **Inputs:** any deck_version.
- **Outputs:** an "Executive Summary" slide and a separate "TL;DR" one-pager (a printable 1-page PDF / scrollytelling strip).
- **Acceptance criteria**
  1. The summary is content-faithful — every claim is grounded in an existing slide.
  2. The summary uses the same brand tokens and theme.
  3. The summary is regenerable from the source deck but neither replaces nor auto-overwrites the user's existing summary.
  4. Citations (#109) are preserved on the summary slide.
- **Edge cases**
  - **Very long deck (>50 slides):** summary covers the most-cited slides, with a "long tail" appendix.
  - **Audience language:** the summary can be generated in a different language than the deck (feature 113).

### Feature 120 — Audience-Adaptive Versions

- **Inputs:** the canonical deck.
- **Outputs:** multiple alternate versions — 5-minute, technical, executive, sales, customer, etc.
- **Acceptance criteria**
  1. Each variant is a derived `deck_version` (not a separate copy) with provenance to the source.
  2. Edits in the source propagate to the variants only after the user explicitly re-derives.
  3. The system shows "what's different" between the source and a variant.
  4. Variants respect brand-locked regions.
- **Behavioral details**
  - Generated via curation (which slides to include), not just compression.
  - The 5-minute version selects slides to fit a time budget; the technical version replaces business-speak with technical detail; the executive version front-loads the ask.
- **Edge cases**
  - **Insufficient material for a coherent variant:** system reports which sections are missing and suggests manual edits.

### Feature 121 — Layout Repair

- **Inputs:** any deck_version.
- **Outputs:** a repair report (issues found) and an auto-fix proposal.
- **Acceptance criteria**
  1. Detects: text overflow, element overlap, orphan elements (no parent), misaligned elements, broken data bindings, color-contrast violations, missing alt text, unreachable interactive elements.
  2. Each fix proposal is a patch (not a global rewrite) — the user can accept/reject per slide.
  3. The repair report is a callable MCP tool (`lint_deck`) for agents (feature 237).
  4. Confidence per fix is surfaced — low-confidence fixes (e.g., subjective alignment) are flagged.
- **Edge cases**
  - **Locked region:** system cannot auto-fix; flags with manual-edit recommendation.
  - **Conflict with user intent:** the user can "save current state as the desired baseline" so the AI doesn't re-apply the same fix.

### Feature 122 — Accessibility AI

- **Inputs:** any deck.
- **Outputs:** auto-generated alt text for images, reading-order fixes, captions for video/audio, contrast checks.
- **Acceptance criteria**
  1. Alt text is generated for every image that lacks one.
  2. Alt text is editable and saved as `alt_text` (not just a tooltip).
  3. Reading order matches visual focus, validated by tab order check.
  4. Captions are generated for video and audio with ≥ 95% accuracy on clean audio.
  5. Captions are translated on demand (feature 113).
  6. The accessibility report is an MCP-callable tool (`accessibility_audit`).
- **Edge cases**
  - **Decorative images:** marked as decorative (empty alt) — system auto-detects or user confirms.
  - **Hard-to-describe figures (charts, diagrams):** alt text includes a structured summary + a link to the data table.

### Feature 123 — AI Chart Selection

- **Inputs:** a dataset (headers + rows) and an intent ("show change over time").
- **Outputs:** a chart recommendation with reasoning.
- **Acceptance criteria**
  1. Recommendation is explainable — "your data has 12 time points and 3 categories → grouped bar or line; line is recommended because the goal is trend."
  2. The user can apply the recommendation as a diff (`apply_chart` patch).
  3. The system supports the chart library (#50).
- **Edge cases**
  - **Data too wide for any single chart:** recommends a small-multiple layout.
  - **Conflicting signals:** the user is asked which to prioritize.

### Feature 124 — Semantic Deck Search

- **Inputs:** a natural-language query (`"find the slide where we mention churn"`) over the user's workspace.
- **Outputs:** ranked list of slides with a snippet, the deck, and a confidence score.
- **Acceptance criteria**
  1. Search is semantic (not just keyword) — synonyms, related concepts, and numeric queries all work.
  2. Filters by deck, date, author, and tag.
  3. Cross-deck semantic search is exposed via MCP (extension point below).
  4. Search latency is ≤ 1 second for workspaces up to 10K slides.
- **Behavioral details**
  - Embedding-based retrieval with a hybrid keyword + vector approach.
  - Index updates within 5 seconds of slide save.
- **Edge cases**
  - **Workspace with mixed languages:** multilingual embeddings.
  - **Permission boundaries:** the user only sees slides they have access to.

### Feature 125 — AI Content Freshness Checker

- **Inputs:** a deck with timestamps and provenance (or citations).
- **Outputs:** a freshness report — "this slide cites data from July 2025; it's now Jan 2026; consider refreshing."
- **Acceptance criteria**
  1. Each citation has a `last_verified_at` and is checked against a configurable freshness threshold.
  2. The system can re-fetch the source (via the data connection) and verify the data is still current.
  3. The cross-deck knowledge graph (#219) lets the system flag "every deck that cites this number is now stale."
  4. Freshness is a callable MCP tool (`check_freshness`) for agents.
- **Edge cases**
  - **Source offline:** the system reports "could not verify" rather than "stale."
  - **Custom domain knowledge:** the user can register a "this number is durable" tag.

---

## 2. UX Flows

### 2.1 Prompt-to-Deck with Outline Approval

```
[User opens Copilot] → [Choose: Prompt / Doc / Data / Voice / Transcript]
  → [User types prompt] → [Orchestrator: parse → plan outline]
  → [Outline rendered as editable slide list]
       ▲
       │ user can: drag-reorder, edit titles, delete slides, add slide, change chart type
       │
  → [User clicks "Approve & Generate"]
  → [Orchestrator: render slides in parallel; cite each claim]
  → [Slide thumbnails appear as rendered → click each to edit]
  → [User can regenerate a single slide from a re-prompt]
```

States to design: empty input, mid-generation (skeleton + progress), partial failure (some slides rendered, others queued), user abandonment at outline (auto-saved for 30 days), conflict between outline and brand lock.

### 2.2 Doc-to-Deck with Citations

```
[User uploads PDF/DOCX/Notion export]
  → [Ingest: extract text + structure; show progress]
  → [Source library: user can name the source, edit chunked text, exclude sections]
  → [Outline generation with citations attached per slide]
  → [User reviews outline; each slide shows "cited from section X.Y"]
  → [Approve → render with citations live]
  → [Each slide has a "Sources" panel with chunk IDs, page numbers, snippets]
```

States: large-file progress, OCR-needed confirmation, citation conflict (two sources disagree), unsupported-claim warning.

### 2.3 Data-to-Story Narrative Generation

```
[User connects data source (Sheets/Airtable/Postgres)]
  → [System runs statistics pass → Findings list]
  → [Narrative planner composes story arc]
  → [Outline preview with "(finding: revenue +40% YoY, APAC)" labels]
  → [Each slide pre-bound to the underlying query]
  → [User approves → render → slides are live; refreshing data updates them]
```

States: insufficient data, mixed language in data, sensitive columns flagged for exclusion.

### 2.4 Slide Redesign

```
[User selects slide(s) → "Redesign"]
  → [Choose: light / full / brand-aligned]
  → [4 options rendered as thumbnails]
  → [Preview side-by-side with original]
  → [Apply (creates new version) → diff view confirms content preservation]
```

States: locked-region warning, content-loss warning (full redesign may compress text).

### 2.5 Rehearsal Coaching

```
[User opens Presenter mode → "Rehearsal"]
  → [Opt-in modal: camera/mic permission, retention policy, metrics scope]
  → [User runs through deck; AI watches/listens]
  → [Per-slide metrics stream live to a side panel]
  → [End of run → dashboard: pace by slide, filler-word count, eye-contact %, stumble points]
  → [User can replay specific slides with annotations]
  → [User can delete all rehearsal data]
```

States: camera denied, low light, poor audio, multi-presenter handoff.

### 2.6 Anticipated Q&A

```
[User opens Copilot → "Q&A prep"]
  → [User selects audience profile: board / technical / customer / general]
  → [System generates Q&A list per slide]
  → [User marks each as "expected" / "surprise" / "skip"]
  → [In presenter mode, the Q&A panel is available as a private view]
```

### 2.7 Accessibility AI

```
[User opens "Accessibility" panel]
  → [Run audit → list of issues: missing alt text, contrast, reading order]
  → [Auto-fix toggle: applies fixes in a batch (preview before commit)]
  → [Per-image alt-text edit inline]
  → [Caption generation for video: review & edit in subtitle editor]
```

---

## 3. Functional and Non-Functional Requirements

### 3.1 Model Selection and Routing

Domio is intentional about being model-agnostic. The orchestrator maintains a router that selects from a managed pool of internal and external providers for text, vision, speech, and TTS. The Puku-style routing principle applies: requests are routed to the best-fit model for the task, balancing quality, latency, cost, and policy. Specific routing decisions are not disclosed at the call level to the user; the user sees the model class used in version history for auditability.

Routing table (illustrative):

| Capability                                        | Primary class       | Fallback class   | Local fallback         |
| ------------------------------------------------- | ------------------- | ---------------- | ---------------------- |
| Text reasoning (outline, summary)                 | High-reasoning text | Mid-tier text    | On-device LLM (draft)  |
| Vision (alt-text, image analysis)                 | Vision model        | Captioning model | None                   |
| Speech-to-text (voice-to-deck, rehearsal)         | Streaming ASR       | Batch ASR        | Whisper-tiny on-device |
| Text-to-speech (caption preview, notes narration) | High-quality TTS    | Standard TTS     | Browser TTS            |
| Image generation                                  | High-quality image  | Standard image   | None                   |
| Embeddings (semantic search)                      | Embedding model     | N/A              | Local                  |

Providers are abstracted behind a `ModelAdapter` interface (see §4) so the router can swap providers without downstream code changes.

### 3.2 Streaming UX

Every generative endpoint streams via Server-Sent Events (SSE) or WebSockets. The client renders deltas as they arrive:

- **Text streams:** typewriter-style rendering into the outline or notes panel.
- **First token latency:** target ≤ 1.5 seconds p95 for the first SSE chunk after the user submits a prompt.
- **Slide-by-slide rendering:** when generating a deck, each slide's title appears within 2 seconds; full slide rendering within 8 seconds per slide.
- **Reconnection:** the client stores a `last_event_id` and resumes on reconnect.
- **Cancellation:** the user can cancel mid-generation; partial output is shown as a draft.

### 3.3 Citation Generation

Citations are first-class objects (see §5) with:

- `citation_id` — UUIDv7.
- `source_id` — points to the `Source` record (doc, URL, query).
- `location` — chunk index, page number, or row range.
- `snippet` — the exact text (≤ 280 chars) used.
- `confidence` — extracted from the retrieval score.
- `verified_by` — user ID if manually verified.
- `disputed` — boolean flag.
- `created_at` — timestamp.

Every claim on a generated slide carries one or more citations. The renderer inserts a small `ⁱ` marker; the sidebar lists all citations.

### 3.4 Data-Claim Traceability

Each numeric claim on a slide links to:

- The data binding (query, source).
- The freshness timestamp.
- The owner (who last verified).

This is exposed via the Provenance chip (feature 215) and via the `provenance` MCP tool (see extension points).

### 3.5 Image Generation Policy

- **Allowed:** abstract art, illustrations, generic scenes, branded visuals.
- **Restricted:** real people (without rights), copyrighted characters, brand logos (other than the user's own).
- **Enforcement:** prompt classifier + post-generation content moderation (CSAM, violence, public-figure face detection).
- **Audit:** every generated image stores `prompt`, `model_version`, `seed`, and `moderation_verdict`.
- **Brand safety:** generated images are scored against the brand palette; a low score triggers a warning.

### 3.6 Rehearsal Feedback Privacy

- **Per-session consent:** camera + mic permission requested each session; permission is revocable.
- **On-device processing:** gaze estimation, pose estimation, filler-word detection run in the browser (WebAssembly + WebGL). Only derived metrics are uploaded.
- **Default retention:** 0 days for raw video/audio; 30 days for derived metrics; user can delete at any time.
- **Workspace policy:** admins can disable rehearsal entirely or require extra justification per session.
- **Biometric data:** never used for identification; gaze is aggregated to a heatmap, not stored per face.

### 3.7 Translation Quality Measurement

- **Back-translation:** source → target → source; semantic similarity (embedding cosine) ≥ 0.85.
- **BLEU / chrF:** scored against a held-out benchmark per language pair.
- **Layout preservation:** text overflow check; translation passes only if the rendered text fits.
- **Terminology:** workspace glossary overrides win; untranslated terms are flagged.
- **Confidence:** low-confidence translations are flagged with a tooltip.

### 3.8 Freshness Scoring

- **Default thresholds:** 30 days for live data, 180 days for cited claims, configurable per-workspace.
- **Score formula:** `freshness_score = 1 - (days_since_verified / threshold)`, clamped to [0, 1].
- **Visualization:** a per-slide freshness badge; deck-level aggregate score in the sidebar.
- **Auto-recheck:** the system can re-fetch the source via the data connection; success resets the score.

### 3.9 Layout Repair Detection

Detected issues (rule-based + AI-assisted):

- Text overflow (width / height).
- Element overlap (bounding-box intersection).
- Orphan elements (no parent, no children).
- Alignment violations (off-grid).
- Contrast violations (WCAG AA).
- Missing alt text.
- Broken data bindings (query returns error).
- Color violations (off-brand tolerance).
- Unreachable interactive elements (tab order check).

Each issue has a `severity`, `auto_fixable` flag, and a `confidence` for the fix.

### 3.10 Alt-Text Generation

- **Trigger:** on image upload, on AI-generated image, on accessibility audit.
- **Model:** vision model with a structured output (subject, action, context, notable objects).
- **Length:** ≤ 280 chars, no "image of…" prefix.
- **Decorative detection:** if the image is purely decorative (gradient, pattern), alt text is empty + `role="presentation"`.
- **Review:** user can edit; edits are stored as `alt_text` (not `ai_alt_text`).

### 3.11 Non-Functional Targets (NFRs)

| Metric                          | Target                                             |
| ------------------------------- | -------------------------------------------------- |
| First-token latency (text)      | ≤ 1.5 s p95                                        |
| Slide generation latency        | ≤ 8 s p95 for text-only; ≤ 30 s p95 for data-bound |
| Voice-to-deck (3 min audio)     | ≤ 60 s for outline                                 |
| Rehearsal metric freshness      | ≤ 1 s after each slide                             |
| Semantic search latency         | ≤ 1 s p95 for workspaces up to 10K slides          |
| Availability                    | 99.5% for outline generation; 99.9% for read APIs  |
| Concurrent generations per user | 5                                                  |
| Cost ceiling per generated deck | $1.00 (soft cap; configurable per workspace)       |
| Browser support                 | Latest 2 versions of Chrome, Edge, Safari, Firefox |
| Accessibility                   | WCAG 2.2 AA on the AI Copilot UI itself            |

---

## 4. Architecture

### 4.1 High-Level Diagram

```
┌──────────────┐
│   Editor UI  │  (canvas, command palette, modal panels)
└──────┬───────┘
       │ HTTPS / WSS
       ▼
┌──────────────────────────────┐
│  AI Orchestrator (Router)    │
│  ┌────────────┐ ┌──────────┐ │
│  │  Planner   │ │ Executor │ │
│  └────┬───────┘ └────┬─────┘ │
└───────┼──────────────┼───────┘
        │              │
        ▼              ▼
┌──────────────┐  ┌──────────────┐
│ Model Adapter│  │ Tool Surface │  (MCP, file IO, retrieval, data)
│  Layer       │  └──────────────┘
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Providers    │  (text, vision, speech, TTS, image gen)
└──────────────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│  Storage: Postgres + Object store + Vector  │
│  index + Cache + Event log                  │
└─────────────────────────────────────────────┘
```

### 4.2 AI Orchestrator (Router, Planner, Executor)

- **Router:** routes user requests to the right pipeline (outline generation, slide redesign, image generation, etc.) and selects the model class. The router is policy-aware (PII detection, content moderation, workspace tier).
- **Planner:** decomposes a request into a sequence of steps. Example: `prompt_outline` → `assert_data_needs` → `plan_slide_intents` → `pick_layouts` → `dispatch_render`.
- **Executor:** runs the steps, with retries, fallbacks, and streaming. The executor is the only component that talks to providers; the planner is model-agnostic.

State of a generation is captured in an `ai_run` (§5) — every step is recorded so the result is replayable and auditable.

### 4.3 Model Adapter Layer (Multi-Provider)

A pluggable adapter interface:

```ts
interface ModelAdapter {
  id: string; // "openai-gpt-4o-class", "internal-text-high", etc.
  capabilities: Capability[]; // ["text", "vision", "json-mode", "tools"]
  generateText(req: TextRequest, ctx: RunContext): AsyncIterable<Delta>;
  generateVision(req: VisionRequest, ctx: RunContext): Promise<VisionResult>;
  generateSpeech(req: SpeechRequest, ctx: RunContext): Promise<AudioResult>;
  generateImage(req: ImageRequest, ctx: RunContext): Promise<ImageResult>;
  transcribe(req: AudioRequest, ctx: RunContext): Promise<TranscriptResult>;
  embed(req: EmbedRequest, ctx: RunContext): Promise<EmbeddingResult>;
}
```

Each provider is wrapped in an adapter that handles auth, rate limits, retries, and content moderation. The orchestrator selects an adapter based on capability, policy, and routing policy.

### 4.4 Document Ingestion Pipeline

For PDF/DOCX/Notion/HTML:

1. **Upload** to object storage (S3-compatible).
2. **Extract:** text + structure. PDF uses `pdf-parse` + Tesseract fallback for scanned pages. DOCX uses `mammoth`. Notion uses block-tree parser.
3. **Chunk:** semantic chunking (heading + paragraph + table boundaries, with overlap).
4. **Embed:** embed chunks into the vector index for retrieval.
5. **Index:** also store full text for keyword search and citation lookup.

The pipeline is async; the user sees progress and can cancel.

### 4.5 Spreadsheet Analysis

For Sheets/Airtable/Excel/CSV/SQL:

1. **Sample** first 1000 rows; if the source is large, paginate.
2. **Profile:** column types, missing values, distributions.
3. **Statistics:** correlations, trend tests (Mann-Kendall), outlier detection (IQR, z-score).
4. **Findings:** top-N significant insights, ranked by effect size + relevance to the user's intent.
5. **Narrative:** planner composes `outline` from findings.

The analysis is deterministic where possible (same input → same findings) and runs in a sandboxed worker with read-only access.

### 4.6 Prompt Template Library

A versioned registry of prompt templates:

- `outline.from_prompt`
- `outline.from_doc`
- `outline.from_data`
- `slide.design`
- `slide.redesign`
- `notes.generate`
- `qa.generate`
- `summary.executive`
- `summary.tldr`
- `translate.preserve_layout`
- `accessibility.alt_text`
- `accessibility.captions`
- `freshness.check`
- `lint.layout`

Each template has a `version`, `model_class_hint`, expected `input_schema`, and a `output_schema`. Templates are eval-tracked — a regression in eval automatically blocks the rollout.

### 4.7 Citation Tracker

The `citation_tracker` is a service that:

- Maintains a 1-to-many mapping of `slide_claim → citation_id`.
- Re-verifies citations on demand (re-fetch the source, re-embed, re-match).
- Computes `citation_coverage` per deck (fraction of claims with verified citations).

### 4.8 Image Generation Service

- Prompt transformation (style references, brand conditioning).
- Provider dispatch with fallback.
- Post-generation moderation (CSAM, trademark, off-brand).
- Storage in object store with provenance metadata.

### 4.9 Voice-to-Deck (ASR)

- Web recorder captures audio in `audio/webm;codecs=opus`.
- ASR via streaming provider; partials are committed on a debounce.
- Speaker diarization when multiple speakers are detected.
- Result is a transcript the user can edit before outline generation.

### 4.10 Speaker Notes Generator

- Input: slide_blueprint + content + data bindings.
- Output: notes (terse / detailed / executive variants).
- Constraint: duration ≤ 90 seconds by TTS estimate.

### 4.11 Rehearsal Coach (Vision + Speech)

Browser-side pipeline:

- `getUserMedia` → MediaRecorder.
- WebAudio analyser → streaming ASR for filler words.
- WebGL gaze estimation (TensorFlow.js MediaPipe FaceMesh).
- Per-slide tracking via slide-change events.
- Aggregated metrics uploaded to server at end of session.

Server-side:

- Long-term storage of metrics only (not raw audio/video).
- Trend analysis across sessions ("you've improved pacing by 12% over 4 sessions").

### 4.12 Q&A Generator

- Per-slide: take slide_blueprint + speaker notes + audience profile.
- Generate likely questions (LLM, structured output: `{question, rationale, suggested_answer, expected_difficulty}`).
- Mark board-prep weighted questions when audience profile is "board."

### 4.13 Summarizer

- Input: deck_version.
- Two outputs: an "Executive Summary" slide (placed in the deck) and a "TL;DR" one-pager (separate document).
- Content faithfulness check: every claim is grounded in an existing slide.

### 4.14 Audience-Version Generator

- Input: deck_version + audience profile.
- Output: a derived `deck_version` with slide selection + per-slide curation.
- The diff between source and variant is stored and queryable.

### 4.15 Layout Repair Engine

- Detection: rule engine (overflow, overlap, alignment, contrast, broken bindings).
- AI-assisted fix: small LLM proposes layout adjustments.
- Each fix is a patch with a confidence score; user approves per slide.

### 4.16 Accessibility Engine

- Alt-text generation (vision model).
- Reading-order analysis (DOM order vs. visual focus).
- Caption generation (ASR for video/audio).
- Translation of captions (feature 113).
- WCAG AA contrast check.

### 4.17 Chart-Selection Recommender

- Rule-based first (data shape → chart type).
- LLM-assisted when intent is ambiguous.
- Output: `{chart_type, rationale, example_layout}`.

### 4.18 Semantic Search Index

- Per-workspace, per-deck vector index.
- Update strategy: incremental on slide save + nightly full rebuild.
- Cross-deck search is exposed via MCP (extension point).

### 4.19 Freshness Checker

- Per-source `last_verified_at` and configurable thresholds.
- Re-fetch via the data connection when possible.
- Cross-deck knowledge graph (#219) integration for "stale everywhere" signals.

### 4.20 Confidence / Uncertainty Surfacing

- Per-claim `confidence` and `basis` ("strongly data-supported", "inferential", "single-point").
- UI: visual badge on data callouts; tooltip on hover.
- MCP tool: `get_claim_confidence({deck_id, slide_id, claim_id})` for agents.

### 4.21 Service Boundaries (Modular Monolith, per planning guide §4.2–4.3)

Boundaries are business-capability oriented even within a single deployable:

- `ai-router` — request intake, policy, routing.
- `ai-planner` — outline / plan generation.
- `ai-renderer` — slide-level generation.
- `ai-image` — image generation + background removal.
- `ai-voice` — ASR + TTS.
- `ai-rehearsal` — rehearsal coach.
- `ai-translate` — translation + accessibility.
- `ai-search` — semantic index.
- `ai-freshness` — freshness checker.
- `ai-tools` — MCP tool surface.

Each module owns its data tables and exposes a clean internal API. The boundary is enforced by code review (no cross-module DB access).

### 4.22 Communication Patterns

- **Synchronous (gRPC internally):** lightweight tool calls (embed, single-step generation).
- **Asynchronous (queue):** long-running generation (deck generation, image generation). The user gets a `job_id` and subscribes via SSE/WebSocket.
- **Event bus (outbox pattern):** downstream notifications (e.g., "deck generated" → Sladk notification, audit log).

### 4.23 Error Handling and Resilience

- **Per-step retry:** exponential backoff, up to 3 attempts.
- **Provider fallback:** router-level fallback to a different model class.
- **Partial success:** if 8/10 slides generated, the user gets the 8 and a queued retry for the 2.
- **Circuit breaker:** per provider; outage triggers fallback.
- **Graceful degradation:** if image generation is down, the slide is rendered with a placeholder + "image will arrive in ~3 min" message.

### 4.24 Idempotency

- Every generation request takes an `idempotency_key` (UUIDv7).
- Retry of the same key returns the same `job_id` and existing output.
- Generation is concurrency-safe: two parallel requests with the same key are coalesced.

### 4.25 Feature Flags

- Per-workspace flags for: image generation, voice-to-deck, rehearsal coach, agent-initiated mode.
- Per-feature flags for: new prompt template versions, new model classes.
- Kill switches at the provider level.

---

## 5. Data Model

PostgreSQL is the system of record (consistent with the planning guide's recommendation for local-first strong-defaults). All tables are append-mostly where possible; audit fields are universal.

### 5.1 `ai_job`

A queued generation request.

```sql
CREATE TABLE ai_job (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL REFERENCES workspace(id),
  requested_by    UUID NOT NULL REFERENCES user(id),
  idempotency_key UUID NOT NULL,
  job_type        TEXT NOT NULL,  -- 'outline.generate', 'slide.render', 'deck.generate', 'image.generate', 'rehearsal.coach', 'qa.generate', 'summary.generate', 'translation', 'freshness.check', 'lint.layout'
  status          TEXT NOT NULL,  -- 'queued', 'running', 'succeeded', 'failed', 'cancelled', 'partial'
  payload         JSONB NOT NULL, -- input per job_type
  constraints     JSONB NOT NULL DEFAULT '{}', -- brand lock, audience, cost cap
  result          JSONB,
  error           JSONB,
  cost_cents      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  UNIQUE (workspace_id, idempotency_key)
);
CREATE INDEX ai_job_ws_status ON ai_job (workspace_id, status);
CREATE INDEX ai_job_created_at ON ai_job (created_at);
```

### 5.2 `ai_run`

A single attempt of an `ai_job` (one for retries, plus one per step in the plan).

```sql
CREATE TABLE ai_run (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID NOT NULL REFERENCES ai_job(id) ON DELETE CASCADE,
  parent_run_id UUID REFERENCES ai_run(id),
  step_name     TEXT NOT NULL,  -- 'plan.outline', 'render.slide', 'embed.chunk', etc.
  model_class   TEXT,           -- 'text-high', 'vision', 'image', 'asr', etc.
  model_id      TEXT,           -- concrete model identifier (audit only)
  prompt_hash   TEXT,           -- hash of the rendered prompt (no PII)
  prompt_ref    UUID REFERENCES prompt_template(id),
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cost_cents    INTEGER,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at  TIMESTAMPTZ,
  status        TEXT NOT NULL,
  error         JSONB
);
CREATE INDEX ai_run_job ON ai_run (job_id);
CREATE INDEX ai_run_started ON ai_run (started_at);
```

### 5.3 `citation`

```sql
CREATE TABLE citation (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  source_id       UUID NOT NULL REFERENCES source(id),
  location        JSONB NOT NULL,  -- {chunk_index, page, section, row_range}
  snippet         TEXT NOT NULL,
  quote_hash      TEXT NOT NULL,  -- hash of the snippet for de-duplication
  confidence      REAL NOT NULL,  -- 0..1
  verified_by     UUID REFERENCES user(id),
  verified_at     TIMESTAMPTZ,
  disputed        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX citation_workspace ON citation (workspace_id);
CREATE INDEX citation_source ON citation (source_id);

CREATE TABLE slide_citation (
  slide_id        UUID NOT NULL REFERENCES slide(id) ON DELETE CASCADE,
  citation_id     UUID NOT NULL REFERENCES citation(id),
  claim_id        UUID NOT NULL,  -- the specific claim this citation supports
  role            TEXT NOT NULL,  -- 'primary', 'supporting', 'background'
  PRIMARY KEY (slide_id, claim_id, citation_id)
);
```

### 5.4 `image_generation_request`

```sql
CREATE TABLE image_generation_request (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        UUID NOT NULL,
  requested_by        UUID NOT NULL REFERENCES user(id),
  prompt              TEXT NOT NULL,
  style_ref_image_id  UUID REFERENCES asset(id),
  brand_kit_id        UUID REFERENCES brand_kit(id),
  model_class         TEXT NOT NULL,
  model_id            TEXT NOT NULL,
  seed                BIGINT,
  output_asset_id     UUID REFERENCES asset(id),
  moderation_verdict  JSONB,
  status              TEXT NOT NULL,
  cost_cents          INTEGER,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ
);
CREATE INDEX igr_workspace ON image_generation_request (workspace_id);
```

### 5.5 `rehearsal_session`

```sql
CREATE TABLE rehearsal_session (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  user_id         UUID NOT NULL REFERENCES user(id),
  deck_id         UUID NOT NULL REFERENCES deck(id),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at        TIMESTAMPTZ,
  consent_flags   JSONB NOT NULL,  -- {camera, mic, retention_days, on_device}
  raw_video_ref   TEXT,            -- object store key (None if retention=0)
  raw_audio_ref   TEXT,
  metrics         JSONB,           -- per-slide + aggregate
  flagged         BOOLEAN NOT NULL DEFAULT FALSE,
  retention_until TIMESTAMPTZ
);
CREATE INDEX rehearsal_user_deck ON rehearsal_session (user_id, deck_id);
```

### 5.6 `qa_pair`

```sql
CREATE TABLE qa_pair (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id         UUID NOT NULL REFERENCES deck(id) ON DELETE CASCADE,
  slide_id        UUID NOT NULL REFERENCES slide(id) ON DELETE CASCADE,
  question        TEXT NOT NULL,
  rationale       TEXT,
  suggested_answer TEXT,
  difficulty      TEXT,  -- 'easy', 'medium', 'hard'
  audience_profile TEXT,
  user_status     TEXT,  -- 'expected', 'surprise', 'skip', NULL
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX qa_pair_deck_slide ON qa_pair (deck_id, slide_id);
```

### 5.7 `summary`

```sql
CREATE TABLE summary (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id         UUID NOT NULL REFERENCES deck(id) ON DELETE CASCADE,
  variant         TEXT NOT NULL,  -- 'executive', 'tldr', 'one_pager'
  content         JSONB NOT NULL, -- structured summary
  source_deck_version_id UUID REFERENCES deck_version(id),
  language        TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX summary_deck ON summary (deck_id);
```

### 5.8 `audience_variant`

```sql
CREATE TABLE audience_variant (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_deck_id  UUID NOT NULL REFERENCES deck(id) ON DELETE CASCADE,
  variant_type    TEXT NOT NULL,  -- 'five_min', 'technical', 'executive', 'sales', 'customer'
  derived_deck_id UUID NOT NULL REFERENCES deck(id),
  diff_summary    JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_deck_id, variant_type)
);
```

### 5.9 `freshness_record`

```sql
CREATE TABLE freshness_record (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  source_id       UUID REFERENCES source(id),
  citation_id     UUID REFERENCES citation(id),
  claim_id        UUID,
  last_verified_at TIMESTAMPTZ NOT NULL,
  threshold_days  INTEGER NOT NULL,
  freshness_score REAL NOT NULL,  -- 0..1
  verified_via    TEXT,           -- 'auto', 'manual', 'fetch_retry'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX freshness_workspace ON freshness_record (workspace_id);
```

### 5.10 `semantic_index_entry`

Stored in a vector index (e.g., pgvector) but mirrored as a relational record for traceability.

```sql
CREATE TABLE semantic_index_entry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID NOT NULL,
  slide_id        UUID NOT NULL REFERENCES slide(id) ON DELETE CASCADE,
  chunk_id        UUID NOT NULL,
  embedding       VECTOR(1536),  -- adjust dimension to model
  text            TEXT NOT NULL,
  language        TEXT,
  metadata        JSONB,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX semantic_index_workspace ON semantic_index_entry USING ivfflat (embedding vector_cosine_ops);
```

### 5.11 Universal Audit

Every table inherits:

- `created_at`, `updated_at`, `created_by`, `updated_by`.
- An `ai_run_id` (nullable) for AI-generated rows.
- An `agent_session_id` (nullable) for agent-initiated rows, distinguishing them from human edits in version history (feature 227).

---

## 6. APIs and Contracts

### 6.1 Async Job Submission

```http
POST /v1/ai/jobs
Content-Type: application/json
Authorization: Bearer <token>
Idempotency-Key: <UUIDv7>

{
  "type": "deck.generate",
  "payload": {
    "prompt": "Q3 board update, 12 slides, optimistic",
    "brand_kit_id": "...",
    "data_sources": [{"id": "...", "intent": "revenue"}]
  },
  "constraints": {
    "max_cost_cents": 100,
    "auto_approve_outline": false
  }
}
```

Response:

```json
{
  "job_id": "...",
  "status": "queued",
  "stream_url": "/v1/ai/jobs/{id}/stream"
}
```

### 6.2 Streaming Response

```http
GET /v1/ai/jobs/{job_id}/stream
Accept: text/event-stream
```

SSE events:

```
event: status
data: {"status": "running", "step": "plan.outline"}

event: delta
data: {"text": "Slide 1: Q3 highlights..."}

event: artifact
data: {"type": "slide_blueprint", "id": "...", "preview_url": "..."}

event: citation
data: {"slide_id": "...", "citation_id": "...", "claim_id": "..."}

event: done
data: {"status": "succeeded", "result": {...}}

event: error
data: {"code": "rate_limit", "retry_after": 30}
```

### 6.3 Tool-Use Endpoints (MCP surface)

The orchestrator exposes a typed tool surface consumable via MCP (feature 221). Phase 12 M2 surfaces — implemented in `services/ai-orchestrator/internal/{designer,redesign,copy,image}` and exposed at:

```http
POST /v1/ai/designer             # feature #111 — 4 distinct options
POST /v1/ai/designer/more-like   # feature #111 — variants biased to a chosen option
POST /v1/ai/redesign             # feature #112 — light or full, content-preserving
POST /v1/ai/copy                 # feature #113 — shorten / punch_up / tone / translate
POST /v1/ai/image                # feature #114 — generate (style-locked + 2-layer moderation)
POST /v1/ai/image/{id}/remove-background   # feature #114 — bg removal
POST /v1/ai/jobs                 # `type = "deck_render"` — sync outline → render → persist
```

The full MCP surface:

- `generate_deck(brief, data_sources, constraints) → job_id`
- `outline_deck(brief) → outline_blueprint`
- `render_slide(blueprint_id) → slide_id`
- `redesign_slide(slide_id, mode) → options`
- `generate_image(prompt, style_ref?, brand_kit_id?) → asset_id`
- `remove_background(asset_id) → asset_id`
- `transcribe_audio(audio_ref) → transcript_id`
- `generate_notes(slide_id, variant) → notes_id`
- `generate_qa(deck_id, audience_profile) → qa_pairs`
- `summarize_deck(deck_id, variant) → summary_id`
- `generate_audience_variant(deck_id, variant_type) → deck_id`
- `lint_deck(deck_id) → repair_report`
- `accessibility_audit(deck_id) → audit_report`
- `select_chart(dataset_id, intent) → chart_recommendation`
- `semantic_search(query, filters) → results`
- `check_freshness(deck_id) → freshness_report`
- `get_claim_confidence(deck_id, slide_id, claim_id) → confidence`
- `get_provenance(claim_id) → lineage`
- `propose_patch(deck_id, instruction) → patch_id`
- `apply_patch(patch_id, approved_by) → deck_version_id`

### 6.4 Citation Retrieval

```http
GET /v1/citations/{citation_id}
→ { source_id, location, snippet, confidence, verified_by, disputed }

GET /v1/slides/{slide_id}/citations
→ [{ citation_id, claim_id, role, snippet, ... }]
```

### 6.5 Voice Upload

```http
POST /v1/ai/voice/transcribe
Content-Type: multipart/form-data

file: <audio>
language: "en" (optional)
```

Returns a `transcript_id` and a streaming SSE of partial results.

### 6.6 API Versioning

- All endpoints under `/v1/`. Breaking changes require `/v2/`.
- Deprecation policy: 6 months notice, `Sunset` header, parallel support.
- OpenAPI spec is the source of truth; clients generate from it.

---

## 7. Security

### 7.1 PII Handling

- **In prompts:** PII detection runs on upload + on prompt assembly. Detected PII is masked and stored as `redacted_prompt` for audit, with the original kept only inside the active session memory.
- **In outputs:** the renderer checks generated text against a PII filter before inserting into the deck.
- **In documents:** the document ingestion pipeline flags PII fields; the user sees a warning and can choose to exclude.
- **In rehearsal:** raw video/audio is never uploaded by default; on-device metrics only.

### 7.2 Content Moderation

- **Two layers:** prompt-level (refuse early) + output-level (post-generation).
- **Categories:** harassment, hate, sexual content, violence, self-harm, illegal content, public-figure impersonation, trademark.
- **Logging:** moderation verdicts are logged with the `ai_run` (without retaining the content).
- **Appeal:** users can appeal a moderation block.

### 7.3 Prompt Injection Defense

Especially important because Doc-to-Deck (#109) and Data-to-Story (#110) ingest untrusted content.

- **Sanitization:** extracted text from PDFs/DOCs/Sheets is wrapped in an `<untrusted_document>` block with a higher-priority system instruction that prevents instruction-following from the document.
- **Two-channel:** user instruction and document content are channel-separated; the model is told documents are data, not instructions.
- **Heuristic scanner:** a lightweight classifier flags suspicious instruction-like patterns ("ignore previous instructions", "you are now ...").
- **Citation-only output:** doc-to-deck outputs are limited to claims + citations; the planner cannot execute arbitrary instructions from the document.
- **Sandbox for data:** spreadsheet analysis runs queries against a read-only connection with row-level security; the LLM only sees the rows the user already has access to.
- **Rate + size limits:** ingestion capped at 50 MB / 50K tokens to bound attack surface.
- **Audit trail:** every generation step stores the prompt hash + input token count; unusual patterns trigger alerts.

### 7.4 Provider Key Isolation

- Keys are stored in a secret manager (HashiCorp Vault / AWS Secrets Manager / equivalent).
- Per-environment keys; never committed.
- Per-tenant keys where the provider supports it (for billing isolation).
- The model adapter layer is the only component that reads keys; downstream code never sees them.

### 7.5 Rehearsal Video / Mic Storage and Retention

- **Default:** raw video/audio not retained. Only metrics.
- **Opt-in retention:** user-initiated, with explicit per-session consent and a configurable retention window (default 7 days).
- **Storage:** encrypted at rest with a per-tenant key.
- **Deletion:** user can delete all rehearsal data for a session or workspace in one action.
- **Access control:** raw video/audio is accessible only to the user; admins cannot view it (privacy floor).

### 7.6 Billing / Usage Limits

- **Per-workspace quotas:** monthly AI credit cap; configurable per workspace tier.
- **Per-job soft cap:** `max_cost_cents` constraint.
- **Per-user rate limits:** token-per-minute, jobs-per-hour.
- **Real-time enforcement:** the router rejects requests that exceed the cap; the user is shown usage.
- **Concurrency:** max 5 concurrent generations per user.

### 7.7 Threat Model (Top Risks)

| Threat                               | Mitigation                                               |
| ------------------------------------ | -------------------------------------------------------- |
| Prompt injection via uploaded doc    | Sanitization + channel separation + citation-only output |
| Data exfiltration via cloud provider | Per-tenant key isolation + zero-retention option         |
| Rehearsal biometric leakage          | On-device processing; metrics only                       |
| Off-brand / harmful image generation | Two-layer moderation + brand-safety scoring              |
| Cost overrun                         | Per-job + per-workspace caps; circuit breaker            |
| SSRF via data connector              | Allowlist of hosts; data connection runs in a sandbox    |
| Insider misuse                       | Audit log; anomaly detection on access patterns          |

### 7.8 Compliance Hooks

- **PDPA (Bangladesh, 2026):** consent flows, data subject rights, retention policies, data fiduciary contact. The rehearsal consent modal uses PDPA-aligned consent grammar.
- **GDPR:** comparable controls; data export and deletion are first-class.
- **WCAG 2.2 AA:** the AI Copilot UI itself meets the target.
- **SOC 2:** audit log + access controls + encryption are built in.

---

## 8. Performance

### 8.1 Streaming First Token Latency

- **Target:** ≤ 1.5 s p95 for text generation.
- **Strategy:** edge-deployed orchestrator (Cloudflare Workers / Vercel Edge / equivalent); persistent connections to providers; pre-warmed model adapters.
- **Measurement:** server-side timestamps; per-route dashboards.

### 8.2 Generation Latency per Slide

- **Text-only slide:** ≤ 8 s p95.
- **Data-bound slide:** ≤ 30 s p95 (includes query + render).
- **Batch generation:** 10-slide deck in ≤ 60 s wall-clock by parallelizing per-slide rendering (up to 5 concurrent).

### 8.3 Async Batching

- Long-running jobs (deck generation, image generation) use a queue (e.g., Redis-backed BullMQ / Postgres-based queue).
- Priority queues: "interactive" (default) > "background" (e.g., nightly freshness).
- Backpressure: the orchestrator returns `429` with `retry_after` if the queue is saturated.

### 8.4 Caching

- **Prompt templates:** cached per `(template_id, version)`.
- **Embeddings:** cached per `(workspace_id, slide_id, content_hash)`.
- **Chart recommendations:** cached per `(dataset_id, intent)`.
- **Translations:** cached per `(text_hash, source_lang, target_lang, glossary_version)`.

### 8.5 Cost Optimization

- **Tiered models:** drafts use cheaper models; final user-facing output uses higher-quality.
- **Streaming reuse:** long generations share partial state across retries.
- **Batching:** multiple semantic searches in one query.
- **Per-workspace budget:** warnings at 80%, hard cap at 100%.

### 8.6 Backend Sizing

- Orchestrator: stateless, horizontally scalable.
- Retrieval: vector index per workspace; sharded by tenant.
- Queue workers: auto-scaled based on queue depth.
- Object storage: cold storage for raw audio/video; hot for assets.

---

## 9. Observability and Testing

### 9.1 Logging

- **Structured logs:** JSON with `run_id`, `job_id`, `workspace_id`, `user_id`, `model_class`, `latency_ms`, `tokens`, `cost_cents`.
- **No PII in logs:** prompts are hashed; only metadata is logged.
- **Retention:** 90 days for operational logs; 1 year for audit logs.

### 9.2 Metrics

- **Per-route:** latency p50/p95/p99, error rate, tokens/sec, cost/req.
- **Per-provider:** availability, latency, error rate.
- **Per-feature (108–125):** usage count, success rate, user satisfaction (thumbs-up/down).
- **Per-workspace:** credit usage vs. cap.

### 9.3 Tracing

- **OpenTelemetry:** end-to-end trace from client click → orchestrator → provider → response.
- **Run trace:** every step in a multi-step generation is a span.

### 9.4 Alerting

- **Provider outage:** immediate alert on error rate spike.
- **Cost overrun:** alert on per-workspace budget burn rate.
- **Latency degradation:** p95 > 2× target for 5 minutes.
- **Content moderation anomaly:** spike in blocks.

### 9.5 Eval Harness

A dedicated eval pipeline that runs on every prompt template / model class change.

- **Golden sets:** human-curated sets of (input, expected output) per feature.
- **LLM-as-judge:** for subjective dimensions (tone, layout quality).
- **Human eval:** periodic sampling for quality audits.
- **Regression gate:** a regression in eval blocks the rollout.

Per-feature eval criteria:

| Feature               | Eval metric                                                      |
| --------------------- | ---------------------------------------------------------------- |
| 108 (deck gen)        | Outline completeness, content faithfulness, design coherence     |
| 109 (doc-to-deck)     | Citation coverage, citation accuracy, claim grounding            |
| 110 (data-to-story)   | Finding significance, narrative coherence, chart appropriateness |
| 113 (translate)       | Back-translation similarity, layout preservation                 |
| 117 (rehearsal)       | Pace accuracy vs. ground truth, filler-word detection accuracy   |
| 122 (accessibility)   | Alt-text quality (1–5), caption WER, contrast check coverage     |
| 124 (semantic search) | NDCG@10 vs. held-out queries                                     |
| 125 (freshness)       | Precision/recall of stale detection                              |

### 9.6 Testing Strategy

- **Unit:** per-component logic (planner, renderers, adapters).
- **Integration:** orchestrator + adapter + mock provider.
- **E2E:** Playwright flows for the AI Copilot UI.
- **Load:** concurrent generation; provider rate-limit behavior.
- **Security:** prompt injection fuzzing; PII detection; content moderation.
- **Accessibility:** automated CI checks (axe-core) + manual screen-reader pass.

### 9.7 Definition of Done (per feature)

- Acceptance criteria pass.
- Eval metric meets target.
- Audit fields populated.
- Documentation updated (API + UX).
- Feature flag in place.
- Smoke test in staging.

---

## 10. Cross-Section Ties

### 10.1 Editor (Section 1, features 1–22)

- The Copilot lives inside the editor's command palette (#13) and as a sidebar panel.
- Slide insertion lands on the canvas as a new frame.
- Outline approval renders to the layers panel (#5).
- Magic move (#86) animations apply to AI-generated slides if the user toggles "follow animation rules."
- Version history (#20) records AI runs as `agent` entries (feature 227).

### 10.2 Components (Section 2, features 23–36)

- Slide generation prefers components from the workspace's library.
- Smart components (#25) expose a typed JSON schema (feature 233) — the planner fills props via structured output.
- Brand-locked templates (#36) constrain the planner's options.
- Community marketplace (#28) components are usable only if the workspace has the appropriate license.

### 10.3 Live Data (Section 4, features 48–64)

- The data-to-story pipeline (#110) is a feature on top of data connections (#48).
- Charts (#50) are bound to live queries — the AI doesn't paste numbers; it binds them.
- The scenario switcher (#57) is callable via MCP (`run_scenario`) for agents (feature 239, simulation mode).
- The what-if sliders (#53) generate derived data that the planner can use.
- **Agent-writable data layer (extension on #48):** agents can write back computed fields or annotations (#59) to the source, closing the loop. The orchestrator issues a `data.write` action with explicit user consent (one-time per session).

### 10.4 Prototyping (Section 7, features 96–107)

- Interactive branching (#97) is preserved by AI generation — the planner reads existing branching and generates variants that respect it.
- Variables (#100) and conditional logic are honored by the slide generator.
- Deep-linkable states (#107) are auto-generated for each audience variant.

### 10.5 Presenter Coach (Section 9, features 126–141)

- The rehearsal coach (feature 117) consumes the same presenter view (#126).
- Rehearsal metrics surface in the post-presentation recap (#141).
- The coaching UI is non-blocking — the presenter can ignore suggestions.
- The "phone as remote" (#127) shows rehearsal metrics in real-time.

### 10.6 Analytics (Section 12, features 169–178)

- AI-generated content is tagged in analytics so the team can see what works.
- Per-viewer engagement feeds back into the planner: "the executive slide you generated had 80% completion; keep that structure."
- The freshness checker (#125) and chart recommender (#123) both feed into the analytics dashboard.

### 10.7 Agentic Interfaces (Section 16, features 221–240)

The AI Copilot is the substrate for the agentic layer. The full cross-section ties:

- **#221 MCP server:** the orchestrator exposes the tool surface (§6.3).
- **#222 Full MCP tool surface:** every Copilot feature is a tool.
- **#223 Structured deck schema:** the Copilot's output is the same schema agents read/write.
- **#224 Deck-as-code:** the planner emits YAML; the renderer applies it.
- **#225 Agent-scoped permissions:** every Copilot action respects agent scopes.
- **#226 Semantic element addressing:** the planner uses stable IDs.
- **#227 Tool-call transcript:** every Copilot action is logged as `agent` in version history.
- **#228 Dry-run mode:** the planner can emit a patch without applying it.
- **#229 Webhooks → agent triggers:** `on data update → invoke deck_orchestrator` is a wiring choice.
- **#230 Agent-to-agent handoff:** the orchestrator exposes a `transfer_to(agent_id)` tool.
- **#231 CLI:** `deckctl ai generate-deck --brief ...` calls the same endpoints.
- **#232 Local-first SDK:** the orchestrator's planner/executor can be embedded for offline use.
- **#233 Function-calling-ready component props:** the planner emits structured fills.
- **#234 Natural-language patch API:** the planner also exposes a convenience wrapper.
- **#235 Agent-readable deck comprehension:** `get_deck_summary` returns the same summary the summarizer produces.
- **#236 Capability discovery:** `list_tools` returns the full MCP tool surface.

**Extension points specifically called out in the feature list:**

- **Agent-writable data layer (extension on #48):** agents and the AI planner can write annotations (#59) or computed fields back to the source. Writes require user consent at the session level and are recorded in `data_mutation` audit.
- **Cross-deck semantic search via MCP (extension on #124):** the `semantic_search` tool is callable from any MCP client: `semantic_search(query, workspace_id, filters) → results`. The vector index is per-workspace; permission boundaries are enforced.
- **Provenance queryable by agents (extension on #216):** an MCP tool `get_provenance(claim_id)` returns `{source_system, query, owner, last_verified_at, freshness_score}`. The audit log is the same one used by the chip UI.
- **Agent-initiated generation mode (extension on #108):** `generate_deck_agent(brief, data_sources, constraints)` is a synchronous wrapper that returns a `job_id` for the agent to await. The brief is structured JSON, not natural language, but the agent can include a natural-language `notes` field that the planner integrates.

**Additional extension points woven through:**

- **Deck linting for agents (feature 237):** `lint_deck(deck_id) → repair_report` is the same engine that powers the UI's layout repair (#121).
- **Confidence/uncertainty surfacing (feature 238):** the planner attaches `confidence` and `basis` to every claim; the UI surfaces it; the MCP tool `get_claim_confidence` returns it.
- **Simulation mode (feature 239):** `run_scenario(deck_id, scenario_id, slider_values[]) → results` programmatically sweeps what-if sliders (#53).
- **Deck diffing API (feature 240):** `diff_deck(version_a, version_b) → structured_diff` is the programmatic counterpart to the visual diff (#183).

---

## 11. Open Questions / Risks

1. **Cost ceiling for AI features:** the per-deck cost target of $1.00 is a soft cap; high-end voice-to-deck or data-to-story may exceed this. Define a workspace-tier-aware cost strategy.
2. **Rehearsal privacy floor:** the on-device processing assumption depends on browser capabilities. Older browsers may fall back to server-side processing — define a graceful UX.
3. **Data residency (Bangladesh PDPA, 2026):** confirm whether rehearsal data, voice-to-deck audio, and AI-generated content are subject to localization rules. Verify directly with counsel before launch.
4. **Citation reliability for low-quality sources:** heuristic quality scores on OCR'd or poorly structured PDFs need a confidence floor before citations are presented.
5. **Model routing opacity:** the platform intentionally does not expose the exact model per request live. Ensure the audit trail (version history) is sufficient for compliance review.
6. **Cross-deck knowledge graph (#219) scale:** index size and query latency for very large workspaces (10K+ decks) need a load test before claiming the feature is "production-ready."
7. **Provider concentration risk:** the system is intentionally multi-provider, but cost/quality trade-offs may favor one provider. Diversification is a non-negotiable.

---

## 12. Milestones

- **M1 — Foundations:** orchestrator, model adapter layer, prompt template registry, audit logging, eval harness.
- **M2 — Generation core:** features 108, 109, 110, 111, 112, 113, 114.
- **M3 — Voice + speaker:** features 115, 116.
- **M4 — Coach + Q&A:** features 117, 118.
- **M5 — Maintenance:** features 119, 120, 121, 122, 123, 124, 125.
- **M6 — Agentic surface:** MCP tool surface, agent-initiated generation, agent-writable data layer, cross-deck search, provenance query, lint tool, simulation, diff.
- **M7 — Hardening:** security review, penetration test, PII/safety eval, localization compliance, performance load test.

---

## 13. Implementation Notes & Divergences (Phase 12, M1 Foundations + M2 Generation core)

Recorded at Phase 12 M1+M2 completion. Updates where implementation diverges from this document, per phase DoD. Deferred M3–M5 content (voice, rehearsal, maintenance, semantic index) is unchanged and tracked in the phase doc.

1. **Cross-language seam.** The orchestrator is Go (`services/ai-orchestrator`); provider access flows Go orchestrator → gRPC → TypeScript adapter service (`services/ai-adapters`, hosting `packages/model-adapter` + `packages/prompt-registry`). The seam is `AdapterService` in `contracts/proto/domio/ai/v1/ai.proto` (GenerateText server-stream, GenerateImage, Transcribe server-stream, Embed, GetCapabilities, GetPrompt). The ModelAdapter interface follows §4.3 exactly.
2. **Prompt registry is code-data, not a DB table.** The 14 seeded templates live in `packages/prompt-registry` (version, model-class hint, input/output schemas, eval-set id). There is no `prompt_template` table; `GET /v1/prompts/{template_id}` is served by the orchestrator proxying to the adapter service's `GetPrompt`.
3. **Migration 0039 deferrals.** All 12 tables ship in one forward-only migration (`0039_phase12_ai_copilot`). Documented deferrals: (a) `semantic_index_entry.embedding` is `BYTEA` — pgvector type + ivfflat index deferred to the M5 follow-up migration (extension is available in the runtime image); (b) foreign keys to tables owned by other phases (workspace, deck, slide, deck_version, brand_kit, asset) are omitted; columns are `uuid NOT NULL` without `REFERENCES`; (c) ids use `gen_random_uuid()` (v4) rather than UUIDv7 — ids are opaque to clients, non-breaking.
4. **Codegen — CI canonical, local fallback available.** `buf generate` runs in CI (`contracts.yml`) using BSR remote plugins (requires `BUF_TOKEN`). For local development without a BUF_TOKEN, `buf.gen.local.yaml` uses pinned local plugins (`protoc-gen-es 1.10.1` from `node_modules`, `protoc-gen-go v1.36.x`, `protoc-gen-go-grpc v1.6.x` from `$GOBIN`). `bin/gen` falls back to the local template automatically. Generated stubs (Go `domioaiv1`, TS `api-client`, Python) live under `gen/` and `packages/api-client/src/gen/`.
5. **Adapter service proto wiring pending.** `services/ai-adapters` currently serves the AdapterService surface via a built-in JSON service definition; migration to real proto-generated stubs is pending CI codegen (see item 4).
6. **Deck persistence — pgx-backed DeckStore.** `internal/renderer` writes `deck_versions` and `slides` through a `DeckStore` interface. The pgx-backed `NewPGXDeckStore(pool)` is now wired in `cmd/ai-orchestrator/main.go` whenever `DATABASE_URL` is set; an in-memory fallback remains for dev/test. Schema references migrations `0003_deck_schema` (decks / deck_versions / slides).
7. **M2 feature coverage (#111–#114) shipped.** #108 (outline + approval + render), #109 (ingest + citations), #110 (data-analysis + bindings) implemented at core level. #111 (slide designer, 4 distinct options + more-like), #112 (redesign, light / full with content-preservation + brand-lock), #113 (copy assistant, shorten / punch_up / tone / translate with glossary + RTL flip), and #114 (image generation + bg removal, provider chain with fallback + 2-layer moderation + provenance) are implemented in `services/ai-orchestrator/internal/{designer,redesign,copy,image}` and exposed at `POST /v1/ai/{designer,redesign,copy,image}`. Per-feature tests run in the orchestrator suite.
8. **RLS tenant isolation.** `0039` adds `tenant_isolation` policies on all 12 tables keyed on `current_setting('app.current_workspace_id')`, per §5 conventions.

---

**End of document.**

Coverage report:

- File: `/home/daiyaan2002/Desktop/Projects/domio/docs/ai-copilot.md`
- Features covered: 108–125 (all 18 features in section 8).
- Extension points covered: agent-writable data layer (on #48), cross-deck semantic search via MCP (on #124), provenance queryable by agents (on #216), agent-initiated generation mode (on #108), plus the additional section 16 extensions — deck linting for agents (#237), confidence/uncertainty surfacing (#238), simulation mode (#239), deck diffing API (#240).
- UX flows: 7 flows (prompt-to-deck, doc-to-deck, data-to-story, redesign, rehearsal, Q&A, accessibility).
- Architecture: 21 sub-components, all addressed.
- Data model: 10 tables, all with SQL DDL and indexes.
- APIs: async job submission, SSE streaming, MCP tool surface, citation retrieval, voice upload.
- Security: PII, moderation, prompt injection, provider keys, rehearsal data, billing, threat model.
- Performance: streaming, latency, batching, caching, cost optimization.
- Observability: logging, metrics, tracing, alerting, eval harness, test strategy.
- Cross-section ties: editor (#1), components (#2), live data (#4), prototyping (#7), presenter coach (#9), analytics (#12), agentic interfaces (#16).
