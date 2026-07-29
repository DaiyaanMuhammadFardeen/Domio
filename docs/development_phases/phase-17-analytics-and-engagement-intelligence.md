# Phase 17 — Analytics & engagement intelligence

**Phase:** 17
**Name:** Analytics & engagement intelligence
**Owner:** Stream F — Insights & Workflow lead; sub-owners per workstream (Ingestion, Identity, Engagement, Heatmaps, A/B, Sales Notifications, CRM Sync, Team Analytics, Live Delivery, Benchmarks, Dashboard)
**Critical-path:** No (surface phase, parallelizable)
**Parallel stream tag:** Stream F — Insights & Workflow (sibling to P18 collaboration & workflow)

**Intent:** Turn every view, click, hover, scenario toggle, ROI calculator interaction, scroll-pause, and live-session action into actionable, owner-visible intelligence — while honoring per-viewer privacy modes (identified / pseudonymous / anonymous-consent / anonymous-no-track) and global compliance regimes (GDPR, CCPA, PDPA 2026). The phase delivers the ingestion plane, columnar analytics warehouse, dashboard GraphQL surface, sales-mode notifications, A/B testing framework, CRM sync adapters, scroll-mode heatmaps, team-level template analytics, live-session delivery analytics, and anonymized benchmark cohorts — all wired to the events emitted by the viewer runtimes (P14), presenter mode (P15), and audience participation (P16).

---

## 1. Goals

