# Wave 6 — AI Copilot UI

**Intent.** Every AI orchestrator endpoint gets a reachable, polished UI surface in the editor (and presenter). Wave 6 closes the §8 (AI Copilot) and §17 (Weaving AI further) feature gaps and converts the existing stub panels into real, AI-powered tools.

**Why it matters.** AI copilot is the second-highest-value differentiator after the live presentation experience. A copilot that the user can't find or that produces broken output is worse than no copilot at all.

---

## 1. Scope

- **§8 AI Copilot:** #108–125 (every feature).
- **§17 Weaving AI further:** #237–240 (deck lint for agents, confidence surfacing, simulation mode, deck diffing API surface).

---

## 2. Sub-phase map

### S6.1 — Copilot hub (command center)

**Features:** #108, #109, #115.

**Files to create:**

- `apps/editor/src/components/copilot/CopilotHub.tsx`
- `apps/editor/src/components/copilot/{PromptInput,JobProgress,History}.tsx`
- `apps/editor/src/lib/ai-service.ts`
- `apps/editor/src/panels/copilot-panel.tsx` (registers in registry from Wave 1)

**Build instructions:**

1. Copilot hub is a right-rail panel; toggled with `Cmd+J`.
2. Prompt input accepts text, voice (mic), and pasted file (doc, PDF, transcript).
3. Submitting routes to the right endpoint based on intent:
   - "Generate deck" → `POST /v1/ai/jobs` (planner).
   - "From this doc" → `POST /v1/ai/ingest` (ingest-docs worker).
   - "From this data" → `POST /v1/ai/data-story`.
   - "From this recording" → `POST /v1/ai/voice-to-deck` (transcribe + plan).
4. Job progress shows phases: planning, outlining, designing slides, citing sources.
5. History list shows past prompts + their outputs; click to re-open or branch.

**SOLID notes:**

- **S:** `CopilotHub` is a thin shell over `<PromptInput>`, `<JobProgress>`, `<History>`.
- **O:** adding a new AI endpoint is a new entry in a `routesPrompt(intent → endpoint)` table.

**Acceptance:**

- Voice-to-deck: 3-minute voice memo produces a structured outline.
- Doc-to-deck: 50-page PDF produces a 12-slide outline in <30 s.

---

### S6.2 — Outline approval (already exists; harden)

**Features:** #108.

**Files to modify:**

- `apps/editor/src/components/copilot/OutlineApproval.tsx`
- `apps/editor/src/components/copilot/SourceCitation.tsx` (new)

**Build instructions:**

1. Outline UI shows slide-by-slide titles + 1-line summary.
2. Per slide: edit title inline; reorder via drag; remove.
3. Each slide's source citations appear as chips; click to open the source paragraph.
4. Approve → `POST /v1/ai/outline/approve`; rejection allows free-form instruction.
5. On approve, the AI builds the slides into the deck (existing `OutlineApproval` already does this — wire to real endpoint).

---

### S6.3 — AI slide designer + redesign

**Features:** #111, #112.

**Files to create:**

- `apps/editor/src/components/copilot/DesignerPanel.tsx`
- `apps/editor/src/components/copilot/RedesignPanel.tsx`
- `apps/editor/src/components/copilot/LayoutPreviewGrid.tsx`

**Build instructions:**

1. Designer panel: prompt ("comparison of 3 pricing tiers, playful"), get 4 layout options.
2. Each layout is a rendered preview using the current theme.
3. Click "Apply" → inserts the layout as new slides.
4. Redesign: select an ugly slide, get on-brand redesigns preserving content. Light or full mode.
5. Brand-lock respected: redesigned slide never escapes the brand kit.

---

### S6.4 — Copy assistant + translation + tone

**Features:** #113, #107.

**Files to create:**

- `apps/editor/src/components/copilot/CopyAssistant.tsx`
- `apps/editor/src/components/copilot/TranslationDialog.tsx`

**Build instructions:**

1. Right-click selected text → "Improve with AI" → 4 variants (shorter, punchier, formal, casual).
2. Apply replaces the selected range; undo available.
3. Translation dialog: pick target language, glossary terms respected, RTL flip when applicable.
4. Per-deck translation creates a localized copy; `services/localization` config drives formatting.

---

### S6.5 — AI image generation + background removal

**Features:** #114.

**Files to modify:**

- `apps/editor/src/panels/media-panel.tsx` (image gen tab)
- `apps/editor/src/components/media/AIImageGenerator.tsx`

**Build instructions:**

