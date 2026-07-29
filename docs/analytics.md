# Section 12 — Analytics & Engagement Intelligence (Features 169–178)

> Part of the Domio planning set. Codename **Domio** — a Figma/Canva/Keynote-grade presentation platform with 240+ features. This document covers the analytics layer: turning every view, click, hover, scenario toggle, and ROI calculator interaction into actionable intelligence for deck owners, sales teams, and org admins — while honoring per-viewer privacy modes and global compliance regimes (GDPR, CCPA, PDPA).

---

## Table of Contents

1. [Feature-by-Feature Mapping (169–178)](#1-feature-by-feature-mapping-169178)
2. [UX Flows](#2-ux-flows)
3. [Functional and Non-Functional Requirements](#3-functional-and-non-functional-requirements)
4. [Architecture](#4-architecture)
5. [Data Model (Postgres + Columnar)](#5-data-model-postgres--columnar)
6. [APIs and Contracts](#6-apis-and-contracts)
7. [Security & Privacy](#7-security--privacy)
8. [Performance](#8-performance)
9. [Observability and Testing (Replay Accuracy)](#9-observability-and-testing-replay-accuracy)
10. [Cross-Section Ties](#10-cross-section-ties)

---

## 1. Feature-by-Feature Mapping (169–178)

Each feature decomposes into **acceptance criteria**, **behavioral details**, and **edge cases**. Test IDs are stable and reused in QA tracking.

### F169 — Per-Viewer, Per-Slide Analytics (#169)

**Scope:** Decompose every viewer session into slide-level engagement: who opened the deck, when, on which device, how long on each slide, where they dropped off, and what they clicked.

**Acceptance Criteria:**
- **AC-169.1** Every public/shared/embedded deck view produces a `session` row and ≥1 `viewer` record (anonymous by default, identified when consent/auth enables it).
- **AC-169.2** Per-slide `dwell_ms` is captured with start/end timestamps accurate to ±250 ms at the client, reconciled against server `session_heartbeat` for drift correction.
- **AC-169.3** Drop-off is computed as the last slide index reached before the session ended (or 30 minutes of inactivity).
- **AC-169.4** Click events are recorded for any element with a `track_clicks=true` property (default for links, hotspots, scenarios, calculators, polls, CTA buttons).
- **AC-169.5** Per-viewer aggregation is only persisted when `viewer_mode != "anonymous_no_track"`; for opt-out modes, only aggregate (deck-level) metrics are retained.
- **AC-169.6** Per-viewer views are exportable as CSV/JSON by deck owners and admins; export is itself audited.

**Behavioral Details:**
- A session is established at deck open, terminated on close/tab-hide + 30 min idle, or on explicit `session.end` from the runtime.
- A session is "anonymous" if the viewer is not authenticated through a share-link identity, SSO, or known CRM contact.
- A session is "identified" when matched to a `viewer` row via `viewer_id_key` (email hash, CRM ID, share-link token).
- Per-slide dwell uses a **visibility-aware timer**: only counts milliseconds where the slide is in the viewport AND the document is visible (Page Visibility API). Audio tab backgrounded → dwell pauses.
- Click recording captures `element_id`, `element_role`, `slide_index`, and a contextual payload (e.g., `{"scenario": "bear"}`, `{"roi_inputs": {...}}`).

**Edge Cases:**
- **Concurrent tabs:** Two tabs on the same deck produce two sessions unless explicitly merged by share-link identity; the UI shows both with a "this viewer also has another tab" badge.
- **Network offline:** Events are buffered in IndexedDB with a 24 h TTL and flushed on reconnect; if offline past TTL, events are dropped and the client emits a `lost_events` self-telemetry record (never the actual events).
- **Bot filtering:** Known user-agents (Googlebot, AhrefsBot, etc.) are tagged `is_bot=true` and excluded from human metrics by default (toggleable).
- **Re-opens within 30 min:** Folded into the prior session if same `viewer_id_key`; otherwise a new session.
- **PDF/PPTX export "viewer":** Exports emit a single `view` event tagged `surface=export` but never a `session` (so they don't pollute dwell metrics).
- **Embed iframes on third-party sites:** Identified by `referer_host`; share-link identity is preserved across embeds when the parent page passes a `_domio_vid` parameter.

---

### F170 — Interactive Element Analytics (#170)

**Scope:** Quantify how viewers interact with interactive elements: which scenario they toggled to, whether they used the ROI calculator, hotspots clicked, branching paths taken, form fields completed, variables modified.

**Acceptance Criteria:**
- **AC-170.1** Every interactive element with a stable `element_id` records a `interaction` event per meaningful user action (toggle, input, submit, click).
- **AC-170.2** Scenario toggles (#57) emit `event_name=scenario_switched` with `{from, to, slide_index, ts}`; the first switch per session is attributed to "first engagement."
- **AC-170.3** ROI calculator (#102) usage emits a `calculator_started` and `calculator_completed` (or `calculator_abandoned`) pair; the inputs are snapshotted only if the user opts in to share them (see §7.2).
- **AC-170.4** Branching choices (#97) emit `branch_taken` with `{from_node, to_node, choice_label}` — these are queryable per-viewer for funnel analysis.
- **AC-170.5** Form inputs (#101) emit `form_field_completed` per field; sensitive fields (e.g., email) are masked by default in analytics (`***@***.com`) unless `collect_pii=true` is set per deck.
- **AC-170.6** Interactive element analytics are visible on the slide-level drilldown with a per-element breakdown ranked by interaction count.

**Behavioral Details:**
- Interaction events carry an `element_role` from a controlled vocabulary (`scenario_toggle`, `roi_calculator`, `hotspot`, `branch_choice`, `form_input`, `poll`, `quiz`, `variable_modifier`).
- Element schema is resolved via the **semantic addressing** system (#226) so that reorders or renames don't break the analytics join.
- A "first interaction" is the earliest non-`view` event in a session; "depth of interaction" is the unique-element count reached.

**Edge Cases:**
- **Spam interactions:** If a user clicks the same toggle >20 times in 10 s, events are coalesced and flagged as `coalesced=true`.
- **Calculator inputs with sensitive numbers:** Numbers are stored as bucketed ranges (e.g., $10k–$50k) by default; raw values only if explicitly opted-in.
- **Branching from a hotspot that is later removed:** Past events still resolve via `element_id` (immutable), with `element_status=retired` annotated in the dashboard.

---

### F171 — Attention Heatmaps for Scroll-Mode Decks (#171)

**Scope:** Generate per-deck, per-section attention heatmaps for the scroll-mode web rendering (#156), showing where viewers scroll, pause, and abandon.

**Acceptance Criteria:**
- **AC-171.1** Scroll-mode renders emit `scroll_progress` pings every 250 ms while the user is scrolling and `scroll_pause` events after 1.5 s of stillness.
- **AC-171.2** A per-deck heatmap tile grid is generated (default 64×N tiles) where each tile's color intensity represents normalized dwell.
- **AC-171.3** Heatmaps are segmented by audience (e.g., "all viewers", "identified investors", "internal team") via saved segments.
- **AC-171.4** Heatmap tile data can be exported as PNG (visual) and JSON (raw) per deck owner request.
- **AC-171.5** Heatmaps refresh within 60 s of a new session ending (near-real-time in the dashboard).

**Behavioral Details:**
- Heatmap generation runs in the **heatmap generator** service (§4.6) on a 5-minute batched job + on-demand trigger after a session ends.
- Tiles are bucketed by `viewport_height` so a phone viewer and a desktop viewer produce comparable tile densities (normalized per row).
- "Hot tiles" are those in the top quartile of dwell; "cold tiles" are those in the bottom quartile with ≥10 impressions (filtering noise).

**Edge Cases:**
- **Very fast scrollers:** Sessions with median scroll velocity >5,000 px/s are flagged and excluded from heatmap generation (not real reading).
- **Long decks (>50 slides):** Tile resolution increases to 128×N to preserve positional granularity.
- **Reduced-motion viewers:** Heatmap still generated but weighted by their scroll progress (which may be the only signal they emit).
- **Empty deck sections:** Skipped; the heatmap renders a "no traffic" placeholder for visual clarity.

---

### F172 — Sales-Mode Notifications (#172)

**Scope:** Push real-time notifications to deck owners when high-value viewers re-engage with the deck — "Acme Corp just reopened your proposal — slide 9, pricing, third time this week."

**Acceptance Criteria:**
- **AC-172.1** Notification triggers fire within 10 s of a qualifying event (session start on a hot deck, repeat visit, long dwell, specific slide touch).
- **AC-172.2** Triggers are configurable per-deck or per-folder: rules like `viewer.tier=="hot" AND slide.section=="pricing" AND revisit_count >= 3`.
- **AC-172.3** Notifications are delivered to channels the user has linked: email, Slack, Teams, mobile push, webhook URL.
- **AC-172.4** Each notification has a deep link to the analytics dashboard for that viewer/deck intersection.
- **AC-172.5** Notification fatigue is bounded by a per-user per-deck rate limit (default: 10 notifications/day).
- **AC-172.6** Notifications respect viewer opt-out: if a viewer disabled tracking, the notification says "anonymous viewer" without identity fields.

**Behavioral Details:**
- The notification dispatcher (§4.10) consumes a `notification.triggered` Kafka topic produced by a CEP (complex event processing) rules engine on top of the event stream.
- "Hot deck" is computed as a heuristic: decks shared with ≥3 high-tier contacts in the last 30 days, or decks tagged `sales-critical=true`.
- "Reopened" requires a session gap of ≥1 hour (configurable) to distinguish a continuation from a reload.
- Notifications are templated with viewer-context (name, company, prior touchpoints) drawn from the `viewer` + `crm_sync_record` join.

**Edge Cases:**
- **Bot sessions:** Always excluded.
- **Self-views by the deck owner:** Excluded by default; toggleable for debugging.
- **Recipient channel outage:** Fallback to email with exponential backoff; surface failure in the audit log.
- **Cross-deck behavior:** If the viewer also opened a related deck (#212), notifications optionally include that as a secondary signal.

---

### F173 — A/B Testing Two Deck Versions (#173)

**Scope:** Split traffic between two deck variants (A/B) or multiple variants (A/B/n) and measure engagement lift on predefined primary metrics.

**Acceptance Criteria:**
- **AC-173.1** An owner can mark a deck as an `ab_test` with 2–n variants, each with a traffic split summing to 100%.
- **AC-173.2** Variants are real decks (linked via `ab_variant_deck_id`) or branches (#19); assignment is sticky per `viewer_id_key`.
- **AC-173.3** The owner selects a **primary metric** (e.g., completion %, time on pricing slide, CTA clicks) and up to 5 secondary metrics.
- **AC-173.4** The framework computes per-variant means, sample sizes, and a p-value or credible interval (Bayesian default).
- **AC-173.5** A "winning variant" call is made when statistical confidence crosses the configured threshold (default 95% or 90% Bayesian probability of being better).
- **AC-173.6** A/B assignments are exposed via an endpoint so external tools (websites, emails) can deterministically assign viewers to variants.

**Behavioral Details:**
- Assignment uses a **deterministic hash** of `viewer_id_key + experiment_id` so the same viewer always sees the same variant — even across devices, browsers, and sessions.
- The A/B framework (§4.7) separates `assignment` (control plane, OLTP) from `measurement` (analytics plane, OLAP).
- Minimum sample size guidance is shown in the UI before launch (e.g., "you'll need ~1,200 sessions per variant to detect a 5 pp lift at 80% power").
- Mid-test peeking is allowed but flagged as "exploratory" until the configured test horizon is reached.

**Edge Cases:**
- **Unbalanced traffic:** If a variant receives <10% of planned traffic after 24 h, a warning is shown.
- **Crossover effects:** If a viewer was previously assigned to a different experiment, the framework respects the older assignment (unless explicitly overridden).
- **Premature stopping:** Stopping a test early logs the decision reason and marks the result as "inconclusive" rather than "winner."
- **Cross-variant contamination:** If a viewer opens the same deck via two different share links (one for A, one for B), the **first** assignment wins for the duration of the test.

---

### F174 — Team Analytics — Templates & Components (#174)

**Scope:** Workspace-level analytics showing which templates, components, and themes drive the most engagement across the org, with the goal of identifying what to invest in.

**Acceptance Criteria:**
- **AC-174.1** The team analytics dashboard ranks templates and components by composite engagement score = weighted sum of (uses, views generated, completion %, conversion events).
- **AC-174.2** Filters: time window, brand, audience tier, deck category (pitch, board report, training).
- **AC-174.3** A "library health" section flags underused but high-engagement templates (signal to promote) and overused but low-engagement templates (signal to retire).
- **AC-174.4** Engagement by **brand kit** (#39) is broken out so brand teams can see which brand expressions resonate.
- **AC-174.5** Drill-down per template shows which decks use it and their median metrics vs. workspace average.

**Behavioral Details:**
- Computed nightly as a `materialized_view` over the deck_metric rollup; materialized for query performance.
- Each `deck_metric` row records the template_id(s) and component_id(s) used; engagement is denormalized for fast aggregation.
- A "trending" badge is awarded to templates with engagement growth >2× the workspace median over 30 days.

**Edge Cases:**
- **New templates:** Templates <14 days old are shown in a separate "incubating" section to avoid drowning them in low-traffic noise.
- **Single-use templates:** Excluded from rankings (need ≥5 distinct decks for statistical relevance).
- **Cross-workspace sharing:** If a template is shared from another workspace, attribution goes to the source workspace (per #186 provenance rules).

---

### F175 — Presentation Delivery Analytics (Live Sessions) (#175)

**Scope:** Real-time and post-session metrics for live presentations: attendance, poll participation, question volume, drop-off, side-channel activity (Q&A, reactions).

**Acceptance Criteria:**
- **AC-175.1** When a presenter starts presenter mode (#126), a `live_session` is opened with `session_kind=live`.
- **AC-175.2** Attendance (unique viewers via QR/join link) is updated every 5 s in the presenter's HUD and every 30 s on the public dashboard.
- **AC-175.3** Poll participation is broken down by poll: participants, response rate, time-to-first-vote, drop-off after a poll.
- **AC-175.4** Question volume: count of Q&A submissions (#145), upvotes, time-to-first-question, unanswered count.
- **AC-175.5** The presenter can pin a "spotlight metric" (e.g., current attendance) for personal confidence monitoring.
- **AC-175.6** After the session ends, a `live_session_summary` is generated within 5 min with engagement scores and replay links.

**Behavioral Details:**
- Live session events flow through the same ingestion pipeline (§4.1) with a `realtime=true` flag for low-latency fan-out to the presenter's HUD via WebSocket.
- The post-session summary joins live session events with the deck's normal metrics for a unified view (avoid double-counting viewers present in both live and replay modes).
- Question volume tracks **distinct viewers** asking, not raw count, to discourage one viewer gaming the metric.

**Edge Cases:**
- **Hybrid attendance (in-room + remote):** In-room attendance is recorded via QR check-in or presenter mark; merged with remote attendance for the live count.
- **Late joins:** Counted from the slide they joined on; retroactive completion rate is computed on a per-viewer basis.
- **Drop-off during Q&A:** Treated as a neutral signal (not a negative engagement mark) unless the viewer also had low live dwell.

---

### F176 — CRM Sync (Salesforce / HubSpot) (#176)

**Scope:** Write viewer engagement events back to the CRM contact timeline so AEs and CSMs see deck activity alongside email/call history.

**Acceptance Criteria:**
- **AC-176.1** When a viewer is identified via CRM ID (matched email hash), engagement events are pushed to the corresponding `Contact` timeline via the CRM's official API.
- **AC-176.2** Events are batched and debounced (default: 5-min flush, or immediately on "high-signal" events like pricing-slide revisit).
- **AC-176.3** A mapping table controls which Domio event types map to which CRM activity types (e.g., `view` → `Email opened`, `pricing_slide_revisit` → `Web activity`).
- **AC-176.4** Sync is bidirectional for opt-in fields: contact "tier" from CRM is pulled back to enrich `viewer.tier` in Domio.
- **AC-176.5** Failed syncs are retried with exponential backoff and surfaced in a sync health dashboard; permanent failures (CRM contact deleted) mark the viewer as `crm_stale`.
- **AC-176.6** Field-level PII is configurable: the sync payload can exclude email, name, or company per CRM config.

**Behavioral Details:**
- The **CRM sync adapter** (§4.8) is a per-provider module (Salesforce, HubSpot, Pipedrive, Dynamics) implementing a common `push(events)`, `pull(contact_id)`, `health()` interface.
- Each CRM has rate limits; the adapter maintains a token bucket and queues accordingly.
- Sync is logged in `crm_sync_record` for auditability (#196), including raw event payloads for 30 days (then purged per retention policy).

**Edge Cases:**
- **CRM outage:** Events are queued up to 24 h; beyond that, they're archived locally and a reconciliation job re-attempts on recovery.
- **Email mismatch:** If the viewer's email doesn't match any CRM contact, the event is held in an "unmatched" bucket for manual review.
- **GDPR erasure request:** If a CRM contact is deleted due to a data subject request, the related Domio viewer records are anonymized and CRM sync is severed (see §7.3).
- **Multiple CRMs:** A workspace can have multiple CRM connections; events route to all connected CRMs that match the contact.

---

### F177 — Funnel View for Sales Decks (#177)

**Scope:** Render a sales funnel — `sent → opened → completed → replied` — with breakdowns by viewer, segment, and time period.

**Acceptance Criteria:**
- **AC-177.1** Funnel stages are computed deterministically: `sent` (link generated/sent), `opened` (first session with ≥1 slide dwell), `completed` (≥80% slides viewed OR final slide viewed), `replied` (reply recorded via email reply tracking or manual mark).
- **AC-177.2** Each stage shows count, conversion rate (from previous), and drop-off count.
- **AC-177.3** Funnel is segmentable by viewer tier, campaign tag, time sent, deck variant, A/B test assignment.
- **AC-177.4** A "time-to-stage" histogram is shown for each transition (e.g., median time from sent to opened).
- **AC-177.5** Funnel is exportable as CSV and shareable as a read-only snapshot URL.

**Behavioral Details:**
- The **funnel computation** runs as a streaming aggregation on the event stream, materialized into `funnel_step` rows per deck × time window × segment.
- A deck owner can override the completion threshold per deck (default 80%) for non-linear decks where the last slide isn't always the goal.
- "Replied" requires email reply tracking integration (per workspace) or a manual flag; if neither, the stage is greyed out.

**Edge Cases:**
- **Anonymous viewers:** Counted in `opened` and `completed` but not in `replied` (since reply requires identity).
- **Multi-deck sequences:** Funnels can be chained across decks in a campaign (#190) — the funnel becomes `sent → deck1_opened → deck1_completed → deck2_opened → ...`.
- **Reply attribution:** If a viewer replies but to a different email thread, attribution is by domain match + fuzzy name match; unmatched replies are flagged for review.
- **Bot opens:** Excluded by default (toggleable for testing scenarios).

---

### F178 — Benchmarks (#178)

**Scope:** Compare a deck's metrics against the distribution of similar decks ("decks like yours average 62% completion — yours is at 78%").

**Acceptance Criteria:**
- **AC-178.1** Benchmarks are computed across the cohort of "similar decks" — same category (pitch, QBR, training), same audience tier (investor, internal, customer), same duration (slide count bucket).
- **AC-178.2** Each benchmark metric shows: your value, cohort median (p50), 25th percentile, 75th percentile, and your percentile rank.
- **AC-178.3** Benchmarks are updated daily and have a 7-day freshness window; stale benchmarks are flagged.
- **AC-178.4** Benchmarks respect minimum cohort size (default n≥30) to avoid exposing individual deck performance in sparse categories.
- **AC-178.5** Org-internal benchmarks can be computed for paid tiers: "your team's decks vs. all decks in your workspace" without exposing to the global pool.

**Behavioral Details:**
- The **benchmark service** (§4.9) computes percentile distributions nightly and stores them as `benchmark_snapshot` rows.
- The cohort definition is parameterized: `category`, `audience_tier`, `slide_count_bucket`, `duration_bucket`, and optional `industry` (if available).
- For privacy, only decks with ≥10 sessions contribute to a cohort; a deck with <10 sessions is excluded from benchmarks but can still query benchmarks.

**Edge Cases:**
- **Cold-start categories:** New categories (<30 eligible decks) display "insufficient data" rather than misleading percentiles.
- **Outliers:** A deck with >3× the cohort's p99 is excluded from the cohort's percentile calculation (otherwise the benchmark becomes self-referential).
- **Time-of-day effects:** Benchmarks can be sliced by weekday/hour for sensitive comparisons (e.g., "investor pitch decks sent on Friday have 12% lower completion").
- **Self-comparison:** A deck owner never sees their deck's individual contribution to a cohort unless explicitly opted in.

---

## 2. UX Flows

### 2.1 Viewing Per-Viewer Engagement

```
Deck owner → "Analytics" tab → Deck detail → "Viewers" tab
  ├─ List of identified viewers (name, company, tier, last seen)
  │   ├─ Click → Per-viewer detail page:
  │   │   - Sessions timeline (open dates, durations, devices)
  │   │   - Per-slide dwell bar chart
  │   │   - Interactions list (toggled scenarios, calculators used, polls answered)
  │   │   - Funnel stage status (sent/opened/completed/replied)
  │   │   - CRM sync status badge
  │   └─ Right pane: Notes, tags, manual "hot lead" flag
  └─ Anonymous viewer aggregate:
      - Count, median dwell, top drop-off slide
```

Key states: empty (no viewers yet), loading (skeleton), loaded, segmented by audience tier, exported as CSV.

### 2.2 Drilling Into Interactive Element Interactions

```
Deck owner → Slide analytics drilldown
  ├─ Slide overview: dwell, drop-off, click heatmap
  └─ "Interactive elements" section:
      ├─ Element list (sorted by interaction count)
      │   ├─ scenario_toggle "Base/Bull/Bear" — 47 switches, 63% engaged
      │   ├─ ROI calculator — 12 started, 8 completed
      │   └─ Hotspot "Talk to sales" — 9 clicks
      └─ Per-element detail:
          - First interaction time (from session start)
          - Time series of interactions (hourly)
          - Completion rate (if applicable)
          - Sample inputs (anonymized unless opted in)
```

### 2.3 Setting Sales Notifications

```
Workspace settings → Notifications → Sales triggers
  ├─ Add trigger:
  │   ├─ Deck(s): pick from list or folder
  │   ├─ Condition builder:
  │   │   - viewer.tier IS one of [Hot, Strategic]
  │   │   - slide.section == "Pricing"
  │   │   - revisit_count >= 3 within 7 days
  │   ├─ Channel(s): Slack #sales-alerts, Email, Webhook
  │   ├─ Rate limit per viewer: default 10/day
  │   └─ Test with synthetic event → Preview notification
  └─ Trigger list with status (enabled/paused, last fired, success rate)
```

### 2.4 Running A/B Tests

```
Deck owner → "Create A/B test"
  ├─ Step 1: Variants
  │   ├─ Variant A (control): pick existing deck
  │   └─ Variant B (challenger): pick branch or upload variant
  ├─ Step 2: Traffic split (default 50/50)
  ├─ Step 3: Primary metric (completion %, time on key slide, CTA click)
  ├─ Step 4: Secondary metrics (up to 5)
  ├─ Step 5: Audience — restrict to known list or open to all viewers
  ├─ Step 6: Estimated runtime (based on effect size + traffic)
  └─ Launch → Live dashboard with:
      - Per-variant sample sizes
      - Live primary metric with confidence interval
      - "Stop test" with required reason
      - "Declare winner" (only when confidence crosses threshold)
```

### 2.5 Comparing Against Benchmarks

```
Deck owner → Deck analytics → "Benchmark" panel
  ├─ Cohort summary: "10,234 similar decks"
  ├─ Your metrics table:
  │   - Completion: yours 78% | cohort p25 41% | p50 62% | p75 79% | rank p88
  │   - Median dwell: yours 4m12s | cohort p50 2m48s | rank p71
  │   - Revisit rate: yours 31% | cohort p50 12% | rank p93
  ├─ Time series overlay (your trend vs. cohort median)
  ├─ "Why this cohort?" — explainer (category, tier, slide count bucket)
  └─ "Drill into cohort" — opt-in to share your deck anonymously to refine
```

---

## 3. Functional and Non-Functional Requirements

### 3.1 Per-Viewer Identification (with Privacy Modes)

**Identification modes** (configured per workspace, per deck, or per share link):
1. **Full identification:** Viewer email + CRM ID + name captured; per-viewer history retained.
2. **Pseudonymous:** Email hashed (HMAC-SHA256 with workspace salt); CRM ID stored as token; reversibility only with workspace admin key.
3. **Anonymous with consent:** No identity captured; per-session pseudonymous ID rotates every 30 days.
4. **Anonymous no-track:** Aggregate only; per-viewer records are not created.

**Identification signals:**
- Email match (from share link, SSO, or CRM reverse-lookup).
- IP + UA fingerprint (best-effort, fallback).
- Share-link token (always created for every shared link).

**Privacy mode selection:**
- Per-workspace default in settings.
- Per-deck override.
- Per-share-link override (the link can declare a stricter mode than the deck default).

### 3.2 Per-Slide Dwell Time Accuracy

- **Sampling:** `visibilitychange` events + 250 ms RAF ticks while visible.
- **Drift correction:** Server `session_heartbeat` (every 30 s) cross-checks client dwell totals; large drift (>15%) is reconciled in favor of server-anchored timestamps.
- **Pause behavior:** Background tab → dwell timer pauses; audio tab backgrounded → paused.
- **Visibility bias mitigation:** A "true dwell" is reported (foreground only) and a "raw dwell" is archived for audit.

### 3.3 Attention Heatmap Generation

- Tile grid: 64 columns × N rows (where N = scroll height / tile height).
- Aggregation: per-tile `dwell_ms`, normalized by `tile_impressions` (count of viewers whose viewport covered the tile).
- Update cadence: 5-min batched + on-demand trigger after a session.
- Privacy floor: tiles with <5 impressions are suppressed in the heatmap to prevent re-identification.

### 3.4 Funnel Computation

- `sent` is set at share-link generation OR first CRM-tracked send (whichever is first).
- `opened` = first session with dwell ≥2 s.
- `completed` = ≥80% slides viewed (configurable) OR final slide reached.
- `replied` = email reply tracked OR manual "replied" flag set.
- Each transition records `transition_ms` from the prior stage for time-to-stage histograms.

### 3.5 CRM Sync Semantics

- **Event types mapped to CRM activities:**
  - `view` → `Email Opened` / `Web Activity`
  - `completed` → `Deck Viewed` / `Milestone`
  - `pricing_slide_revisit` → `Pricing Interest`
  - `replied` → `Email Replied`
  - Custom event mappings configurable per workspace.
- **Sync triggers:**
  - On event (real-time, for high-signal events)
  - On 5-min debounce (default for low-signal events)
  - On session end (full session summary to CRM)
- **Idempotency:** Each event has a stable `event_id`; CRM-side dedup uses this as an external ID.
- **Backpressure:** If CRM rate limit is hit, events queue and retry; if queue depth >10k, a degraded mode flag is set and the UI shows "sync delayed."

### 3.6 Benchmark Computation Pipeline

- **Daily batch:** At 02:00 UTC, compute percentile distributions per cohort.
- **Streaming refresh:** Optional streaming update for high-traffic categories.
- **Cohort eligibility:** Deck must have ≥10 sessions in the last 30 days to contribute.
- **Privacy guard:** Cohort published only if n≥30 contributing decks.
- **Percentile computation:** Standard t-digest or HDR histogram for memory-efficient percentiles.

### 3.7 Real-Time vs Batch Analytics Split

| Layer | Latency target | Use cases |
|---|---|---|
| **Real-time stream** | p95 < 5 s end-to-end | Presenter HUD live attendance, sales notifications, drop-off alerts |
| **Near-real-time batch** | p95 < 60 s | Per-viewer session detail, dashboard refresh |
| **Hourly batch** | p95 < 5 min | Funnel rollups, per-deck aggregates |
| **Daily batch** | by 04:00 UTC | Benchmarks, team analytics, A/B test analysis |

---

## 4. Architecture

### 4.1 High-Level

```
┌──────────────────────────────────────────────────────────────────────┐
│                          VIEWER RUNTIMES                               │
│   Web player · Mobile viewer · Embed iframe · Presenter HUD            │
└──────────────────────────────────────────────────────────────────────┘
                  │ HTTPS (event ingestion)
                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     EVENT INGESTION SERVICE                            │
│   Edge POPs · Auth · Validation · Sampling · Buffer → Kafka           │
└──────────────────────────────────────────────────────────────────────┘
                  │
   ┌──────────────┼──────────────┬──────────────┬──────────────┐
   ▼              ▼              ▼              ▼              ▼
┌────────┐  ┌────────────┐  ┌──────────┐  ┌────────────┐  ┌──────────────┐
│Session-│  │  Analytics │  │ A/B Test │  │  Heatmap   │  │  Notification│
│ization │  │ Warehouse  │  │ Framework│  │ Generator  │  │  Dispatcher  │
│Engine  │  │ (columnar) │  │          │  │            │  │              │
└────────┘  └────────────┘  └──────────┘  └────────────┘  └──────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│            CONTROL PLANE — Postgres (OLTP)                            │
│   viewer · ab_assignment · crm_sync_record · notification_rule       │
└──────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│            DASHBOARD UI + API GATEWAY (GraphQL)                       │
└──────────────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────────────────────────┐
│  CRM SYNC ADAPTERS — Salesforce · HubSpot · Pipedrive · Dynamics      │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.2 Event Ingestion Service

- **Edge layer:** 12+ POPs globally (matching low-latency regions for the editor). Each POP terminates TLS, validates HMAC signatures, applies per-IP rate limiting, and forwards to the regional ingestion cluster.
- **Validation:** Schema enforced per `event_name`; unknown event types logged but accepted (forward compatibility). PII fields are checked against `consent_state` and stripped at the edge if consent is missing.
- **Buffer:** A local disk-backed buffer (10 GB per POP) handles backpressure; client retries on 503 with exponential backoff.
- **Sampling:** A configurable sample rate per deck (default 100% for human sessions, 0% for known bots).
- **Throughput:** Target 200K events/sec sustained, 1M events/sec burst per region.

### 4.3 Analytics Warehouse (Columnar)

- **Choice:** ClickHouse (or DuckDB for the embedded / self-host deployment, #232).
- **Schema design:** Sorted by `(deck_id, ts)` for per-deck scans; `(viewer_id, ts)` for per-viewer scans. Both supported via projection columns.
- **Materialized views:** Pre-aggregated rollups (`deck_metric_5m`, `slide_metric_5m`, `funnel_step_hourly`).
- **Retention:** 13 months hot (columnar), 7 years cold (object storage / Parquet).

### 4.4 Sessionization Engine

- **Input:** Raw event stream from Kafka.
- **Algorithm:** 30-min inactivity timeout; same `viewer_id_key` + same `deck_id` + within window = same session; otherwise new session.
- **Output:** Emits a `session.ended` event with session-level rollups (total dwell, slides touched, interactions count).
- **State:** RocksDB-backed state store for exactly-once semantics with Kafka offsets.

### 4.5 Viewer Identification Service

- **Input:** Anonymous session IDs, email matches, share-link tokens, CRM reverse-lookup.
- **Identity graph:** A viewer can have multiple ID sources (email, CRM ID, SSO sub). The graph merges by a configurable identity rule (default: exact email match after normalization).
- **Privacy boundary:** The graph is only constructed within the workspace's privacy mode; pseudonymous IDs are never merged across privacy modes.

### 4.6 Heatmap Generator

- **Trigger:** 5-min schedule + on-demand after session end.
- **Input:** `scroll_progress` events from sessionization.
- **Output:** `heatmap_tile` rows in the warehouse + a cached PNG/SVG for the dashboard.

### 4.7 A/B Test Framework

- **Components:**
  - **Assignment service** (synchronous, OLTP) — deterministic hash → variant lookup, low-latency.
  - **Metrics collector** (asynchronous, OLAP) — consumes events tagged with `experiment_id`.
  - **Statistics engine** — frequentist (z-test, t-test) and Bayesian (Beta-Binomial) inference.
  - **Decision service** — emits `experiment.concluded` events with the declared winner.

### 4.8 CRM Sync Adapters

- **Per-provider module:** Implements `push(events)`, `pull(contact_id)`, `health()`.
- **Rate limit handling:** Token bucket per CRM API.
- **Webhook receiver:** Receives CRM-side changes (e.g., contact deleted) and propagates to Domio (e.g., anonymize viewer).

### 4.9 Benchmark Service

- **Nightly job:** Computes percentile distributions per cohort.
- **Output:** `benchmark_snapshot` rows + materialized view for fast dashboard reads.
- **Org-internal benchmarks:** Same pipeline, but cohorts are workspace-scoped and not exposed externally.

### 4.10 Notification Dispatcher

- **Input:** `notification.triggered` events from CEP.
- **Channels:** Email (SMTP/SES), Slack (webhook), Teams (webhook), mobile push (FCM/APNs), generic webhook.
- **Rate limiting:** Per-user per-deck daily caps; per-channel concurrency limits.

### 4.11 Dashboard UI

- **Stack:** React + a chart library supporting billions of points (e.g., Apache ECharts / Visx with downsampling).
- **API:** GraphQL gateway that fans out to Postgres (control plane) + ClickHouse (analytics).
- **Refresh model:** Polling at 5 s for live indicators, on-demand for drilldowns, cached aggregations for benchmarks.

---

## 5. Data Model (Postgres + Columnar)

**Hybrid storage rationale:** Postgres owns the control plane (assignments, configs, CRM sync state, identity graph) because of its strong consistency and join semantics. ClickHouse (or DuckDB) owns the analytics plane (events, rollups, heatmap tiles, funnel steps) because of its columnar scan performance at billion-event scale. Some rollups are mirrored in Postgres for low-latency control-plane queries.

### 5.1 Postgres (OLTP Control Plane)

```sql
-- VIEWER: identity graph entry (one row per known viewer)
CREATE TABLE viewer (
  viewer_id          UUID PRIMARY KEY,
  workspace_id       UUID NOT NULL,
  email_hash         BYTEA,             -- HMAC-SHA256(email, workspace_salt)
  email_plain        BYTEA,             -- encrypted-at-rest, only readable with workspace key
  crm_contact_id     TEXT,
  crm_provider       TEXT,              -- 'salesforce' | 'hubspot' | ...
  display_name       TEXT,
  company            TEXT,
  tier               TEXT,              -- 'hot' | 'warm' | 'cold' | 'unknown'
  privacy_mode       TEXT NOT NULL,     -- 'identified' | 'pseudonymous' | 'anon_consent' | 'anon_no_track'
  consent_state      JSONB NOT NULL,    -- {marketing: true, analytics: true, ...}
  first_seen_at      TIMESTAMPTZ NOT NULL,
  last_seen_at       TIMESTAMPTZ NOT NULL,
  crm_stale          BOOLEAN DEFAULT FALSE,
  anonymized_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_viewer_workspace ON viewer(workspace_id);
CREATE INDEX idx_viewer_email_hash ON viewer(email_hash);
CREATE INDEX idx_viewer_crm ON viewer(crm_provider, crm_contact_id);

-- EVENT: control-plane event index (metadata only; payload in columnar)
CREATE TABLE event_index (
  event_id           UUID PRIMARY KEY,
  workspace_id       UUID NOT NULL,
  deck_id            UUID NOT NULL,
  session_id         UUID NOT NULL,
  viewer_id          UUID,             -- nullable for anon_no_track
  event_name         TEXT NOT NULL,    -- 'view' | 'interaction' | 'scroll_progress' | ...
  ts                 TIMESTAMPTZ NOT NULL,
  surface            TEXT,             -- 'web' | 'mobile' | 'embed' | 'presenter' | 'export'
  is_bot             BOOLEAN DEFAULT FALSE,
  ingested_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_event_session ON event_index(session_id);
CREATE INDEX idx_event_deck_ts ON event_index(deck_id, ts DESC);
CREATE INDEX idx_event_viewer_ts ON event_index(viewer_id, ts DESC) WHERE viewer_id IS NOT NULL;

-- SESSION: a viewing session's metadata (dwell totals in columnar)
CREATE TABLE session (
  session_id         UUID PRIMARY KEY,
  workspace_id       UUID NOT NULL,
  deck_id            UUID NOT NULL,
  viewer_id          UUID,             -- nullable for anon_no_track
  share_link_id      UUID,
  started_at         TIMESTAMPTZ NOT NULL,
  ended_at           TIMESTAMPTZ,
  ended_reason       TEXT,             -- 'close' | 'idle_30m' | 'navigation' | 'error'
  device_class       TEXT,             -- 'desktop' | 'mobile' | 'tablet' | 'embed'
  referer_host       TEXT,
  user_agent_hash    BYTEA,            -- bucketed, not raw
  country_code       TEXT,             -- from IP geo
  is_live            BOOLEAN DEFAULT FALSE
);
CREATE INDEX idx_session_deck ON session(deck_id);
CREATE INDEX idx_session_viewer ON session(viewer_id) WHERE viewer_id IS NOT NULL;

-- DECK_METRIC: nightly rollup (also materialized in ClickHouse)
CREATE TABLE deck_metric (
  deck_id            UUID,
  bucket_date        DATE,
  sessions_total     INT,
  viewers_unique     INT,
  completion_pct     NUMERIC(5,2),
  median_dwell_ms    INT,
  revisit_count      INT,
  cta_clicks         INT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (deck_id, bucket_date)
);

-- SLIDE_METRIC: per-slide rollup
CREATE TABLE slide_metric (
  deck_id            UUID,
  slide_index        INT,
  bucket_date        DATE,
  impressions        INT,
  median_dwell_ms    INT,
  drop_off_count     INT,
  interaction_count  INT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (deck_id, slide_index, bucket_date)
);

-- FUNNEL_STEP: precomputed funnel counts
CREATE TABLE funnel_step (
  deck_id            UUID,
  segment_key        TEXT,             -- 'all' | tier:X | campaign:Y
  bucket_date        DATE,
  step_name          TEXT,             -- 'sent' | 'opened' | 'completed' | 'replied'
  count_value        INT,
  conversion_from_prev NUMERIC(5,2),
  transition_p50_ms  INT,
  PRIMARY KEY (deck_id, segment_key, bucket_date, step_name)
);

-- AB_TEST: experiment definition
CREATE TABLE ab_test (
  experiment_id      UUID PRIMARY KEY,
  workspace_id       UUID NOT NULL,
  deck_id            UUID NOT NULL,    -- the control variant
  name               TEXT NOT NULL,
  status             TEXT NOT NULL,    -- 'draft' | 'running' | 'stopped' | 'concluded'
  primary_metric     TEXT NOT NULL,
  secondary_metrics  TEXT[],
  traffic_split      JSONB NOT NULL,   -- {"A": 0.5, "B": 0.5}
  started_at         TIMESTAMPTZ,
  ended_at           TIMESTAMPTZ,
  concluded_winner   TEXT,
  confidence         NUMERIC(5,4),
  created_by         UUID NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- AB_ASSIGNMENT: sticky variant assignment per viewer
CREATE TABLE ab_assignment (
  experiment_id      UUID,
  viewer_id_key      TEXT,             -- pseudonymous key (email_hash or anon_id)
  variant            TEXT NOT NULL,
  assigned_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (experiment_id, viewer_id_key)
);

-- CRM_SYNC_RECORD: audit trail
CREATE TABLE crm_sync_record (
  sync_id            UUID PRIMARY KEY,
  workspace_id       UUID NOT NULL,
  crm_provider       TEXT NOT NULL,
  crm_contact_id     TEXT,
  event_id           UUID,
  sync_status        TEXT NOT NULL,    -- 'queued' | 'sent' | 'failed' | 'skipped'
  sync_attempts      INT DEFAULT 0,
  payload_redacted   JSONB,
  error_message      TEXT,
  synced_at          TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_crm_sync_status ON crm_sync_record(sync_status) WHERE sync_status IN ('queued','failed');

-- CRM_CONNECTION: per-workspace CRM auth
CREATE TABLE crm_connection (
  connection_id      UUID PRIMARY KEY,
  workspace_id       UUID NOT NULL,
  provider           TEXT NOT NULL,    -- 'salesforce' | 'hubspot' | ...
  auth_secret_ref    TEXT NOT NULL,    -- pointer to vault
  field_mapping      JSONB NOT NULL,
  is_active          BOOLEAN DEFAULT TRUE,
  last_health_at     TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- NOTIFICATION_RULE: sales-mode trigger config
CREATE TABLE notification_rule (
  rule_id            UUID PRIMARY KEY,
  workspace_id       UUID NOT NULL,
  user_id            UUID NOT NULL,
  name               TEXT NOT NULL,
  condition_dsl      JSONB NOT NULL,   -- {viewer.tier: ["hot"], slide.section: ["pricing"], ...}
  channels           TEXT[] NOT NULL,  -- ['slack', 'email', 'webhook']
  channel_config     JSONB NOT NULL,
  rate_limit_per_day INT DEFAULT 10,
  is_active          BOOLEAN DEFAULT TRUE,
  last_fired_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 5.2 ClickHouse / Columnar (Analytics Plane)

```sql
-- EVENTS (columnar)
CREATE TABLE events (
  event_id        UUID,
  ts              DateTime64(3),
  workspace_id    UUID,
  deck_id         UUID,
  session_id      UUID,
  viewer_id       Nullable(UUID),
  event_name      LowCardinality(String),
  slide_index     Nullable(Int32),
  element_id      Nullable(String),
  element_role    Nullable(LowCardinality(String)),
  payload_json    String,           -- raw interaction payload
  is_bot          UInt8,
  device_class    LowCardinality(String),
  country_code    FixedString(2),
  surface         LowCardinality(String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(ts)
ORDER BY (deck_id, ts)
TTL ts + INTERVAL 13 MONTH;

-- SESSION_AGG (materialized view)
CREATE MATERIALIZED VIEW session_agg_mv
ENGINE = SummingMergeTree
ORDER BY (deck_id, session_id)
AS SELECT
  deck_id, session_id,
  sum(dwell_ms) AS total_dwell_ms,
  countIf(event_name = 'view') AS views,
  uniqExact(slide_index) AS slides_touched,
  countIf(event_name = 'interaction') AS interactions
FROM events
WHERE event_name IN ('view','interaction')
GROUP BY deck_id, session_id;

-- HEATMAP_TILE (columnar)
CREATE TABLE heatmap_tile (
  deck_id         UUID,
  bucket_date     Date,
  tile_x          Int32,
  tile_y          Int32,
  dwell_ms        UInt64,
  impressions     UInt32,
  updated_at      DateTime
) ENGINE = SummingMergeTree()
ORDER BY (deck_id, bucket_date, tile_x, tile_y);

-- BENCHMARK_SNAPSHOT
CREATE TABLE benchmark_snapshot (
  cohort_key      String,             -- e.g. 'pitch.investor.10_20_slides'
  bucket_date     Date,
  metric_name     LowCardinality(String),
  p25             Float64,
  p50             Float64,
  p75             Float64,
  p95             Float64,
  n               UInt32
) ENGINE = ReplacingMergeTree(bucket_date)
ORDER BY (cohort_key, metric_name);
```

### 5.3 Entity Relationships

- `viewer 1—N session 1—N events`
- `deck 1—N deck_metric` (per day)
- `deck 1—N slide_metric` (per day, per slide)
- `deck 1—N funnel_step`
- `deck 1—N ab_test` (as control)
- `ab_test 1—N ab_assignment`
- `viewer 1—1 crm_sync_record` (latest)
- `workspace 1—N notification_rule`
- `cohort 1—N benchmark_snapshot`

---

## 6. APIs and Contracts

### 6.1 Event Ingestion Endpoint

```
POST /v1/events
Headers:
  X-Domio-Deck-Id: UUID
  X-Domio-Session-Id: UUID
  X-Domio-Ts-Ms: integer (client wall clock)
  X-Domio-Signature: HMAC-SHA256(body, deck_secret)
  Content-Type: application/json

Body (single event):
{
  "event_name": "view",
  "ts": "2026-07-29T10:23:45.123Z",
  "slide_index": 4,
  "dwell_ms": 8500,
  "viewport_visible": true,
  "element_id": null,
  "element_role": null,
  "payload": {}
}

Body (batch):
{ "events": [ { ... }, { ... } ] }

Response 200:
{ "accepted": 12, "rejected": 0, "ingest_id": "evt_..." }

Response 429: rate limited; client retries with backoff.
Response 401: signature invalid.
```

### 6.2 Query API (GraphQL)

```graphql
type Query {
  deckAnalytics(deckId: ID!, range: DateRange!): DeckAnalytics!
  viewerEngagement(viewerId: ID!, deckId: ID): ViewerEngagement!
  slideBreakdown(deckId: ID!, slideIndex: Int!, range: DateRange!): SlideBreakdown!
  funnel(deckId: ID!, segments: [SegmentFilter!]): Funnel!
  heatmap(deckId: ID!, segmentation: SegmentFilter): Heatmap!
  benchmarks(deckId: ID!, cohort: CohortSpec): [Benchmark!]!
  abTestResults(experimentId: ID!): ABTestResults!
  teamAnalytics(range: DateRange!): TeamAnalytics!
  liveSession(liveSessionId: ID!): LiveSessionState!
}

type DeckAnalytics {
  sessionsTotal: Int!
  viewersUnique: Int!
  completionPct: Float!
  medianDwellMs: Int!
  revisitCount: Int!
  perDay: [DeckMetricPoint!]!
}
```

### 6.3 A/B Assignment Endpoint

```
GET /v1/ab/assign?experiment_id={uuid}&viewer_key={key}
Response 200:
{
  "experiment_id": "exp_...",
  "variant": "B",
  "assigned_at": "2026-07-29T10:23:45Z",
  "is_sticky": true
}

POST /v1/ab/conclude
Body:
{
  "experiment_id": "exp_...",
  "winner": "B",
  "confidence": 0.96,
  "reason": "primary_metric_significant"
}
```

### 6.4 CRM Sync Webhooks (incoming from CRM)

```
POST /v1/webhooks/crm/{provider}
Headers:
  X-Domio-Crm-Signature: HMAC-SHA256(body, connection_secret)

Body examples:

# Salesforce contact updated
{
  "event": "contact.updated",
  "contact_id": "003...",
  "changes": { "tier__c": "Hot" }
}

# HubSpot contact deleted (GDPR)
{
  "event": "contact.deleted",
  "contact_id": "...",
  "reason": "gdpr_erasure"
}

Response 200: { "handled": true }
```

---

## 7. Security & Privacy

### 7.1 PII Handling

- **Email:** Stored encrypted-at-rest in Postgres (`email_plain` BYTEA, AES-256-GCM with workspace key). Email hash (`email_hash`) used for joins without decryption.
- **Names / companies:** Plaintext at rest in Postgres, access-controlled.
- **IP addresses:** Truncated to /24 (IPv4) or /48 (IPv6) after geolocation; never stored in raw form beyond 24 h.
- **User agents:** Hashed (SHA-256) for bucketed analytics; raw UA discarded.
- **CRM contact IDs:** Stored in plaintext (CRM IDs are not PII per GDPR recital 30, but workspace policies may treat them as PII).

### 7.2 GDPR / CCPA / PDPA Compliance

- **Lawful basis:** For identified viewers, "legitimate interest" or "consent" per workspace configuration; for anonymous viewers, "legitimate interest" with prominent opt-out.
- **Consent capture:** A non-blocking banner on first visit per share-link, configurable per workspace (mandatory in EU/UK, opt-in elsewhere).
- **Data subject rights:**
  - **Access:** `GET /v1/viewers/{id}/export` returns a JSON bundle of all stored viewer data.
  - **Erasure:** `POST /v1/viewers/{id}/erase` anonymizes all rows, severing CRM sync and breaking the identity graph; verified within 30 days.
  - **Portability:** Export endpoint returns machine-readable JSON.
  - **Object:** `POST /v1/viewers/{id}/object` flags future processing as restricted; allowed only for the requested purpose.
- **Cross-region:** EU-resident viewers are guaranteed to land on EU-region ingestion POPs; data residency enforced at the cluster level.

### 7.3 Anonymization Pipeline

- **Trigger:** Erasure request, account deletion, or privacy mode change.
- **Process:** Within 24 h, all `viewer` rows for the affected subject are scrubbed: `email_plain` zeroed, `email_hash` replaced with a tombstone, `display_name` and `company` set to `"[erased]"`, `anonymized_at` set. Aggregate metrics (deck-level) are retained but cannot be re-linked to the individual.
- **Propagation:** CRM sync adapter is notified to delete corresponding CRM contact or break the link; `crm_sync_record` rows retain metadata but PII fields are scrubbed.

### 7.4 Consent Mode

- **Default:** `analytics_only` — analytics on, marketing off.
- **Available modes:**
  - `analytics_and_marketing` — both on.
  - `marketing_only` — analytics off (rare, only with explicit consent).
  - `none` — no tracking; aggregate-only metrics.
- **Granularity:** Per-category consent (`session`, `interaction`, `scroll`, `crm_sync`, `cross_deck`) — each can be toggled independently.

### 7.5 Retention Policy

| Data class | Hot retention | Cold retention | After |
|---|---|---|---|
| Raw events | 13 months (columnar) | 7 years (Parquet, object storage) | Purged |
| Session metadata | 13 months | n/a | Purged |
| Aggregated deck/slide metrics | 5 years (Postgres + columnar) | n/a | Anonymized |
| CRM sync records | 13 months | n/a | Purged |
| Audit logs | 13 months online | 7 years cold | n/a |
| Anonymized viewer rows | Permanent tombstone | n/a | n/a |

### 7.6 Viewer Opt-Out

- **Mechanism:** A "Do Not Track" toggle accessible via the viewer UI footer; sends a `tracking.optout` event that flips the viewer's `privacy_mode` to `anon_no_track` going forward.
- **Effect:** All future events for that viewer are aggregated but not attributed; existing per-viewer history is purged within 24 h.
- **Honor signals:** `Sec-CH-Prefers-Reduced-Tracking` and `Do-Not-Track` headers are honored automatically.

---

## 8. Performance

### 8.1 Ingestion Throughput

- **Target:** 200K events/sec sustained per region, 1M events/sec burst.
- **Batching:** Clients batch events into 1–5 KB payloads, send every 1–2 s during activity.
- **Backpressure:** When ingestion queue depth >1M events, the POP returns 503 with `Retry-After`; clients back off exponentially.

### 8.2 Query Latency at Billion-Event Scale

- **Per-deck dashboard:** p95 < 500 ms for a deck with 10M events in the last 30 days.
- **Per-viewer detail page:** p95 < 300 ms for a viewer with 1K events.
- **Funnel computation:** p95 < 1 s for a deck with 100K sessions.
- **Heatmap render:** p95 < 200 ms (cached tile data; first load may trigger a 5-min refresh).
- **A/B test results:** p95 < 200 ms (materialized view).
- **Benchmarks:** p95 < 100 ms (precomputed snapshots).

### 8.3 Dashboard Refresh

- **Live indicators (attendance, poll responses):** WebSocket push, p95 < 1 s end-to-end.
- **Per-viewer detail:** On-demand, p95 < 300 ms.
- **Deck overview:** 30-s polling, cached 5 s.
- **Benchmarks:** Cached 24 h, with manual "refresh" button.

---

## 9. Observability and Testing (Replay Accuracy)

### 9.1 Observability

- **Metrics:**
  - `events.ingested.total{event_name, region}`
  - `events.ingest.latency_ms{quantile}`
  - `events.rejected.total{reason}` (validation, signature, sampling)
  - `sessionization.queue_depth`
  - `analytics.query.latency_ms{endpoint}`
  - `crm.sync.queue_depth{provider}`
  - `notification.dispatch.success_rate{channel}`
- **Logs:** Structured JSON per event lifecycle; PII fields redacted at the logger level (regex + allowlist).
- **Traces:** OpenTelemetry across ingestion → sessionization → warehouse, with `event_id` and `session_id` as trace IDs.
- **Alerts:**
  - Ingestion queue depth >1M for 5 min → page on-call.
  - CRM sync failure rate >10% over 1 h → notify integration owner.
  - Benchmark freshness >25 h → notify data team.

### 9.2 Replay Accuracy Testing

The analytics pipeline must be **deterministic** for a given event log. Testing strategy:

- **Replay harness:** A `replay_session(session_id)` job re-runs the sessionization + aggregation pipeline against archived raw events and compares to the originally stored aggregates.
- **Tolerance:** 0.5% delta allowed (drift from clock skew, network jitter). Failures halt the deployment.
- **Property tests:** Random event sequences are generated, processed, and compared to an independent Python reference implementation.
- **Golden files:** A set of 50 hand-curated sessions with expected per-slide dwell, interaction counts, and funnel steps; replayed on every release candidate.
- **Synthetic load tests:** A load generator (`domio-analytics-loadgen`) replays 1M-event corpora at 5× production rate to validate throughput targets.

### 9.3 Other Testing

- **Unit tests:** Per service (ingestion, sessionization, A/B framework, CRM adapters).
- **Integration tests:** End-to-end from a synthetic client through the warehouse.
- **Contract tests:** GraphQL schema conformance; CRM webhook payload schemas.
- **Privacy tests:** PII redactor is unit-tested against known PII patterns; opt-out flow is end-to-end tested.
- **Performance tests:** k6 scripts run nightly against staging to catch regressions.

---

## 10. Cross-Section Ties

| Source feature | Tie-in |
|---|---|
| **#1 (Editor & canvas)** | Analytics is enabled by default for shared decks; the editor exposes an "Analytics preview" panel for owners to see their own viewing behavior. (#1) |
| **#4 (Live data interactions)** | Scenario toggles (#57), ROI calculators (#102), and what-if sliders (#53) emit `interaction` events; chart drill-downs (#52) emit `drilldown` events with the filter context. (#4) |
| **#7 (Prototyping)** | Branching choices (#97), form inputs (#101), device-frame interactions (#103), prototype user-testing (#104), and mini-games (#105) all contribute to interactive element analytics (#170) and funnel steps (#177). |
| **#8 (AI meeting listener)** | When the listener (#214) surfaces an appendix slide during a live Q&A, the audience's dwell on that slide is attributed to the listener trigger — a new event type `listener_surfaced` with `trigger_question_id`. (#8) |
| **#9 (Presenter mode)** | Live session analytics (#175) and presenter rehearsal metrics (#117, #131) share a presenter analytics dashboard; post-presentation recap (#141) is the per-session view of #175. |
| **#10 (Audience participation)** | Polls (#143), Q&A (#145), quizzes (#146), emoji reactions (#147), audience navigation votes (#148), sentiment sliders (#149), raise-hand (#150), and post-session feedback (#154) feed into both live and aggregate analytics. |
| **#11 (Share links)** | Per-link content control (#159), expiring links (#158), per-viewer watermarking (#158), and custom domains (#160) all carry their own share-link identity; analytics respects the strictest privacy mode among the link's overrides. |
| **#14 (Enterprise governance)** | Audit logs (#196) include every analytics access and export; brand governance (#194) uses engagement signals to compute on-brand score; data residency (#197) is enforced at the ingestion POP level. |
| **#16 (Agentic / MCP)** | The MCP server (#221) exposes analytics tools: `get_deck_analytics(deck_id, range)`, `get_viewer_engagement(viewer_id)`, `list_ab_tests()`, `get_benchmark(deck_id)`, `query_funnel(deck_id, segments)`. Tool-call transcripts (#227) record analytics queries as agent actions. Cross-deck semantic search (#124/#292) extends to "find all decks where viewer X spent >2 min on slide Y." Cross-deck knowledge graph (#219) is queryable via the benchmark service. |

---

_Document path:_ `/home/daiyaan2002/Desktop/Projects/domio/docs/analytics.md`

_Coverage: Features 169–178 (all 10 features). Sections: feature-by-feature (AC + behavior + edges), 5 UX flows, functional/NFR (identification, dwell, heatmap, funnel, CRM, benchmarks, real-time split), architecture (11 components), data model (Postgres + ClickHouse schemas), APIs (4 contract categories), security & privacy (6 sub-areas), performance (3 sub-areas), observability & testing (replay accuracy explicit), cross-section ties (9 sections)._