# Phase 17 — Data flow

This document describes the end-to-end data flow for the Phase 17
analytics & engagement-intelligence stack.  It mirrors the style of
the existing event-flow doc (Phase 5 control-plane events).

## Goals

1. **Trace a single analytics event** from the client SDK to the
   dashboard in <2 000 ms p95.
2. **Honour RLS** at every hop: events never cross workspace
   boundaries; CRM records are workspace-scoped; A/B assignments
   cannot leak across workspaces.
3. **Be deterministic on replay**: given the same event corpus, the
   sessionization consumer must produce identical session_id
   sequences across replays (see `tests/load/replay-corpora/`).
4. **Be observable**: every stage emits Prometheus metrics and OTel
   traces (correlation IDs flow end-to-end).
5. **Be degradable**: per-workstream kill switches
   (`infrastructure/feature-flags/phase-17.yaml`) let us disable any
   single W without touching the others.

## Architecture diagram

```
+-----------------+     +-------------------+     +-----------------+
|  client SDK     |     |  client SDK       |     |  presenter-app  |
|  (analytics-sdk)|     |  (analytics-sdk)  |     |  (W11)          |
+--------+--------+     +---------+---------+     +--------+--------+
         | HMAC-signed batched       |                      |
         | events /v1/events         | CRDT apply hooks     |
         v                           v                      v
+--------+--------------------------------------------------+--------+
|                       event-ingest (W1)                    | 3020  |
|   Fastify + Zod, HMAC verify, PII strip,                   |       |
|   Kafka producer, disk-spool backpressure                   |       |
+--------+--------------------------------------------------+--------+
         |                          |
         |  Kafka topic             |  DLQ topic
         |  events.ingest.raw       |  events.ingest.dlq
         v                          v
+--------+--------+         +-------+-------+
| clickhouse-     |         |  DLQ replay   |
| loader (W2)     |         |  CLI          |
| (Go, batch 5k/s)|         +---------------+
+--------+--------+
         | native INSERT into ClickHouse
         v
+--------+--------------------------------------------------+
|              ClickHouse domio_analytics                    |
|                                                            |
|  events (MergeTree, TTL 13m, partition by month)           |
|   |                                                        |
|   +-> session_agg_mv     (SummingMergeTree)                |
|   +-> deck_metric_5m     (SummingMergeTree)                |
|   +-> slide_metric_5m    (SummingMergeTree)                |
|   +-> funnel_step_hourly (SummingMergeTree)                |
|   +-> team_metric_mv     (SummingMergeTree)                |
|   +-> heatmap_tile       (SummingMergeTree, 32x18 grid)    |
|   +-> benchmark_snapshot (ReplacingMergeTree)              |
|                                                            |
+--------+--------------------------------------------------+
         |                  |                |               |
         v                  v                v               v
+-------------------+ +--------------+ +----------------+ +----------+
| analytics-        | | sessionization| | viewer-identity| | heatmap- |
| warehouse (W2)    | | (W4)         | | (W3)           | | generator|
| Read API + Yoga   | | Kafka        | | GDPR export/   | | (W5)     |
| GraphQL gateway   | | consumer,    | | erase,         | | rollups  |
|                   | | 30-min rule  | | privacy modes  | | + export |
+---------+---------+ +------+-------+ +--------+-------+ +----+-----+
          |                 |                   |              |
          |                 +-------+-----------+              |
          |                         |                          |
          v                         v                          v
+------------------+      +------------------+        +---------------+
| apps/dashboard   |      | ClickHouse        |        | Object store  |
| (W11)            |      | analytics.*       |        | (PNG/SVG)     |
| Next.js + Yoga   |<-----+ materialized views|        +-------+-------+
| persisted queries|      | (read path)       |                |
+--------+---------+      +------------------+                |
         |                                                   |
         v                                                   v
+----------------+   +----------------+   +----------------+ +----------+
| /ab            |   | /team          |   | /live          | | /heatmap  |
| ab-measurement |   | team-analytics |   | live-analytics | | canvas    |
| ab-statistics  |   | (W9)           |   | (W10)          | | renderer  |
+----------------+   +----------------+   +----------------+ +----------+

                                  +-------------------------+
                                  |   crm-sync (W7, Go)     |
                                  |   Salesforce / HubSpot  |
                                  |   Pipedrive / Dynamics  |<--+
                                  |   token-bucket + DLQ    |   |
                                  +-------------------------+   |
                                                                |
                                  +-------------------------+   |
                                  |   notification-         |   |
                                  |   dispatcher (W8)       |<--+
                                  |   CEP rules engine      |
                                  +-------------------------+
```

