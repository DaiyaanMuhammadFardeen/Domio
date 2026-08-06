# Feature List

> **Purpose:** Master index of all product features with their status, owning phase, and cross-references to detailed specs. A feature is considered "done" only when its owning phase's Definition of Done is met and the feature appears in the Verification matrix of the corresponding phase.
>
> **Source of truth for feature numbers:** Feature numbers (`#1`–`#219`, `#221`–`#240`) are assigned in the planning docs (`/docs/01..12-*` and `/docs/<domain>.md`) and referenced by phase docs in `/docs/development_phases/`.

---

## Feature index

| # | Feature | Description | Owning phase | Status | Spec |
|---|---------|-------------|:------------:|--------|------|
| #17 | Realtime collaboration | Multiplayer live editing with cursors, selections, presence avatars | 04 | Done | `editor-canvas.md` §1.17, `phase-04-realtime-collab-crdt.md` |
| #18 | Cursor chat & pointer ping | Real-time cursor chat bubbles and pointer ping overlays | 04 | Done | `editor-canvas.md` §1.18 |
| #19 | Branching & merging (infra) | Branch creation, switch, lineage, op-log isolation — infrastructure only; merge resolution UI lands in Phase 05 | 04 / 05 | Done (infra) | `phase-04-realtime-collab-crdt.md`, `phase-05-persistence-versioning-branches.md` |
| #20 | Named checkpoints & visual diffs | Checkpoint creation, timeline scrub, visual diff between checkpoints | 05 | Pending | `editor-canvas.md` §1.20 |
| #21 | Offline-first sync (CRDT) | Offline editing with conflict-free sync on reconnect (CRDT-based); deterministic convergence | 04 | Done | `editor-canvas.md` §1.21, `phase-04-realtime-collab-crdt.md` |
| #108 | Full deck generation from a prompt, doc, or meeting transcript | Outline-first generation: outline approval gate, then designed slides | 12 | Done (M1+M2 core) | `ai-copilot.md` §1.108, `phase-12-ai-copilot-foundation.md` |
| #109 | Doc-to-deck with citations | PDF/DOCX/Notion/Markdown ingest, chunked sources, citation mapping with coverage | 12 | Done (M1+M2 core) | `ai-copilot.md` §1.109, `phase-12-ai-copilot-foundation.md` |
| #110 | Data-to-story narrative generation | Statistical findings (correlation, trend, outliers) feeding live-bound chart narrative | 12 | Done (M1+M2 core) | `ai-copilot.md` §1.110, `phase-12-ai-copilot-foundation.md` |
| #111 | AI slide designer | Four distinct layout options per slide with diversity check | 12 | Pending | `ai-copilot.md` §1.111, `phase-12-ai-copilot-foundation.md` |
| #112 | AI slide redesign | Light vs full redesign modes, content-preserving, brand-aware | 12 | Pending | `ai-copilot.md` §1.112, `phase-12-ai-copilot-foundation.md` |
| #113 | Copy assistant | Shorten / punch-up / tone / translate (100+ languages) with layout preservation | 12 | Pending | `ai-copilot.md` §1.113, `phase-12-ai-copilot-foundation.md` |
| #114 | AI image generation & background removal | Style-locked generation with two-layer moderation and provenance | 12 | Partial (moderation + fallback; provider dispatch pending) | `ai-copilot.md` §1.114, `phase-12-ai-copilot-foundation.md` |

---

## Phase cross-reference

| Phase | Features | Key deliverables |
|-------|----------|------------------|
| 04 — Real-time collaboration & CRDT sync | #17, #19 (infra), #21 | Realtime gateway, Yjs CRDT substrate, presence channel, offline convergence, convergence test suite |
| 12 — AI Copilot Foundation (M1 Foundations + M2 Generation core) | #108, #109, #110 (core); #111–#114 pending/partial | Go AI orchestrator, model-adapter layer, prompt registry, ai-adapters gRPC seam, ai-tasks worker, ai-eval harness, ingest-docs + data-analysis workers, editor OutlineApproval UI, migration 0039 |

---

_Last updated: Phase 12 (M1 Foundations + M2 Generation core) completion._
