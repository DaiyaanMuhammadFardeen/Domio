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

# Phase 18 — Collaboration & workflow

**Phase:** 18
**Name:** Collaboration & workflow
**Owner:** Stream F — Insights & Workflow lead; sub-owners per workstream (Comments, Approval, Assignments, Suggestion Mode, MR + Diff, Permissions, Library, Auto-Update, Expiry, Meeting Tools, Notifications, Calendar, Task Managers, Guests)
**Critical-path:** No (surface phase, parallelizable)
**Parallel stream tag:** Stream F — Insights & Workflow (sibling to P17 analytics & engagement intelligence)

**Intent:** Turn Domio from a single-author canvas into a team-operated production system for presentations. Comments pin to _elements_, not just slides. Approvals are workflow-enforced, not advisory. Suggestion mode is a CRDT-isolated branch, not raw text suggestions. Merge requests produce a _visual_ diff of the deck as a rendered object. The slide library is a governed source of truth with auto-update propagation across every consumer. Meeting tools, chat tools, calendars, and task managers are first-class collaborators, not afterthoughts. Guest collaborators are scoped and expiring. The phase delivers fourteen services, a permission engine, a diff engine, a notification fan-out, and integrations to Slack / Teams / Asana / Jira / Linear / Zoom / Google Meet / Teams Meetings / Google Calendar / Outlook.

---

## 1. Goals

