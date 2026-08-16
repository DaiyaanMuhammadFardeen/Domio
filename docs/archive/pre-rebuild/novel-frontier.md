# Section 15 — Novel & Frontier Features

**Scope:** Features 205–219 of the Domio product specification (the "no one has this" layer). This section is where Domio stops being a better PowerPoint and starts being a fundamentally different kind of presentation surface — one that records itself, listens, watches, talks back, and understands the cross-deck corpus of an organization the way a senior analyst does. The feature numbers below reference `feature-list.md`; cross-references to other sections use the same numbering convention.

The fundamental design tension in this section: **Domio becomes a sensor-and-effect platform for live human communication.** Webcams, microphones, GPS-free beacons (URLs/QR), and shared cursors become first-class signals. The same signals that enable magic — eye-tracking highlighting, voice-triggered scenarios, AI surfacing the right appendix slide — are also the ones that get a product banned from boardrooms, sued under GDPR/PDPA (see `pre-development-planning-guide.md` §11), or shelved by security review. Every feature in 205–219 is therefore designed around a **consent-first** posture: no sensor activates without an explicit, revocable, time-bounded consent record; no signal leaves the device unless the user has affirmatively opted into the cloud path. Privacy isn't a footnote in this section; it's the architectural substrate.

The secondary tension is **reliability under live conditions.** Unlike editor-mode features (section 1) where a misbehavior is a recoverable edit, a misbehavior during a live board presentation is a career event. Hence: every novel feature has a **graceful-degradation path** (gaze off → normal cursor; gesture off → clicker; voice off → clicker; AI listener off → no slide change), an **auditable record** (what was decided, what was shown, what was inferred), and an **operator override** (the presenter can always disable any frontier feature mid-session).

---

## 1. Feature-by-Feature Mapping

### F205 — Presentation state timeline (record & replay every interaction)

