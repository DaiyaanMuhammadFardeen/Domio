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

---

## Phase cross-reference

| Phase | Features | Key deliverables |
|-------|----------|------------------|
| 04 — Real-time collaboration & CRDT sync | #17, #19 (infra), #21 | Realtime gateway, Yjs CRDT substrate, presence channel, offline convergence, convergence test suite |

---

_Last updated: Phase 04 completion._
