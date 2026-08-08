# Domio Collaboration Runbook (Phase 18)

Status: **Phase 18 complete (2026-08-08)** — all 14 workstreams #179–192 shipped.
Wave 1: Foundation + core collaboration modules. Wave 2: Suggestions + merge requests + diff engine.
Wave 3: Library, auto-update, expiry + Wave-1 hardening. Wave 4: Meeting, Slack/Teams, Calendar, Task-manager integrations.
Wave 5: Guest access, share-api approval gate, apps/api mounting, remaining pg DML, editor surfaces, magic-link-landing.

## What Wave 1 shipped

### Foundation
- **Feature flags** — `infrastructure/feature-flags/phase-18.yaml`: 15 flags, all `default: false`
  (`collab.comments/approval/assignments/suggestions/mr/permissions/library/autoupdate/expiry/guests`,
  `collab.integrations.{meeting,slack,teams,calendar,tasks}`). Enforced via `FEATURE_<GROUP>_<NAME>_DISABLED`
  env kill-switch (see `services/collab/src/feature_flags.ts`).
- **Migrations** (`infrastructure/postgres/migrations/0064–0068`, up/down pairs, RLS tenant isolation on every table):
  - `0064_phase18_workspace_permissions` — `workspace`, `workspace_member` (role + capabilities + `effective_from/to`),
    `group_member` (join table), `permission_grant` (resource_type × principal_type, `capabilities[]`, `is_deny`, temporal window).
  - `0065_phase18_comments` — `comment` (deck_id, author_type, target_type/id, `anchor jsonb`, status, `emoji_reactions jsonb`,
    `attachments jsonb`, orphan flag), `mention` (user/role/group, notified_at/read_at).
  - `0066_phase18_approval_requests` — `approval_request` (`version_id`, `policy jsonb` {lanes:[{role,required,sla_hours}]},
    status draft→pending→approved|rejected|changes_requested), `approval_decision` (+`version_id`, per-lane), `approval_audit`.
  - `0067_phase18_assignments` — `assignment` (`slide_range int4range`, `primary_id`, `watchers uuid[]`, blocked_reason, due_at,
    completed_at, task_link_id), `assignment_history` (append-only status audit).
  - `0068_phase18_notifications_guests` — `notification_subscription` (event_types, channels, quiet_hours, digest_mode),
    `guest_access` (scope, capabilities, expires_at, revoked_at).
- **Contracts** — `contracts/openapi/v1/collab.yaml` (12 paths: comments, approvals, assignments, permissions; ProblemDetail errors);
  `contracts/events/collaboration/` 7 canonical event schemas sharing the envelope
  `{event_id, event_type, ts_ms, workspace_id, deck_id?, actor_id, actor_type, payload}`:
  `comment.created/resolved/mentioned`, `approval.requested/decision.recorded`, `assignment.created/status_changed`.

