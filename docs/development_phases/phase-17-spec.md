---
phase: 17
owner_stream: F (Insights & Workflow)
critical_path: false
status: complete
completion_date: 2026-08-08
---

# Phase 17 — Analytics & Engagement Intelligence

**Phase:** 17
**Name:** Analytics & engagement intelligence
**Owner:** Stream F — Insights & Workflow lead; sub-owners per workstream (W0 Foundations, W1 Ingestion, W2 Warehouse, W3 Identity, W4 Sessionization, W5 Heatmaps, W6 A/B, W7 CRM Sync, W8 Notifications, W9 Team Analytics, W10 Live Delivery, W11 Benchmarks + Dashboard — the closing workstream)
**Critical-path:** No (surface phase, parallelizable)
**Parallel stream tag:** Stream F — Insights & Workflow (sibling to P18 collaboration & workflow)
**Status:** Complete as of 2026-08-08 (see `phase-17-dod.md` and `phase-17-verification.md`)

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
- Engagement events are pushed to Salesforce / HubSpot / Pipedrive / Dynamics timelines within 5 min (or immediately for high-signal events), with bidirectional field mapping and rate-limited per provider (#176).
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
- **CRDT-aware replay for the session timeline (#205)** — Phase 17 records events; the visual state timeline is P21.
- **Auto-recommendation of next-best-action to sales reps** — Phase 22 polish.
- **Custom event taxonomy per workspace** — Phase 17 ships the controlled vocabulary only; custom taxonomies are a P22 polish.
- **Bangla (bn-BD) cohort labels** — categories are internationalized but cohort labels are English at launch.

---

## 3. Dependencies

### Upstream (must be complete before P17 starts)

- **P00 — Repo, contracts, dev environment** — `/contracts`, `/packages`, `/services` layout, CI baseline, migration toolchain.
- **P01 — Observability, CI/CD, infra baseline** — OpenTelemetry SDK, Prometheus exporters, k6 harness, secrets manager, regional infra modules, NATS JetStream clusters.
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

The phase is split into eleven ordered workstreams plus a foundational W0. W0 lands the analytics plane's plumbing (Kafka, ClickHouse, SDK, runtime emitters) and must complete before W1. W1–W3 are foundational (ingestion + identity + warehouse) and must land next. W4–W10 depend on W1. W11 (dashboard) depends on W2 (warehouse) and W3 (identity).

### W0 — Foundations

**Sub-owner:** Phase 17 lead
**Goal:** Land the analytics plane's foundation: client-side event emitters, Kafka + ClickHouse infrastructure, the analytics SDK, and the Phase 17 spec doc.

**Tasks.**
1. Publish `phase-17-spec.md` (this document).
2. Provision Kafka in dev via KRaft single-broker compose (`infrastructure/kafka/docker-compose.kafka.yml`).
3. Provision ClickHouse init schema + config + users (`infrastructure/clickhouse/{init,config.xml,users.xml}`).
4. Build the ClickHouse migrator tool (TS, mirrors `infrastructure/migrators/postgres/`).
5. Land initial ClickHouse migrations: `events` table, materialized views, heatmap tile, benchmark snapshot.
6. Wire client-side event emitters in `viewer`, `presenter`, `join-web` runtimes; have `rtgw` and `pwg` re-emit NATS CRDT events to NATS subject `analytics.ingest.live.{sessionID}` (fan-out for W1).
7. Flesh out `@domio/analytics-sdk` (HMAC-signed batched events, IDB-backed retry, device-side PII strip, `doNotTrack` opt-in).
8. Land the 6 ingest event JSON Schemas (`view`, `interaction`, `scroll_progress`, `scroll_pause`, `presenter_event`, `live_session_event`).
9. Land analytics OpenAPI, GraphQL, and proto contracts.
10. Land Phase 17 feature flags, Grafana dashboard, and PagerDuty routing.

**Files / packages touched.**
- `docs/development_phases/phase-17-spec.md` (new)
- `infrastructure/kafka/{docker-compose.kafka.yml, broker.env, kraft/server.properties}` (new)
- `infrastructure/clickhouse/{init/001_phase17_schema.sql, config.xml, users.xml}` (new)
- `infrastructure/clickhouse/init/{002_phase17_views,003_phase17_heatmap,004_phase17_benchmark}.sql` (new)
- `infrastructure/migrators/clickhouse/` (new)
- `packages/analytics-sdk/src/{index,hmac,batcher,transport,pii,types}.ts` (new)
- `apps/{viewer,presenter,join-web}/src/runtime/events/{view,interaction,scroll,presenter_event,session_event}.ts` (new)
- `contracts/events/ingest/{view,interaction,scroll_progress,scroll_pause,presenter_event,live_session_event}.json` (new)
- `contracts/openapi/v1/analytics.yaml` (new)
- `contracts/graphql/v1/analytics.graphql` (new)
- `contracts/proto/domio/v1/{analytics,ab}.proto` (new)
- `infrastructure/feature-flags/phase-17.yaml` (new)
- `infrastructure/local/grafana/dashboards/phase-17-analytics.json` (new)
- `infrastructure/observability/pagerduty-phase17.yaml` (new)

**Contracts added.** All ingest event JSON Schemas, OpenAPI/GraphQL/proto stubs.

**Tests written.** Vitest unit tests for `analytics-sdk` HMAC + batcher + PII strip.

**Definition of Done.**
- Kafka compose up, broker log-clean for 60 s.
- ClickHouse migrations apply via `make migrate-up` from clean state.
- Analytics SDK round-trips a batched event through `InMemoryTransport`.
- Runtime emitters fire on CRDT apply in `viewer`/`presenter`/`join-web`.
- `rtgw` and `pwg` re-emit NATS events to `analytics.ingest.live.*`.

---

### W1 — Event ingestion edge & validation

**Sub-owner:** Ingestion lead
**Goal:** Receive viewer-runtime and presenter-HUD events from edge POPs with HMAC validation, PII stripping, schema enforcement, and backpressure-aware buffering.

**Tasks.**
1. Build `services/event-ingest` — the regional ingestion gateway (TypeScript, Fastify) terminating HTTP at edge POPs, validating HMAC-SHA256 signatures against a per-session key, and forwarding to Kafka via KafkaJS.
2. Implement the edge validator: per `event_name` JSON Schema enforced; unknown event types logged with `forward_compat=true` and accepted; PII fields stripped when `consent_state` lacks the matching category.
3. Implement per-IP and per-deck rate limiting (token bucket); bots filtered by UA allow/block list.
4. Implement local disk-backed buffer (10 GB per POP) for backpressure; clients retry on 503 with `Retry-After`.
5. Implement configurable per-deck sampling (default 100% human, 0% bots).
6. Implement batch endpoint accepting 1–5 KB payloads with `events[]` envelope.
7. Wire OTel traces from edge POP through Kafka to consumers with `event_id` as trace ID.

**Files / packages touched.**
- `services/event-ingest/src/{server,hmac,pii,ratelimit,buffer,producer}.ts` (new)
- `services/event-ingest/src/validate/{schema,forward-compat}.ts` (new)
- `services/event-ingest/cmd/pop-router/main.ts` (new)
- `packages/observability/log-sanitizer.ts` (extend; reuse from P16)

**Contracts added.**
- `POST /v1/events` REST endpoint with `X-Domio-Signature`, `X-Domio-Deck-Id`, `X-Domio-Session-Id`, `X-Domio-Ts-Ms` headers.
- Kafka topic `events.ingest.raw` with partition key `workspace_id:viewer_id_key`.

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
**Goal:** Land raw events into ClickHouse with materialized rollups and the analytic query surface the dashboard consumes.

**Tasks.**
1. Build `services/analytics-warehouse` — TypeScript REST + GraphQL read API (Yoga gateway) against ClickHouse.
2. Build `workers/columnar-loader` — Go Kafka consumer that consumes `events.ingest.raw`, applies sessionization, writes to `events`, and updates `session_agg_mv`, `slide_metric_5m`, `deck_metric_5m`, `funnel_step_hourly`, `heatmap_tile` materialized views.
3. Implement materialized views: `session_agg_mv`, `deck_metric_5m`, `slide_metric_5m`, `funnel_step_hourly`, `heatmap_tile`.
4. Implement retention TTL: 13 months hot in ClickHouse; cold Parquet in object storage for 7 years.
5. Implement projection columns for `(viewer_id_key, ts)` scans to support per-viewer detail queries.
6. Implement ClickHouse → Postgres mirror for low-latency OLTP reads of `deck_metric` and `slide_metric`.
7. Wire `tests/load/replay-corpora/` that replays archived event corpora at 5× production rate.

**Files / packages touched.**
- `services/analytics-warehouse/src/{server,resolver,client}.ts` (new)
- `workers/columnar-loader/cmd/loader/main.go` (new)
- `infrastructure/clickhouse/init/002_phase17_views.sql` (new)
- `infrastructure/postgres/migrations/0059_analytics_core.up.sql` (new — mirror tables)
- `tests/load/replay-corpora/{README, replay.ts, compare.ts}` (new)

**Contracts added.**
- `domio_analytics_warehouse.proto` — gRPC interface for OLAP query dispatch (used by W11 dashboard).
- GraphQL `analytics.graphql` query surface.
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
1. Build `services/viewer-identity` — TypeScript identity graph service owning `viewer`, `identity_link`, `consent_state`.
2. Implement the four identification modes (`identified`, `pseudonymous`, `anon_consent`, `anon_no_track`) per workspace + per-deck + per-share-link override hierarchy.
3. Implement the identity merge rules (default: exact email normalization match); workspace admins can configure rules.
4. Implement consent capture banner service (non-blocking, EU/UK mandatory, opt-in elsewhere).
5. Implement `tracking.optout` flow — flips the viewer's `privacy_mode` to `anon_no_track`; future events aggregated only.
6. Implement `Sec-CH-Prefers-Reduced-Tracking` and `DNT` header honoring.
7. Implement anonymization pipeline triggered by erasure / account deletion / privacy mode change: 24 h scrub of `email_plain`, `email_hash`, `display_name`, `company`; tombstone retained.

**Files / packages touched.**
- `services/viewer-identity/src/{service,graph,consent,anonymize}.ts` (new)
- `apps/viewer/src/runtime/consent-banner/` (new)
- `infrastructure/postgres/migrations/0059_analytics_core.up.sql` (new — `viewer`, `identity_link`, `consent_event`)

**Contracts added.**
- `POST /v1/viewers/{id}/export` (data subject access, NDJSON streaming).
- `POST /v1/viewers/{id}/erase` (right-to-erasure; ClickHouse `LIGHTWEIGHT DELETE`).
- `POST /v1/viewers/{id}/object` (right-to-object).
- `consent.granted`, `consent.withdrawn`, `tracking.optout` events on NATS + Kafka.

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
1. Build `services/sessionization` — TypeScript Kafka consumer consuming `events.ingest.raw`.
2. Implement 30-min inactivity timeout (configurable per workspace) keyed on `(viewer_id_key, deck_id)`.
3. Persist `session` rows in Postgres on session start; emit `session.ended` on close with aggregate payload.
4. Reconcile client dwell totals against server `session_heartbeat` (every 30 s) for drift correction (server-anchored).
5. Detect concurrent tabs (two sessions same `viewer_id_key`) and surface "this viewer also has another tab" badge in the dashboard.
6. Tag bots (`is_bot=true`) by UA matching; bot sessions excluded from human metrics.

**Files / packages touched.**
- `services/sessionization/src/{service,window,heartbeat}.ts` (new)
- `infrastructure/postgres/migrations/0059_analytics_core.up.sql` (extend — `session` table)

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
1. Build `services/heatmap-generator` — TypeScript Nightly + on-demand worker.
2. Implement tile grid generation: 32×18 default (64×N for decks >50 slides); buckets normalized per row by viewport height.
3. Aggregate `scroll_progress` and `scroll_pause` events from sessionization into `heatmap_tile` rollups.
4. Suppress tiles with <5 impressions (privacy floor).
5. Exclude sessions with median scroll velocity >5,000 px/s (fast scrollers, not real reading).
6. Generate cached PNG/SVG for dashboard rendering.
7. Implement 5-min batched job + on-demand trigger on session end.

**Files / packages touched.**
- `services/heatmap-generator/src/{service,grid,privacy}.ts` (new)
- `apps/dashboard/heatmap-renderer/src/` (new — renders tile grid client-side via `@domio/chart`)

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
1. Build `services/ab-assignment` — Go synchronous OLTP variant resolver; deterministic hash of `viewer_id_key + experiment_id` → variant. Sub-ms hot path.
2. Build `services/ab-measurement` — Go Kafka consumer ingesting events tagged `experiment_id`; per-variant aggregation.
3. Build `services/ab-statistics` — Go frequentist z-test/t-test and Bayesian Beta-Binomial inference engine with sequential mSPRT for early stopping.
4. Implement `ab_test` and `ab_assignment` Postgres tables.
5. Implement the A/B dashboard: per-variant sample sizes, live primary metric with confidence interval, "stop test" with required reason, "declare winner" (only when confidence crosses threshold).
6. Implement the `GET /v1/ab/assign` public endpoint for external tools (websites, emails) to assign viewers.
7. Implement mid-test peeking flag ("exploratory" until configured horizon is reached).

**Files / packages touched.**
- `services/ab-assignment/{cmd,internal/hash,internal/handlers}.go` (new)
- `services/ab-measurement/{cmd,internal/aggregate}.go` (new)
- `services/ab-statistics/{cmd,internal/bayesian,internal/freq,internal/sequential}.go` (new)
- `infrastructure/postgres/migrations/0060_analytics_ab.up.sql` (new)
- `apps/dashboard/ab/` (new — `/ab` page)

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
1. Build `services/crm-sync` — Go common framework with per-provider adapters and a plugin loader.
2. Implement `SalesforceAdapter` (OAuth 2.0 + REST API), `HubSpotAdapter` (private app token, 100/10s token bucket), `PipedriveAdapter` (API key), `DynamicsAdapter` (Azure AD + Web API).
3. Implement event-mapping table (`crm_sync_field_map`) controlling which Domio event types map to which CRM activity types.
4. Implement 5-min debounced batch flush + immediate flush for high-signal events (`pricing_slide_revisit`, `completed`, `cta_click`).
5. Implement rate-limit handling per provider via token bucket; queue events on rate-limit hit.
6. Implement bidirectional sync for opt-in fields (e.g., `Contact.Tier` → `viewer.tier`).
7. Implement sync health dashboard (`/admin/crm-health`) showing failure rate, queue depth, last successful sync.
8. Implement webhook receivers for CRM-side changes (e.g., contact deleted → anonymize viewer).
9. Implement idempotency keys (workspaceID:viewerID:eventType:eventID SHA-256) and 24-h retry queue; beyond 24 h, archive and surface reconciliation job.

**Files / packages touched.**
- `services/crm-sync/cmd/sync/main.go` (new)
- `services/crm-sync/internal/{adapters,ratelimit,idempotency,retry}.go` (new)
- `infrastructure/postgres/migrations/0061_analytics_crm.up.sql` (new)
- `apps/admin/crm-health/` (new)

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
1. Build `services/notification-dispatcher` — TypeScript service consuming `notification.triggered` from a CEP rules engine over the event stream.
2. Implement the CEP rule engine on Kafka Streams: conditions like `viewer.tier IN [hot, strategic] AND slide.section = "pricing" AND revisit_count >= 3 within 7 days`.
3. Implement channel adapters: email (SMTP/SES), Slack (incoming webhook), Teams (incoming webhook), mobile push (FCM/APNs), generic webhook.
4. Implement per-recipient per-deck daily rate limit (default 10/day; configurable).
5. Implement "hot deck" heuristic (≥3 high-tier contacts in last 30 days OR `sales-critical=true`).
6. Implement DND / quiet-hours check before sending.
7. Implement notification templates with viewer-context (name, company, prior touchpoints) drawn from the `viewer` + `crm_sync_record` join.
8. Implement anonymous-viewer handling — no identity fields in the notification payload.

**Files / packages touched.**
- `services/notification-dispatcher/src/{service,rules,channels,quota,dnd}.ts` (new)
- `infrastructure/postgres/migrations/0061_analytics_crm.up.sql` (extend — `notification_rule`)

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
1. Build `services/team-analytics` — TypeScript nightly rollup worker.
2. Compute composite engagement score = weighted sum of (uses, views generated, completion %, conversion events) per `template_id` and `component_id`.
3. Compute brand-kit engagement breakdown for #194 brand governance dashboard.
4. Build `team_metric_materialized_view` in ClickHouse for fast dashboard reads.
5. Implement "trending" badge (engagement growth >2× workspace median over 30 days).
6. Implement "library health" section: underused-but-high-engagement templates (promote) and overused-but-low-engagement templates (retire).
7. Apply minimum thresholds: templates <14 days old go to "incubating"; <5 distinct decks excluded from rankings.
8. Implement drill-down per template showing which decks use it and their median metrics vs. workspace average.

**Files / packages touched.**
- `services/team-analytics/src/{service,scoring,rollup}.ts` (new)
- `infrastructure/clickhouse/init/002_phase17_views.sql` (extend — `team_metric_mv`)
- `apps/dashboard/team-analytics/` (new — `/team` page)

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
1. Build `services/live-analytics` — TypeScript WebSocket fan-out to presenter HUD + post-session summary worker.
2. Reuse P16 participation events (`poll_vote`, `qa_item`, `reaction`, etc.) tagged `realtime=true`.
3. Aggregate attendance every 5 s for the presenter HUD; every 30 s for the public dashboard.
4. Compute per-poll participation: participants, response rate, time-to-first-vote, drop-off-after-poll.
5. Compute Q&A volume: distinct viewers asking, upvotes, unanswered count.
6. Track "spotlight metric" configurable per session (e.g., current attendance).
7. Build `live_session_summary` row on session end within 5 min; join live events with normal per-viewer metrics, deduplicate viewers present in both live and replay modes.
8. Implement hybrid attendance (in-room + remote) merge when QR check-in or presenter mark is present.

**Files / packages touched.**
- `services/live-analytics/src/{service,hud,summary,dedup}.ts` (new)
- `infrastructure/postgres/migrations/0061_analytics_crm.up.sql` (extend — `live_session_summary`)
- `apps/presenter/src/runtime/hud/live-metrics/` (new)

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
1. Build `services/benchmark` — Go nightly percentile distribution compute per cohort (`category × audience_tier × slide_count_bucket × duration_bucket`).
2. Implement t-digest / HDR histogram for memory-efficient percentiles.
3. Implement cohort eligibility: deck must have ≥10 sessions in the last 30 days to contribute; cohort only published if n≥30.
4. Implement outlier exclusion: decks >3× cohort p99 are dropped from cohort percentile calc.
5. Build `apps/dashboard` — the Next.js 15 + Tailwind dashboard with GraphQL Yoga gateway.
6. Implement GraphQL gateway that fans out to Postgres (control plane) + ClickHouse (analytics).
7. Implement the per-viewer detail page, slide breakdown, funnel view, heatmap, A/B results, team analytics, live session, benchmarks — all surfaced through GraphQL (`/overview`, `/deck/[id]`, `/heatmap`, `/ab`, `/crm`, `/team`, `/live`, `/benchmarks`).
8. Implement dashboard refresh model: 1-s WebSocket for live indicators, 30-s polling for deck overview, on-demand for drilldowns, 24-h cache for benchmarks.
9. Implement CSV/Parquet export for per-viewer analytics; export is itself audited via `analytics_export_runs` + `analytics_export_audit`.

**Files / packages touched.**
- `services/benchmark/{cmd,internal/percentile,internal/cohort}.go` (new)
- `apps/dashboard/` (new — Next.js 15 + `@domio/chart` + Yoga GraphQL)
- `apps/dashboard/src/app/api/graphql/route.ts` (new)
- `infrastructure/postgres/migrations/0062_analytics_exports.up.sql` (new)

**Contracts added.**
- `analytics.graphql`: full dashboard schema.
- `analytics.proto`: OLAP query dispatch.
- `POST /v1/exports/run` + `GET /v1/exports/runs/{id}` REST.

**Tests written.**
- Unit: percentile math (t-digest vs. reference Python implementation within 0.1%).
- Integration: 1k-benchmark cohort replay.
- A11y: dashboard axe-core suite (0 serious violations).
- E2E: dashboard Playwright (navigate, export, AB-decision flow).
- Load: k6 dashboard-10k (10k concurrent clients).

**Definition of Done.**
- 0 axe serious on every dashboard route.
- All 7+ routes render with sample data.
- GraphQL persisted queries cached.
- Exports stream ≤ 100 MB.
- Benchmarks correct within 0.1% vs. Python reference.

---

## 5. Architecture & data

### 5.1 Postgres tables (Phase 17)

All tables registered with `_tenant_isolation` RLS via the DO/EXECUTE block from `0055_participation_session.up.sql:83-104`.

| Migration | Tables |
|---|---|
| `0059_analytics_core.up.sql` | `viewer`, `identity_link`, `consent_event`, `event_index`, `session` |
| `0060_analytics_ab.up.sql` | `ab_test`, `ab_assignment`, `crm_connection`, `crm_sync_record`, `crm_sync_field_map` |
| `0061_analytics_crm.up.sql` | `notification_rule`, `live_session_summary`, `deck_metric`, `slide_metric` (mirror of ClickHouse) |
| `0062_analytics_exports.up.sql` | `analytics_export_runs`, `analytics_export_audit`, audit trigger |

### 5.2 ClickHouse tables (Phase 17)

| Migration | Tables |
|---|---|
| `001_phase17_schema.sql` | `events` (MergeTree, partition `toYYYYMM(ts)`, sort `(deck_id, ts)`, TTL 13 months) + projection columns |
| `002_phase17_views.sql` | `session_agg_mv`, `deck_metric_5m`, `slide_metric_5m`, `funnel_step_hourly`, `team_metric_mv` (SummingMergeTree) |
| `003_phase17_heatmap.sql` | `heatmap_tile` table + `heatmap_mv` (SummingMergeTree) |
| `004_phase17_benchmark.sql` | `benchmark_snapshot` (ReplacingMergeTree(bucket_date)) |

### 5.3 New services (TS)

`services/{event-ingest,analytics-warehouse,viewer-identity,sessionization,heatmap-generator,team-analytics,live-analytics,notification-dispatcher}/` — Fastify on the read path, Kafka consumers on the write path.

### 5.4 New services (Go, where it earns its keep)

`services/{clickhouse-loader,ab-assignment,ab-measurement,ab-statistics,crm-sync,benchmark}/` — Kafka consumers, native ClickHouse protocol, statistical inference.

### 5.5 New workers

`workers/{columnar-loader,session-archiver,team-analytics-rollup,benchmark-rollup,crm-reconciler}/`.

### 5.6 New apps

`apps/dashboard` (Next.js 15 + Tailwind + `@domio/chart`) with 7 routes surfaced via Yoga GraphQL gateway.

### 5.7 Data flow

```
viewer/presenter/join-web runtime
  └─→ @domio/analytics-sdk (HMAC + batcher + PII strip)
        └─→ POST /v1/events (services/event-ingest)
              └─→ Kafka topic events.ingest.raw
                    ├─→ workers/columnar-loader → ClickHouse events
                    ├─→ services/sessionization → session.started/ended
                    ├─→ services/crm-sync → CRM providers
                    └─→ services/notification-dispatcher → Slack/Teams/email
                          
                          ClickHouse (analytics)
                            ├─→ services/analytics-warehouse (REST + GraphQL)
                            ├─→ services/heatmap-generator
                            ├─→ services/team-analytics (rollups)
                            └─→ services/benchmark (t-digest/HDR)
                                  
                                  → apps/dashboard GraphQL gateway
                                    → Postgres (control plane) + ClickHouse (analytics)
```

---

## 6. Verification matrix

| # | Test | Workspace | Pass criterion |
|---|---|---|---|
| 1 | HMAC verifier negative cases | `tests/integration/event-ingest` | 100% rejection of bad signatures |
| 2 | PII stripper regex suite | `tests/unit/pii-stripper` | 100% strip of email/phone/IP/name |
| 3 | Schema forward-compat | `tests/integration/event-ingest` | v1 events accepted in v2 |
| 4 | 200k events/sec sustained for 10 min | `tests/load/k6/ingest-200k.js` | 0 backpressure events emitted |
| 5 | Replay determinism (1M events) | `tests/load/replay-corpora/` | 0 mismatched session IDs across 5 replays |
| 6 | Materialized view row count | `tests/integration/columnar` | 1 row per session regardless of input order |
| 7 | 50-golden-file replay | `tests/integration/columnar` | ≤ 0.5% delta on every PR |
| 8 | Identity merge collision | `tests/integration/viewer-identity` | 0 cross-privacy-mode merges |
| 9 | Erasure pipeline SLO | `tests/integration/gdpr` | 24h scrub; tombstone survives |
| 10 | Privacy-mode boundary | `tests/integration/viewer-identity` | anon_no_track never emits linkable events |
| 11 | Session boundary determinism | `tests/integration/sessionization` | 1k-session replay → 1000 session.ended |
| 12 | Bot tag false-positive rate | `tests/integration/sessionization` | < 0.5% on synthetic human corpus |
| 13 | Heatmap refresh SLO | `tests/integration/heatmap` | < 60s from session end |
| 14 | Privacy floor (≥5 impressions) | `tests/integration/heatmap` | tiles with <5 impressions suppressed |
| 15 | A/B variant determinism | `tests/integration/ab` | same `viewer_id_key` → same variant |
| 16 | A/B cross-workspace contamination | `tests/integration/ab` | 0 events leak across workspace_id |
| 17 | A/B sequential early stop | `tests/integration/ab` | test stops at simulated effect boundary |
| 18 | CRM idempotency | `tests/integration/crm` | duplicate events deduplicated within 24h |
| 19 | CRM rate-limit burst | `tests/load/k6/crm-burst.js` | 10k events in 1s → 0 dropped |
| 20 | Notification rate-limit | `tests/integration/notifications` | rate limit cannot be bypassed |
| 21 | Notification DND | `tests/integration/notifications` | no notifications within quiet hours |
| 22 | Team analytics trending badge | `tests/integration/team-analytics` | awarded only when growth >2× median over 30d |
| 23 | Bangladesh residency | `tests/integration/team-analytics` | data tagged `bd=true` lands on BD shard only |
| 24 | Live metrics SLO | `tests/integration/live-analytics` | < 1s p95 to presenter HUD |
| 25 | Dashboard axe-core | `tests/a11y/dashboard.axe.spec.ts` | 0 serious violations on every route |
| 26 | Dashboard Playwright E2E | `tests/e2e/dashboard/` | navigate, export, AB-decision flow |
| 27 | Dashboard load (10k concurrent) | `tests/load/k6/dashboard-10k.js` | p95 < 800ms |
| 28 | Benchmark percentile | `tests/integration/benchmark` | t-digest vs. Python reference within 0.1% |
| 29 | Cold-start benchmark | `tests/integration/benchmark` | n<30 cohort displays "insufficient data" |
| 30 | RLS isolation | `tests/security/rls-isolation-phase17.test.ts` | cross-tenant reads return 404 |

---

## 7. Risks & open decisions

| # | Risk | Mitigation |
|---|------|-----------|
| R1 | 200k events/sec exceeds single-broker Kafka | KRaft + 3 brokers in dev; benchmark in W2 |
| R2 | Kafka reordering breaks sessionization | Partition key = `viewer_id_key`; single consumer per partition; deterministic test in W4 |
| R3 | ClickHouse p95 latency > 2s | Pre-aggregate MVs; `LowCardinality` for tenant keys; query-level SLO test |
| R4 | CRM rate-limit bursts drop events | Token-bucket per provider + DLQ + idempotency keys |
| R5 | A/B cross-workspace contamination | All queries filter `workspace_id`; contract test in W6 |
| R6 | GDPR erasure incomplete in ClickHouse | `LIGHTWEIGHT DELETE` (CH 23+) + tombstone table; audit log |
| R7 | HMAC key leakage in browser SDK | Ephemeral session key signed by server; rotate hourly |
| R8 | Replay determinism (1M events) | Lock-step consumer; snapshot session IDs; nightly CI run |
| R9 | Dashboard p95 under 10k concurrent | Persisted GraphQL queries + edge cache + Apollo client streaming |
| R10 | Stat-significance peeking at low sample | Sequential mSPRT; "exploratory" flag until horizon reached |

### Open decisions (defaults)

| Decision | Default |
|---|---|
| A/B/n vs. A/B only in MVP UI | ship A/B only; code supports A/B/n |
| Cohort granularity | category × tier × slide-count only at launch |
| Cross-workspace benchmarks | workspace-scoped only at launch |
| Retention | 13 months hot in ClickHouse; cold Parquet for 7 years |
| CRM debounce window | 5 min default, immediate for high-signal events |
| Heatmap tile grid | 32×18 default; 64×N for decks >50 slides |
| Session inactivity timeout | 30 min default; configurable per workspace |
| Notification DND window | per-recipient; default 22:00–07:00 local |

---

## 8. Demo

The internal demo runs on `localhost` with `docker compose up` and exercises the full pipeline end-to-end:

1. **Sign in** to `apps/presenter` as a presenter; create a fresh deck with 5 slides including a pricing slide.
2. **Open** `apps/viewer` in two browser tabs as the same viewer; **open** a third tab as a different viewer.
3. **Publish** the deck via `apps/presenter`; copy the share link.
4. **Browse** the deck in the viewer tabs; advance slides, click the pricing CTA, scroll-pause on the value slide.
5. **Verify** in `apps/dashboard` `/overview` that the views appear within 5 s; KPI tiles update.
6. **Drill in** to `/deck/[id]`; verify per-slide dwell, drop-off, and click overlay render.
7. **Open** `/heatmap` for a scroll-mode deck; verify tile grid renders.
8. **Configure** an A/B test (control + variant) on the pricing slide; verify deterministic split (`/ab`).
9. **Trigger** a sales notification by hovering on the CTA in the high-tier viewer tab; verify Slack/Teams hook fires within 10 s.
10. **Sync** the engagement event to a Salesforce sandbox; verify the `domio_event` activity appears with the right field map.
11. **Rank** the workspace templates on `/team`; verify the new deck shows up in incubating for 14 days.
12. **Compare** this deck against its cohort on `/benchmarks`; verify p25/p50/p75/p95 render and the deck's rank.

Demo target: 30 min, 12 steps, single operator, all 12 features visible.

---

## 9. Definition of Done

1. All 95 commits landed on `main`; CI green on `unit`, `smoke`, `contracts`, `load` (nightly), `dashboard-build`, `axe`.
2. ClickHouse + Kafka `docker compose` up; `make migrate-up` idempotent; `/healthz` 200 on every service.
3. 200k events/sec sustained for 10 min in k6; ClickHouse query p95 < 2 s for top 20 dashboard queries.
4. Replay determinism: 1M-event corpus, 0 mismatched session IDs across 5 replays.
5. GDPR: `DELETE` removes from ClickHouse within 60 s, audit row present, `GET .../export` returns valid NDJSON.
6. Dashboard: 0 axe serious, 7+ routes render, GraphQL persisted queries cached, exports stream ≤ 100 MB.
7. A/B: assignment deterministic across regions; cross-workspace contamination test green; sequential test correctly stops early on simulated effect.
8. CRM: idempotency keys verified; rate-limit burst handled without drops (or DLQ documented).
9. Bangladesh residency: data tagged `bd=true` lands on BD shard only, verified by integration test.
10. Runbooks published (PagerDuty, on-call); SLOs in `docs/slos/phase-17.md`; dashboards in Grafana; feature flags all wired to kill switch.
11. Spec doc `phase-17-spec.md` published; architecture doc appended.
12. Internal demo (12 steps, 30 min) executed end-to-end on local + staging.