**Definition.** During a live session, every interaction — slide advance, scenario toggle, drill-down, hover, annotation, poll vote, Q&A submission, hidden-slide reveal, reorder, audience-driven navigation, presenter note spoken aloud — is appended to an ordered, replayable event log. After the session, an attendee (or someone who wasn't there) can scrub through the exact presentation as it happened, including every state the deck passed through.

**Acceptance criteria.**

- The timeline captures both **discrete events** (slide 3 → slide 4 at t=00:01:23, "Bear case" scenario toggled at t=00:04:11) and **derived state snapshots** (the actual rendered pixel state at t=00:01:23.500) at a configurable cadence (default 1 Hz, adjustable up to 10 Hz for short sessions).
- Replay shows the slide exactly as it appeared: live data values, scenario state, animations mid-flight (paused at the correct frame), open overlays, active polls with their running totals at each moment, and the presenter's annotations on top.
- Replay supports scrub, play/pause, and ±0.25× / 0.5× / 1× / 2× / 4× speed.
- Replay is _deterministic_: given the same timeline, the same deck version, and the same data-source snapshots, the replay is byte-identical across viewers.
- An "actions taken" rail shows a textual summary alongside the visual replay ("clicked Bull scenario on slide 7; opened ROI calculator on slide 12 with slider=15; jumped to appendix B from Q&A queue").
- Replay is sharable: a URL like `https://domio.app/replay/<session_id>` that any authorized viewer can open with no extra setup.
- Replay respects the same access controls as the underlying deck — confidential decks produce gated replays (F158).
- Replay data is stored separately from deck edits; deleting a replay does not delete the deck.

**Behavioral details.**

- The recorder runs on the presenter client (the "source of truth" for what was on screen) and streams events to a server-side append-only log with monotonically increasing sequence numbers per session.
- Each event carries `{session_id, seq, t_wall, t_mono, actor_id, event_type, payload, deck_version_hash, data_source_snapshot_id}`.
- Snapshots are stored as compact deltas against the prior snapshot using a CRDT-style diff (reusing F21's CRDT machinery where possible) to keep storage small.
- Scenario toggles (F57), calculator inputs (F102), branch choices (F97), and audience-driven navigation votes (F148) are first-class event types — they replay exactly.
- Animations (F85–F95) replay by recording animation _clock time_, not wall time: scrub to t=4.1 s of a slide and you see the animation at frame 4.1 s, regardless of how fast the user scrubs.
- Live data (F48–F63) replays from **snapshot values captured during the live session**, not from re-querying the source — otherwise the replay is non-deterministic (today's revenue won't match what was shown yesterday).

**Edge cases.**

- **Presenter disconnects mid-session (F136):** recorder on phone (if F127 is enabled) takes over with same `session_id` and continues appending events with a `actor_changed` event at the boundary. Replay shows the seam as a single annotation, not a discontinuity.
- **Two presenters simultaneously (F135):** events carry `actor_id`; replay UI shows a per-actor color band on the timeline so it's clear who did what.
- **Audience-driven navigation (F148) wins over presenter click:** both events are in the log; replay shows the audience vote and the auto-jump.
- **Live data source unavailable at replay time:** replay falls back to the captured snapshot value and shows a "data as of <timestamp>" badge on affected slides (F63).
- **Replay of a session with a since-deleted deck:** if the deck is still in trash, replay shows a "deck deleted" overlay with a restore link; if purged, replay is auto-deleted along with the deck (cascade policy configurable per org).
- **Replay storage growth:** a 1-hour session typically produces 5–20 MB of timeline data (depends on snapshot cadence); retention defaults to 365 days for paid tiers, 30 days for free.

---

### F206 — "Living documents" decks (the permanently-alive QBR)

**Definition.** A deck marked "living" is bound to its data sources permanently and updates itself in place: every viewer always sees the current numbers, every comment ever made on the deck accumulates forever, and the deck URL never goes stale. The convention "Q3 deck v2" is eliminated by removing the need for a "v2."

**Acceptance criteria.**

- A living deck has a stable `deck_id` that never changes; URL `domio.app/d/<deck_id>` always resolves to the current state.
- Data bindings (F48) refresh on a configurable cadence (default: every 5 min during business hours, hourly off-hours; manual "refresh now" always available).
- Comments (F179) accumulate: every comment ever made on the deck is preserved; comments on deleted slides are archived but searchable.
- Versioning (F20) still exists but is implicit: every state change appends to the version log; users browse history without the "v2" mental model.
- New viewers always see the current state; existing viewers see a "slide X changed since you last viewed" badge on slides whose content has changed.
- Living decks can be "frozen" temporarily (e.g., during a board meeting) — frozen state shows the snapshot at freeze time, with a banner "frozen at <ts>, will resume live updates after <unfreeze ts>."
- A living deck can be "cloned" (with full copy) for archival or for creating a divergent variant (tied to F19, F212).

**Behavioral details.**

- Living is a deck-level flag, not a per-slide flag; binding either persists everything or nothing.
- When data refreshes, only the data-bearing elements update; layout, theme, animations, and non-data text remain byte-identical, so the user's mental model of "where things are" doesn't shift underneath them.
- Changes accumulate into a "living log" — a deduplicated, semantic diff (not a textual diff) showing "Revenue changed from $4.2M to $4.5M, source refreshed at <ts>."
- When a viewer opens a living deck that's been changed since they last viewed it, they see a per-slide change summary on hover: "+$300K revenue, sourced 2h ago."
- Subscriptions (see F206 data model below) let specific roles opt into push notifications for changes ("notify #finance-team when the burn-rate slide changes by > 5%").

**Edge cases.**

- **Source system deleted or schema changed (F48):** affected elements are marked stale (F125); the deck remains viewable but with a banner; remediation requires rebinding.
- **Two viewers editing the same living deck:** collaborative editing (F17, F21) applies normally; the living nature doesn't change conflict resolution — CRDTs still merge.
- **Comments on a slide that's since been deleted:** comments are preserved in an "archived comments" section of the living log, searchable.
- **Living deck exceeds 10k edits over its lifetime:** older entries are compacted into semantic summaries every 90 days to keep the log searchable (original entries retained for compliance).
- **User "un-lives" a deck:** becomes a static snapshot at un-live time; subsequent edits follow normal versioning. This is irreversible without cloning.
- **Freeze/unfreeze during a live session (F126–F141):** freeze is the recommended state for any deck being presented live; auto-unfreeze at session end is the default.

---

### F207 — Gaze-guided highlighting (opt-in webcam eye-tracking)

**Definition.** With presenter's explicit opt-in, the presenter's webcam performs on-device eye-tracking; the slide subtly spotlights the region the presenter is looking at (a soft circular highlight, like a faint spotlight following their gaze) so the audience's attention is gently guided. The highlight is present on the audience's view only — the presenter's own view is unaffected.

**Acceptance criteria.**

- Gaze tracking is **strictly opt-in per session**, with a separate, more prominent opt-in for recording the gaze data vs. only using it transiently.
- All gaze computation happens on-device (webcam frames never leave the presenter's machine) unless the user explicitly opts into cloud processing (off by default; not even offered in the default UI for users in PDPA-restricted jurisdictions).
- The highlight follows the presenter's gaze with a perceptible but not jarring easing (300 ms ease-out); "flicker" between regions is debounced to a minimum 250 ms dwell per region.
- The audience can see the highlight is gaze-guided via a tiny "👁 presenter eye-tracking" badge in the corner of their view, linked to a disclosure page (transparency, not covert use).
- The presenter can disable gaze highlighting at any time with a single keystroke (default `G`); disabled state persists for the rest of the session.
- The presenter sees their own gaze trail in a small inset for debugging ("is it tracking my eyes correctly?") — toggleable.
- Eye-tracking accuracy target: ±50 px on a 1920×1080 slide at 60 cm viewing distance, on a 720p webcam, in good lighting (300+ lux).

**Behavioral details.**

- Eye-tracking model runs in a WebAssembly module (MediaPipe FaceMesh or a custom 6-DOF gaze model) at ~15 Hz on the presenter's webcam stream.
- The model outputs a gaze ray; the ray is intersected with the slide plane (known from the presenter's viewport geometry) to produce a (x, y) coordinate in slide space.
- That coordinate is broadcast (if audience sync, F213) at ~10 Hz via the real-time channel, throttled and quantized to 32×24 grid to minimize bandwidth and to discourage fine-grained behavioral profiling.
- The audience client renders a radial gradient highlight centered on the received coordinate, with size and opacity tunable in the deck's theme.
- Consent record (see F207 data model) stores: presenter id, session id, opt-in timestamp, scope (transient vs. recorded), expiry, and revocation timestamp if revoked.

**Edge cases.**

- **Webcam permission denied:** feature is unavailable; no error, no nag, no fallback highlight (avoids suggesting the feature is on when it isn't).
- **Poor lighting / off-axis gaze / glasses glare:** the model reports a confidence score; below threshold, the highlight fades out gracefully (no jittery jumps).
- **Presenter looks away from screen (notes, audience):** highlight fades to center over 1 s rather than snapping to where the model last saw the gaze.
- **Audience member has photosensitivity:** the highlight is configurable to a static ring, an arrow, or off entirely; respects `prefers-reduced-motion`.
- **Gaze data leak via network:** coordinate broadcasts are one-way (presenter → audience); no gaze data is sent to analytics, audit, or any server beyond the live session broadcaster; the on-device buffer is zeroed on session end.
- **Two presenters (F135):** only the active presenter (the one whose pointer is in "live" mode) drives the highlight; the inactive presenter's gaze is ignored.
- **Gaze on interactive elements (F96–F105):** the highlight is suppressed on form inputs (don't visually point at a password field the presenter is filling in).

---

### F208 — Gesture control (webcam hand gestures for advance/point)

**Definition.** The presenter uses hand gestures captured by their webcam to advance slides, go back, point at regions, and trigger a small set of presenter actions — useful on stage without a clicker, in sterile environments (kitchen demos, labs), or when hands are otherwise occupied.

**Acceptance criteria.**

- Supported gestures (default set, all configurable on/off):
  - **Open palm forward, push right** → next slide
  - **Open palm forward, push left** → previous slide
  - **Index finger point (held 1 s)** → "pointer" mode: a virtual laser follows the fingertip
  - **Closed fist (held 0.5 s)** → "laser off" / dismiss pointer
  - **Two-finger tap** → toggle pause/resume of any running animation/timer
  - **Thumbs up** → "next build step" (advance animation states within a slide)
- Each gesture has a debounce/cooldown (default 800 ms) to prevent double-trigger.
- Each gesture has a confidence threshold (default 0.85) below which it's ignored.
- The presenter sees a small HUD ("gesture: NEXT_SLIDE, conf 0.92") to confirm what was detected.
- A "training" mode lets the presenter do each gesture 5 times before the session starts; the model calibrates to their hand proportions and lighting.
- The presenter can disable any single gesture (e.g., disable "push left" if they keep triggering it accidentally) without disabling the whole feature.
- Gesture recognition runs entirely on-device; webcam frames never leave the presenter's machine.

**Behavioral details.**

- Hand-pose model runs at ~24 Hz on the webcam stream (MediaPipe Hands or a custom 21-landmark model).
- A small state machine tracks gesture _trajectories_, not just instantaneous poses — "push right" is detected as palm-open + rightward velocity over 300 ms, not just "palm open at frame N."
- Pointer mode projects the fingertip (x, y, z) onto the slide plane using the presenter's webcam position relative to the screen (calibrated at session start with a 3-second "look at each corner of the screen" routine).
- A gesture-to-action mapping is user-editable: a power user can remap "thumbs up" to "open calculator" instead of "next build."

**Edge cases.**

- **Multiple hands in frame (audience behind presenter):** the model picks the largest/closest hand and labels it; if the chosen hand isn't the presenter's (e.g., a co-presenter walks by), the HUD shows "ambiguous — gesture ignored" and waits.
- **Gesture misfire:** the cooldown prevents rapid re-trigger, but if a gesture fires incorrectly, the presenter can hit `Esc` or any keyboard shortcut to override.
- **Lighting too dark / too backlit:** model confidence drops; HUD shows "low confidence, gestures disabled"; presenter is told to use keyboard or clicker.
- **Webcam permission denied:** feature unavailable; graceful no-op.
- **Gesture conflicts with F207 gaze tracking:** both can be on simultaneously; the pointer from gesture takes precedence over gaze spotlight on the audience view (gesture is intentional, gaze is implicit).
- **Sterile gloves / PPE:** the model supports a "gloved hand" profile (slightly lower confidence threshold, larger bounding-box tolerance); toggleable per session.
- **Latency:** end-to-end gesture → slide advance target: < 200 ms p95 (gesture detected at t, action triggered by t+200ms).

---

### F209 — Voice-triggered slide states (ASR with confirmation guard)

**Definition.** The presenter speaks natural phrases ("let's look at the bear case", "show the appendix", "next slide", "zoom in on Q3") and the deck responds by toggling scenarios, jumping, or activating elements. A "confirmation guard" prevents accidental triggers from incidental conversation.

**Acceptance criteria.**

- Trigger phrases are configurable per deck; defaults include scenario toggles (e.g., "bear case" / "bull case" / "base case" for the F57 scenario switcher), navigation ("next slide", "go back", "jump to <slide-name>"), and content actions ("show sources", "open calculator", "zoom to <region>").
- A "wake word" prefix is configurable (default "hey deck", off by default — many users prefer always-on with confirmation instead).
- The confirmation guard: every voice trigger must be confirmed by one of:
  - The same phrase being repeated within 2 s ("show bear case" → "show bear case"), OR
  - A short explicit confirm phrase ("yes do it", "confirmed"), OR
  - The presenter pressing `Enter` within 2 s of the trigger being spoken
- Without confirmation, the trigger is queued as a "pending suggestion" in the HUD and never executes.
- ASR runs on-device by default (Web Speech API or Whisper-tiny in WASM); cloud ASR is opt-in only.
- Microphone audio is never recorded unless the user explicitly opts into recording (separate consent from F214 AI listener).

**Behavioral details.**

- ASR runs continuously while voice trigger is enabled; partial transcripts are matched against the trigger phrase list with fuzzy matching (edit distance ≤ 2, or semantic similarity ≥ 0.85 using a small embedding model).
- The matching engine is event-driven: a partial transcript crossing 70% similarity to any trigger raises a "candidate" event; crossing 95% raises a "trigger" event that goes into the confirmation queue.
- The HUD shows "heard: '...bear case...' — say 'confirmed' or press Enter" so the presenter knows the system is listening and what's pending.
- A "voice trigger log" is kept (in-memory only, zeroed on session end) for debugging false negatives/positives; never persisted to disk or network.

**Edge cases.**

- **False trigger from a participant's question ("can you show the bear case?"):** the confirmation guard catches it; if the presenter says "yes do it" deliberately, it fires; otherwise it's a no-op.
- **Presenter has a cold / voice is hoarse:** ASR can be set to a more permissive acoustic model temporarily.
- **Background noise / crosstalk:** the model has a noise gate; if SNR drops below threshold, voice trigger auto-pauses for the duration.
- **Phonetic ambiguity ("base case" vs "bear case"):** the trigger list is matched with phonetic distance, not just lexical; ambiguous cases require higher confirmation threshold.
- **Language:** defaults to the presenter's UI language; can be switched per session (useful for bilingual presenters).
- **Multi-presenter (F135):** only the active presenter's mic is listened to; the inactive presenter's audio is muted from the trigger channel.

---

### F210 — Ambient boardroom mode (pre-meeting branded dashboard)

**Definition.** When a deck is scheduled to present soon (per calendar integration F190) or is opened on a room display before a meeting, it enters "ambient mode": it idles on a branded dashboard of the live data the deck is about to discuss — KPIs ticking, scenarios rotating, headlines from the deck cycling in — waiting for the presenter to take over.

**Acceptance criteria.**

- Ambient mode activates automatically when:
  - The deck is opened on a "room display" device profile (kiosk tablet, wall-mounted screen), OR
  - The deck's calendar entry (F190) is < 15 min away (configurable), OR
  - The user explicitly enables "ambient" from the deck's share menu.
- The ambient screen shows the deck's hero metric(s), rotating scenario cards, recent "story" headlines, and a quiet countdown to meeting start.
- The ambient screen refreshes data on the same cadence as the living deck (F206): every 5 min during business hours.
- A presenter walking into the room can take over with a single tap (or presence detection via the room display's camera, opt-in only) — the ambient screen transitions to presenter view instantly.
- If no one takes over for > 30 min (configurable), ambient mode powers down to a single still frame ("standby") to save screen and energy.

**Behavioral details.**

- The ambient dashboard is generated from the deck's data bindings: any element bound to a live source (F48) is eligible to appear on the dashboard; the author can curate which elements appear via a "Ambient composition" panel.
- Scenarios (F57) rotate slowly (one every 10 s) so the audience sees all the cases before the meeting starts.
- The dashboard respects the deck's theme (F37–F47) but defaults to a dimmer, larger-type variant optimized for across-the-room viewing.
- A "news" strip at the bottom shows the deck's most recent living-log entries (F206) — "Revenue updated 2 min ago, +$300K" — so the room sees the deck is alive.

**Edge cases.**

- **No calendar integration:** ambient mode still works via manual enable or scheduled windows ("ambient every weekday 9–10am on this display").
- **Data source unavailable:** ambient shows last-known values with a "data as of <ts>" badge; never shows blanks.
- **Meeting runs late:** the countdown adjusts automatically when the calendar event is moved.
- **Sensitive data on ambient screen:** an org-level policy can suppress ambient mode for decks tagged "confidential" (matches F158).
- **Multiple decks scheduled in the same room:** the room cycles between them on the schedule, with a soft transition.
- **Screen burn-in:** elements move on a slow drift path (F93 reduced-motion is respected — drift disabled if requested).

---

### F211 — Two-way slides (live negotiation from multiple devices)

**Definition.** A specific slide type — most commonly a pricing negotiation, term sheet, or split allocation — accepts simultaneous input from multiple parties (each on their own device), converges on a shared visible state, and records the convergence path into the deck for later reference.

**Acceptance criteria.**

- A "two-way slide" is a slide containing one or more **negotiation widgets**: sliders, allocation bars, multi-party split inputs, or free-form counters.
- Each party is invited via the existing F142 audience-join mechanism (QR code) and identified by name/role ("Buyer", "Seller", "Legal", "Observer").
- Each party's inputs are visible (in real time, < 500 ms) to all other parties and to the presenter.
- The "convergence" rule is configurable per widget: "any party accepts", "all parties accept", "median of parties", or a custom formula.
- The negotiation session is recorded (with consent) into the deck's timeline (F205) as a discrete event: who proposed what, when, the convergence path, and the final agreed value.
- A "two-way slide" supports pause/resume: parties can leave and rejoin; the session can be put on hold and resumed later (within a configurable time window, default 24h).
- Observers can watch without input rights.

**Behavioral details.**

- A two-way widget is declared in the deck schema with `{type: "two_way", parties: [...], convergence_rule: ..., initial_state: ..., record: true}`.
- The widget renders identical UI to all parties (responsive: desktop sliders on big screens, large-tap sliders on phones).
- Inputs are CRDT-merged: each party's slider position is an independent field; the visible "agreed value" is a derived value computed by the convergence rule.
- Conflicts (e.g., two parties move sliders to incompatible positions) are _not_ errors — they're the point: the widget shows both values, the gap, and a "delta" indicator until convergence.
- The recorded path is a sequence of `{t, party_id, value, intent: "propose"|"accept"|"reject"}` events.

**Edge cases.**

- **A party drops off mid-negotiation:** their last proposed value remains visible (greyed out) until they rejoin or the session times out; if timeout, they're marked "withdrew."
- **All parties disagree at deadline:** the widget shows "no agreement" and the timeline records it; the deck can be configured to auto-trigger a "follow-up scheduled" slide.
- **Recording with PII visible:** party names are recorded by default but can be pseudonymized ("Party A", "Party B") for confidential negotiations.
- **More than 6 parties:** supported, but UI density becomes a concern; the widget auto-collapses to a "named parties" row when there are > 4.
- **Offline party rejoining:** on reconnect, their local state syncs to the server's CRDT; their UI catches up.

---

### F212 — Deck inheritance trees (lineage + selective push)

**Definition.** Every deck ever derived from a master deck (via clone, template, fork, or share-and-edit) is tracked in a tree. The owner of an ancestor can see all descendants, push updates down the tree selectively (some updates to some descendants, not to others), and see which descendants have unmerged local changes.

**Acceptance criteria.**

- Each deck has a `parent_deck_id` (nullable, set at creation if derived). Derivation paths are recorded: clone, fork-from-template, fork-from-shared, two-way-fork.
- The inheritance view shows a tree (or forest, if multiple roots), with each node showing: deck title, owner, last-modified, divergence-from-parent (semantic diff size), unmerged-changes count, and "updates available" badge.
- "Push update down" lets an ancestor owner select specific changes (slides, themes, components, data bindings) and target specific descendants (one, a group, or "all that haven't diverged").
- The push is a **proposal** by default: descendants can review and accept/reject; for descendants with permission (set at fork time), pushes can be auto-applied.
- An "inheritance audit" log shows every push, accept, reject, with diff and actor.
- A descendant can "break inheritance" — detach from the parent, becoming a root; after this, no more pushes from the parent apply.

**Behavioral details.**

- Inheritance is computed from `parent_deck_id` recursively; the tree is materialized in a graph store for fast traversal.
- "Updates available" is computed as: `ancestor.head ≠ descendant.ancestor_snapshot_at_fork` ∧ `diff(ancestor.head, descendant.ancestor_snapshot_at_fork) ∩ selected_push_set ≠ ∅`.
- Push proposals are themselves decks (or deck-fragments) — they have an id, a diff, a target list, and a status; this lets them be reviewed like any other deck change.
- When a push is accepted, the descendant's `ancestor_snapshot` is updated to the pushed version; subsequent diffs are computed from that snapshot.

**Edge cases.**

- **Diamond inheritance (A → B and A → C; B and C merge into D):** D has two ancestors; conflict resolution follows normal merge semantics (F21 CRDTs + manual review).
- **Circular reference (impossible by design but defensively checked):** the parent pointer is set at creation only and validated against cycles.
- **Parent deck deleted:** descendants are not auto-deleted; they retain a "dangling parent" marker; the inheritance view shows the parent as "deleted" with a tombstone.
- **Push to 1000+ descendants:** done as a background batch with progress visible to the pusher; per-descendant failures are reported individually, not as a single error.
- **A descendant has unsaved local changes conflicting with the push:** the push is held for that descendant until conflicts are resolved (or auto-merged if non-conflicting).

---

### F213 — Real-time co-presenting with synced audience views (sub-second)

**Definition.** A presenter in one location presents to audience members across the globe; every audience member's view is synchronized to the presenter's slide and state with a sub-second budget, regardless of network distance. Includes the audience view (the slides), the presenter's annotations, gaze highlight (F207), pointer (F208), and any live data updates.

**Acceptance criteria.**

- End-to-end sync budget: presenter action → all audience members see the change within 800 ms p95, 400 ms p50, measured from the moment the presenter's client commits the action.
- Audience members see exactly what the presenter sees, modulo per-user personalization (e.g., their own language captions per F153).
- Sync survives presenter reconnects (F136): audience views do not disconnect; they hold the last state and resume when the presenter is back, with a "reconnecting" badge.
- Sync handles 10k+ concurrent audience members per session (matches F142 scale).
- Sync respects per-deck access controls (F158): a confidential deck still works for invited audience members, with the same sync guarantees.
- Bandwidth-adaptive: on poor networks, the client degrades to snapshot-only (no annotations, no gaze) rather than falling behind.

**Behavioral details.**

- The presenter client is the source of truth; it produces a stream of `presenter_state_event`s: slide changes, annotations, scenario toggles, live data updates, pointer position, gaze position.
- Events are broadcast via a global edge network (anycast routing of audience clients to the nearest edge node; the presenter publishes to a coordinator node).
- Each audience client maintains a `last_applied_seq` and a buffer of pending events; if it falls behind, it requests a snapshot.
- Live data updates are deduplicated: if the same value is broadcast twice in 100 ms (e.g., from two data sources), only one event goes out.
- Annotations are layered: an annotation event is small (path, color, lifetime) and ephemeral (not persisted beyond session unless explicitly saved).

**Edge cases.**

- **Audience member on a 200 ms RTT link:** still within budget if the edge is well-placed; falls behind only if RTT > 600 ms, in which case snapshot-only mode kicks in.
- **Audience member on a flaky network (50% packet loss):** WebRTC data channels with FEC handle this; fallback to long-polling on legacy networks.
- **Two presenters in different time zones (F135):** the "active presenter" flag is a single field; audience views follow the active presenter with a small "switching to <name>" overlay during handoff.
- **Live data burst (10k rows update):** the broadcaster rate-limits to 100 events/sec/audience-member; deltas are coalesced; UI animates the change rather than redrawing 10k cells.

---

### F214 — AI meeting listener (opt-in, surfaces relevant slides)

**Definition.** With explicit, prominent opt-in (and ideally a verbal "yes, I'm okay with the listener being on" recorded at session start), the platform listens to the live presentation audio, performs low-latency ASR + intent matching, and quietly surfaces relevant slides to the presenter when the conversation warrants. Classic use case: an audience member asks "what about churn?" — the listener hears it, finds the churn appendix, and surfaces it in the presenter's private view without the audience knowing.

**Acceptance criteria.**

- Opt-in is per-session, with a separate, prominent consent for "listener mode" vs. plain recording.
- The listener audio path is opt-in only: it requires explicit microphone permission for the listener (not just the presenter's mic) and an additional toggle in the presenter UI.
- Audio processing for the listener happens on a dedicated, isolated worker that has no access to other platform data; the listener cannot exfiltrate or persist audio.
- The listener's "surface a slide" action only updates the **presenter's private view** (F126), never the audience view.
- Latency target: question detected → slide surfaced in presenter's view within 1.5 s p95.
- Quiet surface: the presenter's view shows a small, unobtrusive indicator (slide chip in the bottom-right); no audible alert, no full-screen takeover.
- The listener never speaks or auto-navigates the audience view; the presenter must explicitly tap to jump.
- The listener's detection log (what was heard, what was matched, what was surfaced) is available to the presenter for review after the session but never to anyone else.

**Behavioral details.**

- ASR runs on the presenter's audio stream (since the listener needs to hear both presenter and audience). A separate small model classifies intent against the deck's slide corpus.
- Intent matching uses slide titles, slide content (text), and a precomputed embedding per slide; matching is by cosine similarity, threshold 0.78.
- The matching is biased by recency (recently discussed topics are more likely matches) and by presenter context (presenter is currently on slide 5 about revenue — a churn question is more likely about the churn impact on revenue, not the churn definition).
- Surfacing is a non-destructive UI overlay; jumping to the surfaced slide requires an explicit presenter action.

**Edge cases.**

- **Listener misfires (matches wrong slide):** presenter dismisses the chip; the dismissal is a negative training signal that improves the matching for that session and (anonymized) for future sessions.
- **Sensitive content (HR, legal, M&A):** org-level policy can disable the listener for decks tagged "sensitive" or in meetings with certain participant roles.
- **Multiple questions in quick succession:** the listener surfaces the most relevant; chips queue if more than 2 are relevant within 5 s.
- **Audio is just noise / no speech:** the listener is silent; no false-positive surfaces.
- **Presenter hasn't opted in but the meeting organizer has (e.g., a boss enabling it for a subordinate's session):** impossible — opt-in is per-presenter, not per-meeting, and requires the presenter's active consent.
- **Transcription accuracy < 70% (heavy accent, poor audio):** the listener gracefully degrades; surfaces only high-confidence matches; UI shows "low confidence — suggestions may be incomplete."

---

### F215 — Component "provenance" chips (lineage on hover)

**Definition.** Any stat, number, or claim on any slide can display a small "provenance chip" — a chip the viewer hovers over to see where the value came from: source system, query/SQL, owner, last-verified date, and a "stale" indicator if the value is past its freshness threshold.

**Acceptance criteria.**

- Provenance is attached to data bindings (F48) and to AI-generated content (F108–F125); the chip renders automatically when provenance exists.
- Hover (desktop) or tap-and-hold (mobile) reveals the chip with: source system name (linked to its config), query/SQL (read-only, with a "copy" button), data owner (avatar + name), last-verified timestamp, and freshness indicator (green / amber / red based on threshold).
- The chip is keyboard-accessible: Tab to the stat, Enter to expand the chip.
- A "view full lineage" link opens a side panel with the full provenance graph: upstream sources, transformation steps, downstream usages (other slides that consume the same value).
- Provenance is enforced for AI-generated stats: every number an AI generates (per F108–F125) carries a provenance record citing the prompt + data sources used.
- Provenance data is permissioned: the query/SQL is visible only to users with read access on the source system; for viewers without access, the chip shows "source: [Salesforce]" but not the query.

**Behavioral details.**

- Provenance is stored as a `provenance_record` attached to the data binding (see F215 data model).
- "Last-verified" is updated each time the data refreshes successfully; it's independent of "last-shown" (a value can be shown many times but verified rarely).
- The freshness threshold is configurable per data source: e.g., "revenue: stale after 24h", "stock price: stale after 5 min".
- The lineage side panel reuses the cross-deck knowledge graph (F219) for downstream usage tracking.

**Edge cases.**

- **Source system deleted:** chip shows "source: [Salesforce] (disconnected)"; query is hidden; freshness is "unknown".
- **Data owner has left the org:** chip shows "owner: <name> (former)"; re-assignment is a separate governance task (tied to F194).
- **AI-generated stat with no underlying source (e.g., a projection):** chip shows "AI projection based on <prompt and sources>; confidence: <score>" (tied to F238).
- **Provenance chain is very long (>5 hops):** lineage panel renders the first 3 hops inline and "show 2 more" expansion.
- **PII in the query/SQL:** query display respects source-system permissions; if the user can't see the source, they can't see the query — not even redacted.

---

### F216 — Deck-to-podcast (AI audio discussion)

**Definition.** Given a deck (and optionally the presenter's notes), the platform generates a two-voice audio discussion (e.g., "Alex" and "Jamie") that walks through the deck as if two podcast hosts were discussing it. Stakeholders who prefer listening (commute, workout, screen-free review) get an audio version of the deck.

**Acceptance criteria.**

- The generated podcast is a real, listenable audio file (MP3 or AAC, default 128 kbps mono), not a screen-driven TTS read-through.
- Two distinct voices (configurable: male/female, neutral/accent, etc.) with natural prosody, pacing, and turn-taking.
- The script is generated by an LLM that ingests the deck's slide content + presenter notes, then produces a "host A explains, host B asks follow-up, host A answers" pattern.
- Default length: ~1 minute per slide (configurable: 30 s "executive briefing" mode or 3 min "deep dive" mode).
- The podcast respects the deck's tone (F113): a "punch up the headlines" deck gets punchier audio; a "data-to-story" deck (F110) gets a narrative-driven audio.
- The audio file is downloadable and streamable; embedded player in the deck page; RSS-feed-able for podcast apps.
- The presenter reviews and approves the script before audio generation (preview mode: text-only, then commit to TTS).
- Source citations from the deck (F109) are audibly mentioned ("according to Q3 Salesforce data...") at the script's discretion.

**Behavioral details.**

- Pipeline: deck → slide-level summary → per-slide conversational script → cross-slide narrative arc → TTS with two voices → audio post-processing (EQ, normalization, silence trimming) → MP3.
- TTS uses a neural TTS provider (e.g., ElevenLabs, Azure Neural TTS, or self-hosted XTTS); voice selection is per presenter.
- The script is editable post-generation; any edits are re-rendered for the affected segments.
- The audio file is stored as an asset of the deck (similar to a video export); access controls mirror the deck.

**Edge cases.**

- **Deck has no notes:** the script is generated from slide titles + body + data context; quality is lower but still listenable.
- **Deck is heavily visual (charts, diagrams) without text:** the script describes the visuals ("here's a bar chart showing revenue by region, with APAC leading at $4.5M"); quality of description depends on the chart's alt-text (F122).
- **Very long deck (100+ slides):** generation is chunked (per-section); the audio file is a concatenation with section intros ("Part 2: financial review").
- **Sensitive content:** the script respects the deck's confidentiality tag; if "internal only," the audio file inherits that tag.
- **Pronunciation of names / acronyms:** a per-deck pronunciation dictionary (e.g., "NPS = Net Promoter Score", "Mn = Manganese") is used; presenters can add entries.
- **Generation cost / time:** typical 30-slide deck takes 3–6 minutes to generate and costs ~$0.50–$2.00 in TTS compute.

---

### F217 — Haptic remote feedback (phone-remote vibrates at pacing checkpoints)

**Definition.** The phone used as a presenter remote (F127) vibrates at rehearsed pacing checkpoints during a live presentation — e.g., a soft tap at the 50% mark of a slide's allocated time, a stronger pulse when over time — giving the presenter a tactile signal they can feel without looking at the screen.

**Acceptance criteria.**

- Haptic patterns are distinct for distinct signals:
  - **Soft tap** = halfway through slide's allotted time
  - **Double tap** = 80% through (warning)
  - **Strong pulse** = over time (alert)
  - **Long buzz** = "skip" cue (audience vote, F148, suggests skipping this slide)
  - **Triple pulse** = "you're doing great" (positive reinforcement, only in rehearsal mode)
- Patterns are configurable per cue.
- Haptics fire only on the active presenter's phone (not the audience's); in multi-presenter mode (F135), only the active presenter gets cues.
- Haptics respect OS-level "vibrate on silent" preferences; if the phone is in Do Not Disturb, haptics still work (they're hardware-level) but the presenter can opt out.
- Rehearsal mode (F131) lets the presenter rehearse the haptic timing without an audience; the haptic log is reviewable post-rehearsal.

**Behavioral details.**

- The remote (F127) is already a phone-based web app; haptics use the Web Vibration API (`navigator.vibrate`) with platform-specific patterns.
- Cue timing is computed against the deck's per-slide time targets (F131) or the presenter's historical per-slide average (with consent, F131 stores rehearsal times).
- The haptic log (in-memory only, zeroed on session end unless the presenter opts in to save it) shows what fired when, for post-session review.

**Edge cases.**

- **Phone in pocket / silenced:** haptics still work (vibration motor is independent of audio).
- **Presenter using a different clicker:** haptics only fire on the phone remote; a hardware clicker has no haptic channel.
- **Cue fires during an animation (F85):** the haptic doesn't pause the animation; the presenter is expected to glance at the time cue separately.
- **Cue density:** if a slide is < 30 s, only the "over time" cue fires (no halfway warning).

---

### F218 — Kiosk mode (trade-show loop with auto-reset)

**Definition.** A deck configured for unattended display — typically at a trade-show booth, in a lobby, or on a showroom floor — auto-loops through its content with optional touch interactivity (F96–F105), and reliably resets to a clean state on a schedule, on touch-idle, or on a hard timeout.

**Acceptance criteria.**

- Kiosk mode runs in a dedicated browser profile (full-screen, no chrome, no address bar, no system menus) on the configured device.
- The loop is a configurable sequence: which slides play, in what order, with what dwell time per slide (default 15 s, configurable per slide).
- Touch interactivity is enabled per-element: any element flagged "interactive in kiosk" responds to touch (e.g., a tap on a chart drills down; F49).
- Auto-reset triggers:
  - **Scheduled:** at top of hour, daily at midnight, weekly on Sunday, etc.
  - **Idle:** after N seconds (default 60) of no touch input, reset to slide 1.
  - **Hard timeout:** after N minutes (default 30) of continuous display, reset to prevent memory creep.
- Reset is **reliable**: the kiosk must always return to a clean state — no stuck animations, no half-loaded data, no orphaned overlays. A watchdog monitors and force-resets if the deck becomes unresponsive for > 5 s.
- All resets are logged (locally + cloud) with reason and timestamp.
- Kiosk decks support **remote management**: an admin can update the deck content, change the loop, or force-reboot any kiosk from a dashboard.
- Kiosk devices have an isolated user account (no access to other decks, no edit access, no access to the device's other apps).

**Behavioral details.**

- Kiosk runtime is a thin client (Chromium-based, packaged or PWA with full-screen + kiosk print keys).
- The client pre-caches the deck and its data (for offline operation; F137) on launch; refreshes from server periodically.
- Touch input is debounced and rate-limited to prevent accidental rapid-fire taps from triggering dozens of state changes.
- "Reset" is implemented as a soft reset (clear state, return to slide 1, replay cached data) plus an optional hard reset (reload the page) on a longer cadence.

**Edge cases.**

- **Network drops mid-loop:** the kiosk continues on cached data (F137); if cached data is stale beyond threshold, the kiosk shows a "data unavailable" slide until reconnect.
- **Touch screen fails:** kiosk falls back to timed-only loop (no interactivity); admin is alerted.
- **Device stolen / removed:** the kiosk reports its last-known IP and a heartbeat; missing heartbeats alert the admin; the deck can be remotely revoked.
- **Power loss:** on reboot, kiosk auto-launches and resumes its loop with the cached deck; no manual intervention.
- **Tampering (someone tries to escape kiosk mode):** kiosk mode disables standard browser shortcuts (Ctrl+W, Alt+Tab, F11); USB and Bluetooth input is restricted to touchscreens only.

---

### F219 — Cross-deck knowledge graph (entities across all decks)

**Definition.** The platform maintains a knowledge graph over every deck in the user's workspace: entities (companies, products, metrics, people, dates) are extracted from every deck, linked across decks, and indexed for queries like "show me every slide across the company that cites our NPS score — and which ones are stale."

**Acceptance criteria.**

- Entities are extracted from: slide titles, body text, data binding labels, AI-generated content, and provenance records (F215).
- Entity types include: organizations, products, people, metrics (with values and units), locations, dates, and custom types per workspace.
- Each entity has a stable id (e.g., `metric:net_promoter_score`), a canonical label, aliases ("NPS", "Net Promoter Score", "NPS Score"), and a value history (when did different decks cite different values?).
- Cross-deck links are inferred: if two decks cite the same metric, they're linked; if one deck cites a metric with a value of 42 and another with 38, both citations are preserved (the conflict is surfaced, not auto-resolved).
- The graph is queryable via:
  - A UI search bar ("slides citing NPS")
  - An API (F200, F221)
  - An MCP tool (F221)
- Staleness is computed per entity: an entity is "stale" if its value hasn't been re-verified within the freshness threshold (F215) OR if conflicting values exist across decks.
- The graph re-extracts incrementally as decks change; full re-extraction runs weekly.

**Behavioral details.**

- Extraction is a two-pass pipeline: (1) NER + rule-based extractors for known types, (2) LLM-based extraction for ambiguous cases and custom entity types.
- The graph is stored in a graph database (e.g., Neo4j, Memgraph, or self-hosted equivalent) with a separate read-replica for queries.
- "Cites NPS" is a graph traversal: `(deck)-[cites]->(entity:metric:nps)`. Staleness is a derived property: `entity.last_verified_at < now() - threshold OR exists(entity.conflicting_values)`.
- PII is redacted at extraction time: people entities are linked to a directory entry (if org has one) but full names are stored encrypted at rest; public display uses initials or role-based labels per workspace policy.

**Edge cases.**

- **Same name, different concept:** "Apple" the company vs. "apple" the fruit — disambiguation via context (a fruit in a recipe deck vs. a tech company in a market analysis); the graph keeps both as separate entities with a "disambiguation-needed" flag if confidence is low.
- **Entity value conflict across decks:** both values are preserved; the query "show me NPS" returns both, each tagged with their deck; a "consolidate" workflow (out of scope for the graph, but exposed via API) lets an admin pick a canonical value.
- **Extraction quality low (LLM hallucinations):** every extracted entity has a confidence score; entities below threshold are not surfaced in queries (but are kept in the graph for re-extraction).
- **New entity type requested by user:** supported via custom entity definitions (admin-configurable).
- **Org has 100k+ decks:** the graph scales horizontally; queries that touch the entire workspace are rate-limited and cached for 5 min.

---

## 2. UX Flows

This section walks through 14 of the most consequential user flows, each touching one or more of F205–F219. Flow notation: bold = user action; _italic_ = system response; `(decision)` = branching point.

### 2.1 Replaying a presentation session (F205)

1. **Presenter ends session** → _system auto-finalizes the timeline log; presenter sees "Replay ready" in their dashboard._
2. **Presenter clicks "Replay"** → _system opens the replay viewer in a new tab._
3. _Viewer loads the timeline, prefetches the deck version and data snapshots, renders the first slide at t=0._
4. **Presenter scrubs the timeline** → _viewer shows the slide state at the scrubbed time; a side rail shows the textual action log aligned to the scrub position._
5. **Presenter hits Play** → _viewer plays back at 1× by default; animations and live data values evolve as they did live._
6. **Presenter clicks a specific event in the rail (e.g., "Bear case toggled")** → _viewer snaps the scrub to that event's timestamp and shows the resulting slide state._
7. **Presenter shares the replay URL with a colleague** → _colleague opens the link, sees the same replay from t=0; replay is identical because timeline + deck version + data snapshots are deterministic._
8. `(decision)` If the deck has been edited since the session, the replay _shows the "as presented" version_ with a banner "this is the version shown on <date>; the deck has been edited since."

### 2.2 Viewing living-document commentary (F206)

1. **User opens a living QBR deck** → _system loads current state; data refreshes in background._
2. _Sidebar shows "Living log" — the accumulated change history._
3. **User clicks a log entry ("Revenue changed $4.2M → $4.5M, 2h ago")** → _system highlights the affected element on the current slide; a tooltip shows the old vs. new value, the source, and the refresh timestamp._
4. **User scrolls the log** → _system shows years of accumulated entries; semantic search filters ("show only revenue-related changes")._
5. **User clicks "View all 47 comments on this deck"** → _panel opens with all comments (active + archived); comments on since-deleted slides appear in "Archived" subpanel._
6. **User sees a slide badge "Updated since you last viewed (3 changes)"** → _hover reveals the per-slide change summary._
7. `(decision)` If the user wants the _previous_ version of a slide (before the last refresh), they click "View as of <timestamp>" — system renders the deck state at that timestamp using the historical snapshots.

### 2.3 Presenting with gaze-guided highlighting (F207)

1. **Before session: presenter enables gaze tracking in settings** → _system shows consent dialog: "Gaze tracking will run on your webcam. Your gaze is computed on-device and never leaves this computer unless audience sync is enabled (it isn't, by default)."_
2. **Presenter accepts** → _consent record stored with scope = "transient only"; system starts calibration (3-second "look at each corner" routine)._
3. **Presenter goes live** → _audience view shows a faint "👁 presenter eye-tracking on" badge linked to disclosure._
4. **Presenter looks at the upper-left chart** → _audience view shows a soft radial highlight around the chart; presenter view is unaffected._
5. **Presenter looks away at their notes** → _highlight fades to center over 1 s._
6. **Presenter toggles gaze off mid-session (`G` key)** → _highlight disappears; consent record updated with revocation timestamp._
7. `(decision)` If the audience member prefers reduced motion, the highlight defaults to a static ring per `prefers-reduced-motion`.

### 2.4 Using gestures to advance slides (F208)

1. **Before session: presenter enables gestures, does the 5-gesture calibration routine** → _model calibrates to presenter's hand proportions._
2. **Presenter goes live, both hands free (no clicker)** → _HUD shows "gestures: ON" with current detection confidence._
3. **Presenter pushes palm right** → _HUD flashes "NEXT, conf 0.91"; slide advances._
4. **Presenter holds up index finger** → _HUD shows "POINTER"; virtual laser follows fingertip; laser is visible on audience view._
5. **Presenter makes fist** → _HUD shows "LASER OFF"; laser disappears._
6. **Presenter accidentally triggers a back gesture** → _slide goes back; presenter re-advances with another gesture._
7. **Presenter disables gestures (`Esc`)** → _HUD shows "gestures: OFF"; presenter uses keyboard or clicker._
8. `(decision)` If lighting drops, confidence falls below threshold; HUD shows "low confidence — gestures disabled"; presenter is told to use keyboard.

### 2.5 Triggering slide states by voice (F209)

1. **Presenter enables voice trigger** → _system shows "Voice trigger is listening. Say 'confirmed' or press Enter after each trigger phrase."_
2. **Presenter says "let's look at the bear case"** → _HUD shows "heard: '...bear case...' — confirm?"_
3. **Presenter says "confirmed"** → _scenario switches to bear case; data updates; HUD flashes "bear case applied."_
4. **An audience member asks "could you show the bear case?"** → _HUD shows the same pending suggestion; presenter does NOT confirm; no slide change._
5. **Presenter wants to repeat without confirmation** → _presses `Shift+Enter` to enable "fast-confirm" mode (single utterance triggers); toggled off by default._
6. **Presenter disables voice trigger** → _HUD shows "voice trigger: OFF"; system stops listening._

### 2.6 Ambient boardroom pre-meeting dashboard (F210)

1. **Day-of-meeting: room display is on the deck's calendar event in 8 minutes** → _display automatically transitions to ambient mode._
2. \*_Ambient dashboard shows: hero metric (MRR ticking), rotating scenarios (Base → Bull → Bear every 10s), headlines cycling, "Meeting starts in 8:00" countdown._
3. **Data refreshes on cadence** → _every 5 min, numbers update; small "data refreshed <ts>" badge appears._
4. **Presenter walks into the room, taps the screen** → _ambient transitions to presenter view (single tap); meeting starts._
5. `(decision)` If no one takes over for 30 min, ambient fades to a still "Standby" frame.
6. `(decision)` If the meeting runs late (calendar updated), countdown adjusts without a manual refresh.

### 2.7 Two-way pricing negotiation (F211)

1. **Seller opens the pricing slide with a two-way widget** → _widget shows initial offer (e.g., $100K); a unique session QR is generated._
2. **Buyer scans QR on their phone** → _joins as "Buyer"; sees the slider; their value is visible to both parties._
3. **Buyer drags slider to $80K** → _Seller sees the buyer's $80K within 500 ms; both see the "delta: -$20K" indicator._
4. **Seller drags to $90K** → _Buyer sees $90K; both see "delta: +$10K (from buyer's last)."_
5. **Buyer says "yes, $90K works" and taps "Accept"** → _convergence rule (any party accepts) fires; widget locks at $90K; timeline records `{t, party: buyer, value: 90000, intent: accept}`._
6. **Both parties exit** → _negotiation session is recorded into the deck's timeline with full path: `propose $100K → propose $80K → propose $90K → accept $90K`._
7. `(decision)` If a third party (Legal) joins, they see the widget but their input is "observer only" — visible but not counted toward convergence.

### 2.8 Browsing deck inheritance tree (F212)

1. **Owner of the master pitch deck opens "Inheritance view"** → _tree shows master + 23 descendants (cloned for different prospects, forked for different industries)._
2. **Owner sees one descendant has an "Updates available" badge (3 new slides in master since fork)** → _clicks the badge._
3. **Diff view opens** → _shows master.slide[5], master.slide[8], master.theme updated; descendant has none of these._
4. **Owner selects "push master.slide[5] only" to "all descendants that haven't diverged"** → _12 descendants receive a push proposal._
5. **Each descendant's owner reviews and accepts** → _their deck's `ancestor_snapshot` updates; subsequent diffs from master._
6. **One descendant's owner rejects** → _their deck remains on old master.slide[5]; rejection logged._
7. `(decision)` If a descendant has diverged significantly, the push is held for manual merge.

### 2.9 Syncing audience views across continents (F213)

1. **Presenter in NYC clicks "Next slide"** → _presenter client publishes `slide_changed` event to the edge network._
2. **Audience members in London (40ms RTT), Singapore (240ms RTT), Sydney (220ms RTT) receive the event** → _all apply within their respective budgets (p95 = RTT + processing ~ 50ms)._
3. **Presenter annotates with a red circle** → _annotation event broadcasts; all audience members see the annotation drawn in real time._
4. **Presenter's network drops for 2 seconds** → _audience views hold last state; show "reconnecting" badge; presenter client reconnects; replays missed events from snapshot._
5. **Presenter's network drops for 30 seconds** → _failover to phone (F136); phone takes over publishing; audience views seamlessly follow._
6. `(decision)` If an audience member is on a 1Mbps link with high loss, they enter "snapshot-only" mode (no annotations, no gaze) but still see slides advancing.

### 2.10 AI meeting listener raising relevant slides (F214)

1. **Presenter opts in to listener mode at session start** → _consent recorded: "Listener mode active for this session; audio processed in isolated worker; never persisted."_
2. **Audience member asks "what about churn in the SMB segment?"** → _listener ASR transcribes; intent matcher scores against deck's slide corpus._
3. **Match found: slide 14 ("SMB churn deep-dive")** → _small chip appears in presenter's private view: "→ SMB churn deep-dive (slide 14), confidence 0.89."_
4. **Presenter glances at the chip, decides it's relevant** → _taps chip → presenter view jumps to slide 14; audience view unaffected._
5. **Audience member asks a follow-up that's also relevant** → _second chip appears in the queue; presenter taps when ready._
6. **Listener misfires** → _presenter dismisses chip; dismissal logged as negative training signal._
7. **Presenter ends session** → _listener disabled; audio buffer zeroed; consent record retains session scope and revocation._

### 2.11 Hovering over a stat to see lineage (F215)

1. **Viewer hovers over "$4.5M ARR" on a slide** → _chip appears: "Source: Salesforce (Q3 report); Owner: Priya R.; Last verified: 2h ago; Fresh: ✓."_
2. **Viewer clicks "View full lineage"** → _side panel opens showing: source → Salesforce → query → SFDC report ID 00Q... → transformation → none → downstream usages → 7 other slides cite this same metric._
3. **Viewer notices one downstream slide is tagged "stale"** → _clicks it; navigates to that slide; the chip there shows red._
4. `(decision)` If the viewer doesn't have access to the source system, the chip shows source name but no query/SQL.

### 2.12 Listening to a deck-to-podcast (F216)

1. **Presenter clicks "Generate podcast" on the deck** → _LLM generates the script; presenter sees text preview ("Host A: ... Host B: ...")._
2. **Presenter edits one segment ("make the intro more concrete")** → _system re-renders only that segment; preview updates._
3. **Presenter commits to full audio generation** → _neural TTS produces two-voice audio; ~4 minutes for a 30-slide deck._
4. **Audio file appears in deck assets** → _embedded player on deck page; RSS feed generated; downloadable MP3._
5. **Stakeholder listens during commute** → _hears "Host A: this quarter's revenue came in at $4.5M, up 7% from last quarter, driven primarily by..." with citations._
6. `(decision)` If the deck is tagged "internal only," the audio inherits that tag and is gated the same way.

### 2.13 Haptic remote feedback cues (F217)

1. **Presenter's phone is the remote (F127) in their pocket** → _haptics fire at pre-rehearsed cues._
2. **At 50% of slide's allotted time: soft tap** → _presenter feels a single tap; glances at notes; knows they have time._
3. **At 80%: double tap** → _presenter feels double tap; knows to start wrapping up the slide._
4. **Over time: strong pulse** → _presenter feels a long buzz; knows to advance._
5. **Audience vote suggests skipping (F148)** → _long buzz fires; presenter sees the vote tally on phone._
6. `(decision)` In rehearsal mode (F131), a triple pulse at the end of each slide = "good pacing."

### 2.14 Configuring a kiosk loop (F218)

1. **Admin opens Kiosk management dashboard** → _sees all registered kiosks with status (online / offline / last-heartbeat)._
2. **Admin selects "Booth 4 — Lobby iPad"** → _edits loop: slide order, dwell times, touch-enabled elements._
3. **Admin sets reset triggers: idle after 60s, hard timeout 30min, daily reset at midnight** → _config pushed to device._
4. **Kiosk starts loop** → _runs unattended; touch responses (e.g., tapping a chart) trigger drill-downs._
5. **Kiosk goes 60s without touch** → _auto-resets to slide 1; reset logged._
6. **Admin sees a kiosk offline** → _checks last-heartbeat; reboots remotely; kiosk resumes cached loop on restart._
7. `(decision)` If a kiosk becomes unresponsive (watchdog fires after 5s), it force-reloads the page; a reload is logged with reason "watchdog."

### 2.15 Querying the cross-deck knowledge graph (F219)

1. **User opens global search, types "NPS"** → _results show: 23 slides across 8 decks citing NPS; each tagged with value, freshness, and deck._
2. **User filters: "stale only"** → _results narrow to 4 stale citations; each links to the affected slide._
3. **User clicks one** → _navigates to the slide; the stat's provenance chip (F215) shows why it's stale._
4. **User opens "View as graph"** → _visualization shows NPS entity with all 23 citations as nodes; conflicting values (42 vs 38) highlighted._
5. **User queries via MCP (F221): `search_entities(query="NPS", include_stale=true)`** → _returns structured JSON for an external agent to consume._
6. `(decision)` If PII redaction is required (e.g., the entity is a person), the result hides full names per workspace policy.

---

## 3. Functional and Non-Functional Requirements

### 3.1 State timeline record/replay fidelity (F205)

**Functional.** Every discrete interaction during a live session produces exactly one event in the timeline. Event ordering is total (per-session sequence numbers). Replay is deterministic given the timeline + deck version + data snapshots.

**Non-functional.**

- Recorder CPU/memory overhead: < 3% CPU, < 50 MB RAM on a typical presenter's laptop.
- Timeline storage: ≤ 30 KB per minute of session for events; ≤ 200 KB per minute for snapshots (at 1 Hz cadence).
- Replay startup: first frame painted within 1.5 s of opening the replay URL.
- Replay determinism: byte-identical across two viewers on two machines (within rasterization tolerance of ±1 px due to font rendering differences across OSes).

### 3.2 Living-document update semantics (F206)

**Functional.** Living decks refresh data bindings on a configurable cadence (default 5 min). Layout, theme, and non-data text remain stable across refreshes. Comments accumulate and are searchable. The deck URL is stable forever.

**Non-functional.**

- Refresh latency: data binding update → all viewers see the update within 10 s p95 (matches F48 refresh budgets).
- Storage growth: living deck adds ≤ 1 MB per month to the deck's log (semantic summaries); raw events are compacted at 90 days.
- Availability: living decks are always served from a live source; if the source is down, last-known values are served with a "data as of" badge.

### 3.3 Gaze tracking privacy and consent (F207)

**Functional.** Gaze is opt-in per session. Computation is on-device. Coordinate broadcasts (if enabled) are quantized to 32×24 and not persisted server-side. Consent record is stored with scope, expiry, and revocation.

**Non-functional.**

- Webcam frame processing latency: ≤ 33 ms per frame (30 Hz capture, ~15 Hz inference).
- Gaze coordinate accuracy: ±50 px on 1920×1080 at 60 cm viewing distance, 720p webcam, 300 lux.
- Bandwidth for gaze broadcast: ≤ 500 bytes/sec per audience member (10 Hz × quantized coordinate).
- Consent revocation latency: < 100 ms (toggling off immediately stops inference and broadcast).

### 3.4 Gesture recognition robustness (F208)

**Functional.** Five default gestures with configurable on/off, debounce, and confidence threshold. On-device only. Per-gesture enable/disable.

**Non-functional.**

- End-to-end gesture → action latency: < 200 ms p95.
- Gesture recognition FPS: 24 Hz inference, 30 Hz capture.
- False-positive rate: < 1 per 100 gestures at default confidence 0.85 in normal lighting.
- False-negative rate: < 5% at default confidence in normal lighting for trained gestures.

### 3.5 Voice trigger recognition with confirmation guard (F209)

**Functional.** Trigger phrases configurable. Confirmation guard mandatory unless explicitly disabled. ASR runs on-device by default; cloud opt-in only. No audio persisted.

**Non-functional.**

- End-to-end voice trigger → action latency: < 1 s p95 (assuming confirmation within 2 s).
- ASR word error rate (WER): < 8% in normal office noise, English; < 15% with moderate accent variation.
- False-positive rate: < 1 per hour of continuous listening at default settings.

### 3.6 Ambient mode data refresh strategy (F210)

**Functional.** Refresh cadence configurable per deck (default: 5 min during business hours, hourly off-hours). Calendar integration triggers auto-ambient in the 15 min before meeting. Manual enable also supported.

**Non-functional.**

- Ambient startup: < 3 s to first frame painted on a room display.
- Refresh delta: only data-bearing elements update; layout/theme/animation untouched.
- Power: ambient mode dims after 5 min of no interaction; standby after 30 min.

### 3.7 Two-way sync conflict resolution (F211)

**Functional.** Inputs are CRDT-merged per party. Convergence rule is configurable. Recording captures the full proposal path. Pause/resume within 24 h.

**Non-functional.**

- Input → visibility latency: < 500 ms p95 across all parties globally.
- Convergence computation: < 100 ms for up to 10 parties.
- Recording fidelity: full path captured; no lossy compression.

### 3.8 Inheritance tree propagation model (F212)

**Functional.** Tree derived from `parent_deck_id`. Push proposals are reviewable; auto-apply only with explicit permission. Diamond inheritance handled. "Break inheritance" supported.

**Non-functional.**

- Tree traversal: O(N) where N = descendants; cached for 60 s; invalidated on any change.
- Push to 1000 descendants: completed within 5 min p95; per-descendant progress visible.
- Diff computation: semantic diff (element-level) within 10 s for decks up to 500 slides.

### 3.9 Audience view sub-second sync budget (F213)

**Functional.** All audience members see exactly what the presenter sees. Modulo per-user personalization. Survives presenter reconnects.

**Non-functional.**

- Sync budget: 800 ms p95, 400 ms p50 from presenter commit to all audience viewers.
- Scale: 10k concurrent audience members per session.
- Bandwidth per audience member: ≤ 5 KB/s average (varies by annotation density).
- Network adaptive: degrades to snapshot-only on poor links rather than falling behind.

### 3.10 AI listener privacy and quiet surface (F214)

**Functional.** Opt-in per session. Audio processed in isolated worker; never persisted. Surfacing only updates presenter's private view. Quiet UI surface.

**Non-functional.**

- Question detection → slide surface latency: < 1.5 s p95.
- Listener CPU/memory: < 5% CPU, < 100 MB RAM on presenter machine.
- ASR WER target: same as F209 (< 8% in normal conditions).
- Intent match precision: precision > 80% at confidence threshold 0.78; recall > 60% (some misses acceptable; false positives are worse).

### 3.11 Provenance lineage model (F215)

**Functional.** Provenance attached to data bindings and AI-generated content. Lineage graph queryable via side panel and API. Permissioned (source-system access controls query visibility).

**Non-functional.**

- Lineage query latency: < 500 ms p95 for "show all descendants of this source."
- Provenance record size: ≤ 2 KB per data binding.
- PII redaction: applied at query time, not at storage time (so the same record serves both redacted and full views).

### 3.12 Podcast TTS quality (F216)

**Functional.** Two-voice neural TTS. Editable script before generation. Per-deck pronunciation dictionary. Source citations audibly mentioned.

**Non-functional.**

- Generation time: ≤ 6 min for a 30-slide deck.
- Audio quality: 128 kbps MP3 default; 22 kHz sample rate minimum; intelligible in car/headphone environments.
- Voice naturalness: MOS (Mean Opinion Score) ≥ 4.0 on standard evaluation set.
- Pronunciation accuracy: ≥ 95% for names/acronyms in the dictionary.

### 3.13 Haptic device API (F217)

**Functional.** Five distinct haptic patterns. Fires only on active presenter's phone. Configurable per cue. Rehearsal-mode positive reinforcement.

**Non-functional.**

- Web Vibration API compatibility: iOS Safari 16.4+, Android Chrome 100+.
- Haptic fire latency: < 50 ms from cue event to motor activation.
- Power: haptics add < 1% battery drain per hour of presenting.

### 3.14 Kiosk reset reliability (F218)

**Functional.** Three reset triggers (scheduled, idle, hard timeout). Watchdog force-resets on unresponsiveness > 5 s. Remote management dashboard. Isolated user account.

**Non-functional.**

- Reset reliability: 99.99% — kiosks are always in a clean state.
- Watchdog detection latency: < 5 s from unresponsiveness to force-reset.
- Offline operation: cached deck continues to serve loop for ≥ 7 days without network.
- Heartbeat: every 30 s; missed heartbeats alert within 2 min.

### 3.15 Knowledge graph extraction quality (F219)

**Functional.** Entities extracted from text, data bindings, AI content, provenance. Cross-deck linking by entity. Staleness computed. Queryable via UI, API, MCP.

**Non-functional.**

- Extraction precision: ≥ 90% on standard entity types (organizations, products, metrics).
- Extraction recall: ≥ 85% on standard types.
- Query latency: < 1 s p95 for entity lookup; < 3 s p95 for "all citations of this entity."
- PII redaction: enforced at query time; full names stored encrypted at rest.

---

## 4. Architecture

The novel & frontier layer is a set of services that plug into the core editor (section 1), animation system (section 6), prototyping system (section 7), AI copilot (section 8), presenter mode (section 9), analytics (section 12), and collaboration (section 13). The architecture is intentionally event-sourced for time-sensitive features (F205, F206, F211, F213) and query-optimized for graph features (F219).

### 4.1 Presentation state recorder (F205)

**Responsibilities.** Capture every discrete interaction during a live session as a structured event; stream events to a server-side append-only log; capture periodic state snapshots.

**Components.**

- **Client-side recorder (in presenter client).** Listens to the editor event bus and presenter action bus; emits `presenter_event` records with monotonic sequence numbers.
- **Server-side timeline service.** Receives events; validates ordering; persists to an append-only log (Kafka or equivalent); periodically compacts to per-session event streams.
- **Snapshot service.** Receives state snapshots from the presenter client at the configured cadence; stores with delta-compression (CRDT-style) against the prior snapshot.
- **Replay service.** Reads the timeline + snapshots + deck version; produces a deterministic replay by stepping through events and snapshotting the deck state at each timestamp.

**Storage.**

- Events: append-only log, partitioned by `session_id`, retained 365 days.
- Snapshots: blob storage, delta-compressed, retained 365 days.
- Replay URLs: short-lived signed URLs to the replay bundle (events + snapshots + deck version).

### 4.2 Living-document service (F206)

**Responsibilities.** Manage the "living" lifecycle of a deck; refresh data bindings; accumulate semantic change history; emit change notifications.

**Components.**

- **Living state store.** A per-deck materialized view that includes current data values + a compact change log.
- **Refresh scheduler.** Cron-like scheduler that triggers data refreshes per the deck's cadence (per-binding overrides allowed).
- **Change detector.** Computes semantic diffs between refreshes; emits change events.
- **Notification dispatcher.** Fans out change events to subscribers (per-role, per-metric, per-threshold).

**Storage.**

- Current state: same store as the deck (F21 CRDT), with a "living" flag and a refresh log.
- Change history: separate append-only stream, compacted at 90 days to semantic summaries.

### 4.3 Gaze tracking module (F207, opt-in consent)

**Responsibilities.** Capture webcam frames on the presenter's device; run on-device eye-tracking; emit gaze coordinates; broadcast (if enabled) to the audience sync channel.

**Components.**

- **Webcam capture module.** Requests permission; captures at 30 Hz; never persists frames.
- **On-device inference.** MediaPipe FaceMesh (or custom) in WASM at 15 Hz; outputs gaze ray + confidence.
- **Coordinate projector.** Intersects gaze ray with slide plane using presenter viewport geometry.
- **Consent gate.** Wraps the entire module; if no valid consent record, module is inert.
- **Broadcaster.** Quantizes coordinates to 32×24; broadcasts to audience sync channel (F213) at 10 Hz.

**Privacy properties.**

- No frame data leaves the device.
- No raw gaze coordinates leave the device.
- Broadcast coordinates are quantized and ephemeral.
- On session end, all in-memory state is zeroed.

### 4.4 Gesture recognition service (F208, webcam-based)

**Responsibilities.** Capture webcam frames; run on-device hand-pose model; classify gestures; fire gesture events to the presenter action bus.

**Components.**

- **Webcam capture module** (shared with F207, but independently consented).
- **Hand-pose model** (MediaPipe Hands or custom) at 24 Hz.
- **Gesture state machine.** Tracks hand trajectories; classifies into the gesture vocabulary; applies debounce and confidence threshold.
- **Calibration routine.** 5-gesture "do each gesture" routine at session start; per-user hand-size calibration.

### 4.5 Voice trigger service (F209, ASR with confirmation)

**Responsibilities.** Capture presenter mic audio; run on-device ASR; match partial transcripts against the trigger phrase list; manage confirmation queue.

**Components.**

- **Mic capture module** (consent-gated).
- **On-device ASR** (Web Speech API or Whisper-tiny in WASM).
- **Phrase matcher.** Fuzzy match (edit distance ≤ 2 OR semantic similarity ≥ 0.85) against the configurable trigger list.
- **Confirmation queue.** Holds pending triggers; requires confirmation within 2 s.
- **HUD renderer.** Displays "heard: ... — confirm?" to the presenter.

### 4.6 Ambient dashboard (F210)

**Responsibilities.** Render the branded dashboard before a meeting; refresh data; handle presenter takeover; manage standby.

**Components.**

- **Ambient composer.** Generates the dashboard layout from the deck's data bindings (curated by author).
- **Refresh daemon.** Polls data sources per cadence.
- **Presence detector.** Optional (opt-in) room-display camera to detect a person approaching.
- **Takeover handler.** Transitions to presenter view on tap or presence.

### 4.7 Two-way sync engine (F211)

**Responsibilities.** Manage multi-party negotiation sessions; CRDT-merge per-party inputs; compute convergence; record the negotiation path.

**Components.**

- **Session coordinator.** One per negotiation; assigns party roles; manages join/leave.
- **CRDT store.** Per-session state, with one field per party per widget.
- **Convergence evaluator.** Computes the "agreed value" from per-party inputs and the convergence rule.
- **Recording service.** Captures the full proposal path into the deck timeline.

### 4.8 Deck inheritance graph engine (F212)

**Responsibilities.** Maintain the inheritance forest; compute "updates available"; manage push proposals; track accept/reject.

**Components.**

- **Graph store.** Materialized tree/forest in a graph database (or recursive CTE in Postgres for smaller scales).
- **Diff engine.** Computes semantic diffs between ancestor head and descendant snapshot.
- **Push proposal manager.** Creates, dispatches, tracks proposals.
- **Audit log.** Every push/accept/reject recorded.

### 4.9 Real-time audience view broadcaster (F213)

**Responsibilities.** Distribute presenter state events to all audience members within the sub-second budget.

**Components.**

- **Coordinator node.** Receives events from the presenter; fans out to edge nodes.
- **Edge nodes.** Geographically distributed; serve audience clients via WebRTC data channels or WebSocket.
- **Client-side buffer.** Each audience client maintains `last_applied_seq`; requests snapshots on fall-behind.

**Infrastructure.**

- Edge network with anycast routing of audience clients to the nearest edge.
- WebRTC data channels for low-latency delivery; WebSocket fallback for restrictive networks.
- FEC (Forward Error Correction) for lossy links.

### 4.10 AI meeting listener (F214, low-latency ASR + intent match)

**Responsibilities.** Listen to live audio; perform low-latency ASR; match intents against the deck's slide corpus; surface matches to the presenter.

**Components.**

- **Isolated audio worker.** Sandboxed; has no access to other platform data; processes audio frames in real time.
- **ASR module.** Cloud or on-device (user choice); outputs partial transcripts.
- **Intent matcher.** Computes embeddings of partial transcripts; matches against precomputed slide embeddings (using cosine similarity, threshold 0.78).
- **Surface renderer.** Quiet UI overlay in the presenter's private view; non-destructive.

**Privacy properties.**

- Worker is sandboxed; no network egress except to the matcher (which receives only embedding comparisons, not raw audio, if cloud).
- Audio buffer is zeroed on session end.
- Surface events are not persisted.

### 4.11 Provenance lineage tracker (F215)

**Responsibilities.** Store provenance records; render chips; compute freshness; serve lineage queries.

**Components.**

- **Provenance store.** Per-data-binding record with source, query, owner, last-verified.
- **Freshness evaluator.** Per-source threshold; recomputes on access.
- **Chip renderer.** Hover/tap UI; keyboard accessible.
- **Lineage service.** Traverses the cross-deck graph (F219) for downstream usages.

### 4.12 Deck-to-podcast generator (F216)

**Responsibilities.** Generate a two-voice audio discussion from a deck + notes.

**Components.**

- **Script generator.** LLM-based; produces host-A/host-B script with citations.
- **Script editor.** UI for the presenter to review and edit.
- **TTS engine.** Neural TTS provider; two voices; per-deck pronunciation dictionary.
- **Audio post-processor.** EQ, normalization, silence trimming.
- **Distribution.** Embedded player, RSS feed, downloadable MP3.

### 4.13 Haptic remote API (F217)

**Responsibilities.** Fire distinct haptic patterns on the phone remote (F127) at rehearsed pacing checkpoints.

**Components.**

- **Cue scheduler.** Per-slide cue timing (using F131 per-slide targets or historical averages).
- **Pattern library.** Five default patterns with Web Vibration API calls.
- **Log buffer.** In-memory log for review; zeroed on session end unless opt-in save.

### 4.14 Kiosk runtime (F218)

**Responsibilities.** Run an unattended deck loop with auto-reset and remote management.

**Components.**

- **Kiosk client.** Packaged Chromium-based; full-screen; isolated user account; pre-cached deck.
- **Reset manager.** Scheduled, idle, hard-timeout triggers; watchdog for unresponsiveness.
- **Touch router.** Debounced touch input → element interactions (F96–F105).
- **Remote management dashboard.** Admin view of all kiosks; status, content updates, remote reboot.
- **Heartbeat service.** Every 30 s; missed heartbeats alert admin.

### 4.15 Cross-deck knowledge graph (F219, extraction + index)

**Responsibilities.** Extract entities from all decks; build the cross-deck graph; serve queries.

**Components.**

- **Extraction pipeline.** NER + rule-based + LLM-based; incremental on deck change; weekly full re-extraction.
- **Graph store.** Graph database (Neo4j, Memgraph, or self-hosted) with read replica.
- **Entity resolver.** Disambiguates same-name different-concept cases; flags low-confidence resolutions.
- **Staleness evaluator.** Per-entity; checks last-verified + conflicting values.
- **Query service.** UI, API (F200), MCP (F221) interfaces.
- **PII redactor.** Applied at query time.

---

## 5. Data Model

Schemas below use TypeScript-like notation for clarity. All schemas are illustrative; production would use the platform's standard schema language.

```ts
// F205 — Presentation state timeline
interface StateTimelineEvent {
  id: string; // ULID
  session_id: string;
  seq: number; // monotonic per session
  t_wall: number; // wall-clock ms since session start
  t_mono: number; // monotonic ms (for animation timing)
  actor_id: string; // presenter or co-presenter or system
  event_type: StateTimelineEventType;
  payload: Record<string, unknown>;
  deck_version_hash: string;
  data_source_snapshot_id?: string;
  recorded_at: number; // wall-clock ms
}

type StateTimelineEventType =
  | 'slide_changed'
  | 'scenario_toggled'
  | 'calculator_input'
  | 'branch_chosen'
  | 'annotation_drawn'
  | 'poll_vote_cast'
  | 'qa_submitted'
  | 'hidden_slide_revealed'
  | 'slide_reordered'
  | 'data_refreshed'
  | 'actor_changed';

// F205 — Snapshot (CRDT delta against prior snapshot)
interface StateTimelineSnapshot {
  id: string;
  session_id: string;
  t_wall: number;
  deck_version_hash: string;
  data_source_snapshot_id: string;
  // Delta against prior snapshot (CRDT-style)
  delta: Record<string, unknown>;
  full_state?: Record<string, unknown>; // every Nth snapshot is a full anchor
}

// F206 — Living document subscription
interface LivingDocSubscription {
  id: string;
  deck_id: string;
  subscriber_id: string; // user or role or channel
  scope: 'all' | 'metric' | 'slide' | 'threshold';
  filter?: {
    metric_ids?: string[];
    slide_ids?: string[];
    threshold?: { metric_id: string; pct_change: number };
  };
  channel: 'in_app' | 'email' | 'slack' | 'webhook';
  created_at: number;
  active: boolean;
}

// F207 — Gaze consent record
interface GazeConsent {
  id: string;
  user_id: string;
  session_id?: string; // null = workspace-wide
  scope: 'transient_only' | 'recorded';
  granted_at: number;
  expires_at?: number; // null = until revoked
  revoked_at?: number;
  jurisdiction?: string; // for PDPA / GDPR routing
}

// F208 — Gesture model (per-user calibration)
interface GestureModel {
  id: string;
  user_id: string;
  hand_size_calibration?: {
    // calibrated at session start
    palm_width_px: number;
    finger_length_px: number;
  };
  enabled_gestures: GestureType[];
  per_gesture_threshold: Record<GestureType, number>; // 0..1
  per_gesture_cooldown_ms: Record<GestureType, number>;
  updated_at: number;
}

type GestureType =
  | 'push_right' // next slide
  | 'push_left' // previous slide
  | 'point' // virtual laser
  | 'fist' // laser off
  | 'two_finger_tap' // pause/resume
  | 'thumbs_up'; // next build step

// F209 — Voice trigger
interface VoiceTrigger {
  id: string;
  deck_id?: string; // null = workspace default
  phrase: string; // "bear case", "next slide", etc.
  action: string; // action identifier (scenario_toggle, slide_advance, etc.)
  phonetic_variants: string[];
  require_confirmation: boolean; // default true
  language: string; // BCP-47
  enabled: boolean;
}

// F210 — Ambient session
interface AmbientSession {
  id: string;
  deck_id: string;
  device_id: string; // kiosk/room display
  started_at: number;
  ended_at?: number;
  trigger: 'calendar' | 'manual' | 'scheduled_window';
  composition: string[]; // element ids in the ambient dashboard
  refresh_cadence: '5min_business' | 'hourly' | 'custom';
  custom_cadence_seconds?: number;
  takeover_at?: number; // when a presenter took over
  standby_at?: number; // when ambient dimmed to standby
}

// F211 — Two-way negotiation
interface TwoWayNegotiation {
  id: string;
  deck_id: string;
  slide_id: string;
  widget_id: string;
  parties: NegotiationParty[];
  convergence_rule: 'any_accepts' | 'all_accept' | 'median' | 'custom';
  custom_formula?: string;
  state: Record<string, number>; // per-party current value
  agreed_value?: number;
  recorded_path: NegotiationPathEntry[];
  status: 'active' | 'paused' | 'converged' | 'abandoned' | 'timeout';
  started_at: number;
  paused_at?: number;
  expires_at?: number; // default +24h
}

interface NegotiationParty {
  party_id: string;
  label: string; // "Buyer", "Seller"
  role: 'negotiator' | 'observer';
  joined_at: number;
  left_at?: number;
}

interface NegotiationPathEntry {
  t: number;
  party_id: string;
  value: number;
  intent: 'propose' | 'accept' | 'reject' | 'withdraw';
}

// F212 — Deck inheritance edge
interface DeckInheritanceEdge {
  id: string;
  parent_deck_id: string;
  child_deck_id: string;
  derived_via: 'clone' | 'fork_template' | 'fork_shared' | 'two_way_fork';
  ancestor_snapshot_at_fork: string; // version hash
  current_ancestor_version: string;
  unmerged_changes: number;
  updates_available: boolean;
  auto_apply_pushes: boolean; // requires explicit permission at fork time
  broken: boolean; // true if "break inheritance" was called
  created_at: number;
}

// F213 — Audience view state (live broadcast cursor)
interface AudienceViewState {
  session_id: string;
  last_event_seq: number; // most recent event broadcast
  audience_count: number;
  audience_by_region: Record<string, number>; // country -> count
  presenter_connected: boolean;
  last_presenter_heartbeat: number;
}

// F214 — Meeting listener session
interface MeetingListenerSession {
  id: string;
  session_id: string; // presenter session
  user_id: string; // presenter (consent giver)
  consent_id: string; // FK to consent record
  status: 'active' | 'paused' | 'ended';
  started_at: number;
  ended_at?: number;
  surfaces: ListenerSurface[]; // in-session log (not persisted after end)
  // surfaces zeroed on session end; only metadata retained for audit
}

interface ListenerSurface {
  t: number;
  matched_slide_id: string;
  confidence: number;
  intent_text: string; // partial transcript that matched
  dismissed: boolean;
}

// F215 — Provenance chip (attached to a data binding or AI-generated content)
interface ProvenanceChip {
  id: string;
  binding_id: string; // FK to data binding (F48)
  source_system: string; // "Salesforce", "BigQuery:warehouse", etc.
  source_query?: string; // SQL or query DSL (permissioned)
  source_query_redacted?: string; // fallback when user lacks source access
  owner_user_id: string;
  last_verified_at: number;
  freshness_threshold_seconds: number;
  ai_generated: boolean;
  ai_generation_context?: {
    // present iff ai_generated
    prompt_summary: string;
    source_binding_ids: string[];
    confidence_score: number; // ties to F238
  };
  lineage_upstream: string[]; // source/transform IDs
  lineage_downstream: string[]; // other binding IDs citing the same value
}

// F216 — Podcast episode
interface PodcastEpisode {
  id: string;
  deck_id: string;
  version_hash: string; // deck version at generation time
  title: string;
  script: PodcastScriptSegment[];
  audio_url: string; // MP3/AAC
  duration_seconds: number;
  voice_a: string; // voice id
  voice_b: string;
  pronunciation_dict: Record<string, string>; // "NPS" -> "Net Promoter Score"
  generation_metadata: {
    generated_at: number;
    generation_cost_usd: number;
    tts_provider: string;
    model_versions: Record<string, string>;
  };
  access_tag: string; // inherits deck's confidentiality
}

interface PodcastScriptSegment {
  segment_index: number;
  speaker: 'host_a' | 'host_b';
  text: string;
  audio_segment_url?: string; // for partial re-renders after edit
  slide_id?: string; // the slide this segment is based on
}

// F217 — Haptic cue (per-deck or per-rehearsal definition)
interface HapticCue {
  id: string;
  deck_id: string;
  slide_id: string;
  cue_type: 'halfway' | 'warning' | 'over_time' | 'skip_vote' | 'good_pacing';
  trigger: {
    kind: 'time_offset'; // "X% of allotted time"
    pct: number; // 50, 80, 100, 110
  };
  pattern: number[]; // Web Vibration API pattern, e.g. [200]
  enabled: boolean;
  rehearsal_only: boolean; // true = only fires in rehearsal mode
}

// F218 — Kiosk configuration
interface KioskConfig {
  id: string;
  device_id: string;
  deck_id: string;
  loop: KioskLoopEntry[];
  reset_triggers: {
    idle_seconds: number; // default 60
    hard_timeout_minutes: number; // default 30
    schedule_cron?: string; // e.g., "0 0 * * *" for daily midnight
  };
  watchdog_timeout_seconds: number; // default 5
  touch_enabled_elements: string[]; // element ids that respond to touch
  isolation_profile: 'kiosk_only' | 'kiosk_plus_whitelist';
  last_heartbeat: number;
  last_reset: {
    at: number;
    reason: 'scheduled' | 'idle' | 'hard_timeout' | 'watchdog' | 'manual';
  };
  offline_cache_expires_at: number; // cached deck validity
}

interface KioskLoopEntry {
  slide_id: string;
  dwell_seconds: number; // default 15
  start_state?: Record<string, unknown>; // e.g., scenario="bull"
}

// F219 — Cross-deck knowledge graph nodes and edges
interface KnowledgeGraphNode {
  id: string;
  entity_type:
    | 'organization'
    | 'product'
    | 'person'
    | 'metric'
    | 'location'
    | 'date'
    | 'custom';
  canonical_label: string;
  aliases: string[];
  current_value?: string | number;
  value_history: { at: number; value: string | number; deck_id: string }[];
  last_verified_at?: number;
  freshness_threshold_seconds?: number;
  has_conflicting_values: boolean;
  confidence_score: number;
  pii_redacted: boolean;
  workspace_id: string;
}

interface KnowledgeGraphEdge {
  id: string;
  from_node_id: string;
  to_node_id: string;
  edge_type: 'cites' | 'defines' | 'owns' | 'transforms' | 'conflicts_with';
  from_deck_id: string; // the deck that contains the citation
  from_slide_id?: string;
  first_seen_at: number;
  last_seen_at: number;
}
```

---

## 6. APIs and Contracts

REST + WebSocket / WebRTC contracts for each major operation. All endpoints require authentication; access controls mirror the underlying deck's permissions (F158, F193).

### 6.1 Timeline ingest/replay (F205)

```
POST /sessions/{session_id}/timeline/events
  Body: { seq, t_wall, t_mono, actor_id, event_type, payload, deck_version_hash }
  Response: 202 Accepted (event queued for append)

POST /sessions/{session_id}/timeline/snapshots
  Body: { t_wall, deck_version_hash, data_source_snapshot_id, delta, full_state? }
  Response: 202 Accepted

GET  /sessions/{session_id}/replay
  Response: { replay_url, expires_at, total_duration_ms, event_count }

WS   /replay/{replay_id}
  Bidirectional: client sends scrub/play/pause commands; server streams frame snapshots + events.
```

### 6.2 Consent (F207, F208, F209, F214)

```
POST /consents/gaze
  Body: { session_id?, scope: "transient_only"|"recorded", expires_at? }
  Response: 201 Created with { consent_id, valid_until }

DELETE /consents/gaze/{consent_id}
  Response: 204 No Content (revocation recorded)

POST /consents/gesture
  Body: { session_id, hand_size_calibration? }
  Response: 201 Created

POST /consents/voice
  Body: { session_id, language }
  Response: 201 Created

POST /consents/listener
  Body: { session_id, scope: "transient"|"persist_detections_only" }
  Response: 201 Created (consent is per-session, prominent opt-in)
```

### 6.3 Two-way sync (F211)

```
POST /negotiations
  Body: { deck_id, slide_id, widget_id, parties, convergence_rule, expires_at? }
  Response: 201 Created with { negotiation_id, join_urls: { party_id: url } }

POST /negotiations/{id}/input
  Body: { party_id, value, intent: "propose"|"accept"|"reject" }
  Response: 200 OK with { current_state, agreed_value? }

WS   /negotiations/{id}/stream
  Server pushes: state_changed, agreed, paused, resumed, ended events.
```

### 6.4 Inheritance propagation (F212)

```
GET  /decks/{deck_id}/inheritance
  Response: { tree: InheritanceNode[], updates_available_count }

POST /inheritance/push
  Body: { ancestor_deck_id, changes: ChangeRef[], target_descendants: string[]|"unmerged_only" }
  Response: 202 Accepted with { push_proposal_id, target_count }

POST /inheritance/push/{push_proposal_id}/accept
POST /inheritance/push/{push_proposal_id}/reject
  Body: { reason? }
```

### 6.5 Audience view sync (F213)

```
WS   /sessions/{session_id}/audience
  Server pushes: presenter_state_event (slide_changed, annotation, gaze, pointer)
  Client sends: heartbeat, last_applied_seq
```

### 6.6 Listener queries (F214)

```
GET  /sessions/{session_id}/listener/surfaces
  Response: { surfaces: ListenerSurface[] }  // available during session; cleared on end

POST /sessions/{session_id}/listener/feedback
  Body: { surface_id, signal: "positive"|"negative" }
  Response: 204 No Content
```

### 6.7 Provenance lookups (F215)

```
GET  /bindings/{binding_id}/provenance
  Response: { chip: ProvenanceChip, lineage: { upstream: [...], downstream: [...] } }

POST /provenance/verify
  Body: { binding_id, actor_id }
  Response: 200 OK with { last_verified_at: <now> }
```

### 6.8 Podcast generation (F216)

```
POST /decks/{deck_id}/podcast/generate
  Body: { voice_a, voice_b, length_mode: "briefing"|"default"|"deep_dive", pronunciation_dict? }
  Response: 202 Accepted with { job_id }

GET  /podcast-jobs/{job_id}
  Response: { status: "generating_script"|"ready_for_review"|"generating_audio"|"complete", script_preview_url?, episode_id? }

PATCH /podcast-jobs/{job_id}/script
  Body: { edits: { segment_index, new_text }[] }
  Response: 200 OK

POST /podcast-jobs/{job_id}/commit
  Response: 201 Created with { episode_id, audio_url }
```

### 6.9 Knowledge graph queries (F219)

```
GET  /knowledge-graph/entities/search?q={query}&include_stale=true
  Response: { entities: KnowledgeGraphNode[] }

GET  /knowledge-graph/entities/{entity_id}/citations
  Response: { citations: { deck_id, slide_id, value, freshness, stale: boolean }[] }

POST /knowledge-graph/extract/deck/{deck_id}
  Body: { force_full: boolean }
  Response: 202 Accepted with { job_id }

MCP tool (F221): knowledge_graph_search(query: string, options: { include_stale?: boolean, entity_types?: string[] })
MCP tool: knowledge_graph_get_citations(entity_id: string)
```

---

## 7. Security

### 7.1 Consent records for camera/mic data (F207, F208, F209, F214)

- **Storage.** Consent records are stored separately from session data; revocation is append-only (a new record with `revoked_at`); the record's `valid_until` is checked on every activation.
- **Granularity.** Per-feature, per-session (or per-workspace for default grants); never org-wide for biometric features.
- **PDPA / GDPR alignment.** Records include `jurisdiction` for routing; consent text is the literal shown to the user; expiry is enforced.
- **No silent re-consent.** Consent cannot be inferred from continued use of a feature; it must be an explicit affirmative action.

### 7.2 Privacy for gaze and gesture data

- **On-device only by default.** Webcam frames never leave the device. Models run in WASM/Worker isolation.
- **Quantization.** Broadcast coordinates (if enabled) are quantized to 32×24 to prevent fine-grained behavioral profiling.
- **No persistence.** In-memory buffers are zeroed on session end. No raw or derived gaze/gesture data is written to disk or sent to analytics.
- **Auditability.** The user can always see what the system is doing ("gaze tracking is ON; on-device; not recording").

### 7.3 Secure provenance lineage (no credential leakage)

- **Permissioned queries.** The query/SQL behind a data binding is only visible to users with read access on the source system; redacted fallback is shown to others.
- **No credentials in lineage.** The provenance record stores the source system identifier and a query reference (e.g., report ID), never the access token or password.
- **PII redaction.** If the query contains PII, it is stored encrypted at rest; only redacted form is shown unless the user has explicit PII access on the source.

### 7.4 Kiosk isolation

- **Separate user account.** Kiosk devices run as a non-human identity with no edit access, no read access to other decks, no access to other apps.
- **Restricted input.** USB and Bluetooth input is restricted to touchscreens only (no keyboard/mouse injection).
- **Network segmentation.** Kiosk clients connect only to the deck-rendering endpoint and the heartbeat service; no broader network access.
- **Remote revocation.** A stolen or compromised kiosk can be revoked by serial number; revocation invalidates the client cert and the cached deck.

### 7.5 Knowledge graph PII redaction

- **Encrypted at rest.** Person entities are stored encrypted; the encryption key is per-workspace.
- **Redaction at query time.** Queries from users without PII access return initials or role-based labels; full names require PII access.
- **No leakage via embeddings.** Embeddings used for cross-deck linking do not contain PII; entity resolution uses ids, not names.
- **Audit log.** Every PII access is logged for compliance review.

---

## 8. Performance

### 8.1 Timeline storage efficiency (F205)

- **Delta-compressed snapshots.** Snapshots store deltas against the prior snapshot (CRDT-style); every Nth snapshot (default 60) is a full anchor.
- **Compact event encoding.** Events use a fixed event-type enum and a payload schema per type; payloads are JSON-binary-encoded (MessagePack or similar) for ~30% size reduction vs. raw JSON.
- **Compaction.** Per-session events older than 90 days are compacted to a "session summary" record (per-slide dwell, scenario toggles, polls/Q&A counts).
- **Target:** ≤ 30 KB per minute for events; ≤ 200 KB per minute for snapshots (1 Hz cadence).

### 8.2 Gaze sampling/quantization (F207)

- **Capture:** 30 Hz webcam.
- **Inference:** 15 Hz (every other frame) — sufficient for human-gaze dynamics.
- **Broadcast:** 10 Hz, quantized to 32×24 grid (one byte per coordinate = 2 bytes per event).
- **Bandwidth:** ≤ 500 bytes/sec per audience member.

### 8.3 Gesture recognition FPS (F208)

- **Capture:** 30 Hz.
- **Inference:** 24 Hz (skip every 5th frame for compute savings; minor accuracy trade-off).
- **Latency budget:** gesture onset → action fired: < 200 ms p95.

### 8.4 Voice trigger latency (F209)

- **ASR latency:** < 300 ms per partial transcript (Web Speech API or Whisper-tiny).
- **Match latency:** < 50 ms per partial transcript (fuzzy match against a small phrase list).
- **Confirmation latency:** 2 s window.
- **End-to-end:** phrase spoken → action fired (post-confirmation): < 1 s p95.

### 8.5 Two-way sync round-trip (F211)

- **Input → visibility latency:** < 500 ms p95 across all parties globally.
- **Convergence computation:** < 100 ms for up to 10 parties.
- **Recording:** append-only, < 50 ms per path entry.

### 8.6 Audience view sync budget (F213)

- **End-to-end:** 800 ms p95, 400 ms p50 from presenter commit to all audience viewers.
- **Edge routing:** anycast to nearest edge; intra-edge fanout via WebRTC data channels.
- **Bandwidth per audience member:** ≤ 5 KB/s average.

### 8.7 Listener quiet UI budget (F214)

- **Detection → surface latency:** < 1.5 s p95.
- **Surface UI render:** single chip overlay, ≤ 16 ms paint, no full-screen takeover.
- **CPU/memory:** < 5% CPU, < 100 MB RAM on presenter machine.

### 8.8 Knowledge graph query latency (F219)

- **Entity lookup:** < 1 s p95.
- **Citation listing:** < 3 s p95 for "all citations of this entity."
- **Extraction:** incremental on deck change < 10 s per slide; full re-extraction batched.

---

## 9. Observability and Testing

### 9.1 Metrics

Each service exports:

- **Request rate, error rate, latency** (RED metrics) per endpoint.
- **Custom domain metrics:**
  - F205: timeline event rate, snapshot rate, replay startup time, determinism check pass rate.
  - F206: refresh latency per data binding, change-event rate.
  - F207: gaze inference FPS, broadcast latency, consent grant/revoke rate.
  - F208: gesture recognition FPS, false-positive rate (from user dismissals), calibration duration.
  - F209: ASR WER (from user feedback), trigger confirmation latency.
  - F211: negotiation input latency, convergence time, abandonment rate.
  - F212: push proposal latency, accept/reject rate, fan-out duration.
  - F213: edge sync latency p50/p95, audience reconnect rate, bandwidth per audience member.
  - F214: listener detection latency, surface precision (from presenter dismissals), consent grant rate.
  - F215: chip render time, freshness check latency.
  - F216: generation duration, TTS cost per episode, voice MOS from sample reviews.
  - F217: haptic fire latency, missed cues (log review).
  - F218: reset rate by trigger type, watchdog fire rate, heartbeat miss rate.
  - F219: extraction precision/recall (from labeled eval set), query latency, PII redaction coverage.

### 9.2 Logs

Structured JSON logs with:

- `service`, `trace_id`, `session_id`, `actor_id`, `event_type`.
- PII redaction at log emission: person names, email addresses, raw gaze/gesture/voice data are never logged.
- Biometric-feature logs (F207, F208, F209, F214) are tagged `pii:sensitive` and retained for a shorter window (30 days default) with stricter access.

### 9.3 Tracing

Distributed tracing across the presenter client, broadcaster, edge, audience client, and persistence layers. Each user-facing action (e.g., "push update down" from F212) is a root trace with child spans per service hop.

### 9.4 Testing strategy

- **Unit tests.** Per-service logic, especially CRDT merging (F211), convergence rules, extraction heuristics (F219), and gesture/voice state machines.
- **Integration tests.** Cross-service flows: end-to-end timeline record + replay; full inheritance push + accept; two-way negotiation from create to convergence.
- **Property-based tests.** CRDT invariants: convergence, associativity, commutativity. Timeline determinism: replay byte-equality across runs.
- **Synthetic load tests.** 10k concurrent audience members (F213); 100k events/min ingest (F205); 1000-descendant push (F212).
- **Privacy tests.** Automated checks that no raw webcam frames, raw audio, or raw gaze coordinates leave the device (mocked network egress, asserted via packet capture).
- **Consent tests.** Verify that every biometric feature (F207, F208, F209, F214) refuses to activate without a valid consent record; verify revocation immediately stops inference.
- **Accessibility tests.** Keyboard navigation for chips (F215), ambient mode (F210), kiosk (F218); screen-reader pass for live regions (HUDs, listener surfaces).
- **Labeled eval sets for extraction (F219).** Precision/recall measured on a held-out set of decks with ground-truth entities.

### 9.5 Alerting

- **Sync budget breach (F213):** p95 audience sync latency > 1 s for 5 min → page on-call.
- **Consent anomaly (F207/208/209/214):** consent record count drops > 20% in 1 hr → investigate (potential data loss or revocation spike).
- **Watchdog fire rate (F218):** > 5% of kiosks firing watchdog in 1 hr → investigate client health.
- **Extraction precision regression (F219):** precision drops > 5% week-over-week → alert ML team.
- **Timeline storage growth (F205):** > 50 KB/min average over 24 hr → investigate session volume or compaction bug.

---

## 10. Cross-Section Ties

Section 15 doesn't stand alone; it leans heavily on the rest of the platform and is in turn leaned on by later sections. The dependencies below are the design-contract level; if any of these break, a feature in this section breaks.

### 10.1 Editor (section 1)

- **F205 reuses F21 CRDT machinery** for snapshot delta compression. Without the CRDT layer, the timeline would have to store full snapshots at every step, blowing storage budget.
- **F206, F212, F219 depend on the editor's data binding representation** (the schema that defines what a "data binding" is, what fields it has). Changes to that schema propagate to living-deck refresh logic, inheritance diffs, and knowledge graph extraction.
- **F215's provenance chips attach to the editor's data binding objects**; the editor renders the chip in its hover overlay.
- **F216's podcast script generation reads the editor's element tree** to understand slide content; if the element schema changes, the script generator must be updated.
- **F219's extraction pipeline parses the editor's element tree** to extract entities from text, data labels, and AI-generated content.

### 10.2 Animation state (section 6)

- **F205 records animation clock time** (not wall time) so that scrubbing a replay shows the correct animation frame. This requires the animation engine to expose a `getStateAt(t)` API and to be deterministic.
- **F207's gaze highlight integrates with animation timing**: the highlight is a transient overlay rendered in the same compositor as entrance animations.
- **F213 broadcasts animation state** alongside slide state so audience members see animations evolve in sync.
- **F217's haptic cues are timed against animation duration** when a slide has long animations.

### 10.3 Prototyping state (section 7)

- **F205 records prototyping interactions**: branch choices (F97), calculator inputs (F102), variable changes (F100), form inputs (F101). The timeline event vocabulary includes these.
- **F211 (two-way) is a prototyping widget type**; it uses the prototyping engine's state machine and overlay system.
- **F213 broadcasts prototyping state**: when the presenter toggles a prototype state, all audience members see the corresponding slide state change.
- **F218 (kiosk) honors touch-enabled prototype elements**: kiosk's touch router uses the prototyping engine's hotspot definitions.

### 10.4 AI assistant (section 8)

- **F108–F125 (AI generation, redesign, rehearsal, Q&A prediction, summarization) all generate provenance records (F215)** automatically. Without F215, AI-generated content has no audit trail.
- **F214's intent matcher uses slide embeddings** computed by the AI assistant's embedding pipeline.
- **F216's podcast script is generated by an LLM** in the AI assistant's stack; reuses prompt templates, voice/style controls, and citation conventions.
- **F219's extraction uses the AI assistant's NER and LLM extraction**; entity resolution may call on the assistant's embedding model for fuzzy matching.
- **F238 (uncertainty surfacing) and F215 (provenance) cross-reference**: AI-generated stats flagged as "inferential" appear with a different chip variant.

### 10.5 Presenter mode (section 9)

- **F205 records presenter mode events**: slide advances, hidden-slide reveals (F129), reorder, annotation (F128), backstage whispers (F140), per-slide time tracking (F131).
- **F206's freeze-during-meeting is implemented in presenter mode**: ambient freeze, presenter live, unfreeze at session end.
- **F207/F208/F209/F214 all surface in the presenter's private view** (F126), not the audience view.
- **F213's audience sync is the network transport for presenter mode**: every presenter action is broadcast through F213.
- **F217's haptics run on the phone remote** (F127).
- **F136 (presenter failover) is tightly coupled with F205's recorder**: failover requires the recorder to hand off session state, and replays of failover sessions show the seam as an annotation.

### 10.6 Analytics (section 12)

- **F169–F178 (analytics) consume F205 timeline data**: per-slide time, per-slide interactions, scenario toggles, drop-off points are derived from the timeline.
- **F172 (sales-mode notifications) is enhanced by F206's living-doc change events**: a deal reopening a proposal that's been updated since they last viewed it is a stronger signal than just "reopened."
- **F175 (delivery analytics) uses F213's audience view events**: attendance, participation, drop-off are computed from the audience sync stream.
- **F177 (funnel view) and F170 (interactive element analytics) reuse F205 events**: which scenarios were toggled, which ROI calculator inputs were used, etc.

### 10.7 Collaboration (section 13)

- **F179 (comments) are a first-class living-doc feature (F206)**: comments on living decks accumulate forever and are searchable.
- **F183 (deck merge requests) and F212 (inheritance) share machinery**: both compute semantic diffs; the merge engine is reused.
- **F186 (auto-updating shared slides) is a specific case of F206 + F212**: a shared slide in a slide library (F185) is a living-deck fragment that's pushed down inheritance edges.
- **F189 (Slack/Teams notifications) is a delivery channel for F206's living-doc subscriptions.**
- **F192 (guest collaborators) must respect all consent gates in F207/208/209/214**: a guest's access to biometric features is scoped to their session.

### 10.8 Agentic introspection (section 16)

- **F221 (MCP server) exposes read APIs for the knowledge graph (F219)**, the timeline (F205), and provenance (F215) so agents can audit and reason about decks programmatically.
- **F225 (agent-scoped permissions) interact with F207/208/209/214 consent**: an agent cannot enable biometric features on a presenter's behalf without the presenter's explicit consent.
- **F234 (natural-language patch API) can trigger F212 push operations**: "push the latest pricing updates from the master deck to all Q4 decks" is a one-line NL patch.
- **F237 (deck linting for agents) calls into F219's freshness signals**: an agent auditing for stale stats gets the same staleness data the graph exposes to humans.
- **F240 (deck diffing API for agents) uses the same diff machinery as F212**: structural diffs for agent consumption.

---

## Appendix — Coverage summary

| Feature                  | Mapping (F-by-F) | UX flows | F/NFR | Architecture | Data model | APIs | Security   | Performance | Observability | Cross-section                     |
| ------------------------ | ---------------- | -------- | ----- | ------------ | ---------- | ---- | ---------- | ----------- | ------------- | --------------------------------- |
| F205 State timeline      | §1               | §2.1     | §3.1  | §4.1         | §5         | §6.1 | §7.1       | §8.1        | §9            | §10.1, §10.2, §10.5, §10.6, §10.8 |
| F206 Living documents    | §1               | §2.2     | §3.2  | §4.2         | §5         | §6   | §7         | §8          | §9            | §10.1, §10.5, §10.6, §10.7        |
| F207 Gaze highlighting   | §1               | §2.3     | §3.3  | §4.3         | §5         | §6.2 | §7.1, §7.2 | §8.2        | §9            | §10.2, §10.5                      |
| F208 Gesture control     | §1               | §2.4     | §3.4  | §4.4         | §5         | §6.2 | §7.1, §7.2 | §8.3        | §9            | §10.5                             |
| F209 Voice triggers      | §1               | §2.5     | §3.5  | §4.5         | §5         | §6.2 | §7.1, §7.2 | §8.4        | §9            | §10.5                             |
| F210 Ambient boardroom   | §1               | §2.6     | §3.6  | §4.6         | §5         | §6   | §7         | §8          | §9            | §10.5                             |
| F211 Two-way slides      | §1               | §2.7     | §3.7  | §4.7         | §5         | §6.3 | §7         | §8.5        | §9            | §10.3, §10.5                      |
| F212 Inheritance tree    | §1               | §2.8     | §3.8  | §4.8         | §5         | §6.4 | §7         | §8          | §9            | §10.1, §10.7, §10.8               |
| F213 Audience view sync  | §1               | §2.9     | §3.9  | §4.9         | §5         | §6.5 | §7         | §8.6        | §9            | §10.2, §10.3, §10.5, §10.6        |
| F214 AI meeting listener | §1               | §2.10    | §3.10 | §4.10        | §5         | §6.6 | §7.1, §7.2 | §8.7        | §9            | §10.4, §10.5                      |
| F215 Provenance chips    | §1               | §2.11    | §3.11 | §4.11        | §5         | §6.7 | §7.3       | §8          | §9            | §10.1, §10.4, §10.6, §10.8        |
| F216 Deck-to-podcast     | §1               | §2.12    | §3.12 | §4.12        | §5         | §6.8 | §7         | §8          | §9            | §10.1, §10.4                      |
| F217 Haptic remote       | §1               | §2.13    | §3.13 | §4.13        | §5         | §6   | §7         | §8          | §9            | §10.2, §10.5                      |
| F218 Kiosk mode          | §1               | §2.14    | §3.14 | §4.14        | §5         | §6   | §7.4       | §8          | §9            | §10.3, §10.5                      |
| F219 Knowledge graph     | §1               | §2.15    | §3.15 | §4.15        | §5         | §6.9 | §7.5       | §8.8        | §9            | §10.1, §10.4, §10.6, §10.8        |