- Comments anchor to elements (not pixel coordinates) and survive layout changes, drag, and 60 fps real-time multiplayer cursor motion; pinning mentions at p95 ≤ 5s for first delivery (#179).
- A configurable approval workflow gates external share links; multi-lane parallel approvals with SLA escalation; immutable version snapshots prevent in-flight drift; full audit trail (#180).
- Slide-level assignments with multi-assignee, status workflow, blocked-required-reason, and a Gantt-like timeline view (#181).
- Suggestion mode lets any reviewer propose edits without touching the live deck; suggestions are CRDT operations on a parallel branch, conflict-detected at the semantic level, not text-line level (#182).
- Branch / merge requests with a visual diff at three granularities (slide / element / data-binding); 3-way merge UI for conflicts; validation hooks (linting, brand, a11y) block bad merges (#183).
- Typed workspace permissions with deny-first resolution, point-in-time (historical) queries, and a permission engine that evaluates every API call (#184).
- A governed slide library with search, filter, governance, and usage analytics; reference vs. copy insert toggle (#185).
- Auto-updating shared slides with hybrid write-through + lazy propagation, per-reference schedule, mandatory vs. opt-in updates, and consumer-side conflict UI (#186).
- Content expiry policies with three escalation tiers (gentle / moderate / strict) and AI-assisted freshness verification (#187).
- Native in-meeting presentation inside Zoom, Google Meet, and Microsoft Teams with participation features intact; recording markers per slide (#188).
- Slack / Teams notifications with deep links, action buttons, slash commands, DND awareness, and digest batching (#189).
- Calendar integration linking decks to events with pre-meeting prompt, bidirectional sync where the vendor supports it, and recurring-meeting awareness (#190).
- Two-way task-manager sync with Asana / Jira / Linear, declarative field mapping, last-write-wins by default, and bulk operations (#191).
- Guest collaborators with scoped, expiring access; magic-link auth; restricted capability set; audit-distinct identity (#192).

---

## 2. Scope

### In scope (feature numbers)

| Feature | Description                                                                             |
| ------- | --------------------------------------------------------------------------------------- |
| #179    | Element-pinned comments with threads, mentions, resolve, reactions, attachments         |
| #180    | Review/approval workflows with state machine, parallel lanes, SLA escalation            |
| #181    | Slide-level assignments with status workflow, multi-assignee, reason-on-blocked         |
| #182    | Suggestion mode (CRDT-isolated parallel branch, semantic diff, conflict detection)      |
| #183    | Deck merge requests with visual diff at slide/element/data-binding granularities        |
| #184    | Workspaces with hierarchical folders, typed permissions, deny-first, historical queries |
| #185    | Shared slide library with versioned entries, supersedes chain, governance               |
| #186    | Auto-updating shared slides (hybrid write-through + lazy, per-reference schedule)       |
| #187    | Content expiry policies with three escalation tiers + AI freshness check                |
| #188    | Meeting-tool integrations (Zoom, Meet, Teams) — in-meeting app + deep-link fallback     |
| #189    | Slack / Teams notifications with deep links, action buttons, slash commands             |
| #190    | Calendar integration (Google, Outlook, iCloud) with pre-meeting prompt                  |
| #191    | Task-manager integrations (Asana, Jira, Linear) with two-way sync                       |
| #192    | Guest collaborators with scoped, expiring access                                        |

### Out of scope (deferred to later phases)

- **Real-time collaborative slide editing** (live cursors within suggestion mode) — already in P04; P18 only isolation through CRDT sub-doc, not new co-presence.
- **Strict-mode auto-revoke of external share on overdue expiry** — the strictest tier auto-revokes; the auto-revoke pipeline itself is gated on P20 governance.
- **Custom conflict resolution plugins** — default resolvers only in P18; plugin architecture lands in P20.
- **Cross-workspace guest invitations** (guest in workspace A invited to workspace B) — single-workspace only in P18.
- **Live transcription of approval rationale** — text only in P18; voice memo capture deferred to P22.
- **Translating comments in real time** — defer to P21 / P22.
- **LinkedIn / X / iMessage notification channels** — Slack / Teams / email / in-app / push only in P18.
- **Org-wide (cross-workspace) library scope UI** — code supports org-level scope; UI ships workspace + team scopes only.
- **Bangla (bn-BD) UI strings for the library browser** — strings are internationalized; bn-BD translations are a P22 task.
- **Real-time co-presenting with presenter failover from a guest's session** — guests are viewers / commenters only in P18; presenter failover is a P15 / P21 concern.
- **Comment-level DLP scan** — basic warning only in P18; full DLP pipeline is P20.
- **Bidirectional Slack/Teams thread sync** (Domio comment ↔ Slack thread) — one-way → Slack/Teams only in P18; full two-way is P22.
- **Calendar event creation from a deck** — linking existing events only in P18; one-click-create is P22.

---

## 3. Dependencies

### Upstream (must be complete before P18 starts)

- **P00 — Repo, contracts, dev environment** — `/contracts`, `/packages`, `/services` layout, CI baseline, migration toolchain.
- **P01 — Observability, CI/CD, infra baseline** — OpenTelemetry SDK, Prometheus exporters, k6/Locust harness, secrets manager, regional infra modules, Kafka/NATS, object storage.
- **P02 — Deck schema & scene-graph foundation** — `deck.schema.json`, `scene-graph.schema.json`, semantic element IDs (#226).
- **P03 — Canvas editor MVP** — canvas context-menu, layers panel, drag/snap, autosave.
- **P04 — CRDT & presence** — Yjs sub-doc per branch, presence channel, offline sync.
- **P05 — Persistence, versioning, branches** — `deck`, `deck_version`, `branch`, `crdt_snapshot`, `merge_request`, `slide_diff` (consumed by P18's MR + diff engine).
- **P12 — AI copilot foundation** — AI edit suggestions land as P18 suggestions (CRDT-isolated branch); the AI rehearsal coach (F117) writes private comment threads.
- **P13 — Agentic & MCP** — `comment.create`, `approval.request`, `merge_request.open`, `library.search`, `guest.invite` MCP tools documented for P13 to wire.
- **P14 — Sharing & publishing** — share-link API; P18's approval gate hooks into share publishing to block external share while pending.
- **P15 — Presenter experience** — calendar-linked presenter mode; P18 wires calendar events into the presenter's "Today" view.

### Downstream (this phase unblocks)

- **P17 — Analytics & engagement intelligence** — sales notifications (#172) and funnel completed events consume comment/approval/MR lifecycle events emitted by P18.
- **P19 — Marketplace & creator economy** — slide library (#185) is the foundation for the marketplace; auto-update (#186) is the marketplace's propagation fabric.
- **P20 — Security & enterprise** — P18 already satisfies audit-log emission, DLP warning, audit-distinct guest identity; P20 layers DLP full scan, residency, SSO gating, SIEM.
- **P21 — Novel & frontier** — knowledge graph (#219), presentation state timeline (#205), and the AI meeting listener (#214) read comment / MR / approval events.
- **P22 — Polish, scale, hardening, GA** — backfills cross-workspace guest invites, Slack/Teams thread sync, calendar event creation, bidi comments, 25k concurrent session ceiling.

---

## 4. Workstreams

The phase is split into fourteen ordered workstreams. W1–W3 are foundational (permissions, comments, approval) and must land first. W4–W7 depend on W1 (permissions) and P05 branching. W8–W10 depend on W4 (state machine) and W1. W11–W14 depend on W1 (permissions) and W3 (approval).

### W1 — Workspace permission engine

**Sub-owner:** Permissions lead
**Goal:** Typed permission resolution with deny-first, hierarchical inheritance, historical (point-in-time) queries.

**Tasks.**

1. Build `services/permission-engine` — the central authorization engine.
2. Implement typed capabilities: `read`, `comment`, `suggest`, `edit`, `share_internal`, `share_external`, `manage_members`, `manage_billing`, `invite_guest`, `publish_to_library`, `manage_library`, `break_brand_lock`.
3. Implement the resolution algorithm: principal → groups → role → resource hierarchy → effective capabilities with **deny-first** (deny rules override allow rules).
4. Implement historical queries: every `permission_grant` carries `effective_from` / `effective_to`; the engine supports `at_time=...` queries.
5. Implement the Redis cache layer for hot permission resolutions; invalidate on grant / revoke.
6. Implement the `GET /api/v1/resources/{type}/{id}/effective-permissions?for=user_id&at_time=...` endpoint.
7. Wire the engine into the API gateway as middleware so every `/api/v1/...` route is checked.

**Files / packages touched.**

- `/services/permission-engine/` (new)
- `/services/permission-engine/internal/resolver/deny_first.go` (new)
- `/services/permission-engine/internal/cache/redis.go` (new)
- `/db/postgres/migrations/<ts>_workspace_permissions.sql` (new — `workspace`, `workspace_member`, `group_member`, `permission_grant`)
- `/packages/contracts/middleware/auth.go` (new — gateway middleware)

**Contracts added.**

- `GET /api/v1/resources/{type}/{id}/effective-permissions` REST.
- `permission.granted`, `permission.revoked` events on Kafka.

**Contracts consumed.** P00 / P01 infra, P14 share-link API.

**Tests written.**

- Unit: deny-first resolution across all capability combinations.
- Property: no combination of grants can escalate beyond the union of granted capabilities.
- Integration: every API endpoint returns 403 on missing capability.
- Performance: 1k req/s cached, p95 < 50 ms.

**Definition of Done.**

- Permission evaluation p95 < 50 ms cached, < 200 ms cold.
- Historical query (`at_time=...`) returns the period-correct effective set.
- Deny-first invariant verified by exhaustive property test.

---

### W2 — Comment + mention service

**Sub-owner:** Comments lead
**Goal:** Element-pinned comments with threads, mentions, reactions, attachments, orphan handling.

**Tasks.**

1. Build `services/comment-service` — CRUD on `comment`, `comment_thread`, `mention`, with element-relative anchor storage.
2. Implement anchor math: pin coordinates are fractional offsets (0..1) within the element's bounding box + fallback slide-relative offset.
3. Implement element-motion survival: when an element moves, the pin translates; when an element is deleted, the pin promotes to its parent slide with `orphaned=true`.
4. Implement mention autocomplete against `workspace_member` ∪ `guest_access` ∪ `role_handle`; if the user is not yet invited, surface an "invite and mention" affordance that creates a guest access (#192) inline.
5. Implement `@role` resolution (e.g., `@designers`, `@legal`) — resolves to a Slack-channel-style group.
6. Implement attachment upload (image / PDF / doc up to 25 MB) to the same object storage as the asset library.
7. Implement reaction emojis (`emoji_reactions JSONB` on comment row).
8. Implement thread browsing filter (status / author / date / "mentioning me").
9. Implement PII warning on comment creation (email / phone regex check).
10. Wire the notification fan-out for mentions — p95 ≤ 5 s for first delivery.

**Files / packages touched.**

- `/services/comment-service/` (new)
- `/services/comment-service/internal/anchor/element_relative.go` (new)
- `/db/postgres/migrations/<ts>_comment.sql` (new — `comment`, `comment_thread`, `mention`)
- `/apps/editor/canvas/comments/` (new — pin + composer UI)
- `/apps/editor/canvas/layers-panel/comments-tab/` (new)

**Contracts added.**

- `POST /api/v1/decks/{deck_id}/comments` REST.
- `GET /api/v1/decks/{deck_id}/comments?status=...` REST.
- `PATCH /api/v1/comments/{id}` REST.
- `POST /api/v1/comments/{id}/reactions` REST.
- `POST /api/v1/comments/{id}/mentions` REST.
- `comment.created`, `comment.resolved`, `comment.mentioned` events on Kafka.

**Contracts consumed.** P05 deck / element IDs; P14 share-link identity for mention routing.

**Tests written.**

- Unit: anchor math; orphan promotion; PII regex.
- Integration: end-to-end pin → mention → Slack notification in 5 s.
- Property: pin survives element drag at 60 fps.
- Permission: read-only user can read but not reply / resolve.

**Definition of Done.**

- Comment write p95 ≤ 200 ms; mention notification p95 ≤ 5 s.
- Pin survives element motion at 60 fps.
- Thread with 5,000 comments / 200 slides loads in p95 ≤ 1 s.

---

### W3 — Approval workflow engine

**Sub-owner:** Approval lead
**Goal:** Stateful approval workflow with multi-lane parallel approvals, immutable version snapshots, SLA escalation.

**Tasks.**

1. Build `services/approval-engine` — owns `approval_request`, `approval_decision`, the strict state machine.
2. Implement the state machine: `draft → pending → approved | changes_requested | rejected → (back to draft on edit) → pending → ...`. Illegal transitions rejected at the API with `409 Conflict`.
3. Implement parallel lanes: a single approval can have multiple lanes (legal, brand, finance) each with its own decision.
4. Implement SLA escalation: per-policy `sla_hours`; on overdue, escalate to fallback approver (workspace-configurable).
5. Implement immutable version snapshot on submit: reviewer's view is byte-identical to what was approved; subsequent edits create new versions.
6. Implement external-share gate: `share_external` is blocked while any required lane is `pending`; share dialog shows "blocked pending approval" with the pending approver list.
7. Implement auto-revoke on edit: if a previously-approved external link exists and the deck is edited, the link is auto-revoked and the share creator notified.
8. Implement the audit trail: every state transition (actor, timestamp, justification, version_id) is recorded.

**Files / packages touched.**

- `/services/approval-engine/` (new)
- `/services/approval-engine/internal/state_machine/transitions.go` (new)
- `/services/approval-engine/internal/sla/escalator.go` (new)
- `/db/postgres/migrations/<ts>_approval.sql` (new)
- `/services/share-publishing/` (P14, consumer — adds the gate check)
- `/apps/editor/canvas/approval-dialog/` (new)

**Contracts added.**

- `POST /api/v1/decks/{deck_id}/approval-requests` REST.
- `POST /api/v1/approval-requests/{id}/decisions` REST.
- `GET /api/v1/decks/{deck_id}/approval-status` REST.
- `approval.requested`, `approval.decided`, `approval.escalated` events on Kafka.

**Tests written.**

- Unit: full state-machine transition matrix; idempotent approval; escalation on overdue.
- Integration: parallel lanes approve independently; external share blocked then unblocked.
- Property: no illegal transition reachable via any sequence of valid API calls.

**Definition of Done.**

- State-machine verified against all transitions.
- External share gate enforced at the API layer.
- Auto-revoke on edit verified.
- SLA escalation tested on synthetic overdue.

---

### W4 — Assignment service

**Sub-owner:** Assignments lead
**Goal:** Slide-level assignments with status workflow, multi-assignee, reason-on-blocked, timeline view.

**Tasks.**

1. Build `services/assignment-service` — owns `assignment` table with `slide_range INT4RANGE`.
2. Implement assignment scope: slide-level or section-level (continuous range).
3. Implement multi-assignee (primary + watchers); only the primary's status counts toward "all done" rollups.
4. Implement status workflow: `not_started | in_progress | blocked | review | done`; `blocked` requires a mandatory reason text.
5. Implement the "My assignments" view API across the workspace.
6. Implement presenter-view overlay: during a live session, assigned slides show assignee initials in a corner badge (presenter-only, not audience-facing).
7. Implement assignment timeline view (Gantt-like) with critical-path detection (downstream slides of `blocked` highlighted).
8. Implement reassignment preserving the original in the audit log; new assignee notified.

**Files / packages touched.**

- `/services/assignment-service/` (new)
- `/services/assignment-service/internal/timeline/gantt.go` (new)
- `/db/postgres/migrations/<ts>_assignment.sql` (new)
- `/apps/presenter-view/overlays/assignment-badge/` (new)

**Contracts added.**

- `POST /api/v1/decks/{deck_id}/assignments` REST.
- `PATCH /api/v1/assignments/{id}` REST.
- `GET /api/v1/users/{user_id}/assignments` REST.
- `assignment.created`, `assignment.status_changed` events on Kafka.

**Tests written.**

- Unit: range math; blocked-reason mandate; multi-assignee rollup.
- Integration: end-to-end from PM assign → in_progress → review → done.

**Definition of Done.**

- Assignment write p95 ≤ 150 ms.
- Timeline view renders for 1k assignments in p95 ≤ 300 ms.
- Reassignment preserves audit log.

---

### W5 — Suggestion mode (CRDT-isolated parallel branch)

**Sub-owner:** Suggestion mode lead
**Goal:** Propose edits without modifying the live deck, with semantic diff at the operation level.

**Tasks.**

1. Build `services/suggestion-service` — owns `suggestion` table; CRUD on per-session branch operations.
2. Implement the CRDT-isolated parallel branch: each session can have its own sub-doc that **reads** the main branch but does not write to it.
3. Implement suggestion operations as structured (CRDT) ops: element move, resize, restyle, content change, data-binding change, theme/token change — never raw text.
4. Implement per-suggestion accept / reject; accepting applies the op as a normal edit on the live deck.
5. Implement semantic conflict detection at the operation level (compare operations on the same element).
6. Implement suggestion retention: default 90 days; workspace-configurable.
7. Implement the "Review suggestions" panel listing all open suggestions with author + timestamp.
8. Implement brand-lock enforcement: suggestions on locked regions can be authored but accept is denied unless the user has lock-break rights.
9. Implement data-binding preview: a suggestion that changes a binding captures both the new binding and a sample-rendered preview.

**Files / packages touched.**

- `/services/suggestion-service/` (new)
- `/services/suggestion-service/internal/branch/isolated.go` (new)
- `/services/suggestion-service/internal/conflict/detector.go` (new)
- `/db/postgres/migrations/<ts>_suggestion.sql` (new)
- `/apps/editor/canvas/suggestion-mode/` (new — toggle UI)
- `/apps/editor/canvas/suggestion-panel/` (new)

**Contracts added.**

- `POST /api/v1/decks/{deck_id}/suggestions` REST.
- `GET /api/v1/decks/{deck_id}/suggestions?status=open` REST.
- `POST /api/v1/suggestions/{id}/accept` REST.
- `POST /api/v1/suggestions/{id}/reject` REST.
- `suggestion.created`, `suggestion.accepted`, `suggestion.rejected`, `suggestion.obsolete` events on Kafka.

**Tests written.**

- Unit: isolation guarantee (suggestion never touches main branch).
- Property: structured op captured before/after state; conflict detection at op level.
- Integration: parallel suggestions on the same element surface conflict; brand-lock blocks accept.

**Definition of Done.**

- A 100-slide suggestion set serializes to ≤ 50 KB.
- Suggestion on a brand-locked region can be authored but accept is denied.
- Obsolete auto-resolve on element-delete verified.

---

### W6 — Merge request + visual diff engine

**Sub-owner:** MR + diff lead
**Goal:** Branch / MR with three-granularity visual diff; 3-way merge UI; validation hooks.

**Tasks.**

1. Build `services/merge-request` — owns `merge_request`, `slide_diff`; CRUD on the MR lifecycle.
2. Build a separate `workers/diff-engine` — the long-running diff computation worker (handles decks up to 500 slides).
3. Compute three-level diffs: slide (added/removed/reordered), element (added/removed/moved/resized/restyled), data-binding (which source/field changed).
4. Render the visual diff: target slide in two states (before/after) with a highlighted overlay (red = removed, green = added, amber = modified) and a drag-to-compare slider.
5. Implement 3-way merge conflict detection and the 3-column conflict UI (target / source / common ancestor).
6. Implement validation hooks: linting for broken data bindings, off-brand colors (#46), accessibility (alt-text, contrast) (#122) — failed hook blocks the merge.
7. Implement atomic merge: all non-conflicting changes apply, or none.
8. Implement fast-forward vs. 3-way merge modes.
9. Implement orphan MR handling: deleted branch surfaces "branch deleted"; deleted target branch auto-closes with reason.

**Files / packages touched.**

- `/services/merge-request/` (new)
- `/workers/diff-engine/` (new)
- `/workers/diff-engine/internal/visual/three_level.go` (new)
- `/workers/diff-engine/internal/merge/three_way.go` (new)
- `/workers/diff-engine/internal/hooks/lint.go` (new)
- `/db/postgres/migrations/<ts>_merge_request.sql` (new — `merge_request`, `slide_diff`)
- `/apps/editor/canvas/merge-request/` (new — MR UI)

**Contracts added.**

- `POST /api/v1/decks/{deck_id}/merge-requests` REST.
- `GET /api/v1/merge-requests/{id}/diffs?level=slide|element|data_binding` REST.
- `POST /api/v1/merge-requests/{id}/resolve-conflict` REST.
- `POST /api/v1/merge-requests/{id}/merge` REST.
- `merge_request.opened`, `merge_request.merged`, `merge_request.conflict_detected` events on Kafka.

**Tests written.**

- Unit: three-level diff math; 3-way merge conflict UI states.
- Integration: MR → diff → review → merge end-to-end.
- Performance: 100-slide deck diff in p95 ≤ 3 s; 500-slide deck in p95 ≤ 15 s.
- Property: validation hook failure blocks merge; no partial merge.

**Definition of Done.**

- Visual diff rendered at 60 fps for drag-to-compare slider.
- Three-level diff data persisted server-side so MRs remain inspectable after branch deletion.
- 3-way merge UI correctly handles brand-lock vs. normal edit conflict.

---

### W7 — Slide library + auto-update bus

**Sub-owner:** Library + auto-update lead
**Goal:** Governed slide library with versioned entries, reference vs. copy insert, and auto-update propagation.

**Tasks.**

1. Build `services/slide-library` — owns `slide_library_entry`, `library_version`, search/filter via OpenSearch/Elasticsearch index.
2. Implement library scopes: workspace, team, org.
3. Implement library publish workflow with approval gate (configurable per scope).
4. Implement reference vs. copy insert toggle; reference creates an `auto_update_binding` row.
5. Build `services/auto-update-bus` — the propagation fabric for library writes to consumers.
6. Implement the hybrid write-through + lazy model: write-through for mandatory updates, lazy for opt-in.
7. Implement per-reference schedule (`immediate`, `scheduled` with cron, `on-publish`, `manual`, `frozen`).
8. Implement consumer-side conflict detection: an incoming update that conflicts with a local edit triggers a conflict UI and pauses propagation for that consumer.
9. Implement `supersedes` / `superseded_by` chain; a retired entry cannot be the head.
10. Implement backpressure: sharded propagation so a 10k-binding consumer completes within p95 ≤ 60 s.

**Files / packages touched.**

- `/services/slide-library/` (new)
- `/services/auto-update-bus/` (new)
- `/services/auto-update-bus/internal/consumer/per_binding_worker.go` (new)
- `/db/postgres/migrations/<ts>_slide_library.sql` (new)
- `/db/postgres/migrations/<ts>_auto_update_binding.sql` (new)
- `/packages/search/slide-library-index/` (new — OpenSearch client)
- `/apps/editor/canvas/library-browser/` (new)

**Contracts added.**

- `POST /api/v1/library/entries` REST.
- `GET /api/v1/library/entries?q=...&tag=...` REST.
- `POST /api/v1/library/entries/{id}/retire` REST.
- `POST /api/v1/decks/{deck_id}/slides/insert-from-library` REST.
- `library.entry_published`, `library.entry_updated`, `library.entry_retired` events on Kafka.
- `auto_update.required`, `auto_update.applied`, `auto_update.conflict` events on Kafka.

**Tests written.**

- Unit: retired-head chain enforcement; reference vs. copy distinction.
- Integration: library publish → 10k-binding propagation in p95 ≤ 60 s.
- Performance: search + filter on 10k-entry library in p95 ≤ 300 ms.

**Definition of Done.**

- Library publish → propagate → consumer-update verified end-to-end.
- Conflict UI surfaces on consumer side; propagation paused until resolved.
- Mandatory updates prioritized over opt-in.

---

### W8 — Expiry policy scheduler

**Sub-owner:** Expiry lead
**Goal:** Daily scan with three-tier escalation; AI-assisted freshness verification.

**Tasks.**

1. Build `services/expiry-scheduler` — daily run scanning all resources for upcoming and overdue windows.
2. Implement three escalation tiers: **gentle** (badge only), **moderate** (badge + notification), **strict** (badge + notification + auto-revoke external share).
3. Implement the freshness dashboard `GET /api/v1/workspaces/{id}/expiry-dashboard`.
4. Implement the `content_health` API for governance dashboards (#194).
5. Integrate with the AI freshness checker (#125) for auto-confirmation on data-driven slides.
6. Implement inheritance from workspace defaults; override per resource.
7. Implement auto-revoke pipeline: on strict-mode overdue, external share links revoked within p95 ≤ 30 s.
8. Implement compliance: legal-hold on a resource pauses its retention clock.

**Files / packages touched.**

- `/services/expiry-scheduler/` (new)
- `/services/expiry-scheduler/internal/scan/scheduler.go` (new)
- `/services/expiry-scheduler/internal/escalation/tiers.go` (new)
- `/db/postgres/migrations/<ts>_expiry.sql` (new — `expiry_policy`, `freshness_flag`)
- `/apps/dashboard/freshness/` (new)

**Contracts added.**

- `POST /api/v1/resources/{type}/{id}/expiry-policy` REST.
- `POST /api/v1/resources/{type}/{id}/confirm-freshness` REST.
- `GET /api/v1/workspaces/{id}/expiry-dashboard` REST.
- `expiry.policy_triggered`, `expiry.flag_applied`, `expiry.share_revoked` events on Kafka.

**Tests written.**

- Unit: tier logic; auto-revoke on overdue.
- Integration: AI freshness auto-confirm verified on synthetic data-driven slide.
- Performance: 100k-resource scan completes in ≤ 10 min.

**Definition of Done.**

- Scheduler run completes within 10 min for 100k resources.
- Strict-mode auto-revoke verified within p95 ≤ 30 s.
- Inheritance + override combined correctly.

---

### W9 — Notification fan-out + Slack/Teams adapters

**Sub-owner:** Notifications lead
**Goal:** Multi-channel routing, slash commands, action buttons, DND awareness, digest batching.

**Tasks.**

1. Build `services/notification-fanout` — subscribes to event bus; routes to in-app, email, Slack, Teams, meeting adapters.
2. Build `services/slack-adapter` and `services/teams-adapter` — incoming webhook senders + slash command receivers + interactive payload handlers.
3. Implement deep links in notifications (back to the deck / slide / comment).
4. Implement action buttons (Approve, Reject, Open, Resolve) with idempotent handlers.
5. Implement DND / quiet-hours check before sending; quiet-hours users get morning digests.
6. Implement mention-driven notification deduplication: 5 mentions in 30 s → single digest.
7. Implement per-resource subscription model + admin-configurable routing (e.g., `#legal-approvals`, `#design-reviews`).
8. Implement rate-limit + retry with exponential backoff; fallback to email on Slack/Teams outage.
9. Implement HMAC-SHA256 signed payloads and signing-secret verification on inbound.

**Files / packages touched.**

- `/services/notification-fanout/` (new)
- `/services/slack-adapter/` (new)
- `/services/teams-adapter/` (new)
- `/services/notification-fanout/internal/digest/batch.go` (new)
- `/db/postgres/migrations/<ts>_notification_subscription.sql` (new)
- `/apps/settings/integrations/` (new — admin OAuth connection UI)

**Contracts added.**

- `POST /api/v1/webhooks/slack/events` REST.
- `POST /api/v1/webhooks/slack/commands` REST.
- `POST /api/v1/webhooks/slack/interactivity` REST.
- `POST /api/v1/webhooks/teams/events` REST.
- `POST /api/v1/webhooks/teams/commands` REST.

**Contracts consumed.** All P18 events; P07 brand-locked region rules.

**Tests written.**

- Unit: digest batch math; DND check; idempotent action handlers.
- Integration: end-to-end Slack/Teams sandbox test.
- Security: unsigned requests rejected; > 5-min stale requests rejected.

**Definition of Done.**

- Mention-to-notification p95 ≤ 5 s.
- DND awareness verified.
- Rate-limit + retry tested on simulated Slack/Teams outage.

---

### W10 — Meeting tool integrations (Zoom, Meet, Teams)

**Sub-owner:** Meeting integrations lead
**Goal:** Native in-meeting apps with participation features intact; recording markers per slide.

**Tasks.**

1. Build `services/meeting-integration` — common framework + per-vendor adapters.
2. Implement three integration patterns per vendor: in-meeting app SDK, deep-link fallback, OAuth-driven API.
3. Implement OAuth flows for Zoom, Google Meet, Microsoft Teams.
4. Implement session token exchange scoped to `(meeting_id, presenter_id, deck_id)`; tokens expire 1 h after meeting end.
5. Implement bidirectional sync: meeting chat / participants / recording state visible in presenter view (optional, configurable).
6. Implement participation event sync: a poll submitted in Teams surfaces in Domio and vice versa.
7. Implement recording markers: time-stamped per slide transition; encoded into vendor recording metadata where supported.
8. Implement rate-limit handling with exponential backoff; no critical state-change events dropped.
9. Implement presenter failover hook: vendor SDK deprecation falls back to deep-link with reduced feature set; banner in presenter view.

**Files / packages touched.**

- `/services/meeting-integration/` (new)
- `/services/meeting-integration/adapters/zoom.go` (new)
- `/services/meeting-integration/adapters/meet.go` (new)
- `/services/meeting-integration/adapters/teams.go` (new)
- `/db/postgres/migrations/<ts>_meeting_integration.sql` (new)

**Contracts added.**

- `POST /api/v1/webhooks/meetings/zoom` REST.
- `POST /api/v1/webhooks/meetings/teams` REST.
- `POST /api/v1/webhooks/meetings/google` REST.
- `meeting.session_started`, `meeting.session_ended` events on Kafka.

**Tests written.**

- Unit: token scope; rate-limit math; vendor failure modes.
- Integration: end-to-end Zoom / Meet / Teams sandbox test.
- Edge: vendor SDK deprecation falls back to deep-link cleanly.

**Definition of Done.**

- All three vendors integrated with bidirectional chat sync.
- Recording markers verified in vendor recording metadata.
- Rate-limit handling verified under burst.

---

### W11 — Calendar integration

**Sub-owner:** Calendar lead
**Goal:** OAuth calendar access; deck linked to event; pre-meeting prompt; bidirectional sync.

**Tasks.**

1. Build `services/calendar-integration` — owns `calendar_link`; OAuth flows for Google Calendar, Outlook, iCloud.
2. Implement deck-to-event link: `POST /api/v1/calendar/links` and surfacing in event description.
3. Implement pre-meeting prompt: 5 min before scheduled meeting (configurable per user), notification asks "Open in presenter mode?"
4. Implement bidirectional sync where vendor supports (Google, Outlook): moving the event in the vendor updates the linked reminder.
5. Implement recurring-meeting awareness: link at series level + per-instance override.
6. Implement presenter-view "Today" view showing linked decks with attendee + agenda details.
7. Implement pre-meeting ambient mode hook (#210).
8. Implement recording consent flow: if the meeting is recorded, presenter view prompts for attendee notification per vendor rules + GDPR / PDPA.

**Files / packages touched.**

- `/services/calendar-integration/` (new)
- `/services/calendar-integration/adapters/google.go` (new)
- `/services/calendar-integration/adapters/outlook.go` (new)
- `/services/calendar-integration/adapters/icloud.go` (new)
- `/db/postgres/migrations/<ts>_calendar_link.sql` (new)
- `/apps/presenter-view/today/` (new)

**Contracts added.**

- `POST /api/v1/webhooks/calendar/google` REST.
- `POST /api/v1/webhooks/calendar/outlook` REST.
- `calendar.event_linked`, `calendar.event_updated` events on Kafka.

**Tests written.**

- Unit: bidirectional sync math; recurring-meeting instance resolution.
- Integration: end-to-end OAuth → link → pre-meeting prompt.
- Edge: calendar access revoked → integration falls back cleanly.

**Definition of Done.**

- Bidirectional sync p95 ≤ 30 s vendor → Domio; ≤ 5 s Domio → vendor.
- Pre-meeting prompt fires within 5 min of event start.
- Recurring-meeting instance overrides work.

---

### W12 — Task-manager integrations (Asana, Jira, Linear)

**Sub-owner:** Task managers lead
**Goal:** Two-way sync with declarative field mapping; project mapping; bulk operations.

**Tasks.**

1. Build `services/task-manager-integration` — per-vendor adapters + common framework.
2. Implement OAuth (where available) or API-token auth for each vendor.
3. Implement project mapping config: which Asana project / Jira project / Linear team maps to which Domio workspace/folder.
4. Implement field mapping: assignment status ↔ task status, assignee, due date, description (slide link).
5. Implement custom-field mapping (e.g., priority, epic).
6. Implement two-way sync with conflict resolution: `domio_wins`, `task_wins`, `last_write_wins` selectable per workspace.
7. Implement bulk operations: status change on a parent task in the task manager cascades to child assignments in Domio within p95 ≤ 30 s.
8. Implement webhook receivers for vendor-side changes.
9. Implement outbound webhook emitter for assignment events.

**Files / packages touched.**

- `/services/task-manager-integration/` (new)
- `/services/task-manager-integration/adapters/asana.go` (new)
- `/services/task-manager-integration/adapters/jira.go` (new)
- `/services/task-manager-integration/adapters/linear.go` (new)
- `/db/postgres/migrations/<ts>_task_link.sql` (new)

**Contracts added.**

- `POST /api/v1/webhooks/tasks/asana` REST.
- `POST /api/v1/webhooks/tasks/jira` REST.
- `POST /api/v1/webhooks/tasks/linear` REST.
- `task.sync_requested`, `task.sync_completed` events on Kafka.

**Tests written.**

- Unit: field mapping; conflict resolution modes.
- Integration: end-to-end Asana / Jira / Linear sandbox sync.
- Bulk: parent task status change cascades to 100 child assignments ≤ 30 s.

**Definition of Done.**

- Two-way sync p95 ≤ 10 s per change.
- Bulk cascade verified within p95 ≤ 30 s.
- Vendor rate-limit handling verified.

---

### W13 — Guest access manager

**Sub-owner:** Guest access lead
**Goal:** Scoped, expiring access for guests with magic-link auth and audit-distinct identity.

**Tasks.**

1. Build `services/guest-access` — owns `guest_access`; magic-link generation + verification.
2. Implement invite flow: `POST /api/v1/guests` with `scope_type` (folder, project, deck), `scope_id`, `capabilities[]`, `expires_at`.
3. Implement scoped permission enforcement: guests get only the union of granted capabilities; cross-resource access returns `403`.
4. Implement magic-link auth: single-use within TTL (default 15 min); bound to guest email; resending invalidates prior links.
5. Implement expiry enforcement: every request checks `guest_access.expires_at > now()`; active sessions invalidated within p95 ≤ 5 s.
6. Implement audit-distinct identity: every guest action tagged `actor_type=guest` with the original `inviter_id` in the audit log.
7. Implement default restricted capability set: `comment`, `suggest`, `view` only; opt-in `edit` per invite.
8. Implement guest content access: as of access-grant time; not retroactively removed unless resource is fully revoked.
9. Implement download/export disabled by default; opt-in per invite.

**Files / packages touched.**

- `/services/guest-access/` (new)
- `/services/guest-access/internal/magiclink/signer.go` (new)
- `/db/postgres/migrations/<ts>_guest_access.sql` (new)
- `/apps/magic-link-landing/` (new — single-use landing page)

**Contracts added.**

- `POST /api/v1/guests` REST.
- `DELETE /api/v1/guests/{id}` REST.
- `guest.access_granted`, `guest.access_revoked` events on Kafka.

**Tests written.**

- Unit: magic-link single-use; expiry math; scope enforcement.
- Integration: invite → magic link → access → expire → revoke.
- Security: cross-resource access returns 403.

**Definition of Done.**

- Magic-link single-use verified.
- Expiry within p95 ≤ 5 s.
- Audit log tags verified.

---

### W14 — Library UI + comment-side panel + MR UI

**Sub-owner:** Frontend integration lead
**Goal:** Surface all P18 surfaces in the editor / dashboard UI with consistent UX.

**Tasks.**

1. Build `apps/editor/canvas/comment-side-panel/` — grouped by element/slide with filters (status / author / date / "mentioning me").
2. Build `apps/editor/canvas/approval-dialog/` — multi-lane parallel approval UX.
3. Build `apps/editor/canvas/assignment-overlay/` — slide panel chips + Gantt timeline view.
4. Build `apps/editor/canvas/suggestion-mode/` — toggle UI + suggestion panel.
5. Build `apps/editor/canvas/merge-request/` — MR creation + visual diff viewer.
6. Build `apps/editor/canvas/library-browser/` — search / filter / governance panel.
7. Build `apps/editor/canvas/integrations-settings/` — Slack/Teams/Calendar/Task Manager OAuth UIs.
8. Build `apps/editor/canvas/guest-invite/` — invite dialog with scope + expiry picker.
9. Apply a11y pass: keyboard operable, ARIA-live where appropriate, screen-reader friendly.

**Files / packages touched.**

- Multiple paths under `/apps/editor/canvas/`.
- `/apps/settings/integrations/` (new).
- `/packages/ui-kit/comments/` (new).

**Contracts consumed.** All W1–W13 APIs.

**Tests written.**

- Unit: keyboard nav; ARIA-live correctness.
- Integration: end-to-end from comment to Slack notification.
- Visual regression: each panel screenshot diffed.
- A11y: axe-core 0 critical violations on every new route.

**Definition of Done.**

- All 9 surfaces rendering correctly.
- axe-core 0 critical.
- Manual screen-reader pass on every surface.

---

## 5. Architecture & data

This phase introduces fourteen new services, one new worker package, and approximately twenty new tables. References: `/docs/04-system-architecture.md` (component map), `/docs/05-data-database-design.md` (entity model, retention), `/docs/06-technology-stack.md` (Postgres, NATS, Kafka, OpenSearch), `/docs/07-security-planning.md` (PII, DLP, audit), `/docs/collaboration-workflow.md` (full functional + non-functional spec).

### New services

| Service                             | Responsibility                                       | Owns                                                                |
| ----------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| `services/permission-engine`        | Typed resolution, deny-first, historical queries     | `workspace`, `workspace_member`, `group_member`, `permission_grant` |
| `services/comment-service`          | Element-pinned comments, threads, mentions           | `comment`, `comment_thread`, `mention`                              |
| `services/approval-engine`          | Strict state machine, parallel lanes, SLA escalation | `approval_request`, `approval_decision`                             |
| `services/assignment-service`       | Slide-level scope, multi-assignee, status            | `assignment`                                                        |
| `services/suggestion-service`       | CRDT-isolated parallel branch, semantic diff         | `suggestion`                                                        |
| `services/merge-request`            | MR lifecycle, conflict UI                            | `merge_request`, `slide_diff`                                       |
| `services/slide-library`            | Governed pool, search, versioning                    | `slide_library_entry`, `library_version`                            |
| `services/auto-update-bus`          | Write-through + lazy propagation                     | `auto_update_binding`                                               |
| `services/expiry-scheduler`         | Daily scan, three tiers, AI freshness                | `expiry_policy`, `freshness_flag`                                   |
| `services/notification-fanout`      | Multi-channel routing                                | `notification_subscription`                                         |
| `services/slack-adapter`            | Slack webhook + slash + interactivity                | (consumes events)                                                   |
| `services/teams-adapter`            | Teams webhook + slash + adaptive cards               | (consumes events)                                                   |
| `services/meeting-integration`      | Zoom / Meet / Teams in-meeting app                   | `meeting_integration`                                               |
| `services/calendar-integration`     | Google / Outlook / iCloud OAuth                      | `calendar_link`                                                     |
| `services/task-manager-integration` | Asana / Jira / Linear adapters                       | `task_link`                                                         |
| `services/guest-access`             | Magic-link, scoped, expiring                         | `guest_access`                                                      |

### New workers

| Worker                                    | Trigger                 | Purpose                                                                                   |
| ----------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------- |
| `workers/diff-engine`                     | MR open                 | compute three-level diff (long-running)                                                   |
| `workers/library-propagator`              | `library.entry_updated` | fan-out to consumer bindings                                                              |
| `workers/expiry-scanner`                  | nightly                 | scan + flag + escalate                                                                    |
| `workers/bangladesh-residency-reconciler` | 1 h loop                | enforce `apac` shard for BD viewers (per `/docs/11-legal-compliance-bangladesh.md` §11.2) |

### New apps

| App                                                                                                                    | Type           | Purpose                       |
| ---------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------------- |
| `apps/magic-link-landing`                                                                                              | Web (React)    | single-use guest landing page |
| `apps/settings/integrations`                                                                                           | Web (React)    | admin OAuth connection UI     |
| `apps/editor/canvas/{comments,approval,assignment,suggestion,merge-request,library-browser,integrations,guest-invite}` | Web components | in-editor surfaces            |

### New tables (Postgres, consolidated into migration files)

- **`<ts>_workspace_permissions.sql`**: `workspace`, `workspace_member`, `group_member`, `permission_grant`.
- **`<ts>_comments.sql`**: `comment`, `comment_thread`, `mention`.
- **`<ts>_approval.sql`**: `approval_request`, `approval_decision`.
- **`<ts>_assignment.sql`**: `assignment`.
- **`<ts>_suggestion.sql`**: `suggestion`.
- **`<ts>_merge_request.sql`**: `merge_request`, `slide_diff`.
- **`<ts>_slide_library.sql`**: `slide_library_entry`, `library_version`.
- **`<ts>_auto_update_binding.sql`**: `auto_update_binding`.
- **`<ts>_expiry.sql`**: `expiry_policy`, `freshness_flag`.
- **`<ts>_notification_subscription.sql`**: `notification_subscription`.
- **`<ts>_meeting_integration.sql`**: `meeting_integration`.
- **`<ts>_calendar_link.sql`**: `calendar_link`.
- **`<ts>_task_link.sql`**: `task_link`.
- **`<ts>_guest_access.sql`**: `guest_access`.

Detailed DDL is in `/docs/collaboration-workflow.md` §5 (verbatim). Key columns to call out:

- `comment.anchor` — JSONB element-relative + slide-relative fractional offsets.
- `suggestion.operation` — JSONB structured CRDT op (not raw text).
- `slide_diff.{slide_diffs, binding_diffs}` — JSONB three-level diff payload.
- `auto_update_binding.schedule` — JSONB cron config.
- `permission_grant.{effective_from, effective_to}` — temporal range for historical queries.
- `guest_access.expires_at` — server-enforced expiry.

### New contracts

- `contracts/openapi/v1/collaboration.yaml` — REST surface for all 14 services (comments, approval, assignments, suggestions, MR, library, expiry, integrations).
- `contracts/proto/domio/v1/collaboration.proto` — gRPC interface for cross-service calls.
- `contracts/events/collaboration/*.json` — JSON schemas for every event topic (comment._, approval._, assignment._, suggestion._, merge_request._, library._, auto_update._, expiry._, guest.\*).
- `contracts/openapi/v1/webhooks/{slack,teams,calendar,tasks,meetings}.yaml` — inbound webhook contracts.

### Cross-cutting considerations

- **Element-relative anchors.** `comment.anchor` stores fractional offsets (0..1) within the element's bounding box plus a fallback slide-relative offset. Critical for surviving layout changes and real-time multiplayer drag.
- **Immutability of approval snapshots.** `approval_request.version_id` references an immutable deck version; any subsequent edit creates a new version and a new approval cycle.
- **Append-mostly tables.** `comment`, `approval_decision`, `suggestion`, `merge_request`, `assignment` are partitioned by `created_at` monthly for retention and query speed.
- **Soft delete.** `permission_grant`, `workspace_member`, `guest_access` use `effective_to` for historical correctness — never hard delete.
- **Deny-first resolution.** Permission engine evaluates explicit denies before inherited allows; verified by exhaustive property test.
- **Audit-distinct guest identity.** Every guest action tagged `actor_type=guest` with the original `inviter_id` in the audit log.
- **Bangladesh residency.** Guest data, comment data, and library entries of Bangladeshi viewers are pinned to `apac` region; no foreign mirror per `/docs/11-legal-compliance-bangladesh.md` §11.2.
- **Brand-lock enforcement.** Slide library entries, suggestions, MRs, and guest invites all respect brand locks; lock-break requires `break_brand_lock` capability.

---

## 6. Verification matrix

| Feature            | Test                                                                                                               | Expected result                                                       | Owner               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------- |
| #179 comments      | Pin comment to element, drag element 100px                                                                         | Pin translates with element; no jitter at 60 fps                      | Comments lead       |
| #179 comments      | Delete element with 5 comments                                                                                     | Pins promote to slide with `orphaned=true`; threads remain            | Comments lead       |
| #179 comments      | Mention 5 users in <30 s                                                                                           | Single digest delivered p95 ≤ 5 s                                     | Comments lead       |
| #179 comments      | 5,000 comments / 200 slides                                                                                        | Panel loads in p95 ≤ 1 s (pagination + lazy)                          | Comments lead       |
| #180 approval      | Submit for review with 3 parallel lanes                                                                            | All 3 approvers notified; each decides independently                  | Approval lead       |
| #180 approval      | Edit deck after approval                                                                                           | New version; previous approval auto-revokes if external share existed | Approval lead       |
| #180 approval      | Approve SLA overdue                                                                                                | Escalation to fallback approver within SLA window                     | Approval lead       |
| #180 approval      | External share attempted while pending                                                                             | `403 external_share_requires_approval`                                | Approval lead       |
| #181 assignments   | Assign slides 4–7 to Priya with 2 watchers                                                                         | Primary + watchers see assignment; status rollup uses primary         | Assignments lead    |
| #181 assignments   | Set status to `blocked` without reason                                                                             | Rejected with `reason_required`                                       | Assignments lead    |
| #181 assignments   | Reassign mid-flow                                                                                                  | Original preserved in audit; new assignee notified                    | Assignments lead    |
| #182 suggestions   | Reviewer in suggestion mode moves chart 40px right                                                                 | Suggestion captured as CRDT op, not raw text                          | Suggestions lead    |
| #182 suggestions   | Suggestion on brand-locked region                                                                                  | Authored; accept denied                                               | Suggestions lead    |
| #182 suggestions   | 2 suggestions on same element                                                                                      | Conflict detected on second accept; merge / override / abort UI       | Suggestions lead    |
| #182 suggestions   | Element deleted before accept                                                                                      | Suggestion auto-resolves as `obsolete`                                | Suggestions lead    |
| #183 MR            | Open MR with 3 slides added, 1 removed, 5 modified                                                                 | Three-level diff rendered; visual diff at 60 fps                      | MR lead             |
| #183 MR            | Run linting hook on MR with off-brand color                                                                        | Validation failure; merge blocked                                     | MR lead             |
| #183 MR            | Target branch has moved on since branch                                                                            | 3-way merge conflict UI; resolve → re-run hooks                       | MR lead             |
| #183 MR            | 500-slide deck open MR                                                                                             | Diff computed in p95 ≤ 15 s                                           | MR lead             |
| #184 permissions   | Workspace editor + project deny `share_external`                                                                   | User cannot share externally from that project                        | Permissions lead    |
| #184 permissions   | Historical query `at_time=2026-06-01`                                                                              | Returns period-correct effective set                                  | Permissions lead    |
| #184 permissions   | 1k req/s cached                                                                                                    | p95 < 50 ms; cache hit rate > 90%                                     | Permissions lead    |
| #185 library       | Publish slide to library with one approver                                                                         | Approval gate; published after approval                               | Library lead        |
| #185 library       | Insert library slide as reference                                                                                  | `auto_update_binding` row created; library badge shown                | Library lead        |
| #185 library       | Search 10k-entry library with filters                                                                              | p95 ≤ 300 ms                                                          | Library lead        |
| #186 auto-update   | Update library master; 400 consumer decks                                                                          | All receive within p95 ≤ 60 s (write-through)                         | Auto-update lead    |
| #186 auto-update   | Mandatory update with consumer-local conflict                                                                      | Conflict UI surfaces immediately; propagation paused                  | Auto-update lead    |
| #186 auto-update   | Freeze reference                                                                                                   | Slide panel shows "frozen as of <date>"                               | Auto-update lead    |
| #187 expiry        | Set interval=90 days, tier=strict on a slide                                                                       | After 90 days, badge + notification + auto-revoke share               | Expiry lead         |
| #187 expiry        | AI freshness auto-confirm on data-driven slide                                                                     | Auto-confirmed; no manual review needed                               | Expiry lead         |
| #187 expiry        | 100k-resource scan                                                                                                 | Completes within 10 min                                               | Expiry lead         |
| #188 meeting       | Present in Teams meeting                                                                                           | In-meeting app opens; presenter controls work                         | Meeting lead        |
| #188 meeting       | Audience polls in Teams                                                                                            | Results surface in Domio presenter view                               | Meeting lead        |
| #188 meeting       | Vendor SDK deprecation                                                                                             | Falls back to deep-link with banner                                   | Meeting lead        |
| #189 notifications | Comment with `@priya` mention                                                                                      | Slack/Teams notification within 5 s with deep link                    | Notifications lead  |
| #189 notifications | Slack/Teams outage                                                                                                 | Events queue; flush on recovery; fallback to email                    | Notifications lead  |
| #189 notifications | Action button click "Approve"                                                                                      | Idempotent: 2 clicks → 1 approval                                     | Notifications lead  |
| #190 calendar      | OAuth Google → link deck to event                                                                                  | Link visible in event description                                     | Calendar lead       |
| #190 calendar      | Move event in Google Calendar                                                                                      | Domio reminder updated within p95 ≤ 30 s                              | Calendar lead       |
| #190 calendar      | 5 min before meeting                                                                                               | Pre-meeting prompt fires                                              | Calendar lead       |
| #191 tasks         | Asana task status → Domio assignment                                                                               | Two-way sync within p95 ≤ 10 s                                        | Tasks lead          |
| #191 tasks         | Bulk: parent status change cascades to 100 children                                                                | All updated within p95 ≤ 30 s                                         | Tasks lead          |
| #191 tasks         | Sync conflict (both updated same minute)                                                                           | Configurable resolution; default last-write-wins                      | Tasks lead          |
| #192 guests        | Invite guest with scope=deck, expires_at=7d                                                                        | Magic link sent; access expires within 5 s of expiry                  | Guest lead          |
| #192 guests        | Guest attempts cross-resource access                                                                               | `403 out_of_scope`                                                    | Guest lead          |
| #192 guests        | Guest edit action                                                                                                  | Audit log entry: `actor_type=guest`, `inviter_id=<id>`                | Guest lead          |
| Cross-cutting      | axe-core scan of every P18 route                                                                                   | 0 critical violations                                                 | a11y reviewer       |
| Cross-cutting      | Manual screen-reader pass on all 14 surfaces                                                                       | All flows keyboard-operable, ARIA-live where expected                 | a11y reviewer       |
| Security           | Forge magic-link token                                                                                             | Rejected                                                              | Security reviewer   |
| Security           | DLP scan on comment with flagged term                                                                              | Warning surfaced; user confirms or edits                              | Security reviewer   |
| Compliance         | PDPA right-to-erasure on a guest                                                                                   | Guest `guest_access` soft-deleted; comment anonymized                 | Compliance reviewer |
| Scale              | **1,000-deck workspace load test** — 1k decks, 5k comments, 100 MRs open, 50 guests invite, all 14 features active | All latency targets met; no service OOM                               | SRE lead            |

---

## 7. Risks & open decisions

| Risk                                                           | Likelihood | Impact | Mitigation                                                                                   |
| -------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------------------------------- |
| Slack/Teams API rate limits during burst moments               | Med        | Med    | Token bucket + exponential backoff per adapter; queue with persisted backlog                 |
| Library propagation at 10k bindings breaches p95 ≤ 60 s        | Med        | High   | Sharded fan-out workers; pre-aggregate per-shard metrics; benchmark in W7                    |
| MR diff for 500-slide deck in p95 ≤ 15 s                       | Med        | High   | Background diff worker; pre-cache tile renders; pre-compute element-level diff incrementally |
| Calendar bidirectional sync races (vendor push vs. Domio push) | Med        | Med    | Conflict-resolution policy: vendor-wins after a max-wait window; UI surfaces last-writer     |
| Suggestion-mode isolation accidentally affects main branch     | Low        | High   | Strict CRDT sub-doc; pre-merge validation that suggestion ops target only isolated sub-doc   |
| Permission engine cache staleness on revoke                    | Med        | High   | Invalidate-on-write + TTL ≤ 60s; audit log of cache invalidations                            |
| Guest magic-link replay                                        | Low        | High   | Single-use TTL (15 min); server-side consumed-token store                                    |
| Bangladesh residency for click-to-comment from a foreign IP    | Med        | Med    | Region-pinned write path; cross-region replication disabled for residency-locked viewers     |
| Browser-based in-meeting app SDK gaps                          | Med        | Med    | Deep-link fallback path; feature-detect at runtime; banner in presenter view                 |
| Approval state-machine invariant violations via race           | Low        | High   | Postgres row-level lock on `approval_request`; optimistic concurrency `version` column       |
| Task-manager API rate limits during bulk                       | Med        | Med    | Batched sync; back-off; rate-limit per vendor token bucket                                   |

Open decisions (with proposed default):

- **Org-level library scope.** Default: ship workspace + team scopes; org-level UI deferred to P22.
- **Cross-workspace guest invitations.** Default: single-workspace only in P18.
- **Bidi Slack/Teams thread sync.** Default: one-way Domio → Slack/Teams only in P18; full bidi in P22.
- **Bangla (bn-BD) UI strings for library browser.** Default: i18n strings defined; translation deferred to P22.
- **Approval on a branch vs. default branch.** Default: approval always on the default branch's HEAD; approval on a non-default branch surfaces "deploy first then approve" prompt.

---

## 8. Demo

The internal demo proves all fourteen features end-to-end on a 1,000-deck workspace simulation plus one live meeting. Demo script:

**Pre-demo (T-30 min).**

1. Reset staging; deploy `phase-18-internal` tag to all services.
2. Seed one workspace with five decks:
   - **"Q3 Board Update"** — 12 slides, requires `legal_required + brand_required` approval.
   - **"Sales Deck"** — 8 slides, has assignments, library references.
   - **"Product Launch"** — 30 slides, has a branch `priya/experiment-pricing`.
   - **"HR Onboarding"** — 20 slides, hosted in slide library with mandatory auto-update.
   - **"Training Compliance"** — 25 slides, expiry policy `interval=90d, tier=strict`.
3. Connect Slack workspace (`#sales-alerts`, `#design-reviews`), Teams tenant, Google Calendar, Asana project, Salesforce sandbox.
4. Invite 3 guests with scoped access (one to a specific deck, one to a folder, one to a project) with different expirations.
5. Spin up 5 collaborative editors (Alice, Priya, Bob, Carol, Dave) — suggestions mode for 2 of them.

**Live demo script (T-0).**

| T+    | Action                                                      | What we watch                                                            |
| ----- | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| 0:00  | Alice opens Q3 Board Update in editor                       | Permission panel shows Alice's capabilities                              |
| 0:30  | Bob right-clicks a chart on slide 4 → "Add comment"         | Pin appears anchored to element; comment composer opens                  |
| 1:00  | Bob types `@priya @designers` and a PII-pattern email       | PII warning surfaces; mention autocomplete resolves                      |
| 1:30  | Priya receives Slack notification with deep link            | p95 ≤ 5 s; action button "Open" included                                 |
| 2:00  | Alice assigns slides 4–7 to Priya with due date             | Status chip on slide panel; Gantt timeline updates                       |
| 2:30  | Priya opens in suggestion mode (`Cmd+I`)                    | Suggestion indicator; cursor style changes                               |
| 3:00  | Priya moves chart 40px right → suggestion                   | Suggestion captured as CRDT op; not applied to live deck                 |
| 3:30  | Alice accepts suggestion                                    | Element moves; audit log entry: "Accepted from Priya's suggestion"       |
| 4:00  | Bob opens "Present in Teams" → joins next Teams meeting     | In-meeting app opens inside Teams chrome                                 |
| 4:30  | Alice opens MR from `priya/experiment-pricing` → `main`     | Three-level diff computed in 3 s; visual diff rendered                   |
| 5:00  | Alice approves MR                                           | Linting hooks pass; merge atomic; new version on main                    |
| 5:30  | Alice submits Q3 Board Update for review                    | Approval request created; legal + brand notified                         |
| 6:00  | Legal approves; brand still pending                         | Approval status: `partial`; external share blocked                       |
| 6:30  | Carol inserts library slide "Standard Pricing" as reference | Auto-update binding created; library badge shown                         |
| 6:45  | Library owner updates "Standard Pricing"                    | Consumer's slide update propagates within 8 s (write-through)            |
| 7:00  | Training Compliance crosses 90-day expiry                   | Badge + notification; strict mode auto-revokes external share            |
| 7:30  | Priya opens calendar "Today" view                           | Linked decks appear with meeting attendees                               |
| 8:00  | 5 min before scheduled meeting                              | Pre-meeting prompt fires: "Open in presenter mode?"                      |
| 8:30  | Carol opens Asana task → status changes to "In Progress"    | Domio assignment status syncs within 6 s                                 |
| 9:00  | Guest access expires mid-session                            | Active session invalidated within 5 s; "session expired" page shown      |
| 9:30  | Compliance test: erasure request for guest                  | Guest access soft-deleted; comment anonymized; audit log entry preserved |
| 10:00 | Guest attempt cross-resource access                         | `403 out_of_scope`; logged                                               |
| 10:30 | Security test: forge magic-link token                       | Rejected; security alert fires                                           |
| 11:00 | All 14 features exercised; metrics dashboard reviewed       | All latency targets met                                                  |

**Pass criteria for "internal demo passed":**

- All 16 timing targets met (see Verification matrix).
- All security / privacy / compliance tests pass.
- axe-core 0 critical on every P18 route.
- Manual screen-reader pass on every surface.
- 1,000-deck workspace sustained for 12 min with no service crash.

---

## 9. Definition of Done

The phase is "done" only when **every** gate below passes:

- **Code merged.** All fourteen workstreams merged to `main`; PRs reviewed by at least two engineers (one from Stream F + one cross-stream).
- **Contracts versioned.** All new contracts in `/contracts/openapi/v1/`, `/contracts/proto/domio/v1/`, `/contracts/events/collaboration/`, `/contracts/openapi/v1/webhooks/` merged with semver bump; semver tag `phase-18-contracts-v1.0.0` cut.
- **Schema migrations applied.** Migration files applied to staging and previewed against production data; back-out plan documented.
- **Tests pass.** Unit, integration, load, security, privacy, accessibility tests all green in CI; load test report archived at `docs/development_phases/reports/phase-18-loadtest.md`.
- **Telemetry in place.** All metrics from `/docs/collaboration-workflow.md` §9.1 emitted and dashboarded in Grafana; alerts wired in PagerDuty; OTel trace propagation verified from API gateway through services through event bus through Slack/Teams.
- **Docs updated.** `/docs/collaboration-workflow.md` already exists; this phase doc is the implementation source of truth; `/docs/collaboration-runbook.md` (new) drafted with on-call procedures (comment storms, approval cascades, library propagation outages, guest expiry storms).
- **Compliance review.** Security reviewer signed off on permission engine deny-first, magic-link single-use, audit-distinct guest identity, DLP warning on comments, append-only audit log.
- **Bangladesh residency check.** All Bangladeshi viewer data pinned to `apac` region; no foreign mirror per `/docs/11-legal-compliance-bangladesh.md` §11.2.
- **Internal demo passed.** The script in §8 executes cleanly with all pass criteria met.
- **Design partner demo passed** (target). A design partner runs the script in their environment with their decks; no critical regressions.
- **Cross-cutting review by P20 lead.** Audit-log ingestion from `comment`, `approval_decision`, `suggestion`, `merge_request`, `library_version`, `guest_access` confirmed end-to-end.
- **Feature flags ready.** Every new feature behind a flag (`collab.comments`, `collab.approval`, `collab.assignments`, `collab.suggestions`, `collab.mr`, `collab.permissions`, `collab.library`, `collab.autoupdate`, `collab.expiry`, `collab.integrations.meeting`, `collab.integrations.slack`, `collab.integrations.teams`, `collab.integrations.calendar`, `collab.integrations.tasks`, `collab.guests`) with a kill-switch.
- **Wiring to MCP noted.** Collaboration tools documented for P13/P22 MCP surface (`comment.create`, `approval.request`, `assignment.create`, `suggestion.create`, `merge_request.open`, `library.search`, `library.insert`, `auto_update.configure`, `guest.invite`) — the actual MCP tools ship in P13/P22, not P18.