### Services
- **`services/permission-engine`** (#184) — deny-first resolver: resource ancestry
  workspace→folder→project→deck→slide, ancestor-deny blocks descendants, deny overrides allow, temporal
  `effective_from/to` windows, point-in-time (`at`) evaluation, group membership expansion, workspace-role baselines
  (owner/admin/editor/commenter/viewer). `PermissionService.check/require/createGrant/listGrants/checkHistorical`.
  Handlers: `POST /v1/permissions/grants`, `GET /v1/permissions/grants`, `POST /v1/permissions/check`. 72 tests (incl. pg_store).
  _Deviation from phase doc: TS not Go (repo convention; query-gateway ACL precedent)._
- **`services/collab`** (@domio/collab-service) —
  - **Comments (#179)**: element anchors (fractional 0..1 validated), thread inheritance from parent, `@user`/`@role:`/`@group:`
    mention parsing, email/phone PII warning (non-blocking), idempotent reactions, orphan promotion (target→slide),
    resolve w/ resolved_at/by. Emits `comment.created/resolved/mentioned`.
  - **Approvals (#180)**: state machine draft→pending→approved|rejected|changes_requested (→draft on edit via `backToDraft`),
    parallel lanes — approved only when ALL required lanes approve, any reject → rejected, changes_requested otherwise;
    SLA `overdueLanes()` computes fallback approver role; immutable `version_id` snapshot on submit. Emits
    `approval.requested/decision.recorded`.
  - **Assignments (#181)**: `slide_range` (start≥1, end≥start), primary + watchers, full status matrix
    (blocked REQUIRES blocked_reason; done sets completed_at), reassignment detected + audited. Emits
    `assignment.created/status_changed/reassigned`.
  - Handlers map for all 15 endpoints; store interface + in-memory impl + full pg DML
    (parameterized SQL, `withTransaction` for atomic comment+mentions). 117 tests.
- **`services/notification-dispatcher`** (#189 wiring) — subscribes `collab.events.*` (gated by `COLLAB_EVENTS_ENABLED`),
  maps `comment.mentioned`/`approval.requested`/`assignment.created`/`assignment.status_changed` → Slack + in-app
  notifications with deep links (`/decks/{id}/comments/{id}`, `/approvals/{id}`, `/assignments/{id}`), in-memory mention
  dedup (5/30s window → digest). Real NATS via `NatsSubscriptionManager` + `connectWithRetry`
  (`crm.sync.events` + `collab.events.>`, degraded mode on connect failure). Existing CRM path untouched. 89 tests.

## What Wave 3 shipped

### Migrations + contracts
- **Migrations** (`0069–0071`, RLS via DO$$ loop incl. WITH CHECK):
  - `0069_phase18_library` — `slide_library_entry` (scope workspace/org/team, `approval_chain jsonb`, status
    draft/pending/approved/retired, `version_id`, `superseded_by` chain), `library_version`
    (immutable `slide_snapshot jsonb`, `data_bindings jsonb`, `brand_locked`, UNIQUE(entry_id, version_num)).
  - `0070_phase18_auto_update` — `auto_update_binding` (consumer_deck_id + consumer_slide_id, `pinned_version_id`,
    mode immediate|scheduled|manual|frozen, `schedule jsonb` cron, `is_mandatory`, `last_synced_at/status`).
  - `0071_phase18_expiry` — `expiry_policy` (`interval_days`, escalation gentle/moderate/strict,
    `auto_revoke_share`), `freshness_flag` (reason policy_overdue|manual|ai_detected, resolved_at/by).
- **Contracts** — `collab.yaml` grew to 29 operationIds (tags library/auto-update/expiry); collaboration event schemas
  now **21 files**: +`library.entry_created/entry_published/entry_updated/entry_retired/version_added`,
  +`auto_update.required/applied/conflict/binding_created`, +`expiry.policy_triggered/flag_applied/share_revoked/notification/freshness_confirmed`.
  `actor_type` enum is now `[member, guest, agent, system]` across all 21 schemas (system actor for scanner/worker emissions).

### Services + workers
- **`services/library`** (#185) — entries (create/addVersion/publish draft→pending→approved/retire with supersedes
  chain — retired ≠ head), insert-from-library with reference-vs-copy toggle (reference creates an immediate binding),
  auto-update bindings CRUD. Emits `library.entry_created/entry_published/entry_retired/version_added`,
  `auto_update.binding_created/applied`. Store interface + mem impl + pg skeleton (nil-guarded). 51 tests.
- **`workers/library-propagator`** (#186) — `PropagatorWorker` (setInterval tick, `WORKER_TICK_MS` default 60s):
  `getPropagationCandidates` → `applyBinding`; frozen/manual modes skipped, `last_sync_status=conflict` pauses. 5 tests.
- **`services/expiry`** (#187) — policies CRUD w/ workspace-defaults inheritance, `scanResource` idempotent
  (gentle→flag, moderate→flag+notify, strict→flag+notify+revoke via injected `ShareRevoker`), `confirmFreshness`
  resolves flags. Emits `expiry.policy_triggered/flag_applied/notification/share_revoked/freshness_confirmed`.
  Store interface + mem impl + pg skeleton. 31 tests.
- **`workers/expiry-scanner`** (#187) — `ExpiryScannerWorker` tick loop; `resourceProvider` injection (default empty). 4 tests.

### Hardening (folded in)
- `services/collab/src/store/pg_store.ts` — full parameterized DML for all 14 methods + `withTransaction` (int4range
  half-open handling, jsonb, uuid[], dynamic UPDATE). 33 new tests (117 total).
- `services/permission-engine/src/pg_store.ts` — full pg implementation of all 4 repository interfaces (temporal
  effective_from/to filtering). 21 new tests (72 total).
- `services/notification-dispatcher` — real NATS `NatsSubscriptionManager` + `connectWithRetry` (degraded mode on
  failure), subscribes `crm.sync.events` + `collab.events.>`. 8 new tests (89 total).

## What Wave 2 shipped

### Migrations + contracts
- **Migrations** (`0072–0073`, RLS tenant isolation; `actor_type` enum `[member, guest, agent, system]`):
  - `0072_phase18_suggestions` — `suggestion` (deck_id, session_id, author_id, target_type element|slide|data_binding,
    target_id, `operation jsonb`, status open|accepted|rejected|obsolete, thread_id, resolved_at/by).
  - `0073_phase18_merge_requests` — `slide_diff` (`mr_id`, base/target/source_version_id, `slide_diffs jsonb`,
    `binding_diffs jsonb`, computed_at) created first, then `merge_request` (source_branch/target_branch TEXT, title,
    description, author_id, status open|approved|merged|closed|conflict, `diff_id` → slide_diff, merged_at/by,
    merge_commit_id). _Note: legacy phase-05 `merge_requests` (0009) stays with control-plane — untouched._
- **Contracts** — `collab.yaml` grew to **38 operationIds** (tags suggestions/merge-requests):
  +`createSuggestion/listSuggestions/acceptSuggestion/rejectSuggestion`,
  +`createMergeRequest/listMergeRequests/getMergeRequestDiffs/mergeMergeRequest/resolveMergeRequestConflict`.
  Collaboration event schemas now **28 files**: +`suggestion.created/accepted/rejected/obsolete`,
  +`merge_request.opened/merged/conflict_detected`.

### Services + workers
- **`services/suggestions`** (#182) — structured ops (move/resize/restyle/content/data_binding/theme; raw-text ops
  rejected), op-level semantic conflict detection (`detectOpConflict`, move-vs-resize, conflicting-obsolete cascade on
  accept), brand-lock (author ok / accept requires `break_brand_lock`), 90-day retention via `expires_at` + sweep,
  CRDT sub-doc isolation via Y.Doc (`createIsolatedBranch`, injected snapshot provider), pure `applyOp` deck
  transformer. Emits `suggestion.created/accepted/rejected/obsolete`. Store interface + mem impl + pg skeleton. 49 tests.
- **`services/merge-requests`** (#183) — 3-way diff ported from control-plane `computeDiff` and extended with
  data-binding diffs; 3 granularity levels (slide|element|data_binding via `SlideDiffLevel`), fast-forward vs 3-way
  (`isFastForward`), validation hooks (lint/brand/a11y via injected `validateMerge`, block merge on failure),
  atomic merge (withTransaction: apply resolved state, set merged + merge_commit_id). **Full pg DML** for
  `merge_request`/`slide_diff` (parameterized SQL, `withTransaction`). Emits
  `merge_request.opened/merged/conflict_detected`. 41 tests (diff 15, service 14, pg_store 12).
- **`workers/diff-engine`** (#183) — `DiffEngineWorker` (setInterval tick, `WORKER_TICK_MS` 60s, start/stop/runOnce);
  injected `MergeRequestProvider` + `ReplayProvider` (default in-memory; real crdt_logs replay later). runOnce →
  recompute diff for open MRs; conflicts → status `conflict` + emit `merge_request.conflict_detected`; fast-forward →
  auto-merge. 8 tests.

## What Wave 4 shipped

### Migrations + contracts
- **Migrations** (`0074–0076`, RLS tenant isolation via DO$$ loop incl. WITH CHECK):
  - `0074_phase18_meeting_integrations` — `meeting_integration` (workspace_id, vendor zoom|meet|teams, `auth jsonb`
    encrypted OAuth tokens, status disconnected|connecting|connected|error, connected_by/at, UNIQUE(workspace_id, vendor)).
  - `0075_phase18_calendar` — `calendar_link` (deck_id, user_id, vendor google|outlook|icloud, event_id, event_start_at,
    is_recurring, recurrence_id, last_synced_at).
  - `0076_phase18_task_links` — `task_link` (assignment_id, vendor asana|jira|linear, external_task_id/project_id,
    `field_map jsonb`, sync_mode domio_wins|task_wins|last_write_wins DEFAULT last_write_wins, last_synced_at).
- **Webhooks OpenAPI** — `contracts/openapi/v1/webhooks/slack.yaml` (receiveSlackEvent/Interaction/Command) +
  `teams.yaml` (receiveTeamsAction/Command); unauthenticated HMAC-verified, 401 on bad signature.
- **Contracts** — `collab.yaml` grew to **53 operationIds** (tags meeting-integrations/calendar/task-manager):
  +`getMeetingIntegrationStatus/connectMeetingIntegration/disconnectMeetingIntegration/issueMeetingToken/recordMeetingMarker`,
  +`createCalendarLink/listCalendarLinks/deleteCalendarLink/syncCalendarLink/getPresenterTodayView`,
  +`createTaskLink/listTaskLinks/updateTaskLink/deleteTaskLink/syncTaskLink`. Collaboration event schemas now **34 files**:
  +`meeting.session_started/session_ended`, +`calendar.event_linked/event_updated`, +`task.sync_requested/sync_completed`.

### Services
- **`services/meeting-integration`** (#188) — vendor connect/disconnect/status (zoom|meet|teams), scoped meeting
  tokens: HMAC-SHA256 over `${meetingId}.${presenterId}.${deckId}.${expiresAt}`, `expires_at = min(meetingEndAt+1h, now+4h)`,
  `verifyMeetingToken` timing-safe scope check; recording markers (`recordMarker` — transitioned_at ≤2min future skew,
  `meeting.session_started` emitted on first marker per meeting). Emits `meeting.session_started/session_ended`.
  Store interface + mem impl + pg skeleton. 40 tests. _Token secret default is dev-only; production secret must be injected._
- **`services/notification-dispatcher`** (#189 full) — 173 tests: webhook HMAC verification (`verifySignature`
  timing-safe, `NOTIFICATION_WEBHOOK_SECRET`), action buttons (approve/reject/open/resolve, InMemoryIdempotencyStore
  24h TTL, NoopActionHandler), slash commands (`parseSlashCommand`, built-in `/domio approve|open|help`),
  quiet-hours (`isQuietHour` overnight windows + morning `buildDigest`), subscription-based routing
  (`routeBySubscription`: event-type match, channel mapping, quiet→digest, HMAC signing), outbound signature header
  (`X-Domio-Signature` via optional `OutboundSigner` on SlackSender/TeamsSender). _Deviations: real vendor API
  adapters (OAuth/DM delivery) and collab action wiring (NoopActionHandler) are later-wave follow-ups._
- **`services/calendar`** (#190) — deck-to-event linking (dedupe (deck_id, vendor, event_id)), sync plan
  (5-min pre-meeting prompt; created|updated|canceled change types), recurring-event per-instance override skip,
  presenter 'Today' view, `shouldPrompt` pure pre-meeting check. Emits `calendar.event_linked/event_updated`.
  **Full pg DML** + withTransaction. 58 tests. _Deviations: SyncProvider default is in-memory round-trip; real
  Google/Outlook/iCloud adapters later._
- **`services/task-manager`** (#191) — declarative field mapping (status/priority/assignee/due_date/title,
  string + {from,to} tuple forms), conflict resolution (`resolveSyncConflict`: domio_wins|task_wins|last_write_wins,
  newer-updatedAt wins per field), link CRUD (dedupe (assignment_id, vendor)), `syncLink` emits
  `task.sync_requested` then `task.sync_completed` (synced | conflict + resolution), bulk `syncLinks`.
  Emits `task.sync_requested/sync_completed`. Store interface + mem impl + pg skeleton. 52 tests.
  _Deviations: TaskProvider default noop; real Asana/Jira/Linear adapters + receiveTaskWebhook later._

## What Wave 5 shipped

### Migrations + contracts
- **Migrations** (0077–0078, RLS tenant isolation DO$$ WITH CHECK):
  - `0077_phase18_guest_magic_links` — `guest_magic_link` (guest_access_id REFERENCES guest_access CASCADE, token_hash, expires_at, consumed_at, invalidated_at, created_by; idx access + token).
  - `0078_phase18_reassignment_history` — `reassignment_history` (assignment_id REFERENCES assignment CASCADE, old_primary_id, new_primary_id, actor_id, reason, changed_at; idx assignment).
- **Contracts** — collab.yaml grew to **58 operationIds** (tag guests): `createGuest/getGuest/deleteGuest/resendGuestMagicLink/consumeGuestMagicLink`; event schemas now **36 files**: +`guest.access_granted/access_revoked` (actor_type [member,guest,agent,system]).

### Services + apps
- **`services/guests`** (#192) — magic-link auth (HMAC token + nonce, default TTL 15min `GUEST_MAGIC_LINK_TTL_MINUTES`, resend invalidates prior links, consume rejects consumed/invalidated/expired/revoked), default capabilities `[comment,suggest,view]` only (download/export disabled by default), audit-distinct `actor_type=guest` on consume, soft revoke via revoked_at, **full pg DML** both tables + withTransaction. Emits `guest.access_granted/access_revoked`. 73 tests.
- **`services/share-api`** (#180 approval gate) — optional `ShareApprovalGate` (default AllowAll), enforced on share delivery (`createShare` + `introspect`), 403 ProblemDetail `external_share_requires_approval`, admin ops ungated. 47 tests.
- **`apps/api`** — all 10 P18 services mounted via `adaptHandler` (62 endpoints incl. unauthenticated `POST /v1/guest-access/consume`), in-memory stores via `createP18Services()`. 13 tests.
- **pg DML complete** — expiry, library, suggestions, task-manager, guests all full parameterized DML (no nil-guarded skeletons remain).
- **W14 editor surfaces** (`apps/editor`) — comment pins (fractional anchors), approval banner (approve/request changes), assignment panel (status workflow, blocked requires reason); polling scaffold.
- **`apps/magic-link-landing`** — token consumption page with invalid/expired/used/revoked/error states, redirects to deck on success.

## Follow-ups
1. **Resolved in Wave 3:** collab pg DML (full parameterized SQL), permission-engine pg_store, real NATS subscription in notification-dispatcher.
2. **Resolved in Wave 2:** suggestions + merge-requests shipped; merge-requests pg_store is full DML; diff-engine worker (in-memory replay provider, real crdt_logs replay later).
3. **Resolved in Wave 4:** meeting integration (scoped HMAC tokens, recording markers), Slack/Teams full (#189: HMAC webhooks, action buttons, slash commands, quiet-hours digests, subscription routing), calendar service (full pg DML), task-manager service. Meeting handler `issueMeetingToken` response-shape bug fixed during reconciliation (`{token}` now returns full MeetingToken object, 40/40 tests).
4. **Resolved in Wave 5:** guests service (#192) with magic-link + TTL + resend-invalidate + full pg DML; share-api approval gate (#180, 403 `external_share_requires_approval`); apps/api mounting of all P18 services (62 endpoints, in-memory stores); full pg DML for expiry/library/suggestions/task-manager/guests (no nil-guarded skeletons remain); W14 editor surfaces (comment pins, approval banner, assignment panel); `apps/magic-link-landing`; `reassignment_history` migration (0078) + collab service wiring.
5. Library follow-ups: scheduled-mode `isBindingDue` uses a 60s placeholder window (real cron parsing later); `last_sync_status=conflict` pauses propagation but has no conflict UI/merge yet; `approval_chain jsonb` stored but not yet integrated with collab approvals (#180).
6. Expiry follow-ups: `ShareRevoker` defaults to Noop — real share-api integration (strict tier auto-revoke) lands with the Wave 5 approval gate; AI freshness check (`ai_detected` reason supported in schema) not yet wired; legal-hold is an injected predicate placeholder.
7. Suggestions follow-ups: snapshot provider defined but not yet wired into accept (real Y.Doc sub-doc projection on accept later); `thread_id` stored but no comment-thread discussion integration yet; `applyOp` uses a simplified deck state until the real yjs-shared pipeline.
8. Diff-engine follow-ups: real crdt_logs replay (ReplayProvider default is in-memory), 500-slide ≤15s p95 benchmark, orphan-branch handling, conflict UI in editor (W14).
9. Integrations follow-ups (Wave 4 deviations): real vendor adapters — meeting OAuth (Zoom/Meet/Teams), calendar `SyncProvider` (Google/Outlook/iCloud), task `TaskProvider` (Asana/Jira/Linear) + `receiveTaskWebhook`; collab action wiring in notification-dispatcher (`NoopActionHandler` → real comment/approval/assignment actions); Redis dedup + role/group mention expansion; `notification_subscription`-based approver routing.
10. Reassignment history — resolved in Wave 5: dedicated `reassignment_history` table (migration 0078) + `insertReassignmentHistory` wired into the collab service reassignment path.
11. Migrations 0064–0078 not yet applied to a live DB (no local Postgres in the authoring environment) — run `make migrate-up` before exercising services.
