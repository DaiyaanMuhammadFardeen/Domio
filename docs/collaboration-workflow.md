# Section 13 — Collaboration & Workflow (Features 179–192)

> **Source:** `feature-list.md` §13, `pre-development-planning-guide.md` (full document, applied contextually).
> **Status:** Planning document — no code, no commits.

Section 13 turns Domio from a single-author canvas into a **team-operated production system** for presentations. Comments pin to *elements*, not just slides. Approvals are workflow-enforced, not advisory. Suggestion mode is a CRDT-isolated branch, not raw text suggestions. Merge requests produce a *visual* diff of the deck as a rendered object. The slide library is a governed source of truth, with auto-update propagation across every consumer. Meeting tools, chat tools, calendars, and task managers are first-class collaborators, not afterthoughts. Guest collaborators are scoped and expiring. This document covers features 179–192 end-to-end: feature mapping, UX flows, functional & non-functional requirements, architecture, data model, API contracts, security, performance, observability/testing, and cross-section ties.

---

## 1. Feature-by-Feature Mapping (179–192)

Each entry has: **acceptance criteria**, **behavioral details**, and **edge cases**.

### 179. Comments pinned to elements or slides, with threads, mentions, and resolve states

**Acceptance criteria**
- A user can right-click any element (or slide canvas) → **Comment** → a pin appears at the element's current canvas coordinate (in 2D canvas space, not document space).
- Threaded replies render in a side panel grouped by element/slide with **resolve / reopen / delete** actions.
- A comment can `@mention` any workspace member, guest (#192), or role handle (`@designers`, `@legal`); mentioned users receive a notification within **p95 ≤ 5s** (see §3).
- Pinning targets survive element motion: if the element moves, the pin translates with it; if the element is deleted, the pin **promotes to its parent slide** and a `orphaned=true` flag is set on the comment (the pin re-anchors at the parent slide center with a marker).
- Resolving a thread **does not delete it**; resolved threads are filterable and restorable for the lifetime of the deck unless explicitly purged.
- Pin coordinates are **not** absolute pixels — they are element-relative anchors, so changing the slide layout (or rendering on a smaller viewport) keeps pins meaningful.

**Behavioral details**
- Pins are stored as `(target_type, target_id, anchor)` tuples where `anchor` is an element-relative offset (e.g., `(0.42, 0.31)` of the element's bounding box) plus a fallback slide-relative offset.
- The comment side-panel supports **filter by status** (open / resolved / mentioning me), **filter by author**, **filter by date range**.
- A comment can attach a **file** (image / PDF / doc up to 25 MB) using the same object storage as the asset library; previews render inline in the thread.
- Mentions autocomplete from `workspace_member` ∪ `guest_access` ∪ `role_handle`; if the user has not yet been invited to the workspace, an `@` fallback surfaces an "invite and mention" affordance that creates a guest access (#192) inline.
- A comment can have **reaction emojis** (👍, 🎯, ✅, ❓, etc.) — lightweight, no separate table needed, encoded as `emoji_reactions JSONB` on the comment row.
- Threading depth is **unbounded** but the UI shows top-3 levels with "continue thread" expand at deeper levels to prevent runaway indentation.
- A separate **comment feed view** lists every comment in the deck chronologically with quick navigation.

**Edge cases**
- Pin target is on an element inside a locked / brand-locked region (#36) → comment is still permitted, but the comment thread displays a "this region is brand-locked" badge; edit/resolve actions remain available.
- Mentioning a deactivated user → notification suppressed, mention rendered as `‹@inactive-user›` with strikethrough; thread remains intact.
- A deleted slide has 12 comments on it → on slide delete, comments move to a **deck-level trash view** (auto-purge after 30 days, configurable per workspace), restorable if the slide is restored from version history (#20).
- Element is part of an auto-updating shared slide (#186) → comment is **anchored to the instance, not the master**, so updating the master does not move comments on instances.
- User has **read-only** access → comment reads are allowed; reply/resolve denied with an inline explanation; mentions of read-only users still notify.

---

### 180. Review/approval workflows (legal signs off before a deck can be shared externally)

**Acceptance criteria**
- A deck can be marked **"Request Review"** with a configurable approval policy: e.g., `legal_required, brand_required, finance_required` — each is a role or named individual.
- Until all required approvals are `approved`, **external share links cannot be published** (#155–#158); the share dialog shows "blocked pending approval" with the list of pending approvers.
- Approvers receive an **approval request** with: a deck thumbnail, the deck version under review (immutable snapshot), the requested approver role(s), and a comment thread dedicated to the review.
- Approval decisions are `approved | changes_requested | rejected`; only `approved` unblocks external share; `changes_requested` returns the deck to the author with the thread attached.
- A complete **decision audit trail** records every state transition with actor, timestamp, justification, and the immutable version_id.

**Behavioral details**
- Approval is on a **deck version snapshot**, not the live editable deck — so approvers see a stable artifact even if the author edits mid-review.
- Approval states are a strict **state machine**: `draft → pending → approved | changes_requested | rejected → (back to draft on edit) → pending → ...`. Illegal transitions are rejected at the API level and the UI does not surface transitions the actor cannot perform.
- The deck can have **multiple parallel approval lanes** (legal and brand can review simultaneously); each lane has its own decision.
- Approval windows can be SLA-bound (e.g., "approve within 48h or escalate"); auto-escalation is per-policy.
- The approval policy is **deck-level and workspace-level** — workspace admins can set a default policy that authors can override per deck (within allowed policy types).

**Edge cases**
- An approver is removed from the workspace mid-review → the approval reassigns to the role's fallback approver (configurable per workspace) and the original approver's prior decisions remain in the audit log.
- Author submits for review while still editing → the system creates an **immutable version snapshot** at submit-time; further edits create new versions that auto-resubmit (configurable: auto vs. requires manual resubmit).
- An approver requests changes → the author edits → a new version is created and the reviewer is auto-notified; previous approval decisions on older versions remain visible but do **not** apply to the new version.
- External share attempted while pending → share dialog blocks; if a previously-approved external link exists and the deck has changed, the link is **auto-revoked** and a notification is sent to the share creator.
- A guest collaborator (#192) requests review → guests cannot approve (they lack the role), but they can comment on the review thread.

---

### 181. Slide-level assignments ("Priya owns slides 4–7") with status tracking

**Acceptance criteria**
- A user (with appropriate permission) can select one or more slides → **Assign** → choose an assignee (or role handle) and an optional due date.
- The assignee sees the deck in a "My assignments" view across the workspace, filterable by `status` and `due`.
- Each assignment has a **status**: `not_started | in_progress | blocked | review | done`, settable by the assignee or the assignor.
- Assignments show up in **presenter view** as overlays during a live session (with assignee initials in a corner badge) — purely informational, not audience-visible.

**Behavioral details**
- Assignment scope is **slide-level or section-level** (a continuous range of slides) — not element-level.
- An assignment can have **multiple assignees** (primary + watchers); only the primary's status counts toward "all done" rollups.
- A `blocked` status requires a **reason text** (mandatory) so the team can see *why* a slide is blocked, not just that it is.
- Assignments have **email / Slack / Teams / in-app** notification hooks per status transition.
- An assignment timeline view shows all decks and all assignments in a Gantt-like chart with critical path detection (slides downstream of `blocked` are highlighted).
- Assignment **reassignment** preserves the original assignment in an audit log; the new assignee is notified.

**Edge cases**
- Assignee leaves the workspace → assignment transitions to `unassigned`; the assignor is notified and can reassign.
- A slide is deleted → its assignments auto-cancel with a notification; if the slide is restored, assignments restore with it.
- Two people assigned to the same slide → both see the assignment; status is set by either, with last-write-wins (with a brief "X also updated this" attribution).
- Assignment on a slide in a locked/brand-locked region → still allowed; assignee edits subject to the lock; the assignment carries the lock badge.

---

### 182. Suggestion mode — propose edits without changing the deck (Google-Docs-style)

**Acceptance criteria**
- A user can toggle **Suggestion mode** in the editor (toolbar toggle or `Cmd+I` shortcut). While on, **all of the user's edits are recorded as suggestions**, not applied to the live deck.
- Suggestions render in **distinct visual style** (typically a colored margin + changed text/element stroke) with a hover-tooltip showing the original and the suggested value.
- The deck author / a reviewer can **Accept** or **Reject** each suggestion individually, or **Accept all** / **Reject all** in bulk.
- Accepting a suggestion applies it as a normal edit on the live deck; rejecting removes it without trace.
- Suggestion mode is **per-user-session**, not per-deck: two users can each be in suggestion mode simultaneously, producing independent suggestion threads.

**Behavioral details**
- Suggestions are stored as **CRDT deltas** on a parallel branch (see §4 architecture) — not as raw text patches. This is essential because Domio edits are not text: a suggestion may be "move this chart 40px right" or "swap this chart type to waterfall" or "change the data binding to the Q3 sheet."
- The suggestion representation captures the **intent** (semantic operation) plus the resulting **state diff** so both can be reviewed.
- Suggestions are **scoped per editor session** but **persisted** in the deck for the lifetime of the review cycle (configurable retention, default 90 days).
- Suggestions can be **commented on** — each suggestion can have a thread attached for discussion before acceptance.
- The deck author can see a **suggestion count badge** in the editor toolbar and a "Review suggestions" panel listing all open suggestions with author + timestamp.

**Edge cases**
- A suggestion is made on an element that **moves before it's accepted** → the suggestion stores element-relative anchoring (like comments #179), so it follows the element. If the element is deleted before accept, the suggestion auto-resolves as "obsolete" with a notification.
- A suggestion conflicts with a parallel suggestion (two suggesters edit the same element differently) → on the second suggestion's accept attempt, the system detects the conflict and offers "your accept will override theirs / merge / abort."
- Author is **in suggestion mode** themselves and accepts a suggestion → that counts as a normal accept (their own session's suggestions remain pending).
- A suggestion includes a change to a **brand-locked region** (#36) → the suggestion is allowed to be authored (anyone can propose) but accept is denied unless the user has lock-breaking rights, with an inline message "this region is brand-locked; contact admin to accept."
- A suggestion changes a **data binding** (#48) → the suggestion captures both the new binding and a sample-rendered preview so the reviewer can see what the live data will look like.

---

### 183. Deck merge requests with visual diffing between branches

**Acceptance criteria**
- A user can **branch** the current deck (#19 — branching is already in section 1, this feature surfaces it for collaboration) into a named branch (e.g., `priya/experiment-pricing-layout`).
- On a branch, the user (or team) edits freely. When ready, they **Open a Merge Request** against `main` (or any chosen target branch).
- The merge request UI shows a **visual diff** of the two deck versions: thumbnails side-by-side, element-level diff overlay, and structural diff (added / removed / modified slides).
- A reviewer can **comment on the diff** (comments attach to the diff element, not the source code), request changes, or approve.
- Merging applies the branch's changes to the target branch. If both branches edited the same element, the system detects **semantic conflicts** and offers a 3-way merge UI.

**Behavioral details**
- The merge request is implemented as a **server-side synthesis**: the server computes the diff between two deck snapshots (#19 branch heads), persists it as a `merge_request`, and stores the visual diff payload.
- Visual diff is at **three granularities**: (a) slide-level (added/removed/reordered slides), (b) element-level within a slide (added/removed/moved/resized/restyled elements), (c) data-binding-level (which data source changed, what fields updated).
- The element-level diff renders the **target slide in two states** (before/after) with a **highlighted overlay** (red = removed, green = added, amber = modified) and a slider so the reviewer can drag between the two states.
- Merge conflict UI is **non-text**: it shows the three versions (target, source, common ancestor) of an element with three columns and per-column accept toggles, since Domio elements are not text.
- A merge can be **fast-forward** (target unchanged since branch base) or **3-way** (target has new changes too).
- Merging runs **validation hooks** (linting for broken data bindings, off-brand colors per #46, accessibility checks per #122) before completing; failed hooks block the merge.
- The merge is **atomic**: either all non-conflicting changes apply, or none. Conflict resolution is required to complete.

**Edge cases**
- Branch deleted before merge → MR becomes orphaned, surfaces as "branch deleted, can you re-create?" — the MR remains open with stale data.
- Target branch is deleted → MR auto-closes with reason "target branch deleted."
- Author of branch leaves workspace → MR remains open; reassignable to a new author.
- Two MRs modify the same slide → second MR's merge detects conflict; UI shows "Slide 4 has been modified by MR #41 since you branched; resolve conflicts."
- Conflict between a brand-locked region edit and a normal edit → brand-lock wins, the MR is blocked from accepting that element unless an admin overrides.

---

### 184. Team workspaces with folders, projects, and granular permissions

**Acceptance criteria**
- A workspace has a **hierarchical folder structure**: workspace → folders → projects → decks (and standalone decks at any level).
- Permissions are assigned per **role** (owner, admin, editor, commenter, viewer, guest — see #192) and per **principal** (named user or group).
- Permission inheritance flows: workspace → folder → project → deck → element (via #179 comment pinning) but can be **overridden at any level**.
- Each deck has a **visible permission summary** ("Who has access") that resolves inherited + explicit permissions into a single effective list.
- A **groups** mechanism allows permission assignment to a group of users (e.g., "Brand Team," "Legal") — nested groups supported.
- Permissions are **typed**: `read`, `comment`, `suggest`, `edit`, `share_internal`, `share_external`, `manage_members`, `manage_billing`. Each is a separate capability.

**Behavioral details**
- Permissions are evaluated by the **workspace permission engine** (§4) at every API call. The engine resolves the principal → group memberships → role → resource hierarchy → effective capabilities.
- A user can have **multiple roles** on a single resource (e.g., editor on the deck, commenter on slide 4 only); the **union of allowed** is taken.
- **Denied permissions** are explicit, not silent: an attempted share_external that the user lacks returns a clear error rather than an opaque 403.
- **Deny rules** override allow rules (deny-first): an explicit deny on a sub-resource strips that capability even if inherited elsewhere.
- Permission changes are **versioned** — each role assignment has `effective_from` and `effective_to`, supporting historical queries (e.g., "who had access on March 5?").
- Workspace admins can set **workspace-level defaults** that propagate but are overridable.

**Edge cases**
- A user is removed from a workspace mid-edit → their open sessions are invalidated; their unsaved CRDT state (#21) is reconciled as a final commit if the deck has shared edit history.
- Permission downgrade mid-review → the user's review access persists until the review closes (configurable); they cannot start new reviews.
- Permission inheritance broken by an intermediate "no-inherit" folder → permissions below it are not affected by above; this is opt-in per folder.
- Guest collaborator (#192) added at the project level → inherits only project-scoped permissions, not workspace-level admin capabilities.

---

### 185. Slide library — a governed pool of approved slides anyone can pull from

**Acceptance criteria**
- A **Slide Library** is a workspace-level (or organization-level) collection of slides marked **Approved for Reuse**.
- Any workspace member with `share_to_library` permission can publish a slide to the library with a **title, description, owner, tags, and an approval stamp**.
- The library has **search and filter**: by tag, owner, data-binding type, brand-kit, last updated, approval status.
- A slide in the library is **importable** into any deck via drag-from-library or insert-from-library — the imported slide is a **reference to the master** (or a copy, with a "copy vs. reference" toggle).
- The library has **governance** features: required reviewers for publish, retire/archive workflow, usage analytics ("this slide is used in 47 decks"), and a freshness indicator (last reviewed date).

**Behavioral details**
- A library entry stores **the canonical slide** plus **metadata**: owner, tags, data-binding summary, brand compliance, freshness, approval chain.
- Library entries can have **supersedes** and **superseded_by** relationships, enabling retire/refresh cycles.
- The library is **scoped**: workspace-level (everyone in the workspace can use), org-level (across workspaces, admin-managed), or **team-level** (specific group only).
- Library entries are **versioned**: editing a library slide creates a new version; consumers can stay on the old version or auto-update (per #186).
- The library has an **admin view** showing pending approvals, usage heatmap, stale slides (no update in N days), and off-brand outliers.

**Edge cases**
- Library slide is deleted → consumers' references break; the system prompts to either pin to the last available version or remove the reference (and the slide is replaced with a placeholder).
- Library slide has a **data binding** (#48) → on import, the consumer is asked whether to reuse the same binding (live-linked) or copy with a new binding (snapshot).
- A user wants to publish a slide that has **comments** (#179) → comments are stripped on publish by default, with a "carry reviewer notes" toggle that imports only resolved-comment summaries.
- A library slide uses a **brand-locked region** (#36) → the lock is preserved on import; consumers cannot edit the locked region unless they override.

---

### 186. Auto-updating shared slides — legal updates the disclaimer once; all 400 decks using it update

**Acceptance criteria**
- When a deck inserts a slide as a **library reference** (not a copy, per #185), edits to the library master **propagate automatically** to every deck that references it, within **p95 ≤ 60s** for normal update windows.
- Consumers can opt to **freeze** a reference (snapshot the library version, stop receiving updates) on a per-reference basis.
- Updates are **non-destructive by default**: a library update that conflicts with a consumer's local edit triggers a **conflict UI** (similar to #183) and pauses propagation for that consumer until resolved.
- Auto-updates can be **scheduled** (e.g., "legal's quarterly disclaimer refresh applies on the 1st of the month") or **immediate** (apply on save).
- Every consumer can see a **"last synced with library" timestamp** and a **"what changed in this update"** changelog entry.

**Behavioral details**
- Auto-update is implemented as an **event bus + lazy materialization** hybrid (see §3 NFRs and §4 architecture): the library write emits an event; consumers either pull on read (lazy) or get pushed (write-through) depending on configuration.
- The **propagation unit** is the **slide**, not the deck — consumers can have one deck with five library slides, each with independent update settings.
- An update can be **mandatory** (compliance: "you must accept this update") or **opt-in** (improvement: "you can take this update if you want").
- A **compatibility check** runs before propagation: if the library master changes the slide's contract (e.g., a previously-editable prop becomes locked), consumers are warned.
- Auto-update respects **brand-locked regions** — locked regions of a library slide cannot be overridden by the consumer, ever.

**Edge cases**
- Library master is deleted while consumers reference it → consumers see a "reference broken" badge and the slide is replaced with a snapshot of the last version; the snapshot is marked `frozen_due_to_deletion`.
- Consumer's local edit conflicts with incoming update → conflict UI; if not resolved within N days, the conflict auto-resolves by preferring the local edit and emitting a notification (configurable).
- A library update would **break data bindings** in a consumer (e.g., library master changed a bound field name) → propagation paused for that consumer until bindings are re-mapped.
- Propagation rate-limited per consumer (e.g., a 400-deck consumer can't all be updated within the latency budget) → background queue with priority for mandatory updates.

---

### 187. Content expiry policies (this pricing slide auto-flags for review every quarter)

**Acceptance criteria**
- An **expiry policy** can be attached to a slide, deck, library entry, or section. The policy defines: a **review interval** (e.g., 90 days), a **responsible role/user**, and a **flag behavior** (badge, notify, auto-archive).
- When content exceeds its review interval without an explicit **freshness confirmation**, the system **flags it**: a "stale" badge appears, notifications go to the responsible party, and (if configured) the deck's external share links display "contains content pending review."
- Freshness can be confirmed by any user with edit rights; the confirmation resets the timer and is logged.
- Expiry policies can be **inherited** from workspace defaults and overridden per resource.

**Behavioral details**
- The **expiry policy scheduler** (§4) runs daily, scanning all resources for upcoming and overdue freshness windows.
- Three escalation tiers: **gentle** (badge only), **moderate** (badge + notification), **strict** (badge + notification + auto-revoke external share on overdue).
- Stale content is surfaced in a **dashboard**: "42 slides across 12 decks need review this week."
- A **content health API** exposes staleness across the workspace for governance dashboards (#194).
- AI freshness checker (#125) can **auto-confirm** freshness if it can verify the bound data is current — saving manual review for purely data-driven slides.

**Edge cases**
- Resource has no responsible party (e.g., the user who owned it left) → escalates to the workspace admin.
- Policy is **disabled** mid-cycle → existing flags clear on next scheduler run.
- A library entry's expiry passes → all consumers inherit the staleness flag (they cannot independently freshen a library slide's flag; only the library owner can).
- Strict policy + overdue → external share auto-revokes; on freshening, share auto-reinstates if the share policy hasn't otherwise expired (#158).

---

### 188. Meeting-tool integrations: present natively inside Zoom/Meet/Teams with participation features intact

**Acceptance criteria**
- From the share dialog (#155) or the presenter view (#126), a user can **"Present in Zoom"** / **"Present in Google Meet"** / **"Present in Microsoft Teams"** — the deck launches **inside the meeting** as a native app or a connected app.
- All participation features survive: live polls (#143), Q&A (#145), word clouds (#144), emoji reactions (#147), audience-driven navigation (#148), live translation captions (#153), attention heatmap data capture.
- The presenter controls the deck from inside the meeting (no separate tab needed) and audience members see the slides synchronized.
- The integration is **bidirectional**: the meeting's chat, participants list, and recording state are visible inside Domio's presenter view (optional, configurable).

**Behavioral details**
- Three integration patterns are supported per vendor:
  1. **In-meeting app / SDK** (Teams Meetings apps, Zoom Apps SDK) — full-featured, runs inside the meeting chrome.
  2. **Connected app via deep link** — opens the deck in a co-pane window tied to the meeting lifecycle.
  3. **OAuth-driven API integration** — Domio uses the vendor's APIs to register as a participant and stream slides.
- A **session token** is exchanged per meeting; the token is scoped to the meeting ID and the presenter.
- Participation events (polls, Q&A) are **synced across the meeting** — a poll submitted in Teams surfaces in Domio and vice versa.
- Recording: if the meeting is being recorded, the deck's slides are **time-stamped in the recording** with chapter markers per slide (per #141).
- The integration respects **the meeting's permission model**: only meeting attendees see the deck; Domio does not bypass meeting-level access control.

**Edge cases**
- Vendor API rate limit hit during a high-traffic poll → Domio queues events and degrades gracefully (e.g., emoji reactions may briefly lag but not drop).
- Vendor SDK deprecation → fall back to deep-link integration with reduced feature set; banner in presenter view.
- Network drop during meeting → presenter reconnects via #136 (presenter failover) and resumes at the same slide.
- Two presenters in the same meeting → Domio detects and offers "hand off" (#135); both cannot drive simultaneously.

---

### 189. Slack/Teams notifications (comments, approvals, viewer activity)

**Acceptance criteria**
- Workspace admins connect a **Slack workspace** or **Teams tenant** via OAuth; on connect, Domio posts to configured channels via **incoming webhooks** and supports **slash commands** (`/domio approve`, `/domio share`).
- Notification triggers: comment added, mention, approval requested/decided, assignment created/updated, viewer activity (per #172 sales-mode notifications), library updates, expiry alerts.
- Users can **mute** notifications per channel or per event type; admins can **route** event types to specific channels (e.g., #legal-approvals, #design-reviews).
- Notifications include **deep links** back into the deck and **action buttons** (Approve, Reject, Open, Resolve) where applicable.
- Notifications honor **do-not-disturb / quiet hours** by checking the user's Slack/Teams status before sending.

**Behavioral details**
- Implementation: **incoming webhooks** for outbound notifications (Domio → Slack/Teams), **slash commands + interactive payloads** for inbound (Slack/Teams → Domio).
- Outbound uses Domio's **notification fan-out service** (§4) with a Slack/Teams adapter.
- Inbound slash commands are authenticated via Slack/Teams' signing secret verification.
- Interactive payloads (button clicks from Slack) hit Domio's webhook handlers (§6) which perform the action (e.g., approve) and reply with an updated message.
- **Per-resource subscription model** — users subscribe to notifications for specific decks, slides, libraries.
- Notification **batching**: rapid-fire events (e.g., 10 comments in 5 minutes) are batched into a digest.

**Edge cases**
- Slack/Teams outage → notifications queue in Domio with retry; on recovery, they flush in order. No notifications are dropped silently.
- Slack/Teams workspace disconnected (admin revokes) → Domio switches to email fallback for affected notifications.
- Slash command issued by an unauthorized user → rejected with a friendly "you don't have access to this deck" message.
- Bot posting rate limit → exponential backoff with eventual delivery.

---

### 190. Calendar integration — deck linked to the meeting invite, opens in presenter mode at meeting time

**Acceptance criteria**
- A user can **link a deck to a calendar event** (Google Calendar / Outlook / iCloud) — the link is stored on the event and surfaced in the event description.
- At meeting start (configurable: 5 min before by default), a **prompt appears** on the presenter's device: "Your meeting 'Q3 Board Review' starts in 5 min — open in presenter mode?"
- Calendar links are **bi-directional** when the vendor supports it (Google Calendar, Outlook): updating the meeting time in the calendar updates the deck's scheduled reminder.
- A **deck can have a default calendar template** (e.g., "every Monday 9am board meeting") that auto-creates events with the deck attached.
- Meeting attendance can be cross-referenced with viewer analytics (#169) to surface "this deck was shown in 12 of your meetings this quarter."

**Behavioral details**
- Calendar integration is OAuth-based: the user grants Domio calendar-read (and optional write) scopes.
- Linked decks show up in **presenter view's "Today" view** along with the meeting details (attendees, agenda if present).
- **Pre-meeting ambient mode** (#210) auto-engages if a linked meeting is the user's next calendar event.
- The integration supports **meeting reschedules**: if a meeting is moved, Domio updates the linked reminder (if the integration is bidirectional).
- **Recording consent** flow: if the meeting is recorded, Domio's presenter view prompts for attendee notification (per the meeting vendor's rules + GDPR / PDPA).

**Edge cases**
- Calendar access revoked → Domio falls back to no calendar integration; existing links remain on events but stop updating.
- Meeting moved to a time the user has a conflict → Domio doesn't auto-reschedule; surfaces a notification.
- Meeting canceled → Domio removes the scheduled reminder but keeps the deck-meeting association for analytics.
- Recurring meeting series → Domio links at the series level; the presenter can also link to a specific instance.

---

### 191. Task-manager integrations (Asana/Jira/Linear) for deck production pipelines

**Acceptance criteria**
- A workspace can connect **Asana, Jira, Linear** (one or more) via OAuth or API token.
- Slide-level assignments (#181) can be **mirrored to a task manager**: each assignment creates a task in the chosen project; status changes in Domio sync to the task manager and vice versa.
- A **deck production pipeline** view aggregates all assignments across decks into a kanban-style board sourced from the task manager.
- **Two-way sync** with conflict resolution: if a task is updated externally while the Domio assignment is also updated, the last-write-wins by default, with a configurable "Domio is source of truth" / "task manager is source of truth" mode.
- **Bulk operations**: changing a deck's status in the task manager updates all of its assignments.

**Behavioral details**
- The integration uses each vendor's REST/GraphQL API; sync runs via **webhook receivers** (vendor → Domio) and **outbound webhooks** (Domio → vendor).
- A **project mapping** config: which Asana project / Jira project / Linear team maps to which Domio workspace/folder.
- **Field mapping**: assignment status ↔ task status (configurable per mapping), assignee, due date, description (slide link).
- **Comments on tasks** are mirrored as comments on the corresponding Domio assignment, with author attribution.
- **Custom fields** in task managers can be mapped to Domio assignment metadata (e.g., "priority" → "P0/P1/P2").

**Edge cases**
- Task deleted in task manager → Domio assignment cancels with a notification; reversible via the task manager's restore.
- Sync conflict (both updated in same minute) → configurable conflict resolution; default is "last write wins" with a "merge" option in conflict UI.
- Task manager auth expired → sync paused with admin notification; backlog re-syncs on re-auth.
- Vendor API rate limit → batch and back off; no drops.

---

### 192. Guest collaborators with scoped, expiring access

**Acceptance criteria**
- A workspace member with `invite_guest` permission can invite a **guest** by email — guests do not need a full workspace account; they sign in via email link / SSO.
- Guest access is **scoped**: the inviter picks a folder or project (or specific decks), and the guest only sees those resources.
- Guest access is **time-bounded**: an `expires_at` is mandatory; on expiry, the guest's access is revoked and any active sessions are invalidated.
- Guest capabilities are restricted by default: `comment`, `suggest`, `view` only — never `edit`, `share`, or `manage`. The inviter can opt-in to `edit` for the duration.
- A guest's identity is **logged distinctly** in audit trails and version history (per #196 audit log).
- Guests can be **converted to full members** by an admin if needed.

**Behavioral details**
- Guests authenticate via **magic link** (default) or **SSO** if the workspace enforces it. They never see workspace-wide content.
- Guest **notifications** route to the guest's email only; guests do not appear in workspace member rosters, only in the per-resource access list.
- Guest **billing**: guests count toward seat usage (#199) at a different rate (typically lower or zero); configurable per workspace.
- Guest **content access**: if the guest has access to a deck, they see the deck as of their access grant — they do not see retro-removal unless the resource is fully revoked.
- Guest **download/export** is disabled by default; opt-in by the inviter.

**Edge cases**
- Guest's email domain matches a domain-restricted share (#157) → the guest can authenticate via their domain SSO, gaining guest-tier access.
- Guest access to a library entry (#185) → guests see the library entry but cannot publish to it (cannot become a library contributor).
- Guest invited to a deck with brand-locked regions (#36) → the locks apply; guest cannot break them.
- Guest access expires while they're viewing → they see a "session expired, contact inviter" screen; their comment/suggest drafts are auto-saved as a handoff note for the inviter.

---

## 2. UX Flows

The flows below are the canonical user journeys for section 13. Each describes the happy path, then a representative failure mode or edge path.

### 2.1 Pinning a comment to an element (feature #179)

**Happy path:**
1. User right-clicks an element on the canvas → context menu shows "Add comment."
2. User picks "Add comment" → comment pin appears at the element's bounding box anchor, in a stable color tied to the user; a comment composer opens anchored to the pin.
3. User types `@priya` → mention autocomplete suggests Priya from workspace members; user picks Priya.
4. User submits → comment appears in the right-side panel grouped under that element, with a dot indicator on the pin.
5. Priya receives a Slack notification (#189) and an in-app mention badge.
6. Priya opens the deck from the notification, sees the highlighted pin, opens the thread, replies, resolves.

**Edge — pin target moves:**
- User moves the element → pin moves with it (anchor is element-relative).
- User deletes the element → pin promotes to slide-level with an `orphaned` badge; the thread remains readable; resolution moves to the slide context.

**Edge — element is in a brand-locked region:**
- Pin is allowed; a "this region is brand-locked" badge appears on the comment thread; resolve/reply remain available.

### 2.2 Requesting review / approval (feature #180)

**Happy path:**
1. Author finishes a deck → clicks "Request Review" in the toolbar.
2. System creates an immutable version snapshot of the deck (#180 behavioral detail).
3. Author picks approvers: legal team, brand team, finance team (a configured approval policy).
4. Author adds a note ("please focus on the new pricing slide") and submits.
5. Each approver receives a notification (in-app + Slack/Teams) with a thumbnail, the version snapshot, and a "Review" CTA.
6. Approver opens the deck in read-only review mode (the immutable snapshot); comments and decision are recorded against the version.
7. All three approve → external share becomes available; the share dialog shows "Approved by legal, brand, finance."
8. Author publishes the share; the audit log records the entire decision chain.

**Edge — approval with parallel changes:**
- Mid-review, author edits → a new version is created; auto-resubmit (configurable) sends the new version to approvers; previous approvals on the older version remain in the audit log but do not apply.

**Edge — approval rejected mid-share:**
- An external link was previously approved → author edits → link auto-revokes; share creator notified.

### 2.3 Assigning slides to teammates (feature #181)

**Happy path:**
1. PM selects slides 4–7 in the slide panel → right-click → "Assign to..."
2. PM picks "Priya" from the team dropdown, sets due date "Friday," and adds a brief ("please redesign the comparison slide").
3. Slide panel shows a chip on each assigned slide with Priya's initials and a status indicator (initially `not_started`).
4. Priya sees the deck in her "My Assignments" view across the workspace.
5. Priya opens the deck, makes edits, marks `in_progress`; PM gets a notification of the status change.
6. Priya marks `review` when done; PM is notified to review.
7. PM reviews, marks `done`.

**Edge — reassignment:**
- PM reassigns to a new teammate mid-flow → original assignee notified; new assignee gets the assignment; audit log records both events.

**Edge — assignment cascade:**
- A slide assigned to Priya is later moved to a different section; the assignment persists with the slide.

### 2.4 Drafting in suggestion mode (feature #182)

**Happy path:**
1. Reviewer opens a deck in suggestion mode (`Cmd+I`).
2. Reviewer's cursor becomes a "suggesting" indicator (e.g., a different color).
3. Reviewer moves a chart, edits a label, changes a data binding → all changes show up as suggestions (different color stroke, comment-style markers).
4. Reviewer adds a comment to one suggestion ("why not a waterfall?").
5. Author opens the deck, sees a "12 suggestions from Priya" badge.
6. Author opens the suggestions panel, reviews each one individually; accepts some, rejects others, replies on a few.
7. Author accepts a suggestion → it applies as a normal edit; the change appears in version history with attribution "Accepted from Priya's suggestion."
8. Suggestions panel now shows the remaining unresolved ones.

**Edge — suggestion conflict:**
- Two reviewers each suggest a different layout for slide 4 → author accepts Priya's first, then opens Raj's suggestion → system detects "Priya already accepted a change to this element" and offers to override, merge, or abort.

**Edge — suggestion on brand-locked region:**
- Reviewer can author the suggestion; accept is denied unless the author is an admin who can break the lock.

### 2.5 Opening a merge request with visual diff (feature #183)

**Happy path:**
1. Developer branches the deck from `main` into `priya/pricing-experiment`.
2. Developer edits freely in the branch.
3. Developer clicks "Open Merge Request" → picks target `main`, fills in title and description.
4. System computes the visual diff (§4) and stores it as the MR.
5. Reviewer gets a notification with the MR link.
6. Reviewer opens the MR → sees a summary ("3 slides added, 1 removed, 5 modified"), a thumbnail strip with the changed slides highlighted, and an element-level diff overlay on slide 4 with a drag-to-compare slider.
7. Reviewer comments on the diff element ("why did you move the chart?"), then approves.
8. Developer merges; the MR shows a "merged" state with the merge commit's deck version; the deck's `main` branch now reflects the changes.

**Edge — conflict:**
- `main` has moved on (someone else merged another MR) → MR detects conflict; conflict resolution UI shows three columns for the conflicting element; developer resolves, then re-runs validation hooks.

**Edge — validation failure:**
- A linting hook (#46) detects off-brand colors in the MR → merge is blocked; developer fixes; re-runs.

### 2.6 Browsing the shared slide library (feature #185)

**Happy path:**
1. User opens "Slide Library" in the workspace sidebar.
2. Library panel shows all approved slides with thumbnails, titles, tags, owners, freshness.
3. User filters by tag "pricing," by owner "Legal," and by freshness "last 30 days" → list narrows.
4. User drags the "Standard Pricing - 3 Tier" slide into an open deck → it inserts as a **reference** (with a "reference vs. copy" dialog defaulting to reference).
5. The deck now has the library slide referenced; the slide panel shows a "library" badge.

**Edge — reference vs. copy:**
- User picks "copy" instead → the inserted slide is a one-time snapshot, no longer updates from the library.

**Edge — library has stale data:**
- A library entry's freshness is past its review interval → it shows a "stale" badge and the insert dialog warns "this slide is pending review."

### 2.7 Configuring auto-update for shared slides (feature #186)

**Happy path:**
1. User inserts a library slide as a reference → system prompts for auto-update settings: `immediate`, `scheduled (e.g., monthly)`, `on-publish`, or `manual`.
2. User picks `scheduled: 1st of each month` → system confirms and shows the next sync date.
3. Library owner updates the master → consumer sees a notification ("Standard Pricing updated by Legal — auto-update scheduled for Aug 1").
4. On Aug 1, the consumer's deck updates; a changelog entry appears on the slide's panel ("Updated from library: copy revised for FY25").

**Edge — mandatory update:**
- Compliance update marked mandatory → consumer receives a high-priority notification; if the consumer's local edit conflicts, the conflict UI surfaces immediately, not on schedule.

**Edge — freeze:**
- Consumer freezes the reference → no further updates; slide panel shows "frozen as of Jul 1, 2025."

### 2.8 Integrating with Zoom / Meet / Teams (feature #188)

**Happy path:**
1. From the presenter view, presenter clicks "Present in Teams" → if not already connected, OAuth flow to grant Domio Teams Meetings access.
2. System detects the user's next Teams meeting (via calendar #190 if linked) or asks the presenter to pick a meeting.
3. Domio opens as an in-meeting app inside Teams; presenter sees the deck and the Teams meeting chrome.
4. Audience sees the slides synchronized via the in-meeting app; audience polls/Q&A from Teams flow into Domio's participation panel.
5. Presenter advances slides inside the meeting; both views stay in sync.
6. Meeting ends → Domio cleans up the session; a recording marker per slide is written if the meeting is recorded.

**Edge — vendor SDK missing:**
- Teams SDK not available in this meeting (older client) → falls back to co-pane deep link with reduced feature set; banner in presenter view.

**Edge — high poll traffic:**
- 200 audience members voting on a poll → Domio batches updates to Teams; brief lag, no drops.

### 2.9 Calendar linking (feature #190)

**Happy path:**
1. Author clicks "Schedule meeting with this deck" → OAuth flow to Google Calendar (or Outlook).
2. Author picks attendees, time, title; calendar event is created with the deck link in the description.
3. Author's calendar shows the meeting; the deck link is clickable.
4. Five minutes before the meeting, the author's Domio shows a notification with "Open in presenter mode?"
5. Author clicks → Domio opens in presenter view with the deck, notes, timer, and a deep link back to the calendar event.

**Edge — bidirectional update:**
- Author moves the meeting in Google Calendar → Domio updates the linked reminder time.

**Edge — recurring series:**
- Author links to a weekly recurring meeting → the link applies to all instances; presenter can override per-instance.

---

## 3. Functional and Non-Functional Requirements

### 3.1 Functional requirements summary

| # | Feature | Functional capabilities |
|---|---------|------------------------|
| 179 | Comments | Pin to element/slide; thread; mention; resolve; element-relative anchoring; reactions; attachments; orphan handling |
| 180 | Approval | State machine; per-version snapshots; multi-lane parallel approvals; SLA escalation; audit log |
| 181 | Assignments | Slide-level scope; multi-assignee; status workflow; reason-on-blocked; notifications; timeline view |
| 182 | Suggestions | CRDT-isolated per-session branch; semantic diff; per-suggestion accept/reject; conflict resolution; retention policy |
| 183 | Merge requests | Branching; visual diff (slide/element/data-binding); 3-way merge; validation hooks; atomic merge |
| 184 | Workspaces | Hierarchical folders; typed permissions; group support; deny-first; historical queries |
| 185 | Slide library | Governed pool; search/filter; reference vs. copy; versioned; supersedes chain; usage analytics |
| 186 | Auto-update | Event-driven propagation; lazy + write-through; per-reference config; conflict detection; mandatory vs. opt-in |
| 187 | Expiry | Policy attachment; three escalation tiers; dashboard; AI-assisted freshness verification |
| 188 | Meeting integrations | In-meeting app; deep link; OAuth; participation sync; recording markers |
| 189 | Slack/Teams | Incoming webhooks + slash commands; action buttons; digest batching; DND awareness |
| 190 | Calendar | OAuth calendar access; meeting→deck link; pre-meeting prompt; bidirectional update |
| 191 | Task managers | Asana/Jira/Linear; two-way sync; field mapping; conflict resolution; bulk operations |
| 192 | Guests | Scoped, expiring access; restricted capabilities; audit-distinct identity; conversion-to-member |

### 3.2 Non-functional requirements

**Comment threading performance (feature #179)**
- Comment write latency: **p95 ≤ 200 ms** end-to-end (UI → persisted → broadcast).
- Comment read (fetch thread + count): **p95 ≤ 150 ms**.
- Thread fan-out to subscribers (in-app + email + Slack/Teams): **p95 ≤ 5 s** for first delivery; **p99 ≤ 15 s**.
- A deck with 5,000 comments on 200 slides still loads its comment panel in **p95 ≤ 1 s** (pagination + lazy load).
- A pin's anchor survives element motion at 60fps drag (no comment jitter during real-time multiplayer editing, #17).

**Mention notifications (#179, #189)**
- Mention-to-notification latency: **p95 ≤ 5 s** end-to-end.
- Notification **deduplication**: a user mentioned in 5 comments in 30 s receives a single batched digest, not 5 separate notifications.
- **Routing rules**: Slack-channel-bound mentions go to Slack (with action buttons); email-only subscribers get an email; do-not-disturb users get a queued morning digest.
- **No ghost notifications**: a mention that is later deleted before the user opens it does not produce a stale notification; the digest entry is removed.
- Mention **autocomplete**: ≤ 100 ms response for typical workspace sizes; scales to 10k-member workspaces with search index.

**Approval state machine integrity (#180)**
- The state machine is **server-enforced**: any state transition not in the allowed list is rejected at the API with a `409 Conflict`.
- **Idempotent**: a duplicate "approve" call from the same approver on the same version is a no-op (200 OK with current state), not a duplicate audit entry.
- **No lost approvals**: an approver who submits a decision during a network partition sees their decision reconciled on reconnect; if the version they were approving has since been superseded, the decision is rejected with a clear message.
- **Snapshot integrity**: the immutable version snapshot a reviewer sees is byte-identical to what was approved; any subsequent edit creates a new version.
- **Audit trail completeness**: every state transition (including no-op idempotent ones, except where omitted for noise reduction) appears in the audit log with actor, timestamp, version_id, and justification.

**Suggestion-mode semantic diff (vs raw text) (#182)**
- Suggestions are **CRDT operations** on the parallel branch, not raw text patches — preserving layout, data bindings, and element identity.
- A suggestion can express: element move, resize, restyle, delete, add; data binding change; text content change (as a structured op, not raw text); theme/token change.
- The diff viewer renders **structured before/after** with semantic annotation ("moved chart from (100,200) to (140,200); increased width from 200 to 240; rebound from Q3_sheet to Q3_sheet_v2").
- Conflicts between suggestions are detected at the **operation level**, not text-line level.
- A suggestion set on a 100-slide deck serializes to **≤ 50 KB** typically (compared to raw text diff which would balloon with element metadata).

**Merge request visual diff at slide/element level (#183)**
- MR creation latency: **p95 ≤ 3 s** for diff computation on decks up to 100 slides; **≤ 15 s** for decks up to 500 slides; computed in background for larger.
- The visual diff is rendered at **three granularities** (slide-level, element-level, data-binding-level); each is independently browsable.
- Element-level diff rendering: **60 fps** slider drag between before/after states; the renderer uses WebGL acceleration for complex slides.
- Diff data is **stored server-side** (not regenerated on view) so MRs remain inspectable even after branches are deleted.
- **3-way merge conflict detection** at the element level; conflicts are surfaced immediately, not on merge attempt.

**Slide library governance (#185)**
- Library publish → approval gate: configurable; default = one approver required for any publish, two for "approved for org-wide use."
- Library search: **p95 ≤ 300 ms** for filter+search on libraries up to 10,000 entries.
- Library entry versioning: each version is **immutable**; edits create a new version; consumers can pin to a version (not a "latest" pointer).
- Library **supersedes chain** enforced: a retired entry cannot be the head; consumers on retired heads see a migration prompt.

**Auto-update propagation: write-through vs lazy (#186)**
- **Write-through**: library edit → event published within 1 s → consumers subscribed to immediate updates receive within **p95 ≤ 60 s** total.
- **Lazy**: consumer's next read of the slide triggers a freshness check; if stale, lazy-fetch and update on the fly (no user-visible latency added for typical deck sizes).
- **Hybrid default**: write-through for mandatory updates, lazy for opt-in updates; configurable per library.
- **Backpressure**: if a single consumer has 10,000 references to a library slide, propagation is sharded (parallel workers) so total wall-clock latency stays within budget.
- **Conflict detection** runs before write-through pushes land; conflicts are queued per-consumer, not per-slide.

**Content expiry policy enforcement (#187)**
- Scheduler runs daily; **completes within 10 minutes** for workspaces up to 100k resources.
- Flag application: **immediate** on policy trip (no batch lag).
- Strict-mode auto-revoke: **immediate** on overdue; share links are revoked within **p95 ≤ 30 s**.
- AI freshness verification (#125 integration): async, with a budget of **p95 ≤ 60 s** per slide; results cache for 24h.

**Meeting-tool integration protocol (#188)**
- **In-meeting app** uses each vendor's official SDK (Teams Meetings apps, Zoom Apps SDK, Google Meet add-ons).
- **Deep link** fallback uses each vendor's URL scheme with auth tokens.
- **OAuth scopes** are minimal: meeting read, meeting write (for chat integration), app registration.
- **Session tokens** are scoped to (meeting_id, presenter_id, deck_id); tokens expire 1 hour after meeting end.
- **Rate limits**: respect vendor limits; on hit, queue with exponential backoff; never drop critical state-change events.
- **Recording markers**: time-stamped per slide transition; encoded into vendor recording metadata if supported.

**Slack/Teams webhook semantics (#189)**
- Outbound webhooks use **HMAC-SHA256 signed payloads**; receivers verify before trusting.
- **Retry policy**: failed deliveries retry with exponential backoff up to 24h; after that, fall back to email.
- **Slash commands** are authenticated via each vendor's signing secret; Domio rejects unsigned or stale (>5 min) requests.
- **Action button callbacks** (interactive payloads) are processed idempotently; the same button click twice does not double-approve.
- **DND awareness**: Domio checks each user's Slack/Teams status before sending non-critical notifications; quiet-hours users get morning digests instead.

**Calendar event linking (#190)**
- Calendar OAuth scopes: `read` events (always), `write` events (opt-in).
- Pre-meeting prompt: **5 min before** default; configurable per user per workspace.
- Bi-directional update latency: **p95 ≤ 30 s** for vendor push → Domio update; Domio → vendor update is **p95 ≤ 5 s**.
- Recurring meetings: instance-level overrides supported; series-level settings are defaults.
- **No silent calendar writes**: every Domio-initiated calendar change is logged in the user's audit trail.

**Task-manager integration (#191)**
- Two-way sync latency: **p95 ≤ 10 s** per change; batched for bulk operations.
- Field mapping is **declarative** per workspace; configuration UI lets admins map custom fields.
- Conflict resolution: configurable per workspace (Domio-wins / task-manager-wins / last-write-wins).
- Bulk operations: a "status change" on a parent task in the task manager cascades to child assignments in Domio within **p95 ≤ 30 s**.
- Vendor API rate limits: respect and back off; sync queue persists across restarts.

**Guest collaborator scoping (#192)**
- Guest session creation: **p95 ≤ 1 s** end-to-end (invite → magic link → access).
- Guest access revocation: **immediate** on expiry; active sessions invalidated within **p95 ≤ 5 s**.
- Guest identity is **distinct in audit log**: every guest action tagged with `actor_type=guest` and the original inviter's ID.
- Guest content access: scoped per-resource; cross-resource access attempts are rejected with a clear "out of scope" message.

---

## 4. Architecture

Section 13 has 14 distinct services. They're organized as a **modular monolith** with clear service boundaries, so each can be split out independently if scale demands.

### 4.1 High-level architecture

```
                            ┌──────────────────────────┐
                            │   Client (web/desktop)   │
                            └──────────────┬───────────┘
                                           │
                                           ▼
                  ┌────────────────────────────────────────────┐
                  │            API Gateway / BFF                │
                  └────────────────────┬───────────────────────┘
                                       │
   ┌──────────────┬─────────────┬──────┴──────┬─────────────┬──────────────┬────────────┐
   ▼              ▼             ▼             ▼             ▼              ▼            ▼
┌────────┐  ┌─────────┐  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐  ┌────────────┐
│Comment │  │Approval │  │Assignment│  │Suggestion │  │   MR     │  │ Workspace │  │  Library   │
│Service │  │ Engine  │  │ Service  │  │   (CRDT)  │  │ Service  │  │   Perm    │  │  Service   │
└───┬────┘  └────┬────┘  └────┬─────┘  └─────┬─────┘  └────┬─────┘  └─────┬─────┘  └─────┬──────┘
    │            │            │              │             │              │             │
    └────────────┴────────────┴──────┬───────┴─────────────┴──────────────┴─────────────┘
                                     │
                                     ▼
              ┌─────────────────────────────────────────────────────────────┐
              │                Event Bus (Kafka / NATS)                     │
              └──┬──────────┬──────────┬───────────┬──────────┬──────────┬──┘
                 ▼          ▼          ▼           ▼          ▼          ▼
            Auto-Update  Expiry   Notification  Calendar  Task Mgr   Meeting
              Bus       Scheduler  Fan-out      Adapter  Adapters   Adapters
```

### 4.2 Services

**Comment Service** (feature #179)
- Owns `comment`, `comment_thread`, `mention` (§5).
- Provides CRUD, threading, mention parsing, resolve/reopen.
- Stores pin anchors as element-relative offsets (not absolute pixels) so they survive layout changes.
- Broadcasts comment events to the **notification fan-out** service and to live editor sessions via WebSocket.

**Review/Approval Workflow Engine** (feature #180)
- Owns `approval_request`, `approval_decision` (§5).
- Implements the approval state machine (§3) with server-enforced transitions.
- Creates immutable version snapshots on submit.
- Schedules SLA escalations via the expiry scheduler (shared infrastructure).

**Assignment Service** (feature #181)
- Owns `assignment` (§5).
- Slide-level scope; multi-assignee; status workflow.
- Emits assignment events to the notification fan-out and to task-manager adapters for sync (#191).

**Suggestion Mode CRDT** (feature #182)
- Owns `suggestion` (§5).
- Per-session **isolated CRDT branch** of the deck schema; the user's edits land here instead of the main branch.
- Suggestions are **CRDT operations** (move, resize, restyle, content change, binding change), not raw text patches.
- The suggestion set is serialized to the deck on submission; the live editor continues to render the main branch until accept.

**Merge Request Service + Diff Engine** (feature #183)
- Owns `merge_request`, `slide_diff` (§5).
- Computes and persists **three-level diffs** (slide/element/data-binding).
- The diff engine is a separate worker process that handles long-running diff computations for large decks.
- 3-way merge engine for conflicts; validation hooks as pre-merge checks.

**Workspace Permission Engine** (feature #184)
- Owns `workspace`, `workspace_member`, group definitions (§5).
- Evaluates permissions at every API call: principal → groups → role → resource hierarchy → effective capabilities.
- Deny-first resolution; historical (point-in-time) queries supported.
- A cache layer (Redis) holds hot permission resolutions; invalidated on permission changes.

**Shared Slide Library Service** (feature #185)
- Owns `slide_library_entry` (§5).
- Manages library entries: publish, approve, retire, version, supersede.
- Search/filter via a dedicated search index (OpenSearch / Elasticsearch).
- Emits library events to the auto-update bus.

**Auto-Update Event Bus** (feature #186)
- The propagation fabric for #185 → consumer.
- Hybrid model: write-through for mandatory updates, lazy for opt-in (see §3).
- Per-reference configuration; per-consumer state.
- Backpressure: sharded propagation for high-fanout consumers.

**Expiry Policy Scheduler** (feature #187)
- Owns `expiry_policy` (§5).
- Daily scan; flag application; escalation tiers.
- Auto-revoke of external shares in strict mode.
- Integrates with AI freshness checker (#125) for auto-confirmation.

**Meeting Tool Adapters** (feature #188)
- Per-vendor adapters (Zoom, Meet, Teams) implementing a common interface.
- Each adapter encapsulates: OAuth flow, in-meeting app / SDK integration, deep-link fallback, participation sync, recording markers.

**Notification Fan-Out Service** (feature #179, #189, #191)
- Owns `notification_subscription` (§5).
- Subscribes to event bus events; routes to in-app, email, Slack, Teams, and meeting adapters.
- Digest batching; DND awareness; deduplication.
- Action button callback handling.

**Calendar Integration** (feature #190)
- Owns `calendar_link` (§5).
- OAuth flows for Google Calendar, Outlook, iCloud.
- Bidirectional sync (vendor-dependent).
- Pre-meeting prompt scheduling.

**Task-Manager Adapters** (feature #191)
- Per-vendor adapters (Asana, Jira, Linear).
- Two-way sync; field mapping; conflict resolution.
- Webhook receivers and outbound webhook emitters.

**Guest Access Manager** (feature #192)
- Owns `guest_access` (§5).
- Magic-link auth for guests.
- Scoped permission enforcement; expiry enforcement; audit-distinct identity.

### 4.3 Event bus and async communication

All inter-service state changes flow through a **Kafka** (or NATS, depending on scale) event bus. Key topics:
- `comment.created`, `comment.resolved`, `comment.mentioned`
- `approval.requested`, `approval.decided`
- `assignment.created`, `assignment.status_changed`
- `suggestion.created`, `suggestion.accepted`, `suggestion.rejected`
- `merge_request.opened`, `merge_request.merged`, `merge_request.conflict_detected`
- `library.entry_published`, `library.entry_updated`, `library.entry_retired`
- `auto_update.required`, `auto_update.applied`, `auto_update.conflict`
- `expiry.policy_triggered`, `expiry.flag_applied`, `expiry.share_revoked`
- `meeting.session_started`, `meeting.session_ended`
- `calendar.event_linked`, `calendar.event_updated`
- `task.sync_requested`, `task.sync_completed`
- `guest.access_granted`, `guest.access_revoked`

This event bus is also the seam for **agentic integrations** (section 16) — an agent can subscribe to events to react to collaboration changes.

---

## 5. Data Model

All schemas use SQL (Postgres-favored). Schemas are illustrative — concrete DDL would include indexes, FKs, partitioning keys, etc.

### 5.1 Core collaboration schemas

```sql
-- Comment and threading (#179)
CREATE TABLE comment (
    id              UUID PRIMARY KEY,
    deck_id         UUID NOT NULL,
    thread_id       UUID NOT NULL,        -- groups replies under one root
    parent_id       UUID,                 -- null for thread root
    author_id       UUID NOT NULL,
    author_type     TEXT NOT NULL,        -- 'member' | 'guest' | 'agent'
    body_md         TEXT NOT NULL,
    target_type     TEXT NOT NULL,        -- 'element' | 'slide' | 'deck'
    target_id       UUID NOT NULL,
    anchor          JSONB,                -- element-relative or slide-relative offset
    status          TEXT NOT NULL,        -- 'open' | 'resolved'
    is_orphaned     BOOLEAN NOT NULL DEFAULT FALSE,
    emoji_reactions JSONB,                -- { '👍': ['user_id', ...], ... }
    attachments     JSONB,                -- [{ asset_id, filename, mime, size }]
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,
    resolved_at     TIMESTAMPTZ,
    resolved_by     UUID
);
CREATE INDEX comment_deck_idx ON comment(deck_id);
CREATE INDEX comment_thread_idx ON comment(thread_id);
CREATE INDEX comment_target_idx ON comment(target_type, target_id);

CREATE TABLE mention (
    id              UUID PRIMARY KEY,
    comment_id      UUID NOT NULL,
    mentioned_id    UUID NOT NULL,
    mentioned_type  TEXT NOT NULL,        -- 'user' | 'role' | 'group'
    notified_at     TIMESTAMPTZ,
    read_at         TIMESTAMPTZ
);
CREATE INDEX mention_user_idx ON mention(mentioned_id);

-- Approval (#180)
CREATE TABLE approval_request (
    id              UUID PRIMARY KEY,
    deck_id         UUID NOT NULL,
    version_id      UUID NOT NULL,        -- immutable snapshot under review
    requested_by    UUID NOT NULL,
    requested_at    TIMESTAMPTZ NOT NULL,
    policy          JSONB NOT NULL,       -- { lanes: [{role, required, sla_hours}], ... }
    status          TEXT NOT NULL,       -- 'pending' | 'approved' | 'rejected' | 'changes_requested'
    closed_at       TIMESTAMPTZ
);

CREATE TABLE approval_decision (
    id              UUID PRIMARY KEY,
    request_id      UUID NOT NULL,
    lane            TEXT NOT NULL,
    approver_id     UUID NOT NULL,
    decision        TEXT NOT NULL,       -- 'approved' | 'rejected' | 'changes_requested'
    justification   TEXT,
    decided_at      TIMESTAMPTZ NOT NULL,
    version_id      UUID NOT NULL        -- the version the approver saw
);

-- Assignment (#181)
CREATE TABLE assignment (
    id              UUID PRIMARY KEY,
    deck_id         UUID NOT NULL,
    slide_range     INT4RANGE NOT NULL,   -- e.g., [4,7]
    primary_id      UUID NOT NULL,
    watchers        UUID[],
    status          TEXT NOT NULL,       -- 'not_started' | 'in_progress' | 'blocked' | 'review' | 'done'
    blocked_reason  TEXT,
    due_at          TIMESTAMPTZ,
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL,
    completed_at    TIMESTAMPTZ,
    task_link_id    UUID                  -- FK to task_link (#191)
);

-- Suggestion (#182) — semantic operations, not text
CREATE TABLE suggestion (
    id              UUID PRIMARY KEY,
    deck_id         UUID NOT NULL,
    session_id      UUID NOT NULL,        -- session of the suggester
    author_id       UUID NOT NULL,
    target_type     TEXT NOT NULL,        -- 'element' | 'slide' | 'data_binding'
    target_id       UUID NOT NULL,
    operation       JSONB NOT NULL,       -- structured op: {type, params, before_state, after_state}
    status          TEXT NOT NULL,       -- 'open' | 'accepted' | 'rejected' | 'obsolete'
    thread_id       UUID,                 -- attached thread (reuses comment_thread)
    created_at      TIMESTAMPTZ NOT NULL,
    resolved_at     TIMESTAMPTZ,
    resolved_by     UUID
);

-- Merge Request (#183)
CREATE TABLE merge_request (
    id              UUID PRIMARY KEY,
    deck_id         UUID NOT NULL,
    source_branch   TEXT NOT NULL,
    target_branch   TEXT NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    author_id       UUID NOT NULL,
    status          TEXT NOT NULL,       -- 'open' | 'approved' | 'merged' | 'closed' | 'conflict'
    diff_id         UUID NOT NULL,       -- FK to slide_diff
    created_at      TIMESTAMPTZ NOT NULL,
    merged_at       TIMESTAMPTZ,
    merged_by       UUID,
    merge_commit_id UUID                 -- post-merge deck version
);

CREATE TABLE slide_diff (
    id              UUID PRIMARY KEY,
    mr_id           UUID,
    base_version_id UUID NOT NULL,
    target_version_id UUID NOT NULL,
    source_version_id UUID NOT NULL,
    slide_diffs     JSONB NOT NULL,      -- array of {slide_id, change_type, before, after, element_diffs[]}
    binding_diffs   JSONB,                -- array of {binding_id, change_type, before, after}
    computed_at     TIMESTAMPTZ NOT NULL
);

-- Workspace + permissions (#184)
CREATE TABLE workspace (
    id              UUID PRIMARY KEY,
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    owner_id        UUID NOT NULL,
    settings        JSONB,                -- {default_approval_policy, default_expiry_policy, ...}
    created_at      TIMESTAMPTZ NOT NULL
);

CREATE TABLE workspace_member (
    id              UUID PRIMARY KEY,
    workspace_id    UUID NOT NULL,
    user_id         UUID NOT NULL,
    role            TEXT NOT NULL,       -- 'owner' | 'admin' | 'editor' | 'commenter' | 'viewer'
    capabilities    TEXT[],               -- granular capability list
    effective_from  TIMESTAMPTZ NOT NULL,
    effective_to    TIMESTAMPTZ
);
CREATE INDEX workspace_member_user_idx ON workspace_member(user_id);

CREATE TABLE group_member (
    group_id        UUID NOT NULL,
    user_id         UUID NOT NULL,
    PRIMARY KEY (group_id, user_id)
);

CREATE TABLE permission_grant (
    id              UUID PRIMARY KEY,
    resource_type   TEXT NOT NULL,       -- 'workspace' | 'folder' | 'project' | 'deck' | 'slide'
    resource_id     UUID NOT NULL,
    principal_id    UUID NOT NULL,
    principal_type  TEXT NOT NULL,       -- 'user' | 'group'
    capabilities    TEXT[] NOT NULL,
    is_deny         BOOLEAN NOT NULL DEFAULT FALSE,
    effective_from  TIMESTAMPTZ,
    effective_to    TIMESTAMPTZ
);

-- Slide Library (#185)
CREATE TABLE slide_library_entry (
    id              UUID PRIMARY KEY,
    workspace_id    UUID NOT NULL,
    scope           TEXT NOT NULL,       -- 'workspace' | 'org' | 'team'
    team_id         UUID,
    title           TEXT NOT NULL,
    description     TEXT,
    tags            TEXT[],
    owner_id        UUID NOT NULL,
    approval_chain  JSONB,
    status          TEXT NOT NULL,       -- 'draft' | 'pending' | 'approved' | 'retired'
    version_id      UUID NOT NULL,       -- current canonical version
    superseded_by   UUID,                 -- pointer to successor in retire chain
    created_at      TIMESTAMPTZ NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL,
    last_reviewed_at TIMESTAMPTZ
);

CREATE TABLE library_version (
    id              UUID PRIMARY KEY,
    entry_id        UUID NOT NULL,
    version_num     INT NOT NULL,
    slide_snapshot  JSONB NOT NULL,       -- immutable slide state
    data_bindings   JSONB,
    brand_locked    BOOLEAN NOT NULL,
    created_by      UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL
);

-- Auto-update binding (#186) — per-reference config
CREATE TABLE auto_update_binding (
    id              UUID PRIMARY KEY,
    consumer_deck_id UUID NOT NULL,
    consumer_slide_id UUID NOT NULL,
    library_entry_id UUID NOT NULL,
    pinned_version_id UUID,               -- null = follow latest
    mode            TEXT NOT NULL,       -- 'immediate' | 'scheduled' | 'manual' | 'frozen'
    schedule        JSONB,                -- { cron, ... } for scheduled
    is_mandatory    BOOLEAN NOT NULL DEFAULT FALSE,
    last_synced_at  TIMESTAMPTZ,
    last_sync_status TEXT
);

-- Expiry Policy (#187)
CREATE TABLE expiry_policy (
    id              UUID PRIMARY KEY,
    resource_type   TEXT NOT NULL,
    resource_id     UUID NOT NULL,
    interval_days   INT NOT NULL,
    responsible_id  UUID,                 -- user or role
    escalation      TEXT NOT NULL,       -- 'gentle' | 'moderate' | 'strict'
    auto_revoke_share BOOLEAN NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL
);

CREATE TABLE freshness_flag (
    id              UUID PRIMARY KEY,
    resource_type   TEXT NOT NULL,
    resource_id     UUID NOT NULL,
    flagged_at      TIMESTAMPTZ NOT NULL,
    reason          TEXT,                 -- 'policy_overdue' | 'manual' | 'ai_detected'
    resolved_at     TIMESTAMPTZ,
    resolved_by     UUID
);

-- Meeting Integration (#188)
CREATE TABLE meeting_integration (
    id              UUID PRIMARY KEY,
    workspace_id    UUID NOT NULL,
    vendor          TEXT NOT NULL,       -- 'zoom' | 'meet' | 'teams'
    auth            JSONB NOT NULL,       -- encrypted OAuth tokens
    status          TEXT NOT NULL,
    connected_by    UUID NOT NULL,
    connected_at    TIMESTAMPTZ NOT NULL
);

-- Notification (#189)
CREATE TABLE notification_subscription (
    id              UUID PRIMARY KEY,
    user_id         UUID NOT NULL,
    resource_type   TEXT NOT NULL,
    resource_id     UUID NOT NULL,
    event_types     TEXT[] NOT NULL,
    channels        TEXT[] NOT NULL,      -- 'in_app' | 'email' | 'slack' | 'teams'
    quiet_hours     JSONB,                -- { start, end, tz }
    digest_mode     TEXT                  -- 'realtime' | 'hourly' | 'daily'
);

-- Calendar Link (#190)
CREATE TABLE calendar_link (
    id              UUID PRIMARY KEY,
    deck_id         UUID NOT NULL,
    user_id         UUID NOT NULL,
    vendor          TEXT NOT NULL,       -- 'google' | 'outlook' | 'icloud'
    event_id        TEXT NOT NULL,
    event_start_at  TIMESTAMPTZ NOT NULL,
    is_recurring    BOOLEAN NOT NULL,
    recurrence_id   TEXT,                 -- for instance identification
    last_synced_at  TIMESTAMPTZ NOT NULL
);

-- Task Link (#191)
CREATE TABLE task_link (
    id              UUID PRIMARY KEY,
    assignment_id   UUID NOT NULL,
    vendor          TEXT NOT NULL,       -- 'asana' | 'jira' | 'linear'
    external_task_id TEXT NOT NULL,
    external_project_id TEXT NOT NULL,
    field_map       JSONB,                -- {status: '...', priority: '...', ...}
    sync_mode       TEXT NOT NULL,        -- 'domio_wins' | 'task_wins' | 'last_write_wins'
    last_synced_at  TIMESTAMPTZ
);

-- Guest Access (#192)
CREATE TABLE guest_access (
    id              UUID PRIMARY KEY,
    inviter_id      UUID NOT NULL,
    guest_email     TEXT NOT NULL,
    guest_user_id   UUID,                 -- populated on first sign-in
    scope_type      TEXT NOT NULL,        -- 'folder' | 'project' | 'deck'
    scope_id        UUID NOT NULL,
    capabilities    TEXT[] NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ
);
```

### 5.2 Schema design notes

- **Append-mostly tables** (comment, approval_decision, suggestion, merge_request) are partitioned by `created_at` monthly for retention and query speed.
- **Soft delete** is implemented via `effective_to` on permission_grant, workspace_member, guest_access — never hard delete, to preserve audit trails (#196).
- **Immutable snapshots** (library_version, slide_diff.base/target/source) are stored as JSONB blob of the deck schema (#223). They are write-once, never updated.
- **Element-relative anchors** in `comment.anchor` are critical for #179 — they are stored as fractional offsets (0..1) within the element's bounding box.
- **Index strategy**: hot-path lookups (comments by deck, permissions by user+resource, assignments by assignee) are covered by composite indexes; full-text search uses a parallel search index (see §6).
- **JSONB use**: CRDT operations in `suggestion.operation`, diff payloads in `slide_diff`, and policy/field maps use JSONB deliberately — they are inherently structured but schema-flexible.

---

## 6. APIs and Contracts

The section 13 services expose a REST API (with a few GraphQL endpoints for complex fetches). Contracts below are illustrative — production would be in OpenAPI / Protobuf.

### 6.1 Comment CRUD

```http
POST   /api/v1/decks/{deck_id}/comments
       body: { target_type, target_id, body_md, anchor, attachments[], mentions[] }
       → 201 { comment }

GET    /api/v1/decks/{deck_id}/comments?status=open&author=...&page=...
       → 200 { comments: [...], next_cursor }

PATCH  /api/v1/comments/{id}            # edit body, resolve, reopen
       body: { body_md?, status? }
       → 200 { comment }

DELETE /api/v1/comments/{id}            # soft delete; thread remains
       → 204

POST   /api/v1/comments/{id}/reactions
       body: { emoji: '👍' }
       → 200 { reactions }

POST   /api/v1/comments/{id}/mentions
       body: { mentioned_id, mentioned_type }
       → 200 { mention }
```

### 6.2 Approval state transitions

```http
POST   /api/v1/decks/{deck_id}/approval-requests
       body: { policy, version_id, note }
       → 201 { approval_request }

POST   /api/v1/approval-requests/{id}/decisions
       body: { decision: 'approved'|'rejected'|'changes_requested', justification }
       → 200 { approval_request, decision }

GET    /api/v1/decks/{deck_id}/approval-status
       → 200 { current_status, pending_lanes, blockers }

POST   /api/v1/approval-requests/{id}/cancel
       → 200 { approval_request }
```

State transitions are server-enforced; an attempt to transition `pending → approved` with `decision = 'changes_requested'` returns `409 Conflict`.

### 6.3 Suggestion commit / accept

```http
POST   /api/v1/decks/{deck_id}/suggestions
       body: { target_type, target_id, operation }     # operation is the CRDT op
       → 201 { suggestion }

GET    /api/v1/decks/{deck_id}/suggestions?status=open
       → 200 { suggestions }

POST   /api/v1/suggestions/{id}/accept
       → 200 { applied_change }                          # the resolved deck op

POST   /api/v1/suggestions/{id}/reject
       → 204

POST   /api/v1/suggestions/{id}/comment
       body: { body_md }
       → 201 { comment }                                 # attaches to suggestion thread
```

### 6.4 Merge request CRUD

```http
POST   /api/v1/decks/{deck_id}/merge-requests
       body: { source_branch, target_branch, title, description }
       → 201 { merge_request, diff_summary }

GET    /api/v1/merge-requests/{id}
       → 200 { merge_request, slide_diff }

GET    /api/v1/merge-requests/{id}/diffs?level=slide|element|data_binding
       → 200 { diffs }                                    # level-specific payload

POST   /api/v1/merge-requests/{id}/resolve-conflict
       body: { element_id, resolution: 'target'|'source'|'manual', manual_state? }
       → 200 { merge_request }

POST   /api/v1/merge-requests/{id}/merge
       → 200 { merge_request, merge_commit_id }            # runs validation hooks first

POST   /api/v1/merge-requests/{id}/close
       → 200 { merge_request }
```

### 6.5 Library sync

```http
POST   /api/v1/library/entries
       body: { scope, title, description, slide_snapshot, tags, approval_chain }
       → 201 { slide_library_entry, library_version }

GET    /api/v1/library/entries?q=...&tag=...&owner=...&fresh_within=...
       → 200 { entries, next_cursor }

POST   /api/v1/library/entries/{id}/retire
       body: { superseded_by? }
       → 200 { slide_library_entry }

POST   /api/v1/decks/{deck_id}/slides/insert-from-library
       body: { library_entry_id, mode: 'reference'|'copy', target_slide_position }
       → 201 { slide, auto_update_binding }                # if reference
```

### 6.6 Expiry policy CRUD

```http
POST   /api/v1/resources/{type}/{id}/expiry-policy
       body: { interval_days, responsible_id, escalation, auto_revoke_share }
       → 201 { expiry_policy }

PATCH  /api/v1/expiry-policies/{id}
       body: { interval_days?, escalation?, ... }
       → 200 { expiry_policy }

POST   /api/v1/resources/{type}/{id}/confirm-freshness
       → 200 { freshness_flag: resolved }

GET    /api/v1/workspaces/{id}/expiry-dashboard
       → 200 { overdue: [...], upcoming: [...], resolved_30d: [...] }
```

### 6.7 Integration webhook handlers (inbound)

These endpoints receive webhooks from external vendors. Each is HMAC-signed and authenticated.

```http
# Slack
POST   /api/v1/webhooks/slack/events
       body: { type, event, team_id, ... }                 # signed by Slack
       → 200 { handled }

POST   /api/v1/webhooks/slack/commands                     # slash commands
       → 200 { response_text }

POST   /api/v1/webhooks/slack/interactivity                # button clicks
       → 200 { replace_original }

# Teams (similar)
POST   /api/v1/webhooks/teams/events
POST   /api/v1/webhooks/teams/commands

# Calendar
POST   /api/v1/webhooks/calendar/google                    # watch channels
POST   /api/v1/webhooks/calendar/outlook

# Task managers
POST   /api/v1/webhooks/tasks/asana
POST   /api/v1/webhooks/tasks/jira
POST   /api/v1/webhooks/tasks/linear

# Meeting vendors
POST   /api/v1/webhooks/meetings/zoom                      # session events
POST   /api/v1/webhooks/meetings/teams
POST   /api/v1/webhooks/meetings/google
```

### 6.8 Outbound webhooks (Domio → external)

Section 13 services also emit outbound webhooks for #201 (webhooks platform feature) and for vendor integrations:

- `comment.created`, `comment.resolved` → Slack/Teams channel(s), email
- `approval.requested`, `approval.decided` → Slack/Teams, task manager (create task)
- `assignment.created` → task manager (create task)
- `merge_request.opened` → Slack/Teams channel, optional email
- `auto_update.applied` → consumer notification feed
- `expiry.flag_applied` → responsible party, workspace admin channel
- `meeting.session_started` → calendar event update

---

## 7. Security

### 7.1 Permission inheritance (#184)

- Permissions resolve **top-down** through the resource hierarchy: workspace → folder → project → deck → slide.
- A user with `editor` on a workspace gets `editor` on every contained folder/project/deck unless explicitly denied or scoped down.
- **Deny-first**: an explicit deny at any level overrides inherited allows. Example: workspace `editor` + project-level deny `share_external` = user cannot share externally from that project.
- **Effective permissions API**: `GET /api/v1/resources/{type}/{id}/effective-permissions?for=user_id` returns the resolved permission set as a typed capability list — used by the UI to render access lists and by the gateway to authorize.
- **Historical permissions**: every permission grant has `effective_from` / `effective_to`; the engine supports point-in-time queries ("who had access to this deck on March 5?"). This is required by audit and legal hold (#198).
- **No implicit escalation**: a role's default capabilities are explicit; granting `editor` does not implicitly grant `share_external` unless the role's policy says so.

### 7.2 Suggestion mode isolation (#182)

- Each suggestion session operates on a **CRDT-isolated parallel branch** of the deck schema. The user's edits never touch the main branch until accepted.
- The parallel branch has a **strict read-only view of the main branch**: it can read current deck state but not write to it.
- **No privileged suggestions**: a suggestion made by an admin is still a suggestion (not an auto-apply). Suggestions must be explicitly accepted to land.
- **Suggestion retention**: bound by workspace policy (default 90 days). After retention, the suggestion is purged (with audit log of purge retained for compliance).
- **Suggestion on brand-locked region**: authoring allowed; accept blocked unless the user has lock-break rights.
- **Suggestion injection prevention**: suggestion operations are validated against the deck schema before persistence — a malformed CRDT op is rejected.

### 7.3 Approval required for external share (#180, #157)

- External share (`share_external`) is **gated by approval policy**. If a workspace has `legal_required` for external share, attempting `POST /shares` with `policy.external = true` while no approval is granted returns `403 Forbidden` with a structured error `external_share_requires_approval`.
- The approval gate is **per-version**: editing the deck after approval re-evaluates the policy and may revoke the previously-issued share.
- Approval delegation is **explicit**: an admin can delegate approval authority to a role, but delegation cannot be sub-delegated without explicit config.

### 7.4 Guest scoping (#192)

- Guests receive **only the scoped permissions** explicitly granted; workspace-level admin capabilities are never granted.
- Guest sessions are scoped to the specific resource(s) they were invited to; cross-resource access attempts return `403`.
- Guest expiry is **server-enforced**: every request checks `guest_access.expires_at > now()`; expired sessions are invalidated within p95 ≤ 5s.
- Guest identity is **audit-distinct**: every guest action carries `actor_type=guest` and `inviter_id` in the audit log (#196).
- Guest magic links are **single-use within TTL** (default 15 min) and bound to the guest's email; resending invalidates prior links.

### 7.5 PII redaction in comments (#179, #196)

- Comments containing email addresses, phone numbers, or other detected PII are flagged at creation time. Users see a "your comment contains what appears to be PII" warning with options to confirm or edit.
- **Redaction on export**: comment exports (CSV/JSON) auto-redact emails to `‹email›` and phone numbers to `‹phone›` by default; an opt-in "include PII" flag requires elevated permission.
- **DLP scan on comments**: the workspace's content DLP rules (#195) run on every comment; comments containing flagged terms (e.g., "confidential," "internal-only") are blocked from external share contexts and flagged in the admin dashboard.
- **Logs**: comments are not logged in plaintext at the application log level; logs store comment IDs only. Audit log stores redacted-by-default comment bodies.

### 7.6 Audit log (#196)

Every action in section 13 is recorded in the central audit log with:
- **Actor**: user_id, actor_type (`member` / `guest` / `agent` / `system`), IP, user-agent, session_id
- **Action**: typed (e.g., `comment.create`, `approval.decision`, `mr.merge`, `library.publish`, `guest.invite`)
- **Resource**: type + id
- **Before / after state** (for state-changing actions)
- **Timestamp**: server time (UTC)
- **Trace ID**: links to the originating API request for distributed tracing

Audit log is **append-only**, retained per workspace policy (min 1 year, max indefinite for legal hold), exportable to SIEM (#197 compliance).

---

## 8. Performance

### 8.1 Comment thread fan-out (#179)

A comment with mentions may fan out to N subscribers across in-app, email, Slack, Teams. The fan-out pattern:
1. Comment write to `comment` + `mention` tables (single transaction).
2. Event `comment.created` published to event bus.
3. Notification fan-out service consumes event; for each subscriber, picks the highest-priority channel (in-app if online, else Slack/Teams if connected, else email).
4. **Batched delivery**: if a subscriber has 5 mentions in 30 s, they're delivered as a single digest.
5. **DND check**: if user is DND or in quiet hours, the notification queues for digest at the end of the quiet window.

Targets:
- Single comment write: **p95 ≤ 200 ms**.
- Fan-out start: **p95 ≤ 1 s** after write.
- Delivery complete: **p95 ≤ 5 s** for first delivery, **p99 ≤ 15 s**.

### 8.2 Library sync throughput (#185, #186)

Library update propagation must scale to **400+ consumer decks** in a single update cycle (per the #186 spec example).

Architecture:
- Library write → event `library.entry_updated` published.
- Event bus partitions by `entry_id` so updates to the same entry are ordered.
- A **fan-out worker** consumes the event and queries all `auto_update_binding` rows for that entry.
- Bindings are partitioned into shards; parallel workers process shards. With 10,000 bindings, 100 workers, target = 100 bindings/worker.
- Each binding has a per-binding worker that:
  - Checks compatibility (no consumer-local conflict).
  - If compatible, applies the update and updates `last_synced_at`.
  - If conflict, writes to a `pending_conflict` queue and notifies the consumer.
- Total propagation time: **p95 ≤ 60 s** for 10,000 bindings.

For **mandatory updates**, priority is raised; the queue is drained faster (shorter backoff between worker batches).

### 8.3 Auto-update propagation latency (#186)

Detailed in §3.2 and §8.2; the targets are:
- Immediate (write-through): **p95 ≤ 60 s**.
- Lazy: **0 ms** added to user-visible latency on read (the update is applied during the slide's hydration).
- Mandatory: **p95 ≤ 30 s** (higher priority).
- Bulk: rate-limited per consumer but the overall propagation completes within **p95 ≤ 5 min** for 10k bindings.

---

## 9. Observability and Testing

### 9.1 Observability

**Metrics** (per service, exported to Prometheus / OTLP):
- Comment write/read latencies (p50, p95, p99)
- Approval state transition counts and durations
- Suggestion counts (open / accepted / rejected / obsolete)
- Merge request counts (open / merged / conflicted) and time-to-merge
- Permission evaluation latency (p95) and cache hit rate
- Library publish/retire counts
- Auto-update propagation latency (per binding)
- Expiry flag counts (per escalation tier)
- Notification fan-out latency and delivery success rate
- Guest session counts and revocation latency

**Logs** (structured JSON, shipped to a central store):
- Every state-changing action logs `{actor, action, resource, before, after, trace_id}`.
- Logs redact PII in comment bodies by default; an opt-in `audit_verbose` mode includes redacted bodies.
- Per-service log levels; no PII in INFO-level logs.

**Traces** (OpenTelemetry):
- API requests traced across the gateway → services → event bus → downstream consumers.
- Cross-service operations (e.g., "create comment + fan out notifications") are parented by a single trace.

**Alerts**:
- Comment write p99 > 1 s → warn.
- Approval state transition rejection (409) rate > 1% → warn (suggests client misuse).
- Auto-update propagation p95 > 60 s → critical.
- Expiry scheduler missing a run → critical.
- Guest revocation latency p99 > 30 s → critical.
- Notification delivery failure rate > 5% → warn.
- Permission evaluation p99 > 100 ms → warn (cache miss spike).

### 9.2 Testing

**Unit tests**: every state machine (approval, assignment status, suggestion conflict detection, permission resolution, expiry escalation, guest expiry) has exhaustive state-coverage tests. The approval state machine alone is tested with hundreds of transition combinations.

**Integration tests**:
- Comment + notification fan-out (in-app + Slack + email + Teams): full pipeline test with vendor stubs.
- Approval flow end-to-end: submit → notify → decide → audit → unblock external share.
- Suggestion session: parallel CRDT branches; conflict detection between suggestions.
- Merge request: branch → edit → MR open → diff computed → review → merge → audit.
- Library publish → propagate → consumer-side update with conflict detection.
- Expiry: schedule → flag → notification → strict-mode auto-revoke → freshen → restore.
- Guest: invite → magic link → access → expire → revoke.

**Contract tests**:
- Every webhook handler (inbound Slack/Teams/Calendar/Task) is tested with vendor-recorded payloads.
- Every outbound webhook payload is schema-validated against the contract.

**Load tests**:
- Comment thread fan-out: 10k mentions/min, target delivery p99 ≤ 15 s.
- Library propagation: 10k bindings, single update, target p95 ≤ 60 s.
- Permission evaluation: 1k req/s, target p95 ≤ 50 ms (cached).
- Expiry scheduler: 100k resources, target scheduler run ≤ 10 min.

**Security tests**:
- Permission denial cases (deny-first overrides): comprehensive.
- Guest scope enforcement: cross-resource access attempts blocked.
- Suggestion isolation: a suggestion cannot affect the main branch until accepted.
- DLP scan on comments: flagged terms blocked.
- Webhook signing verification: unsigned requests rejected.

**Property-based / fuzz tests**:
- CRDT suggestion operations: malformed ops rejected.
- Permission resolution: no combination of grants can escalate beyond the union of granted capabilities.
- Approval state machine: no illegal transition reachable via any sequence of valid API calls.

---

## 10. Cross-Section Ties

Section 13 doesn't stand alone — it touches every other section. The ties below are intentional integration points, not afterthoughts.

### 10.1 Editor (section 1) — features #17–#22

- **#17 multiplayer live editing**: comment pins must not jitter during live multiplayer cursor motion; the comment anchor is element-relative, not pixel-relative, so it survives real-time element drag.
- **#19 branching & merging**: the merge request (#183) builds directly on the branching primitive from section 1. A merge request is essentially a "request to merge branch X into branch Y with visual review."
- **#20 version history**: approval snapshots (#180) become version-history checkpoints; suggestion accepts land as version history entries with author attribution "Accepted from Priya's suggestion"; merge commits land as version history entries.
- **#21 CRDT-based offline sync**: the suggestion-mode CRDT (#182) extends the same CRDT machinery used for offline sync — just with a different branch target.
- **#22 autosave every keystroke**: comments and suggestions are autosaved on every keystroke as drafts; this means draft comments survive reload.

### 10.2 Components (section 2) — features #23–#36

- **#25 smart components with editable props**: slide library entries (#185) can be smart components — when inserted, the consumer sees the props panel for the component, not the underlying element. Auto-update (#186) preserves the props contract.
- **#27 shared team component libraries with publish/subscribe**: this is the component-level analog of the slide library; the same publish/subscribe model with auto-update propagation applies.
- **#28 community marketplace**: the slide library has a workspace-private scope and an org-wide scope; a community marketplace is a future scope (`marketplace`) that reuses the same library service with a different audience.
- **#36 brand-locked templates**: slide library entries inherit brand locks; suggestions (#182) and merge requests (#183) must respect them; guest collaborators (#192) cannot break them.

### 10.3 Shared slides tied to component libraries

- A library entry can be a **single slide** (most common) or a **multi-slide section template** (#31).
- When a section template is inserted into a deck, the auto-update binding (#186) is created at the **section level** (multi-slide binding); the section updates atomically.
- Components on a library slide retain their **provenance chips** (#215) — the lineage is queryable by agents via the agentic interfaces (#293).

### 10.4 AI assistant (section 8) — features #108–#125

- **#108 full deck generation**: when AI generates a deck, it can auto-create a **review request** with a configured approval policy.
- **#113 copy assistant**: edits are surfaced as **suggestions** (#182), not applied directly — preserving the human-in-the-loop pattern.
- **#117 AI rehearsal coach**: coaching sessions produce a private **comment thread** on the relevant slides, visible only to the presenter.
- **#119 smart summarization**: the AI's "executive summary" slide is inserted as a **suggestion** by default, not auto-applied.
- **#121 layout repair**: AI layout fixes are surfaced as **bulk suggestions** that the author reviews.
- **#125 AI content freshness checker**: integrates with the expiry policy scheduler (#187) — can auto-confirm freshness for data-driven slides.

### 10.5 Sharing per-link content (section 11) — features #155–#168

- **#155 every deck is a web page**: an external share link can only be published if the deck's approval status allows it (#180).
- **#158 expiring links and per-viewer watermarking**: if a deck goes stale (#187), watermarking includes a "stale" indicator on the share view.
- **#159 per-link content control**: a per-link content control can restrict the shared deck to only "approved-by-legal" slides; this integrates with the approval state machine.
- **#168 deck update propagation (kills final_v7.pptx)**: this is the same propagation fabric as #186 — fixing a typo once updates every shared link, including external ones.

### 10.6 Enterprise governance (section 14) — features #193–#204

- **#193 SSO/SCIM**: guest collaborators (#192) can authenticate via the workspace's SSO if their email domain matches.
- **#194 brand governance dashboard**: draws on the expiry policy scheduler (#187) and the slide library governance (#185) for on-brand and freshness signals.
- **#195 content DLP rules**: run on every comment (#179) and on every merge request's diff (#183) before merge.
- **#196 audit logs**: section 13 actions are first-class in the audit log (§7.6).
- **#197 data residency**: guest data, comment data, and library entries are all subject to the workspace's data residency rules.
- **#198 legal hold and retention**: comments, suggestions, and merge requests can be placed under legal hold; their retention clock pauses until released.
- **#199 usage-based seat analytics**: guests (#192) and external share viewers feed into seat analytics.
- **#200 public API + SDK**: section 13's APIs (§6) are exposed via the public API and SDK; an external system can create assignments, open MRs, request approvals programmatically.
- **#201 webhooks**: section 13 events are first-class webhook topics (comment.created, approval.decided, etc.).
- **#202 plugin architecture**: a plugin can extend the notification fan-out (e.g., to a custom channel), the permission engine (e.g., a new capability), or the merge conflict resolution (e.g., a custom resolver).
- **#203 custom component development kit**: custom components in a library entry retain their props contract through auto-update (#186).

### 10.7 Agentic suggestion mode (section 16) — features #221–#240

- **#221 MCP server**: the section 13 services are exposed via MCP tools: `comment.create`, `approval.request`, `assignment.create`, `suggestion.create`, `merge_request.open`, `library.search`, `library.insert`, `auto_update.configure`, `guest.invite`, etc. The MCP server is the same code path as the REST API.
- **#225 agent-scoped permissions**: an agent acting on behalf of a user is subject to the user's permissions (#184). A guest agent has the guest's scoped permissions (#192). Agent actions are tagged `actor_type=agent` in the audit log.
- **#227 tool-call transcript / agent audit trail**: every agent action in section 13 (e.g., an agent opening a merge request) is logged distinctly from human edits.
- **#228 dry-run / preview mode for agent edits**: an agent can use **suggestion mode** (#182) to propose changes instead of applying directly — same semantic diff, same accept/reject UI, but the actor is `agent` and the audit log entry says "Agent: Claude via MCP proposed slide edit."
- **#229 webhooks → agent triggers**: a webhook event from section 13 (e.g., `comment.created` with a `@agent-handler` mention) can invoke an MCP-driven agent workflow.
- **#230 agent-to-agent handoff**: a "deck-builder" agent opens a merge request; a "brand-compliance" agent (running hook #202) reviews it; a "rehearsal-coach" agent comments on it. All section 13 primitives used by both humans and agents.
- **#240 deck diffing API for agents**: the merge request diff engine (#183) is exposed as an MCP tool `diff_decks(deck_a, deck_b)` returning structured diffs.
- **#238 confidence/uncertainty surfacing**: AI-generated narrative in slides (per #110) carries a confidence flag visible in comments — agents can post a comment with `confidence: 0.62` that downstream compliance agents can detect.

---

## Appendix A — Section 13 at a glance

| # | Feature | Service | Storage | Key integration |
|---|---------|---------|---------|-----------------|
| 179 | Comments | Comment Service | `comment`, `mention` | Section 1 editor; section 11 share |
| 180 | Approval | Approval Engine | `approval_request`, `approval_decision` | Section 11 external share; section 14 audit |
| 181 | Assignments | Assignment Service | `assignment` | Section 13 #191 task mgr; section 14 audit |
| 182 | Suggestions | Suggestion CRDT | `suggestion` | Section 1 CRDT; section 16 agentic |
| 183 | Merge requests | MR Service + Diff Engine | `merge_request`, `slide_diff` | Section 1 branching; section 16 MCP |
| 184 | Workspaces | Workspace Permission Engine | `workspace`, `workspace_member`, `permission_grant` | All sections (every API call) |
| 185 | Slide library | Library Service | `slide_library_entry`, `library_version` | Section 2 component libs; section 14 governance |
| 186 | Auto-update | Auto-Update Bus + Bindings | `auto_update_binding` | Section 11 propagation; section 14 governance |
| 187 | Expiry | Expiry Policy Scheduler | `expiry_policy`, `freshness_flag` | Section 14 governance; section 8 #125 |
| 188 | Meeting integrations | Meeting Tool Adapters | `meeting_integration` | Section 9 presenter; section 10 audience |
| 189 | Slack/Teams | Notification Fan-Out + Adapters | `notification_subscription` | Section 14 audit; section 16 webhooks |
| 190 | Calendar | Calendar Integration | `calendar_link` | Section 9 presenter; section 10 audience |
| 191 | Task managers | Task Manager Adapters | `task_link` | Section 13 #181 assignments; section 14 audit |
| 192 | Guest access | Guest Access Manager | `guest_access` | Section 14 SSO/audit; section 16 agent scoping |

---

## Appendix B — Open questions for follow-up

1. **Suggestion retention default**: 90 days seems long for casual reviews but short for compliance-sensitive industries; should this be per-workspace configurable from day one?
2. **Approval lane parallelism**: should "approved by any one of {legal, finance, brand}" be expressible in the policy, or only all-required? (Current spec assumes all-required.)
3. **Library governance cross-workspace**: how do org-wide library scopes interact with workspace-level permissions? Spec assumes org-scoped libraries require org-admin rights to publish.
4. **Auto-update conflict UX**: when 400 decks are mid-conflict with a mandatory library update, what's the prioritization rule? Spec assumes mandatory > non-conflicting, but doesn't specify a tiebreaker.
5. **Guest billing model**: guests count toward seat usage — but the rate needs to be defined; defer to section 14 #199.
6. **Agent-scoped permissions vs section 16 #225**: this section covers guest scoping; the agent-specific scoping (e.g., "this MCP key can only read this deck") needs deeper modeling in section 16.

---

**Coverage:** Features 179–192 — Comments pinned to elements with threads, mentions, resolve; Review/approval workflows; Slide-level assignments with status tracking; Suggestion mode with semantic diff; Deck merge requests with visual diff; Team workspaces with folders and granular permissions; Slide library governance; Auto-updating shared slides with propagation; Content expiry policies; Meeting-tool integrations (Zoom/Meet/Teams); Slack/Teams notifications; Calendar integration; Task-manager integrations (Asana/Jira/Linear); Guest collaborators with scoped expiring access. Section 13 is fully covered across feature mapping, UX flows, functional/non-functional requirements, architecture, data model, API contracts, security, performance, observability/testing, and cross-section ties.

**File:** `/home/daiyaan2002/Desktop/Projects/domio/docs/collaboration-workflow.md`