- Every public/shared/embedded deck view produces an event-driven record with per-slide dwell accurate to ±250 ms at the client and drift-corrected against server heartbeats; per-viewer aggregation respects privacy mode (#169).
- Interactive elements (polls, ROI calculators, hotspots, branching, form fields, scenario toggles) emit structured interaction events that roll up into per-element rankings and feed funnel step computation (#170, #177).
- Scroll-mode decks generate per-tile attention heatmaps refreshed within 60 s of a session ending, segmented by audience tier, exportable as PNG and JSON (#171).
- Sales-mode notifications fire within 10 s of a qualifying event (high-tier reopen, hot slide revisit, hotspot on CTA) and respect per-recipient daily caps; notifications route to Slack/Teams/email/webhook/mobile push (#172).
- A/B tests split traffic deterministically by hashed `viewer_id_key`, separate assignment from measurement, and call a winner only when statistical confidence crosses the configured threshold (#173).
- Workspace-level team analytics ranks templates, components, and brand kits by composite engagement score; nightly cohort rollups expose what to invest in or retire (#174).
- Live presenter mode streams attendance, poll participation, Q&A volume, and reaction rates to the presenter's HUD in under 1 s p95; post-session summaries join live events with normal per-viewer analytics (#175).
- Engagement events are pushed to Salesforce / HubSpot / Pipedrite / Dynamics timelines within 5 min (or immediately for high-signal events), with bidirectional field mapping and rate-limited per provider (#176).
- The funnel view for sales decks renders `sent → opened → completed → replied` deterministically, with per-stage conversion, time-to-stage histograms, and segmentable by tier, campaign, A/B assignment, and time period (#177).
- Anonymized benchmark cohorts compare each deck against similar decks (category × tier × slide-count bucket) with p25/p50/p75/p95 percentiles and your rank; cold-start categories display "insufficient data" (#178).

---

## 2. Scope

### In scope (feature numbers)

| Feature | Description |
|---|---|
| #169 | Per-viewer, per-slide analytics — dwell, drop-off, click, device, referer |
| #170 | Interactive element analytics — scenario toggles, ROI calc, hotspots, branching, form fields |
| #171 | Attention heatmaps for scroll-mode decks |
| #172 | Sales-mode notifications (real-time, multi-channel, rate-limited) |
| #173 | A/B testing two (or N) deck variants with statistical significance |
| #174 | Team analytics — template / component / brand engagement rankings |
| #175 | Presentation delivery analytics (live sessions + post-session recap) |
| #176 | CRM sync (Salesforce, HubSpot, Pipedrive, Dynamics) |
| #177 | Funnel view for sales decks |
| #178 | Engagement benchmarks (cohort percentiles, percentile rank) |

### Out of scope (deferred to later phases)

- **A/B testing beyond two variants in MVP** — A/B/n is supported in code but the dashboard UI ships with two-variant first; A/B/n is a polish task.
- **Pixel-level heatmaps for slide content** (not just scroll position) — Phase 22 polish.
- **AI-generated narrative on benchmark insights** ("why are you in p88?") — Phase 12 / 21.
- **Multi-tenant cross-workspace benchmarks** — only same-tenant org-internal benchmarks ship; global pool benchmarks are a paid-tier future.
- **Real-time voice-of-customer NLP on comments / Q&A** — Phase 21 novel & frontier.
- **CRDT-aware replay for the session timeline (#205)** — phase 17 records events; the visual state timeline is P21.
- **Auto-recommendation of next-best-action to sales reps** — Phase 22 polish.
- **Custom event taxonomy per workspace** — phase 17 ships the controlled vocabulary only; custom taxonomies are a P22 polish.
- **GDPR right-to-erasure propagation to the columnar warehouse** — the anonymization pipeline scrubs Postgres control plane; columnar events are tombstoned via a partition-drop strategy in P20.
- **Bangla (bn-BD) language support in benchmark categories** — categories are internationalized but cohort labels are English at launch.

---

## 3. Dependencies

### Upstream (must be complete before P17 starts)

- **P00 — Repo, contracts, dev environment** — `/contracts`, `/packages`, `/services` layout, CI baseline, migration toolchain.
- **P01 — Observability, CI/CD, infra baseline** — OpenTelemetry SDK, Prometheus exporters, k6/Locust harness, secrets manager, regional infra modules, edge POP Terraform, object storage (S3 / GCS), Kafka/NATS clusters.
- **P02 — Deck schema & scene-graph foundation** — `deck.schema.json` and `scene-graph.schema.json`; semantic element IDs (#226) flow through to event payloads.
- **P03 — Canvas editor MVP** — `track_clicks` per element, scene-graph node IDs stable across reorder, scene export stable.
- **P04 — CRDT & presence** — branch isolation, presence channel for live attendee counts.
- **P05 — Persistence, versioning, branches** — `deck`, `slide`, `deck_version`, `branch` rows consumed by event index.
- **P12 — AI copilot foundation** — citation schema and confidence flags ride on AI-generated artifacts that are tagged in event payloads.
- **P13 — Agentic & MCP** — `get_deck_analytics`, `get_viewer_engagement`, `list_ab_tests`, `query_funnel`, `get_benchmark` MCP tools documented for P13 to wire.
- **P14 — Sharing & publishing** — share-link API, `share_link_id`, per-link content control (#159), per-link privacy mode override (#169).
- **P15 — Presenter experience** — `session` (live) row, presenter session API, stage signaling channel, recap API, `live_session_summary` compute.
- **P16 — Audience participation** — `poll_vote`, `qa_item`, `quiz_attempt`, `reaction`, `nav_vote`, `sentiment_input`, `raise_hand`, `attendance_record` all emit engagement events consumed by P17.

### Downstream (this phase unblocks)

- **P18 — Collaboration & workflow** — sales notifications carry comment/approval/MR triggers; funnel stage `replied` may be set by external reply tracking.
- **P20 — Security & enterprise** — P17 satisfies anonymization, retention, audit export hooks; P20 layers DLP, residency, SSO gating, and SIEM export on top.
- **P21 — Novel & frontier** — knowledge graph (#219) ingests deck_metrics / benchmark_snapshot; the presentation state timeline (#205) reads live-session events.
- **P22 — Polish, scale, hardening, GA** — backfills Bangla cohort labels, multi-tenant global benchmarks, A/B/n UI, AI narrative on benchmarks, 25k concurrent session ceiling.

---

## 4. Workstreams

The phase is split into eleven ordered workstreams. W1–W3 are foundational (ingestion + identity + warehouse) and must land first. W4–W10 depend on W1. W11 (dashboard) depends on W2 (warehouse) and W3 (identity).

### W1 — Event ingestion edge & validation

**Sub-owner:** Ingestion lead
**Goal:** Receive viewer-runtime and presenter-HUD events from edge POPs with HMAC validation, PII stripping, schema enforcement, and backpressure-aware buffering.

**Tasks.**
1. Build `services/event-ingest` — the regional ingestion gateway (Go) terminating TLS at edge POPs, validating HMAC-SHA256 signatures against `deck_secret`, and forwarding to Kafka via Kafka Streams.
2. Implement the edge validator: per `event_name` JSON schema enforced, unknown event types logged with `forward_compat=true` and accepted, PII fields stripped when `consent_state` lacks the matching category.
3. Implement per-IP and per-deck rate limiting (token bucket); bots filtered by UA allow/block list.
4. Implement local disk-backed buffer (10 GB per POP) for backpressure; clients retry on 503 with `Retry-After`.
5. Implement configurable per-deck sampling (default 100% human, 0% bots).
6. Implement batch endpoint accepting 1–5 KB payloads with `events[]` envelope.
7. Wire OTel traces from edge POP through Kafka to consumers with `event_id` as trace ID.

**Files / packages touched.**
- `/services/event-ingest/` (new)
- `/services/event-ingest/cmd/pop-router/main.go` (new)
- `/services/event-ingest/internal/validate/pii_stripper.go` (new)
- `/services/event-ingest/internal/buffer/disk_buffer.go` (new)
- `/packages/contracts/events/ingest/*.json` (new — JSON schemas for every accepted event type)
- `/infra/terraform/modules/event-ingest-pop/` (new)
- `/packages/observability/log-sanitizer.ts` (extend; reuse from P16)

**Contracts added.**
- `POST /v1/events` REST endpoint with `X-Domio-Signature`, `X-Domio-Deck-Id`, `X-Domio-Session-Id`, `X-Domio-Ts-Ms` headers.
- JSON schemas in `contracts/events/ingest/{view,interaction,scroll_progress,scroll_pause,presenter_event,live_session_event}.json`.
- Kafka topic `events.ingest.raw` with partition key `deck_id`.

**Contracts consumed.** P14 share-link identity, P15 presenter session events, P16 participation events.

**Tests written.**
- Unit: HMAC verifier (negative cases), PII stripper regex suite, schema validator.
- Integration: end-to-end ingestion from a synthetic client into Kafka + Postgres `event_index`.
- Load: 200k events/sec sustained per region for 10 min; 1M events/sec burst for 60 s.
- Property: any event accepted in v1 remains accepted in v2 (forward compat).

**Definition of Done.**
- 200k events/sec sustained per region with p95 ingest-to-Kafka latency < 100 ms.
- PII stripper unit tests cover email, phone, IP, name patterns.
- All contracts merged with semver bump.

---

### W2 — Columnar warehouse & OLAP rollups

**Sub-owner:** Warehouse lead
**Goal:** Land raw events into ClickHouse (or DuckDB for self-host, #232) with materialized rollups and the analytic query surface the dashboard consumes.

**Tasks.**
1. Build `services/analytics-warehouse` — ClickHouse cluster with `events` table partitioned by `toYYYYMM(ts)` and sorted by `(deck_id, ts)`.
2. Build `workers/columnar-loader` — Kafka Streams job that consumes `events.ingest.raw`, applies sessionization, writes to `events`, and updates `session_agg_mv`, `slide_metric_5m`, `deck_metric_5m`, `funnel_step_hourly`, `heatmap_tile` materialized views.
3. Implement materialized views: `session_agg_mv`, `deck_metric_5m`, `slide_metric_5m`, `funnel_step_hourly`, `heatmap_tile` (per `/docs/analytics.md` §5.2).
4. Implement retention TTL: 13 months hot in ClickHouse; cold Parquet in object storage for 7 years.
5. Implement projection columns for `(viewer_id, ts)` scans to support per-viewer detail queries.
6. Implement ClickHouse → Postgres mirror for low-latency OLTP reads of `deck_metric` and `slide_metric`.
7. Wire `domio-analytics-loadgen` (a replay harness) that replays archived event corpora at 5× production rate.

**Files / packages touched.**
- `/services/analytics-warehouse/` (new)
- `/workers/columnar-loader/` (new)
- `/db/clickhouse/migrations/<ts>_events.sql` (new)
- `/db/clickhouse/migrations/<ts>_session_agg.sql` (new)
- `/db/clickhouse/migrations/<ts>_heatmap.sql` (new)
- `/db/clickhouse/migrations/<ts>_benchmark.sql` (new)
- `/db/postgres/migrations/<ts>_analytics_mirror.sql` (new — mirror tables)
- `/tools/loadgen/domio-analytics-loadgen/` (new)

**Contracts added.**
- `domio_analytics_warehouse.proto` — gRPC interface for OLAP query dispatch (used by W11 dashboard).
- `events.ingest.normalized` Kafka topic (post-sessionization).

**Contracts consumed.** W1 `events.ingest.raw`.

**Tests written.**
- Unit: materialized view SQL compiles; projection column physical layout verified.
- Integration: 1M-event corpora replayed end-to-end through loader; aggregates match a Python reference implementation within 0.5% delta.
- Replay accuracy: golden-file test against 50 hand-curated sessions.
- Property: every `session_id` produces exactly one `session_agg_mv` row regardless of input order.

**Definition of Done.**
- 1B events ingested in staging with all rollups populated.
- p95 per-deck query < 500 ms over 10M events.
- 50-golden-file replay passes within 0.5% delta on every PR.
- Cold Parquet export path verified end-to-end.

---

### W3 — Identity graph & privacy modes

**Sub-owner:** Identity lead
**Goal:** Construct the viewer identity graph across email, CRM ID, share-link token, and SSO sub, while honoring the four privacy modes.

**Tasks.**
1. Build `services/viewer-identity` — identity graph service owning `viewer`, `identity_link`, `consent_state`.
2. Implement the four identification modes (`identified`, `pseudonymous`, `anon_consent`, `anon_no_track`) per workspace + per-deck + per-share-link override hierarchy.
3. Implement the identity merge rules (default: exact email normalization match); workspace admins can configure rules.
4. Implement consent capture banner service (non-blocking, EU/UK mandatory, opt-in elsewhere).
5. Implement `tracking.optout` flow — flips the viewer's `privacy_mode` to `anon_no_track`; future events aggregated only.
6. Implement `Sec-CH-Prefers-Reduced-Tracking` and `DNT` header honoring.
7. Implement anonymization pipeline triggered by erasure / account deletion / privacy mode change: 24 h scrub of `email_plain`, `email_hash`, `display_name`, `company`; tombstone retained.

**Files / packages touched.**
- `/services/viewer-identity/` (new)
- `/services/viewer-identity/internal/graph/merger.go` (new)
- `/services/viewer-identity/internal/consent/banner.go` (new)
- `/db/postgres/migrations/<ts>_viewer_identity.sql` (new — `viewer`, `identity_link`, `consent_event`)
- `/db/postgres/migrations/<ts>_viewer_anonymization.sql` (new — tombstone helper)
- `/apps/viewer-runtime/consent-banner/` (new — non-blocking banner component)

**Contracts added.**
- `POST /v1/viewers/{id}/export` (data subject access).
- `POST /v1/viewers/{id}/erase` (right-to-erasure).
- `POST /v1/viewers/{id}/object` (right-to-object).
- `consent.granted`, `consent.withdrawn`, `tracking.optout` events on Kafka.

**Contracts consumed.** P05 `viewer_id_key` resolver; P14 share-link identity.

**Tests written.**
- Unit: identity graph merge rules (collision handling, pseudonymous boundary).
- Integration: erasure pipeline scrubs within 24 h; tombstone survives.
- Privacy: pseudonymous IDs never merge across privacy modes.
- Compliance: GDPR access / erasure / object endpoints pass privacy review.

**Definition of Done.**
- Erasure pipeline verified on a synthetic 10k-viewer workload within 24 h.
- All four privacy modes honored end-to-end.
- PII stripper + consent gate integrated with W1 ingestion.

---

### W4 — Sessionization engine

**Sub-owner:** Sessionization lead
**Goal:** Convert raw event streams into coherent sessions with deterministic 30-min inactivity timeout.

**Tasks.**
1. Build `services/sessionization` — Kafka Streams app consuming `events.ingest.raw`.
2. Implement 30-min inactivity timeout (configurable per workspace) keyed on `(viewer_id_key, deck_id)`.
3. Persist `session` rows in Postgres (`session` table per `/docs/analytics.md` §5.1) on session start; emit `session.ended` on close with aggregate payload.
4. Reconcile client dwell totals against server `session_heartbeat` (every 30 s) for drift correction (server-anchored).
5. Detect concurrent tabs (two sessions same `viewer_id_key`) and surface "this viewer also has another tab" badge in the dashboard.
6. Tag bots (`is_bot=true`) by UA matching; bot sessions excluded from human metrics.

**Files / packages touched.**
- `/services/sessionization/` (new)
- `/services/sessionization/internal/window/inactivity.go` (new)
- `/db/postgres/migrations/<ts>_session.sql` (new)

**Contracts added.**
- `session.started`, `session.ended`, `session.heartbeat` events on Kafka.

**Contracts consumed.** W1 `events.ingest.raw`; W2 `session_agg_mv`.

**Tests written.**
- Unit: inactivity window math; concurrent-tab detection.
- Integration: 1k-session replay, every session produces exactly one `session.ended`.
- Replay: deterministic output on shuffled input.

**Definition of Done.**
- Session boundaries deterministic and replayable.
- Bot tag rate < 0.5% false positive on synthetic human corpus.
- Heartbeat drift correction verified.

---

### W5 — Heatmap generator

**Sub-owner:** Heatmap lead
**Goal:** Generate per-deck attention heatmaps for scroll-mode decks (#156) within 60 s of a session ending.

**Tasks.**
1. Build `services/heatmap-generator` — scheduled + on-demand worker.
2. Implement tile grid generation: 64×N default (128×N for decks >50 slides); buckets normalized per row by viewport height.
3. Aggregate `scroll_progress` and `scroll_pause` events from sessionization into `heatmap_tile` rollups.
4. Suppress tiles with <5 impressions (privacy floor).
5. Exclude sessions with median scroll velocity >5,000 px/s (fast scrollers, not real reading).
6. Generate cached PNG/SVG for dashboard rendering.
7. Implement 5-min batched job + on-demand trigger on session end.

**Files / packages touched.**
- `/services/heatmap-generator/` (new)
- `/apps/dashboard/heatmap-renderer/` (new — renders tile grid client-side)

**Contracts added.**
- `heatmap.refreshed` event.
- `GET /v1/decks/{id}/heatmap?segmentation=...` GraphQL.

**Tests written.**
- Unit: tile bucketing math; viewport normalization.
- Integration: end-to-end from a 1k-session scroll corpus to PNG.
- Privacy: tiles with <5 impressions suppressed.

**Definition of Done.**
- Heatmap refreshed within 60 s of session end.
- Tile cache hit rate > 90% on dashboard reads.
- Privacy floor verified.

---

### W6 — A/B testing framework

**Sub-owner:** A/B framework lead
**Goal:** Deterministic variant assignment + measurement plane with frequentist and Bayesian inference.

**Tasks.**
1. Build `services/ab-assignment` — synchronous OLTP variant resolver; deterministic hash of `viewer_id_key + experiment_id` → variant.
2. Build `services/ab-measurement` — Kafka consumer ingesting events tagged `experiment_id`; per-variant aggregation.
3. Build `services/ab-statistics` — frequentist z-test/t-test and Bayesian Beta-Binomial inference engine.
4. Implement `ab_test` and `ab_assignment` Postgres tables per `/docs/analytics.md` §5.1.
5. Implement the A/B dashboard: per-variant sample sizes, live primary metric with confidence interval, "stop test" with required reason, "declare winner" (only when confidence crosses threshold).
6. Implement the `GET /v1/ab/assign` public endpoint for external tools (websites, emails) to assign viewers.
7. Implement mid-test peeking flag ("exploratory" until configured horizon is reached).

**Files / packages touched.**
- `/services/ab-assignment/` (new)
- `/services/ab-measurement/` (new)
- `/services/ab-statistics/` (new)
- `/db/postgres/migrations/<ts>_ab_test.sql` (new)
- `/apps/dashboard/ab/` (new)

**Contracts added.**
- `GET /v1/ab/assign?experiment_id=...&viewer_key=...` REST.
- `POST /v1/ab/conclude` REST.
- `experiment.concluded` Kafka event.

**Tests written.**
- Unit: deterministic hash, statistical math (Bayesian Beta-Binomial, z-test), tie handling.
- Integration: end-to-end A/B test on 10k synthetic viewers; winner declared at threshold.
- Property: same `viewer_id_key` always returns the same variant.

**Definition of Done.**
- Assignment lookup p95 < 5 ms.
- Statistical confidence threshold enforced server-side; UI cannot bypass.
- Cross-variant contamination protection (first-assignment-wins) verified.

---

### W7 — CRM sync adapters

**Sub-owner:** CRM lead
**Goal:** Push viewer engagement events to Salesforce, HubSpot, Pipedrive, Dynamics timelines; pull contact tier back.

**Tasks.**
1. Build `services/crm-sync` — common framework with per-provider adapters.
2. Implement `SalesforceAdapter` (OAuth 2.0 + REST API), `HubSpotAdapter` (private app token), `PipedriveAdapter` (API key), `DynamicsAdapter` (Azure AD + Web API).
3. Implement event-mapping table (`crm_sync_field_map`) controlling which Domio event types map to which CRM activity types (e.g., `view` → `Email opened`, `pricing_slide_revisit` → `Web activity`).
4. Implement 5-min debounced batch flush + immediate flush for high-signal events (`pricing_slide_revisit`, `completed`, `cta_click`).
5. Implement rate-limit handling per provider via token bucket; queue events on rate-limit hit.
6. Implement bidirectional sync for opt-in fields (e.g., `Contact.Tier` → `viewer.tier`).
7. Implement sync health dashboard (`/admin/crm-health`) showing failure rate, queue depth, last successful sync.
8. Implement webhook receivers for CRM-side changes (e.g., contact deleted → anonymize viewer).
9. Implement 24-h retry queue; beyond 24 h, archive and surface reconciliation job.

**Files / packages touched.**
- `/services/crm-sync/` (new)
- `/services/crm-sync/adapters/salesforce.go` (new)
- `/services/crm-sync/adapters/hubspot.go` (new)
- `/services/crm-sync/adapters/pipedrive.go` (new)
- `/services/crm-sync/adapters/dynamics.go` (new)
- `/services/crm-sync/internal/ratelimit/token_bucket.go` (new)
- `/db/postgres/migrations/<ts>_crm_sync.sql` (new — `crm_connection`, `crm_sync_record`, `crm_sync_field_map`)
- `/apps/admin/crm-health/` (new)

**Contracts added.**
- `POST /v1/webhooks/crm/{provider}` inbound.
- `crm.sync.queued`, `crm.sync.sent`, `crm.sync.failed` events on Kafka.

**Tests written.**
- Unit: adapter per-provider with sandboxed vendor test instances.
- Integration: end-to-end sync with Salesforce / HubSpot sandboxes.
- Failure: rate-limit handling, exponential backoff, queue persistence.
- Compliance: GDPR erasure cascades to CRM-side contact delete.

**Definition of Done.**
- 5-min debounced flush verified; high-signal immediate flush verified.
- Failure rate < 1% in staging for 24 h sustained run.
- Webhook signing enforced on inbound.

---

### W8 — Sales-mode notification dispatcher

**Sub-owner:** Notifications lead
**Goal:** Fire real-time notifications on high-intent viewer behavior, rate-limited and channel-routed.

**Tasks.**
1. Build `services/notification-dispatcher` — consumes `notification.triggered` from a CEP rules engine over the event stream.
2. Implement the CEP rule engine on Kafka Streams: conditions like `viewer.tier IN [hot, strategic] AND slide.section = "pricing" AND revisit_count >= 3 within 7 days`.
3. Implement channel adapters: email (SMTP/SES), Slack (incoming webhook), Teams (incoming webhook), mobile push (FCM/APNs), generic webhook.
4. Implement per-recipient per-deck daily rate limit (default 10/day; configurable).
5. Implement "hot deck" heuristic (≥3 high-tier contacts in last 30 days OR `sales-critical=true`).
6. Implement DND / quiet-hours check before sending.
7. Implement notification templates with viewer-context (name, company, prior touchpoints) drawn from the `viewer` + `crm_sync_record` join.
8. Implement anonymous-viewer handling — no identity fields in the notification payload.

**Files / packages touched.**
- `/services/notification-dispatcher/` (new)
- `/services/notification-dispatcher/internal/cep/rule_engine.go` (new)
- `/services/notification-dispatcher/adapters/{email,slack,teams,push,webhook}.go` (new)
- `/db/postgres/migrations/<ts>_notification_rule.sql` (new)

**Contracts added.**
- `notification.triggered`, `notification.sent`, `notification.failed` events on Kafka.
- `POST /v1/notifications/test` (synthetic event preview).

**Tests written.**
- Unit: rule evaluation, rate-limit math, DND check, template rendering with anonymization.
- Integration: end-to-end trigger → delivery to Slack/Teams/email sandbox.
- Property: rate limit cannot be bypassed by rapid triggers.

**Definition of Done.**
- Trigger fired within 10 s p95 of qualifying event.
- Rate limit enforced; no over-quota notifications sent.
- Anonymous-viewer notifications contain no PII.

---

### W9 — Team analytics rollups

**Sub-owner:** Team analytics lead
**Goal:** Workspace-level template / component / brand engagement rankings.

**Tasks.**
1. Build `services/team-analytics` — nightly rollup worker.
2. Compute composite engagement score = weighted sum of (uses, views generated, completion %, conversion events) per `template_id` and `component_id`.
3. Compute brand-kit engagement breakdown for #194 brand governance dashboard.
4. Build `team_metric_materialized_view` in ClickHouse for fast dashboard reads.
5. Implement "trending" badge (engagement growth >2× workspace median over 30 days).
6. Implement "library health" section: underused-but-high-engagement templates (promote) and overused-but-low-engagement templates (retire).
7. Apply minimum thresholds: templates <14 days old go to "incubating"; <5 distinct decks excluded from rankings.
8. Implement drill-down per template showing which decks use it and their median metrics vs. workspace average.

**Files / packages touched.**
- `/services/team-analytics/` (new)
- `/services/team-analytics/internal/scoring/composite.go` (new)
- `/db/clickhouse/migrations/<ts>_team_metric_mv.sql` (new)
- `/apps/dashboard/team-analytics/` (new)

**Contracts added.**
- `team_analytics.refreshed` Kafka event.

**Tests written.**
- Unit: composite scoring math; trending badge threshold.
- Integration: nightly job on synthetic 1k-template workspace.
- Edge: cold-start templates routed to "incubating" correctly.

**Definition of Done.**
- Nightly job completes within 30 min for 10k-template workspace.
- "Trending" badge awarded only when growth >2× median over 30 days.

---

### W10 — Live session delivery analytics

**Sub-owner:** Live analytics lead
**Goal:** Real-time attendance / poll / Q&A / reaction metrics to the presenter HUD plus post-session summary.

**Tasks.**
1. Build `services/live-analytics` — WebSocket fan-out to presenter HUD + post-session summary worker.
2. Reuse P16 participation events (`poll_vote`, `qa_item`, `reaction`, etc.) tagged `realtime=true`.
3. Aggregate attendance every 5 s for the presenter HUD; every 30 s for the public dashboard.
4. Compute per-poll participation: participants, response rate, time-to-first-vote, drop-off-after-poll.
5. Compute Q&A volume: distinct viewers asking, upvotes, unanswered count.
6. Track "spotlight metric" configurable per session (e.g., current attendance).
7. Build `live_session_summary` row on session end within 5 min; join live events with normal per-viewer metrics, deduplicate viewers present in both live and replay modes.
8. Implement hybrid attendance (in-room + remote) merge when QR check-in or presenter mark is present.

**Files / packages touched.**
- `/services/live-analytics/` (new)
- `/services/live-analytics/internal/hud/pusher.go` (new — WebSocket fan-out)
- `/services/live-analytics/internal/summary/builder.go` (new)
- `/db/postgres/migrations/<ts>_live_session_summary.sql` (new)
- `/apps/presenter-view/hud/live-metrics/` (new)

**Contracts added.**
- `live_session.attendance`, `live_session.poll_aggregate`, `live_session.qa_volume` WebSocket events.
- `live_session_summary.generated` Kafka event.

**Tests written.**
- Unit: dedup math (live + replay viewers); hybrid attendance merge.
- Integration: end-to-end 1k-participant session with live metrics surfaced within 1 s.
- Edge: drop-off during Q&A not counted as negative engagement unless low live dwell.

**Definition of Done.**
- Live metric update within 1 s p95 to presenter HUD.
- Post-session summary generated within 5 min of session end.
- Dedup math matches a hand-curated 100-session reference corpus.

---

### W11 — Benchmarks service & dashboard UI

**Sub-owner:** Benchmarks + dashboard lead
**Goal:** Anonymized cohort benchmarks plus the dashboard GraphQL surface that surfaces everything else.

**Tasks.**
1. Build `services/benchmark` — nightly percentile distribution compute per cohort (`category × audience_tier × slide_count_bucket × duration_bucket`).
2. Implement t-digest / HDR histogram for memory-efficient percentiles.
3. Implement cohort eligibility: deck must have ≥10 sessions in the last 30 days to contribute; cohort only published if n≥30.
4. Implement outlier exclusion: decks >3× cohort p99 are dropped from cohort percentile calc.
5. Build `apps/dashboard` — the React + ECharts/Visx UI with GraphQL gateway.
6. Implement GraphQL gateway that fans out to Postgres (control plane) + ClickHouse (analytics).
7. Implement the per-viewer detail page, slide breakdown, funnel view, heatmap, A/B results, team analytics, live session, benchmarks — all surfaced through GraphQL.
8. Implement dashboard refresh model: 5-s WebSocket for live indicators, 30-s polling for deck overview, on-demand for drilldowns, 24-h cache for benchmarks.
9. Implement CSV/JSON export for per-viewer analytics; export is itself audited.

**Files / packages touched.**
- `/services/benchmark/` (new)
- `/services/benchmark/internal/percentile/tdigest.go` (new)
- `/apps/dashboard/` (new)
- `/apps/dashboard/graphql/` (new — schema + resolvers)
- `/db/clickhouse/migrations/<ts>_benchmark_snapshot.sql` (new)

**Contracts added.**
- `contracts/graphql/v1/analytics.graphql` — the full dashboard schema.
- `benchmark.refreshed` Kafka event.

**Tests written.**
- Unit: t-digest vs. reference implementation within 1% on 1M samples.
- Integration: cohort eligibility, outlier exclusion, percentile compute.
- Dashboard: end-to-end rendering tests with synthetic corpora.
- Privacy: benchmark never exposes a deck's individual contribution unless opted in.

**Definition of Done.**
- Nightly benchmark job completes within 30 min for 100k-deck fleet.
- Cold-start categories display "insufficient data" correctly.
- GraphQL dashboard p95 < 300 ms for all standard queries.

---

## 5. Architecture & data

This phase introduces eleven new services, four new worker packages, one new dashboard app, and approximately eighteen new tables across Postgres + ClickHouse. References: `/docs/04-system-architecture.md` (component map), `/docs/05-data-database-design.md` (entity model, retention), `/docs/06-technology-stack.md` (ClickHouse / Postgres / Kafka / NATS / k6), `/docs/07-security-planning.md` (PII, consent, audit), `/docs/analytics.md` (full functional + non-functional spec).

### New services

| Service | Responsibility | Owns |
|---|---|---|
| `services/event-ingest` | Edge ingestion + validation | edge POP, `events.ingest.raw` |
| `services/analytics-warehouse` | ClickHouse cluster | `events`, `session_agg_mv`, `deck_metric_5m`, `slide_metric_5m`, `funnel_step_hourly`, `heatmap_tile`, `benchmark_snapshot` |
| `services/viewer-identity` | Identity graph + consent | `viewer`, `identity_link`, `consent_event` |
| `services/sessionization` | 30-min inactivity sessionization | `session` |
| `services/heatmap-generator` | Tile rollup | `heatmap_tile` |
| `services/ab-assignment` | Synchronous variant assignment | `ab_assignment` |
| `services/ab-measurement` | Asynchronous variant aggregation | per-variant counts |
| `services/ab-statistics` | Inference engine | winner calls |
| `services/crm-sync` | Per-provider adapters + framework | `crm_connection`, `crm_sync_record`, `crm_sync_field_map` |
| `services/notification-dispatcher` | Multi-channel routing | `notification_rule` |
| `services/team-analytics` | Nightly template/component rollups | `team_metric_mv` |
| `services/live-analytics` | Live HUD + post-session summary | `live_session_summary` |
| `services/benchmark` | Cohort percentile compute | `benchmark_snapshot` |

### New workers

| Worker | Trigger | Purpose |
|---|---|---|
| `workers/columnar-loader` | Kafka stream | raw → ClickHouse + materialized views |
| `workers/session-archiver` | `session.ended` | flush in-memory aggregates to cold storage |
| `workers/team-analytics-rollup` | nightly | template/component engagement |
| `workers/benchmark-rollup` | nightly (02:00 UTC) | cohort percentiles |
| `workers/crm-reconciler` | 1 h loop | unmatched events + retry queue |

### New apps

| App | Type | Purpose |
|---|---|---|
| `apps/dashboard` | Web (React + ECharts) | deck analytics, viewer detail, funnel, heatmap, A/B, team, benchmarks |
| `apps/viewer-runtime` | Embedded JS | event capture in viewer / presenter / scroll-mode runtimes |
| `apps/admin/crm-health` | Web (React) | CRM sync health dashboard |

### New tables (Postgres OLTP control plane)

Per `/docs/analytics.md` §5.1, the following tables are added in a single migration `<ts>_analytics_control_plane.sql`:
- `viewer`, `identity_link`, `consent_event` (W3)
- `event_index` (W1)
- `session` (W4)
- `deck_metric`, `slide_metric`, `funnel_step` (W2)
- `ab_test`, `ab_assignment` (W6)
- `crm_connection`, `crm_sync_record`, `crm_sync_field_map` (W7)
- `notification_rule` (W8)
- `live_session_summary` (W10)

### New tables (ClickHouse OLAP analytics plane)

Per `/docs/analytics.md` §5.2, added in four migration files:
- `<ts>_events.sql` — `events` table with `MergeTree` engine, partitioned by `toYYYYMM(ts)`, sorted by `(deck_id, ts)`, TTL 13 months.
- `<ts>_session_agg.sql` — `session_agg_mv` materialized view with `SummingMergeTree`.
- `<ts>_heatmap.sql` — `heatmap_tile` table with `SummingMergeTree`.
- `<ts>_benchmark.sql` — `benchmark_snapshot` table with `ReplacingMergeTree(bucket_date)`.

### New contracts

- `contracts/openapi/v1/analytics.yaml` — dashboard REST surface (per-viewer export, deck summary, funnel, heatmap export).
- `contracts/graphql/v1/analytics.graphql` — full dashboard schema (`deckAnalytics`, `viewerEngagement`, `slideBreakdown`, `funnel`, `heatmap`, `benchmarks`, `abTestResults`, `teamAnalytics`, `liveSession`).
- `contracts/proto/domio/v1/analytics.proto` — gRPC interface for OLAP query dispatch.
- `contracts/events/ingest/*.json` — JSON schemas for every accepted event type.
- `contracts/proto/domio/v1/ab.proto` — A/B assignment + conclude.

### Cross-cutting considerations

- **Privacy boundary.** The identity graph (W3) only constructs links within the workspace's privacy mode; pseudonymous IDs are never merged across privacy modes.
- **PII at the edge.** The PII stripper at W1 runs before Kafka write; emails, phones, names, IPs are masked/stripped per `consent_state`. Postgres stores `email_plain` only as encrypted-at-rest BYTEA (`email_hash` used for joins).
- **Drift correction.** Server `session_heartbeat` (every 30 s) cross-checks client dwell totals; large drift (>15%) reconciled in favor of server-anchored timestamps.
- **Replay determinism.** Every consumer downstream of `events.ingest.raw` must be replayable: sessionization, warehouse loaders, heatmap generator all produce deterministic output on the same input.
- **Bangladesh residency.** For Bangladeshi viewers, ingestion POP, ClickHouse shard, and Postgres row are pinned to the `apac` region (per `/docs/11-legal-compliance-bangladesh.md` §11.2). CRM sync for Bangladeshi contacts honors the workspace's data residency setting.
- **Append-mostly tables.** `event_index`, `session`, `crm_sync_record`, `notification_rule`, `live_session_summary` are append-mostly; UPDATE/DELETE denied at the role level except for anonymization pipeline.

---

## 6. Verification matrix

| Feature | Test | Expected result | Owner |
|---|---|---|---|
| #169 per-viewer | 1k sessions on one deck with mixed devices | Per-slide dwell accurate ±250 ms; drop-off computed | Ingestion lead |
| #169 per-viewer | Viewer toggles privacy mode mid-session | Old events retained; new events aggregated only | Identity lead |
| #170 interactive | ROI calculator usage by 500 viewers | `calculator_started`/`calculator_completed` paired; inputs bucketed | Ingestion lead |
| #170 interactive | Spam click flood (>20 clicks/10s on one element) | Events coalesced + `coalesced=true` | Ingestion lead |
| #171 heatmap | 1k-viewer scroll session on 50-slide deck | Heatmap refreshed within 60 s; tiles with <5 impressions suppressed | Heatmap lead |
| #171 heatmap | Fast scroller (median >5k px/s) | Excluded from heatmap generation | Heatmap lead |
| #172 notifications | Hot-tier viewer reopens pricing slide 3× in 7 days | Notification fires within 10 s; routed to configured channels | Notifications lead |
| #172 notifications | Same trigger fires 11 times in one day | First 10 sent; 11th rate-limited | Notifications lead |
| #172 notifications | Anonymous viewer triggers | Notification sent with no identity fields | Notifications lead |
| #173 A/B | A/B test on 10k viewers, 50/50 split | Same `viewer_id_key` always returns same variant | A/B lead |
| #173 A/B | Winner crosses 95% confidence | `experiment.concluded` emitted with declared winner | A/B lead |
| #173 A/B | Stopped early before horizon | Result marked "inconclusive" not "winner" | A/B lead |
| #174 team analytics | Nightly run on 1k-template workspace | Composite scores computed; trending badge for >2× growth | Team lead |
| #174 team analytics | New template <14 days old | Routed to "incubating" section | Team lead |
| #175 live delivery | 1k-participant live session with polls + Q&A | Attendance within 1 s p95 to presenter HUD | Live lead |
| #175 live delivery | Same viewer present in live + replay | Counted once in post-session summary | Live lead |
| #176 CRM sync | Salesforce sandbox: 1k events pushed | All events visible on `Contact` timeline within 5 min | CRM lead |
| #176 CRM sync | Salesforce rate limit hit | Events queued; flush resumes on rate-limit reset | CRM lead |
| #176 CRM sync | GDPR erasure request | Domio anonymizes + Salesforce contact deleted | CRM lead |
| #177 funnel | Sales deck with 100 sent, 80 opened, 40 completed, 5 replied | Funnel shows 80% open, 50% completion, 12.5% reply | Funnel lead |
| #177 funnel | Anonymous viewer opens + completes | Counted in opened/completed, not in replied | Funnel lead |
| #178 benchmarks | Cohort with 1k eligible decks | p25/p50/p75/p95 published; rank computed | Benchmark lead |
| #178 benchmarks | Cohort with <30 eligible decks | "Insufficient data" displayed | Benchmark lead |
| Cross-cutting | 1M-event corpus replayed through pipeline | Aggregates match reference impl within 0.5% | SRE lead |
| Cross-cutting | ClickHouse p95 per-deck query over 10M events | < 500 ms | SRE lead |
| Cross-cutting | Right-to-erasure request on 10k-viewer workload | All PII scrubbed within 24 h; tombstone retained | Compliance lead |
| Cross-cutting | axe-core scan of dashboard routes | 0 critical violations | a11y reviewer |
| Cross-cutting | Manual screen-reader (VoiceOver, NVDA) pass on dashboard | All flows keyboard-operable | a11y reviewer |
| Security | Forge `X-Domio-Signature` | All forged requests rejected | Security reviewer |
| Compliance | PDPA right-to-access request | JSON bundle returned within 30 days | Compliance reviewer |
| Scale | **10k concurrent session internal load test** — 1 region, mixed widgets, 60 min | All latency targets met; no consumer OOM | SRE lead |

---

## 7. Risks & open decisions

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| ClickHouse scaling at 1B+ events with per-deck p95 < 500 ms | Med | High | Spikes in W2; pick projection column layout early; pre-aggregate `deck_metric_5m` aggressively |
| Sessionization determinism broken by Kafka reordering | Med | High | Partition by `deck_id`; replay harness enforces determinism; idempotency on `op_id` |
| CRM rate-limit handling at burst moments (e.g., 10k events/min during big reveal) | Med | Med | Token bucket per provider; degraded-mode flag with UI surface; 24-h retry queue |
| A/B test contamination across workspaces (a viewer in two workspaces sees different variants) | Low | Med | `viewer_id_key` includes `workspace_id`; documented in stats engine; cross-workspace test forbidden in UI |
| Heatmap privacy floor (<5 impressions) prevents useful signal on small decks | Low | Low | Adjustable threshold per workspace; default conservative |
| Funnel stage definitions drift across workspaces (what counts as "completed"?) | Med | Med | Configurable per deck (default 80% slides viewed OR final slide); surfaced in funnel header |
| Bangladesh residency for ClickHouse shards | Med | Med | Region-pinned shards; cross-region replication disabled for residency-locked viewers |
| PII stripper regex misses new PII patterns | Med | Med | ML-based PII detector added in P20; conservative over-strip in MVP |
| Live + replay viewer dedup math on cross-device viewers | Med | Med | Identity graph (W3) primary; fallback on `viewer_id_key` device-class match |
| Notification spam during A/B tests (every variant's first session triggers a notification) | Med | Low | Exclude test-assigned viewers from `viewer.tier` evaluation; configurable |

Open decisions (with proposed default):

- **A/B/n vs. A/B only in MVP UI.** Default: ship A/B only in UI; code supports A/B/n but no UI affordance until P22.
- **Cohort granularity beyond category × tier × slide-count.** Default: ship with category × tier × slide-count; duration-bucket and industry added in P22.
- **Cross-workspace benchmarks for paid tiers.** Default: ship workspace-scoped only; cross-workspace opt-in via admin flag.
- **Retention of raw events beyond 13 months.** Default: cold Parquet for 7 years; deletion via legal-hold workflow only.

---

## 8. Demo

The internal demo proves all ten features end-to-end on a synthetic 10k-session / 1k-viewer workload plus one live session. Demo script:

**Pre-demo (T-30 min).**
1. Reset staging; deploy `phase-17-internal` tag to all services in `apac`, `eu`, `us` regions.
2. Seed three decks:
   - **"Investor Pitch A"** (12 slides, ROI calculator on slide 6, branching choice on slide 8, A/B variant "Investor Pitch B" with revised pricing slide).
   - **"Sales Deck"** (8 slides, all interactive elements; sales-critical=true; notification rule: tier=hot AND slide.section=pricing).
   - **"Training Deck"** (30 slides, scroll-mode, all references from library).
3. Connect Salesforce and HubSpot sandboxes; configure `crm_sync_field_map`.
4. Configure Slack channel `#sales-alerts` and Teams channel for outbound notifications.
5. Spin up 1,000 headless viewer clients distributed across regions, throttled to mixed 3G/4G/Wi-Fi.
6. Configure a live presenter session for 200 participants on the Investor Pitch.

**Live demo script (T-0).**

| T+ | Action | What we watch |
|---|---|---|
| 0:00 | Viewer A opens Investor Pitch A → scrolls to slide 6 (ROI calc) → inputs values | `view` + `interaction` events flow; per-slide dwell accurate |
| 0:30 | Same viewer toggles between Base/Bull/Bear scenarios 5× | `scenario_switched` events captured with `{from, to, slide_index}` |
| 1:00 | Viewer B (identified via share-link token, email matched to Salesforce Contact) opens deck | CRM contact matched; `viewer` row created |
| 1:30 | Viewer B reaches pricing slide (slide 9) → exits → returns 5 min later | First session captured; "reopened" qualifies |
| 2:00 | Viewer C (hot-tier per CRM) opens Sales Deck → pricing slide revisit ×3 in 10 min | Sales notification fires within 10 s to Slack; rate-limit set to 5/day |
| 2:30 | Owner dashboard refreshes | Per-viewer detail page shows all three viewers; Sales Deck funnel visible |
| 3:00 | A/B test on Investor Pitch A/B starts → 1k viewers assigned deterministically | Variant split 50/50; same viewer always sees same variant |
| 5:00 | Live presenter session starts (Investor Pitch, 200 participants) | Attendance HUD updates every 5 s; poll at slide 5 returns within 1 s p95 |
| 7:00 | Live session ends | `live_session_summary` generated within 5 min; merged with per-viewer analytics |
| 8:00 | Owner opens dashboard "Heatmap" tab for Training Deck | Tile grid rendered from scroll events; tiles with <5 impressions suppressed |
| 9:00 | Owner opens "Benchmarks" tab for Investor Pitch | Cohort "pitch.investor.10_20_slides" shows p25/p50/p75/p95; rank computed |
| 10:00 | Owner opens "Team Analytics" | Templates ranked by composite engagement; "trending" badge awarded |
| 11:00 | Compliance test: erasure request for Viewer B | All PII scrubbed within 24 h (verified at T+12 h); CRM contact deletion propagated to Salesforce |
| 12:00 | Replay accuracy: load archived 1M-event corpus through pipeline | Aggregates match reference implementation within 0.5% |

**Pass criteria for "internal demo passed":**
- All 11 timing targets met (see Verification matrix).
- 1M-event replay accuracy within 0.5% delta.
- All security / privacy / compliance tests pass.
- 1000-viewer sustained workload for 12 min with no consumer crash and ingestion p95 < 100 ms.

---

## 9. Definition of Done

The phase is "done" only when **every** gate below passes:

- **Code merged.** All eleven workstreams merged to `main`; PRs reviewed by at least two engineers (one from Stream F + one cross-stream).
- **Contracts versioned.** All new contracts in `/contracts/openapi/v1/`, `/contracts/proto/domio/v1/`, `/contracts/graphql/v1/`, `/contracts/events/ingest/` merged with semver bump; semver tag `phase-17-contracts-v1.0.0` cut.
- **Schema migrations applied.** Migration files applied to staging and previewed against production data; back-out plan documented.
- **Tests pass.** Unit, integration, load, replay, security, privacy, accessibility tests all green in CI; k6 load test report archived at `docs/development_phases/reports/phase-17-loadtest.md`.
- **Telemetry in place.** All metrics from `/docs/analytics.md` §9.1 emitted and dashboarded in Grafana; alerts wired in PagerDuty; OTel trace propagation verified from edge POP through Kafka through ClickHouse through dashboard.
- **Docs updated.** `/docs/analytics.md` already exists; this phase doc is the implementation source of truth; `/docs/analytics-runbook.md` (new) drafted with on-call procedures.
- **Compliance review.** Security reviewer signed off on PII stripper, consent gate, anonymization pipeline, CRM sync GDPR erasure, retention TTL.
- **Bangladesh residency check.** All Bangladeshi viewer data pinned to `apac` region; no foreign mirror per `/docs/11-legal-compliance-bangladesh.md` §11.2.
- **Internal demo passed.** The script in §8 executes cleanly with all pass criteria met.
- **Design partner demo passed** (target). A design partner runs the script in their environment with their decks; no critical regressions.
- **Cross-cutting review by P20 lead.** Audit-log ingestion from `event_index`, `crm_sync_record`, `notification_rule` confirmed end-to-end.
- **Feature flags ready.** Every new feature behind a flag (`analytics.dashboard`, `analytics.heatmap`, `analytics.abtest`, `analytics.crm.sync`, `analytics.notifications.sales`, `analytics.benchmarks`, `analytics.funnel`, `analytics.team`) with a kill-switch.
- **Wiring to MCP noted.** Analytics tools documented for P13/P22 MCP surface (`get_deck_analytics`, `get_viewer_engagement`, `list_ab_tests`, `query_funnel`, `get_benchmark`, `get_heatmap`, `get_live_session`) — the actual MCP tools ship in P13/P22, not P17.