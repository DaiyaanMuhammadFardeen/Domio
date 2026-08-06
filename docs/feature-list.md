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
| #111 | AI slide designer | Four distinct layout options per slide with diversity check | 12 | Done (M2 follow-up) | `ai-copilot.md` §1.111, `phase-12-ai-copilot-foundation.md` |
| #112 | AI slide redesign | Light vs full redesign modes, content-preserving, brand-aware | 12 | Done (M2 follow-up) | `ai-copilot.md` §1.112, `phase-12-ai-copilot-foundation.md` |
| #113 | Copy assistant | Shorten / punch-up / tone / translate (100+ languages) with layout preservation | 12 | Done (M2 follow-up) | `ai-copilot.md` §1.113, `phase-12-ai-copilot-foundation.md` |
| #114 | AI image generation & background removal | Style-locked generation with two-layer moderation and provenance | 12 | Done (M2 follow-up) | `ai-copilot.md` §1.114, `phase-12-ai-copilot-foundation.md` |
| #221 | MCP server gateway | JSON-RPC 2.0 gateway with bearer-token auth, capability gating, RFC-7807 errors, and SSE streaming | 13 | Done (M1) | `phase-13-agentic-programmable-interfaces.md` §M1, `docs/mcp-server.md` |
| #222 | Hash-chained audit log | HMAC-SHA256 per (workspace, agent_session) chain, tamper-evident, hydrate/snapshot | 13 | Done (M1) | `phase-13-agentic-programmable-interfaces.md` §M1, `services/mcp-server/internal/audit/` |
| #223 | `lint_deck` tool | Layout / content lint rules over a deck JSON; 6 rules, count by severity | 13 | Done (M1) | `contracts/mcp/tools/lint_deck.*.schema.json` |
| #224 | `get_provenance` tool | Returns the universal audit quartet (created_by, updated_by, ai_run_id, agent_session_id) for a deck/slide | 13 | Done (M1) | `contracts/mcp/tools/get_provenance.*.schema.json` |
| #225 | `semantic_search` tool | Top-K slides matching a query, scored by token overlap (M1 stub; pg_trgm in M2) | 13 | Done (M1) | `contracts/mcp/tools/semantic_search.*.schema.json` |
| #226 | `get_claim_confidence` tool | Returns claim confidence score + evidence IDs (M1 stub; wired to P12 citation tables in M2) | 13 | Done (M1) | `contracts/mcp/tools/get_claim_confidence.*.schema.json` |
| #227 | `accessibility_audit` tool | WCAG-style a11y rules: missing alt, low contrast, no lang | 13 | Done (M1) | `contracts/mcp/tools/accessibility_audit.*.schema.json` |
| #228 | `check_freshness` tool | Reports whether a data binding is stale relative to a threshold (M1 stub; P12 ai_freshness_record in M2) | 13 | Done (M1) | `contracts/mcp/tools/check_freshness.*.schema.json` |
| #155 | Share-link CRUD | Create / read / update / soft-revoke of share_link + link_policy rows with optimistic seq concurrency | 14 | Done (W1) | `phase-14-sharing-publishing.md` W1, `contracts/openapi/v1/shares.yaml` |
| #156 | Signed link tokens | HMAC-SHA256 short-lived bearer tokens with nonce-based replay protection; mint via create/rotate, verify via `POST /mcp/share-introspect` | 14 | Done (W1) | `phase-14-sharing-publishing.md` W1, `packages/signed-link-token/` |
| #157 | Token rotation & expiry extension | `POST /v1/shares/{id}/rotate-token` (mints a fresh nonce) and `POST .../extend-expiry` (push the absolute expiry forward) | 14 | Done (W1) | `contracts/openapi/v1/shares.yaml` |
| #158 | Visibility policy | `link_policy.visibility` ∈ {public, link_only, allowlist, domain_restricted} with `allowedViewers` allowlist + max_views / allow_download / allow_print / allow_embed / require_passcode flags | 14 | Done (W1) | `phase-14-sharing-publishing.md` W1 |

---

## Phase cross-reference

| Phase | Features | Key deliverables |
|-------|----------|------------------|
| 04 — Real-time collaboration & CRDT sync | #17, #19 (infra), #21 | Realtime gateway, Yjs CRDT substrate, presence channel, offline convergence, convergence test suite |
| 12 — AI Copilot Foundation (M1 Foundations + M2 Generation core) | #108, #109, #110 (core); #111–#114 done (M2 follow-up) | Go AI orchestrator, model-adapter layer, prompt registry, ai-adapters gRPC seam, ai-tasks worker, ai-eval harness, ingest-docs + data-analysis workers, editor OutlineApproval UI, migration 0039 |
| 13 — Agentic & programmable interfaces (M1: read-only tools) | #221, #222, #223, #224, #225, #226, #227, #228 | Standalone Go MCP server, JSON-RPC 2.0 gateway, hash-chained audit log, 6 read-only tools with JSON Schema contracts, migration 0040 |

---

_Last updated: Phase 13 M1 (MCP server + read-only tools) completion._
