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

# Phase 05 — Persistence, versioning, branches

> **Phase:** 05
> **Name:** Persistence, versioning, branches
> **Critical path:** yes
> **Parallel stream:** Foundation (no parallel split; this is a critical-path phase)
> **Owner:** Editor lead + Schema lead + Data platform lead
> **Stream tag:** `F:VERSION` (foundation/versioning)

## 1. Intent

Phase 05 turns the live CRDT stream from Phase 04 into a durable, addressable, versioned history. It introduces a durable operation log per deck / branch, deterministic deck snapshots, a branching API (create, list, switch), a merge request service with 3-way diff at slide and element granularity, and a full version history with named checkpoints, visual diffs, and non-destructive restore. The phase is the second half of the foundation: components (#23–#36), theming (#37–#47), data bindings (#48–#64), animation (#85–#95), prototyping (#96–#107), AI (#108–#125), and agentic (#221–#240) all rest on the deterministic, queryable history this phase produces. The output of this phase must allow a user to nominate a checkpoint, branch from it, edit in isolation, and merge back with a structured, programmatic diff that downstream phases (collaboration workflow, agentic) can consume.

## 2. Goals

1. **Durable operation log is canonical.** Every CRDT op is persisted with causal metadata, replayable in order, and survives realtime-gateway restart without loss.
2. **Deck snapshots are deterministic and addressable.** A snapshot is a frozen Yjs state at a specific HLC; given the same ops + parent snapshot, the resulting snapshot is byte-identical.
3. **Branching is a first-class concept.** Users can create a branch from any checkpoint, switch to it, edit in isolation, and list all branches with lineage. The CRDT sub-doc set keys off `branch_id`.
4. **Merge requests expose a 3-way diff at slide and element granularity.** The diff is structured (JSON, not just visual) so the agentic layer and the workflow layer can branch on it programmatically.
5. **Version history is user-facing.** Named checkpoints, auto-checkpoints every 50 ops or 10 min, visual diffs, and a non-destructive restore that creates a new forward edge in history rather than rewinding.
6. **Editor history is unified with the version history.** Local undo/redo, named checkpoints, and merge commits are all the same kind of history entry; the user sees one continuous timeline.

## 3. Scope

**In scope (feature numbers):**

- #19 — Branching & merging of decks (full UX: branch create, list, switch, merge request lifecycle, 3-way diff, conflict resolution UI).
- #20 — Full version history with named checkpoints, diffs, restore.

**Out of scope (handled in later phases):**

- Suggestion mode (`#182`) — Phase 18.
- Review/approval gates (`#180`) — Phase 18.
- Per-slide assignments (`#181`) — Phase 18.
- Comments (`#179`) — Phase 18.
- AI-style merge conflict resolution copilot — Phase 12.
- Cross-deck branching — deferred to Phase 22.
- Visual diff for image-only changes (pixel diff) — Phase 22 (this phase covers structural diff).
- Branch-level audit log fan-out into enterprise compliance — Phase 20.

## 4. Dependencies

**Upstream phases (must be complete):**

- **Phase 00** — repo, contracts, generated clients, migration toolchain.
- **Phase 01** — observability, CI/CD, NATS, Postgres, Redis, container images.
- **Phase 02** — `decks`, `slides`, `elements`, schema version, deck canonical row.
- **Phase 03** — single-user editor, scenes, history engine, autosave.
- **Phase 04** — CRDT log, sub-documents, branch ID plumbing on ops, presence, offline.

**Downstream phases (this phase unblocks):**

- **Phase 06** — components use the same CRDT history; per-component overrides ride branches.
- **Phase 07** — themes are versioned on the same branch/sub-doc machinery.
- **Phase 08** — data bindings bind to a specific revision; snapshot guarantees data is reproducible.
- **Phase 09** — animation timelines are CRDT-native; branches let users experiment.
- **Phase 10** — prototype variables and interactions inherit history.
- **Phase 11** — 3D / media assets are revisioned.
- **Phase 12** — AI edits land in CRDT history with `author_kind: 'agent'`; the agent can read version diffs.
- **Phase 13** — agentic / MCP surface exposes version diff and branch operations.
- **Phase 14** — sharing & publishing pin a specific revision.
- **Phase 18** — comments & review read MR diffs.
- **Phase 20** — audit, retention, and legal hold consume the durable op log.

## 5. Workstreams

### Stream A — Durable op log and snapshots

**Owner:** Data platform lead + Editor lead. **Critical path.** Run in parallel with Stream B.

**A.1 Durable op log writer**

- Files: `/workers/sync/cmd/op-writer/main.go`, `/workers/sync/internal/materialize/op_writer.go`, `/workers/sync/internal/materialize/dedup.go`.
- Consumes `realtime.deck.{deckId}.crdt` from JetStream; writes to `crdt_logs` (per Phase 04); promotes a `(deck_id, branch_id, hlc)` materialized view used by the snapshot worker.
- Idempotency: `op_id` ULID is the primary key; duplicate writes are silently dropped.
- Batch size: 100 ops per write; commit every 16 ms ceiling; flush on graceful shutdown.
- Tests: 1M op replay test against a fresh Postgres; idempotency test (re-submit 100k ops, no growth in table).
- DoD: a hard kill of the worker followed by a restart loses zero ops and converges to the same `current_revision` reported by the gateway.

**A.2 Snapshotter and compaction**

- Files: `/workers/sync/cmd/snapshotter/main.go`, `/workers/sync/internal/snapshot/{snapshot.go,throttle.go,object_store.go}`.
- Triggers: every 5,000 ops on a deck, or every 10 min of no snapshot, whichever first.
- Output: a Yjs binary update stored in `deck_schemas` (Phase 05 introduces new columns for `crdt_snapshot_yjs bytea`, `crdt_snapshot_object_key text`); also a JSON Schema projection for the renderer.
- Object storage: snapshots > 256 KB go to S3 (`s3://snapshots/{tenant}/{workspace}/{deck}/{revision}.bin`); small snapshots stay in Postgres JSONB.
- Retention: keep last 50 snapshots inline; older snapshots are object-storage-only and referenced by `crdt_snapshot_object_key`.
- Tests: deterministic snapshot test (same ops + parent snapshot → byte-identical snapshot); large-deck shadow test (1,000 slides, 50k ops).
- DoD: rebuilding a deck from snapshot + tail ops completes in <100 ms for a 200-slide deck.

**A.3 Revision and schema versioning**

- Files: `/services/control-plane/modules/deck/src/revisions.ts`, `/services/control-plane/modules/deck/src/schema-version.ts`, `/packages/schema/src/versioning.ts`.
- Each successful op batch advances `current_revision` (`bigint`, monotonic per deck/branch). Each snapshot stores `revision`. `parent_revision` is the prior snapshot's revision.
- Schema versioning (per `/docs/05-data-database-design.md` §5.3): snapshot stores `schema_version`; reads apply bidirectional migration on the fly.
- DoD: a v1 deck opened in a v2 client migrates transparently; a v2 deck opened in a v1 client can render the v1 projection.

### Stream B — Branches API and merge request service

**Owner:** Editor lead. **Critical path.** Run in parallel with Stream A.

**B.1 Branches API (REST + gRPC)**

- Files: `/services/control-plane/modules/branch/src/handlers.ts`, `/services/control-plane/modules/branch/src/service.ts`, `/services/control-plane/modules/branch/src/lineage.ts`, `/services/control-plane/modules/branch/src/dal.ts`.
- Endpoints:
  - `POST /v1/decks/{deckId}/branches` — body `{name, baseCheckpointId}`; creates branch with `parent_branch` derived from current branch; rejects duplicate names per deck.
  - `GET /v1/decks/{deckId}/branches` — list with `{id, name, parentBranch, headRevision, status, createdAt, createdBy}`.
  - `POST /v1/decks/{deckId}/branches/{branchId}/checkout` — switches editor to branch; returns a WS endpoint and the branch's HLC vector.
  - `POST /v1/decks/{deckId}/branches/{branchId}/archive` — soft-archives (does not delete).
- gRPC equivalents live in `contracts/proto/domio/branch/v1/branch.proto` for the realtime gateway consumption.
- Tests: contract tests for create/list/switch; lineage test (deep ancestry, multiple parents).
- DoD: `branch_id` is required on every CRDT op from this phase forward; legacy ops without `branch_id` are treated as `main`.

**B.2 Merge requests — 3-way diff at slide/element granularity**

- Files: `/services/control-plane/modules/branch/src/diff.ts`, `/services/control-plane/modules/branch/src/merge.ts`, `/services/control-plane/modules/branch/src/resolver.ts`.
- Diff inputs: source branch base, source branch head, target branch head. Compute delta via Myers-style diff on the slide rail, per-slide diff on the element tree (add/modify/delete), per-property diff using JSON patch (RFC 6902) for scalars.
- Output: a structured `diff_summary` JSON consumed by both the editor UI and the agentic layer:
  ```json
  {
    "slides": { "added": ["slide:{id}"], "removed": ["slide:{id}"], "modified": ["slide:{id}"] },
    "elements": [{ "slideId": "...", "path": "elements[3].transform.x", "kind": "modified", "source": "..." | "target": "..." }],
    "conflicts": [{ "slideId": "...", "elementId": "...", "path": "...", "sourceValue": ..., "targetValue": ..., "baseValue": ... }]
  }
  ```
- Endpoints:
  - `POST /v1/decks/{deckId}/merge_requests` — body `{sourceBranchId, targetBranchId}`; returns `mrId` and initial `diff_summary`.
  - `GET /v1/decks/{deckId}/merge_requests/{mrId}` — fetch MR + diff.
  - `POST /v1/decks/{deckId}/merge_requests/{mrId}/resolve` — body `{strategy: "theirs"|"ours"|"manual", resolutions: [...]}`; updates the working tree.
  - `POST /v1/decks/{deckId}/merge_requests/{mrId}/merge` — final commit; produces a new branch head on the target.
- Fast-forward short-circuit: if the target branch has not advanced since `baseCheckpoint`, the merge is a fast-forward and skips the diff UI.
- Tests: golden diff tests (fixture decks with known divergences); conflict resolution matrix (all combinations of `theirs`/`ours`/`manual`); idempotent merge (re-merging after a partial resolve produces the same head).
- DoD: a 200-slide deck with 50 divergent elements produces a `diff_summary` in <1.5 s.

**B.3 Branch UI in the editor**

- Files: `/apps/editor/src/branch/{branch-panel.tsx,branch-create-dialog.tsx,merge-request-view.tsx,conflict-resolver.tsx}`.
- Branch panel: list, create, switch, archive. Switch requires user confirmation if there are unsynced local ops.
- MR view: 3-pane diff (target / source / resolved). Conflict resolver allows per-element choice (`theirs`/`ours`/`manual`) with a preview.
- DoD: a complete branch → edit → MR → resolve → merge → publish flow works in the editor with visual confirmation.

### Stream C — Named checkpoints, restore, history timeline

**Owner:** Editor lead. **Run in parallel with Stream A and B.**

**C.1 Named checkpoints**

- Files: `/services/control-plane/modules/checkpoint/src/handlers.ts`, `/services/control-plane/modules/checkpoint/src/service.ts`, `/apps/editor/src/history/checkpoints.tsx`.
- Endpoints:
  - `POST /v1/decks/{deckId}/checkpoints` — body `{name, parentCheckpointId?}`; creates a checkpoint pinning the current revision.
  - `GET /v1/decks/{deckId}/checkpoints` — list with `{id, name, revision, parentId, createdBy, createdAt}`.
  - `POST /v1/decks/{deckId}/checkpoints/{id}/restore` — non-destructive: creates a new forward edge in history. Returns the new revision.
  - `PATCH /v1/decks/{deckId}/checkpoints/{id}` — rename (history entry recorded).
- Auto-checkpoints: created by the snapshotter every 50 ops or 10 min; expire after 30 days; named checkpoints never expire.
- DoD: a user can rename and restore checkpoints; the editor's history timeline shows checkpoints inline.

**C.2 Visual diff and purge**

- Files: `/services/control-plane/modules/diff/src/visual.ts`, `/services/control-plane/modules/diff/src/structural.ts`, `/workers/render/cmd/diff-renderer/main.go`.
- Visual diff: server-rendered thumbnails at fixed zoom levels for fast scrub; client-computed thumbnails for live preview.
- Structural diff: feed from `diff_summary` in §B.2; renders as slide rail + per-element tree diff.
- Restore: `restore` is `git checkout + new commit` per `/docs/editor-canvas.md` §1 feature 20; never rewinds the branch.
- DoD: a user can scrub a 200-slide deck's history at 200 ms per step and see structural plus visual diffs.

**C.3 Unified history timeline**

- Files: `/apps/editor/src/history/timeline.tsx`, `/apps/editor/src/history/remote-entry.tsx`.
- The timeline shows: local undo/redo entries, named checkpoints, auto-checkpoints, branch switches, merge commits, agent edits.
- Each entry has: timestamp, author (with avatar), preview thumbnail, "go to this state" button.
- DoD: the timeline is continuous per branch; switching branches switches the timeline.

### Stream D — Contracts, telemetry, and migration

**Owner:** Platform lead + Schema lead. **Run in parallel with Streams A–C.**

**D.1 Proto contracts**

- Files: `contracts/proto/domio/branch/v1/branch.proto`, `contracts/proto/domio/checkpoint/v1/checkpoint.proto`, `contracts/proto/domio/merge/v1/merge.proto`, `contracts/proto/domio/diff/v1/diff.proto`.
- Generated clients commit to `services/control-plane/gen/`, `services/realtime-gateway/gen/`, `packages/sdk-go/branch/`, `packages/sdk-ts/branch/`.
- CI: `buf breaking` against `main` must pass.

**D.2 OpenAPI**

- Files: `contracts/openapi/v1/branches.yaml`, `contracts/openapi/v1/checkpoints.yaml`, `contracts/openapi/v1/merge_requests.yaml`, `contracts/openapi/v1/diff.yaml`.
- Spectral lint clean; CHANGELOG entry per breaking change.

**D.3 Migrations and table changes**

- New / changed tables (per `/docs/05-data-database-design.md`):
  - `decks` — extend with `current_revision bigint not null default 0`, `current_branch text not null default 'main'`, `crdt_snapshot_object_key text`.
  - `deck_versions` — extend with `branch_id uuid null` (nullable; `main` for legacy) and `diff_object_key text`; primary key already `(deck_id, revision)`.
  - `crdt_logs` — extend with `branch_id uuid null`, `op_kind text not null default 'crdt'`, `byte_size int not null`.
  - `branch_heads` — new shadow table: `(deck_id, branch_id, hlc, revision, updated_at)`; primary key `(deck_id, branch_id)`.
  - `merge_requests` — extend with `source_revision bigint`, `target_revision bigint`, `base_revision bigint`, `diff_summary jsonb`, `resolution_strategy text`, `resolved_by uuid`, `resolved_at timestamptz`.
  - `checkpoints` — new: `(id, deck_id, branch_id, name, revision, parent_id, created_by, created_at, kind ('named'|'auto'))`; unique `(deck_id, branch_id, name)`.
- Migration files: `migrations/2026XX_phase05_deck_revisions.sql`, `migrations/2026XX_phase05_branch_heads.sql`, `migrations/2026XX_phase05_merge_requests_resolution.sql`, `migrations/2026XX_phase05_checkpoints.sql`.
- Backfill: enumerate existing `crdt_logs` rows and assign `branch_id = 'main'`; backfill `current_revision` from max(op count) per deck.

**D.4 Telemetry**

- Files: `/services/control-plane/modules/branch/src/metrics.ts`, `/services/control-plane/modules/diff/src/metrics.ts`, `/workers/sync/internal/snapshot/metrics.go`.
- Metrics: `branch_create_total`, `branch_diff_duration_ms`, `branch_merge_duration_ms`, `checkpoint_restore_total`, `snapshot_size_bytes`, `snapshot_duration_ms`.
- Traces: spans for `branch.create`, `diff.compute`, `merge.commit`, `snapshot.materialize`.
- Alerts: `branch_diff_duration_ms p95 > 2000 ms` (matches `/docs/editor-canvas.md` §3.2 latency budget); `snapshot_duration_ms p95 > 5000 ms`.

**D.5 Security and audit**

- Every merge request emits an `audit.event` of `action = 'merge.commit'` with `actor_id`, `source_branch_id`, `target_branch_id`, `revision`.
- Branch create / archive / restore emit `audit.event` of `branch.create`, `branch.archive`, `checkpoint.restore`.
- Diff and MR endpoints are ACL-checked (a viewer cannot read MR; only editor and admin).

## 6. Architecture & data

### 6.1 New modules and services

- **Branch service** (`/services/control-plane/modules/branch`) — TS module; owns branches, merge requests, diff computation against CRDT snapshots.
- **Checkpoint service** (`/services/control-plane/modules/checkpoint`) — TS module; owns named and auto checkpoints.
- **Diff service** (`/services/control-plane/modules/diff`) — TS module; owns structural and visual diff; coordinates with `/workers/render/cmd/diff-renderer` (Go) for fast scrub thumbnails.
- **Snapshot worker** (`/workers/sync/cmd/snapshotter`) — Go; periodic snapshotting and compaction; integrates with NATS.
- **Op writer** (`/workers/sync/cmd/op-writer`) — Go; consumes CRDT stream, writes to Postgres.
- **Editor UI** (`/apps/editor/src/branch`, `/apps/editor/src/history`, `/apps/editor/src/checkpoint`) — branch panel, MR view, checkpoint UI, unified history timeline.

### 6.2 New tables and migrations

See Stream D.3 for the SQL. Subjects:

- `decks` — `current_revision`, `current_branch`, `crdt_snapshot_object_key`.
- `deck_versions` — `branch_id`, `diff_object_key`.
- `crdt_logs` — `branch_id`, `op_kind`, `byte_size`.
- `branch_heads` (new) — `(deck_id, branch_id, hlc, revision, updated_at)`.
- `merge_requests` — `source_revision`, `target_revision`, `base_revision`, `diff_summary`, `resolution_strategy`, `resolved_by`, `resolved_at`.
- `checkpoints` (new) — `(id, deck_id, branch_id, name, revision, parent_id, created_by, created_at, kind)`.

Migrations are reversible; backfill is re-runnable; the `branch_id` column defaults to `'main'` for legacy rows.

### 6.3 New contracts

- `contracts/proto/domio/branch/v1/branch.proto` — branch CRUD, switch, lineage.
- `contracts/proto/domio/checkpoint/v1/checkpoint.proto` — checkpoint CRUD, restore.
- `contracts/proto/domio/merge/v1/merge.proto` — MR lifecycle, resolve, commit.
- `contracts/proto/domio/diff/v1/diff.proto` — diff request/response.
- `contracts/openapi/v1/{branches,checkpoints,merge_requests,diff}.yaml` — REST counterparts.
- `contracts/schema/merge/diff_summary.schema.json` — JSON Schema for `diff_summary` so the agentic layer and the UI share the same shape.

### 6.4 New events on the bus

- `deck.branch.created` — `{deckId, branchId, parentBranchId, baseRevision, actorId}`.
- `deck.branch.switched` — `{deckId, branchId, hlc, actorId}`.
- `deck.checkpoint.created` — `{deckId, branchId, checkpointId, revision, kind}`.
- `deck.checkpoint.restored` — `{deckId, branchId, checkpointId, newRevision, actorId}`.
- `deck.merge.committed` — `{deckId, mrId, sourceBranchId, targetBranchId, revision, actorId}`.
- `deck.snapshot.materialized` — `{deckId, branchId, revision, byteSize, objectKey}`.

### 6.5 Cross-references to master docs

- **`/docs/04-system-architecture.md` §4.4 (Module Boundaries)** — `Deck & Schema` and `Collaboration` modules gain branches, checkpoints, and merge requests.
- **`/docs/04-system-architecture.md` §4.7 (Data Flows)** — the editor-edit flow now ends with a snapshot/materialize step at every 5,000 ops.
- **`/docs/04-system-architecture.md` §4.8 (Consistency Model)** — branches and MRs merge via CRDT; permissions and publication remain strong-consistency.
- **`/docs/05-data-database-design.md` §5.2.2 (decks, deck_versions)**, §5.2.10 (crdt_logs) — Phase 05 extends these.
- **`/docs/05-data-database-design.md` §5.3 (Schema Versioning)** — Phase 03 acquired schema_version; this phase wires migration on read.
- **`/docs/06-technology-stack.md` §6.2.0 (Contract Rule)** — every new surface is a committed contract.
- **`/docs/editor-canvas.md` §1 features #19, #20** — this phase implements them.

## 7. Verification

| Feature                 | Test                                                    | Expected result                                                      | Owner              |
| ----------------------- | ------------------------------------------------------- | -------------------------------------------------------------------- | ------------------ |
| #19 branch create       | POST /v1/decks/{id}/branches with valid base checkpoint | `branch` row created; subsequent ops carry `branch_id`               | Editor lead        |
| #19 branch list         | GET /v1/decks/{id}/branches                             | All branches with lineage; status fields populated                   | Editor lead        |
| #19 branch switch       | POST /v1/decks/{id}/branches/{branchId}/checkout        | Realtime gateway swaps sub-doc; cursor and selection state preserved | Editor lead        |
| #19 fast-forward merge  | Target branch has no commits since base                 | MR auto-commits with no diff UI; new head on target                  | Editor lead        |
| #19 3-way diff          | Source + target each diverge from base                  | `diff_summary` JSON returned with slide/element/path granularity     | Editor lead        |
| #19 conflict resolution | Manual resolution per element                           | Resolved value applied; conflicts list shrinks                       | Editor lead        |
| #19 merge commit        | Merge committed                                         | New revision on target; `deck.branch.merged` audit event emitted     | Editor lead        |
| #19 idempotent merge    | Re-merge after partial resolve                          | Same final head hash; no duplicate ops                               | Editor lead        |
| #20 named checkpoint    | POST /v1/decks/{id}/checkpoints                         | `checkpoint` row created; survives restart                           | Editor lead        |
| #20 auto-checkpoint     | Synthesize 50 ops in 10 min                             | Auto-checkpoint created; expires after 30 days                       | Editor lead        |
| #20 rename              | PATCH checkpoint                                        | Name updated; history entry for the rename                           | Editor lead        |
| #20 restore             | POST /v1/decks/{id}/checkpoints/{id}/restore            | New forward edge; original checkpoint preserved                      | Editor lead        |
| #20 visual diff         | Diff two revisions                                      | Thumbnails render at ≤200 ms per step; structural diff overlay       | Editor lead        |
| #20 unified timeline    | Local + checkpoint + merge + agent entries              | All entries shown in branch order                                    | Editor lead        |
| History continuity      | Switch branch, view timeline                            | Timeline swaps to branch-local history                               | Editor lead        |
| Snapshot determinism    | Replay identical op sequence                            | Byte-identical snapshot                                              | Data platform lead |
| Snapshot retention      | 50 snapshots inline; older object-store only            | Inline count capped; older referenced by object key                  | Data platform lead |
| Large-deck diff         | 200 slides, 50 divergent elements                       | `diff_summary` in <1.5 s                                             | Editor lead        |
| Load: 200 MRs           | 200 concurrent MRs on a deck                            | All complete in <2 s; no cross-MR interference                       | SRE                |
| Mig backfill            | 100k legacy `crdt_logs` rows                            | All backfilled with `branch_id = 'main'`; `current_revision` matches | Data platform lead |
| Audit                   | Branch create + merge emit audit events                 | `audit_events` rows with `branch.*` and `merge.*` actions            | Security lead      |
| Security gate           | Threat model diff for branch/MR endpoints               | All risks mitigated or accepted                                      | Security lead      |
| Contract CI             | `buf breaking` + Spectral                               | Pass on PR                                                           | Platform lead      |
| Schema migration        | Forward and backout rehearsed in staging                | No data loss; no downtime                                            | Data platform lead |

## 8. Risks & open decisions

| Risk                                                     | Likelihood | Impact | Mitigation                                                                                                                                       |
| -------------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3-way diff cost blows up on 1,000-slide decks            | medium     | high   | Phase 02 schema review board already constrains deck shape; large-deck stress test in §D.5; lazy diff (only render changed slide rail positions) |
| Branch storage cost grows unbounded                      | medium     | medium | Object-storage snapshot retention per `/docs/05` §5.11; per-workspace quota enforced at branch-create                                            |
| Merge commit with conflicting data bindings              | medium     | medium | Diff classify per `/docs/05` §5.2.4; bindings diff into MR; user resolves; binding evaluator re-runs on merge                                    |
| Restore accidentally creates large forward history       | low        | medium | Restore is post-quantized at 50 ops per merge; idempotent                                                                                        |
| Open: visual diff renders (Phase 13 vs Phase 15 hosting) | low        | low    | Defer to Phase 22 polish; this phase uses `/workers/render`                                                                                      |
| Open: cross-deck branching                               | low        | medium | Explicitly out of scope per §3; revisit in Phase 22                                                                                              |
| Open: agent-initiated merge resolution                   | medium     | medium | Defer to Phase 12; MR endpoints accept `actor_kind = 'agent'` today                                                                              |
| Open: scraping / data export of branch history           | low        | low    | `audit_events` covers; export tested in Phase 20                                                                                                 |

## 9. Demo

The "internal demo" for Phase 05 is a 20-minute live walkthrough on staging. Script:

1. **Setup.** Open `/decks/q3-board-deck` in the editor. The deck has 20 slides, 200 elements, 3 attached data bindings, and one theme. Last snapshot is 1,200 ops old.
2. **Snapshot milestone.** Trigger a manual snapshot. The worker writes a `crdt_snapshot_object_key`; the editor shows a "snapshot 1" badge in the history timeline.
3. **Named checkpoint.** Name a checkpoint "v1.0 — Board submission". The checkpoint panel shows it; the timeline pins it.
4. **Branch from checkpoint.** Press `Cmd+Shift+B`, name the branch `experiment/header-v2`. The branch panel shows the new branch with parent `main` and `base_revision` matching the checkpoint.
5. **Edit in isolation.** Switch to the branch. Move the header element on slide 1, change the headline text, and delete a footer element. The main branch is untouched; a coworker on `main` sees none of these changes.
6. **Edit main concurrently.** Switch back to `main`. Move the same header element by 20 px to the right. Both branches now have divergent edits.
7. **Open MR.** `experiment/header-v2` → `main`. The MR view shows: 1 slide modified (slide 1), 2 elements changed (header with conflict, footer deletes), 1 element deleted (footer).
8. **Resolve conflict.** In the conflict resolver, choose `manual` for the header position, type `x: 200`. Confirm. The diff now shows 0 conflicts.
9. **Merge commit.** Click "Merge". The MR commits; `main` advances; the new revision is 1,201. The audit event panel shows `merge.commit` by the demo user.
10. **Auto-checkpoint.** Continue editing until 50 ops or 10 min elapse. The auto-checkpoint appears in the timeline as "auto · 17:42".
11. **Visual diff.** Restore to the "v1.0" checkpoint. The timeline shows a new forward edge; the editor renders slide 1 as it was at v1.0; the visual diff overlay highlights the changed element.
12. **Unified timeline.** Show the timeline: local undo entries, named checkpoints, auto-checkpoints, the merge commit, agent edits (Phase 12 will exercise; in this demo a placeholder is shown).
13. **Diff service.** Show the `diff_summary` JSON for the merge, demonstrating that an agent could read it programmatically.
14. **Schema migration.** Show the `decks` row now has `current_revision = 1201`, `current_branch = 'main'`, `crdt_snapshot_object_key` populated.

Acceptance: the demo completes without manual DB intervention, the branch / merge / restore cycle is visually clear, and the `diff_summary` matches the human-readable diff.

## 10. Definition of Done

- [ ] Code merged to `main` for `/services/control-plane/modules/{branch,checkpoint,diff}`, `/workers/sync/cmd/{op-writer,snapshotter}`, `/workers/render/cmd/diff-renderer`, `/apps/editor/src/{branch,history,checkpoint}`, and `/contracts`.
- [ ] `buf breaking` and Spectral lint pass; generated clients committed.
- [ ] All migrations applied to staging with reversible backout rehearsed; legacy backfill complete.
- [ ] All unit and integration tests pass; load and chaos tests pass.
- [ ] Grafana dashboards populated: `branch_diff_duration_ms`, `branch_merge_duration_ms`, `snapshot_duration_ms`, `checkpoint_restore_total`.
- [ ] Alerts wired: `branch_diff_duration_ms p95 > 2000 ms`, `snapshot_duration_ms p95 > 5000 ms`.
- [ ] OpenTelemetry traces flow from editor → branch service → diff → snapshotter.
- [ ] Versioned protos are `v1.0.0` and tagged in `/contracts/CHANGELOG.md`.
- [ ] Security review: branch / MR / checkpoint endpoints ACL-checked; audit events emitted; threat model accepted.
- [ ] Documentation: this phase is cross-linked from `/docs/feature-list.md` for #19 and #20; `/docs/04` §4.4 module table updated.
- [ ] Internal demo passed; demo recording linked in the phase Status field.
- [ ] Phase 06 has the contracts and tables it needs to ship components on the same history.