## Stage-by-stage

### 1. Client SDK (`@domio/analytics-sdk`)

- Browser bundle, ships in `apps/{viewer,presenter,join-web}`.
- Buffers events in IndexedDB (`packages/prototype-recorder` shim).
- Batches up to 100 events or 5 s, whichever first.
- Signs each batch with HMAC-SHA256(`INGEST_HMAC_KEY_HEX`).
- Strips PII client-side before sending.
- Respects `navigator.doNotTrack` and `Sec-CH-Prefers-Reduced-Tracking`.

### 2. Event-ingest edge (W1)

- `services/event-ingest` — Fastify + Zod.
- Validates payload against `contracts/events/ingest/*.json`.
- Verifies HMAC; rejects expired (5 min skew) or replayed nonces.
- Strips server-side PII (defence in depth).
- Produces to Kafka topic `events.ingest.raw` keyed by
  `${workspace_id}:${viewer_id_key}` so all events for one viewer
  land on the same partition (deterministic sessionization).
- Backpressure: when Kafka is unreachable, spool to local disk
  (`INGEST_SPOOL_DIR`, 10 GB cap); replay CLI drains the spool
  once Kafka recovers.
- DLQ: schema-violating events go to `events.ingest.dlq` with an
  `x-dlq-reason` header.

### 3. ClickHouse loader (W2, Go)

- `services/clickhouse-loader` (Go).
- Kafka consumer group `clickhouse-loader`; one consumer per pod,
  pinned to a partition.
- Batches 5 000 events / 1 s; native protocol INSERT into
  `domio_analytics.events`.
- Emits Prometheus metrics: `columnar_loader_events_inserted_total`,
  `columnar_loader_last_processed_timestamp_seconds`.

### 4. ClickHouse materialized views

- `session_agg_mv`, `deck_metric_5m`, `slide_metric_5m`,
  `funnel_step_hourly`, `team_metric_mv`, `heatmap_tile`,
  `benchmark_snapshot`.
- Rollup job (`workers/team-analytics-rollup`) refreshes the team MV
  nightly at 02:00 UTC.
- `workers/benchmark-rollup` refreshes the benchmark snapshot nightly.

### 5. Sessionization (W4)

- `services/sessionization` consumes `events.ingest.raw` with the
  same partition key as ingest (one consumer per viewer partition).
- Applies the 30-min inactivity rule + max 4 h session ceiling.
- Emits `session.started`, `session.ended`, `session.heartbeat`.
- Writes to `domio_analytics.sessions_long`.
- Determinism is enforced by `tests/load/replay-corpora/replay.test.ts`.

### 6. Viewer identity (W3)

- `services/viewer-identity` consumes `session.started` and
  `interaction` events.
- Builds the identity graph (email hash, CRM ID, share-link,
  SSO).
- Honours 4 privacy modes (strict / balanced / permissive / anonymous).
- GDPR `DELETE /v1/viewers/{id}` issues ClickHouse `LIGHTWEIGHT
  DELETE` + Postgres tombstone.
- GDPR `GET /v1/viewers/{id}/export` streams NDJSON.

### 7. Heatmap generator (W5)

- `services/heatmap-generator` consumes `session.ended`.
- Computes 32x18 grid rollup into `heatmap_tile`.
- Caches PNG/SVG in object-store (MinIO in dev).

### 8. A/B testing (W6)

- `services/ab-assignment` — Go — synchronous hash assignment.
  Sub-ms p95 hot path.
- `services/ab-measurement` — Go — Bayesian Beta-Binomial +
  frequentist z-test, batched per 5 min.
- `services/ab-statistics` — Go — sequential mSPRT + early stopping.
- RLS enforced at the assignment endpoint; cross-workspace
  contamination is a **page** alert (`ab-cross-workspace-leak`).

### 9. CRM sync (W7)