1. Prompt + negative prompt + style picker.
2. Calls `POST /v1/ai/image`; renders 4 candidates; click to insert.
3. Background removal: on inserted image, right-click → "Remove background" → `POST /v1/ai/image/{id}/remove-background`.
4. Provenance chip shown on hover (per #215 in Wave 11).

---

### S6.6 — Speaker notes generation

**Features:** #116.

**Files to create:**

- `apps/editor/src/components/copilot/NotesGenerator.tsx`

**Build instructions:**

1. With a slide selected, click "Generate notes"; calls `POST /v1/ai/notes`.
2. Notes appear in the props panel notes field.
3. Three style presets: bullets, paragraph, story.
4. Regenerate with feedback ("make it more technical").

---

### S6.7 — AI rehearsal coach

**Features:** #117.

**Files to modify:**

- `apps/presenter/src/components/rehearsal/AICoach.tsx` (new)
- `apps/presenter/src/components/rehearsal/{PaceTracker,FillerWordCounter,EyeContactMeter}.tsx`

**Build instructions:**

1. Webcam + mic capture during rehearsal.
2. Pace tracker (WPM) updates live.
3. Filler word counter ("um", "uh", "like") per minute.
4. Eye contact meter via MediaPipe face mesh.
5. End of rehearsal: heatmap of pace, top filler words, slides where presenter stumbled.
6. Submit to `POST /v1/ai/rehearsal-feedback`; render structured feedback.

---

### S6.8 — AI-anticipated Q&A + summarization + audience-adaptive versions

**Features:** #118, #119, #120.

**Files to create:**

- `apps/editor/src/components/copilot/QAGenerator.tsx`
- `apps/editor/src/components/copilot/SummaryGenerator.tsx`
- `apps/editor/src/components/copilot/AudienceVersionsPanel.tsx`

**Build instructions:**

1. Q&A generator: per-slide "likely tough questions" with suggested answers.
2. Summary generator: produces 1-pager TL;DR + executive summary slide.
3. Audience versions: pick persona (5-min version / technical / exec) → creates a branched deck version per persona.

---

### S6.9 — Layout repair + accessibility fix

**Features:** #121, #122.

**Files to create:**

- `apps/editor/src/components/copilot/LayoutRepair.tsx`
- `apps/editor/src/components/copilot/AccessibilityFix.tsx`

**Build instructions:**

1. Layout repair scans the deck for overflowing text, misalignment, orphaned elements; lists each issue with a one-click fix.
2. Accessibility fix: alt-text missing → AI suggests; caption generation for embedded video/audio; reading-order corrections.
3. Both call `POST /v1/ai/lint-layout` and `POST /v1/ai/accessibility-audit` respectively.

---

### S6.10 — AI chart selection + semantic deck search

**Features:** #123, #124, #219.

**Files to create:**

- `apps/editor/src/components/copilot/ChartRecommender.tsx`
- `apps/editor/src/components/search/SemanticSearch.tsx`
- `apps/editor/src/app/search/page.tsx`

**Build instructions:**

1. Chart recommender: select a data element → "Suggest chart types" → 3 options with rationale.
2. Semantic search: `/search` page with a search bar; results are slides (across workspace) ranked by meaning.
3. Results show slide preview + source deck + click-to-jump.

---

### S6.11 — AI freshness checker

**Features:** #125.

**Files to create:**

- `apps/editor/src/components/copilot/FreshnessChecker.tsx`

**Build instructions:**

1. Run on the current deck; flags stats/claims older than X months.
2. Cross-references data sources for newer values.
3. One-click update.

---

### S6.12 — Confidence surfacing + simulation mode

**Features:** #238, #239.

**Files to create:**

- `apps/editor/src/components/copilot/ConfidenceChip.tsx`
- `apps/editor/src/components/copilot/SimulationRunner.tsx`

**Build instructions:**

1. AI-generated claims show a `<ConfidenceChip>` with strength level (data-supported vs. inferential).
2. Hover shows explanation.
3. Simulation runner: programmatically sweeps what-if sliders across a range; returns the resulting numbers as a chart. Calls `services/scenario-manager`.

---

### S6.13 — Deck linting for agents + deck diff API surface

**Features:** #237, #240.

**Files to modify:**

- `apps/editor/src/panels/deck-diff-panel.tsx` (real backend)
- `apps/editor/src/components/copilot/AgentDeckLint.tsx` (new)

**Build instructions:**

1. `deck-diff-panel` calls `POST /v1/diff/deck` with two deck IDs; renders structured diff (added/removed/changed slides, elements, data bindings).
2. Agent deck lint: invokes `POST /v1/ai/lint-deck`; checks for broken data bindings, orphaned components, off-brand colors, a11y issues.

---

## 3. SOLID injection

### Copilot module map

```
apps/editor/src/
├── components/
│   └── copilot/
│       ├── CopilotHub.tsx         # shell
│       ├── PromptInput.tsx        # text + voice + file
│       ├── JobProgress.tsx        # shared progress UI
│       ├── OutlineApproval.tsx
│       ├── DesignerPanel.tsx
│       ├── RedesignPanel.tsx
│       ├── CopyAssistant.tsx
│       ├── NotesGenerator.tsx
│       ├── QAGenerator.tsx
│       ├── SummaryGenerator.tsx
│       ├── AudienceVersionsPanel.tsx
│       ├── LayoutRepair.tsx
│       ├── AccessibilityFix.tsx
│       ├── ChartRecommender.tsx
│       ├── FreshnessChecker.tsx
│       ├── ConfidenceChip.tsx
│       ├── SimulationRunner.tsx
│       ├── AgentDeckLint.tsx
│       └── SourceCitation.tsx
├── lib/
│   └── ai-service.ts
├── panels/
│   └── copilot-panel.tsx          # registers in registry
└── app/search/page.tsx
```

### Rule: every AI feature is one prompt + one endpoint + one panel

Adding a new AI feature follows the same template. The CopilotHub wires via `routesPrompt(intent → endpoint)` table; no panel duplicates dispatch logic.

---

## 4. Out of scope

- Backend AI model work (the orchestrator is presumed complete).
- Public-facing copilot (the copilot is editor-internal; an audience-side "explain this slide" is Wave 11 novelty).

---

## 5. DoD checklist

- [ ] Every §8 feature reachable from a UI surface.
- [ ] Voice-to-deck round-trip <30 s for a 3-minute memo.
- [ ] All AI calls have a fallback empty state — no `SAMPLE_A11Y_FINDINGS` mocks.
- [ ] Outline approval persists.
- [ ] Rehearsal coach feedback rendered with structured scores.
- [ ] Semantic search returns ranked slides in <500 ms.
- [ ] Confidence chip rendered on every AI-generated claim.
- [ ] Accessibility fixes applied with one click.