- `services/crm-sync` (Go) consumes `interaction` events.
- Per-provider adapters: HubSpot (token bucket 100/10s), Salesforce
  (OAuth refresh + 429 backoff), Pipedrive, Dynamics.
- Idempotency keys: `SHA-256(workspaceID:viewerID:eventType:eventID)`.
- DLQ: `crm.dlq`; depth > 1 000 pages on-call (`crm-dlq-depth-page`).

### 10. Notification dispatcher (W8)

- `services/notification-dispatcher` consumes CRM scoring + lead
  threshold events.
- CEP rules engine: lead score threshold, MQL->SQL transitions,
  high-signal interactions.
- Multi-channel: email (SES stub in dev), Slack, Teams, webhook,
  mobile push.
- Per-recipient daily caps + DND quiet hours.

### 11. Team analytics (W9)

- `services/team-analytics` reads materialized views.
- `workers/team-analytics-rollup` runs nightly at 02:00 UTC.
- Manager dashboard `/team` reads through the Yoga gateway.

### 12. Live analytics (W10)

- `services/live-analytics` consumes NATS subject
  `analytics.ingest.live.{sessionID}`.
- HUD WebSocket fan-out for `<1 s` p95.
- Generates `live_session_summary` within 5 min of session end.

### 13. Benchmarks + dashboard (W11)

- `services/benchmark` (Go) — t-digest + HDR histograms; cohort
  eligibility (>=10 sessions / 30 d); outlier exclusion (>3x p99).
- `apps/dashboard` — Next.js 15 + Yoga GraphQL gateway with
  persisted queries.
- 7 routes: `/overview`, `/deck/[id]`, `/heatmap`, `/ab`,
  `/crm`, `/team`, `/live`, `/benchmarks`.  Plus `/export` for
  CSV/Parquet streaming.

## Cross-cutting concerns

| Concern | How it's enforced |
|---------|-------------------|
| **RLS** | `SET app.tenant_id = 'ws-X'` at the head of every Postgres session (see `tests/security/rls-isolation-phase17.test.ts`). |
| **HMAC** | Single key in Vault (`secret/domio/analytics/hmac`); rotation procedure in `docs/analytics-runbook.md#hmac-key-rotation`. |
| **PII** | Stripped on device (SDK) AND on edge (`services/event-ingest/src/pii/strip.ts`). |
| **GDPR** | Right-to-erasure via ClickHouse `LIGHTWEIGHT DELETE` + Postgres tombstone; right-to-export via NDJSON streaming. |
| **Kill switches** | `process.env.PHASE17_W{N}_DISABLED` checked at service boot (see `infrastructure/feature-flags/README.md`). |
| **Replay determinism** | Lock-step sessionization consumer; SHA-256 fingerprint equality (see `tests/load/replay-corpora/`). |
| **Observability** | Prometheus + OTel; Grafana dashboard `phase-17-analytics-prod`; PagerDuty rules in `infrastructure/observability/pagerduty/phase17.yaml`. |

## Worked example: a single `view` event

1. Viewer loads a deck. The browser SDK buffers the `view` event in
   IDB. After 100 events or 5 s it batches them.
2. SDK computes `HMAC-SHA256(batch, INGEST_HMAC_KEY_HEX)` and POSTs
   to `event-ingest:3020/v1/events`.
3. event-ingest validates the HMAC, strips PII, and produces to Kafka
   `events.ingest.raw` keyed by `ws-42:viewer-7`.
4. clickhouse-loader (Go) consumes the partition, batches 5 000 rows,
   inserts into ClickHouse.
5. Materialized views refresh (within 60 s): `deck_metric_5m` for
   `ws-42` increments the `view` counter for slide `s-12`.
6. sessionization (W4) reads the partition, sees no prior session
   for `viewer-7` in the last 30 min, emits `session.started` to
   Kafka `events.session.*`.
7. The dashboard's persisted query `OverviewKPI` reads
   `deck_metric_5m` (via the Yoga gateway), returns a tile with
   `view_count = 1`.
8. PagerDuty `Ingest p95 > 5s` SLO: not paged (latency is < 50 ms).

End-to-end latency: < 1 000 ms from SDK flush to dashboard render
in the steady state.