# Phase 17 — Analytics Data Flow

**Phase:** 17 — Analytics & Engagement Intelligence
**Status:** Complete (2026-08-08)
**Supersedes / extends:** [`docs/architecture/event-flow.md`](event-flow.md), [`docs/architecture/data-residency.md`](data-residency.md)
**Companion docs:** [`phase-17-spec.md`](../development_phases/phase-17-spec.md), [`analytics-runbook.md`](../analytics-runbook.md), [`slo/phase-17.md`](../../slo/phase-17.md)

This document is the implementation-level companion to the Phase 17 spec.
The spec describes *what* the analytics plane does; this document describes
*how data actually moves through it* — the wire-level edges, the storage
tiers, the residency boundaries, and the SLI/SLO checkpoints on each hop.

---

## 1. End-to-end pipeline

```
┌────────────────────────────────────────────────────────────────────────┐
│                       viewer / presenter / join-web                    │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ @domio/analytics-sdk  (HMAC-signed, batched, PII-strip, IDB-retry│  │
│  │   doNotTrack opt-in, consent gate, ephemeral session key)        │  │
│  └──────────────────────────┬───────────────────────────────────────┘  │
└─────────────────────────────┼──────────────────────────────────────────┘
                              │  HTTPS (X-Domio-Signature, X-Domio-Deck-Id,
                              │         X-Domio-Session-Id, X-Domio-Ts-Ms)
                              ▼
                ┌────────────────────────────────────┐
                │   services/event-ingest  (edge POP)│
                │   - HMAC verify                    │
                │   - per-event JSON-Schema enforce  │
                │   - PII strip if consent missing   │
                │   - token-bucket rate limit        │
                │   - 10 GB disk spool backpressure  │
                └─────────────────┬──────────────────┘
                                  │  KafkaJS producer
                                  ▼
                ┌────────────────────────────────────┐
                │   Kafka topic  events.ingest.raw   │
                │   key = workspace_id:viewer_id_key │
                │   (3 brokers, KRaft, partitioned) │
                └─┬───────┬─────────┬────────┬───────┘
                  │       │         │        │
                  ▼       ▼         ▼        ▼
              ┌───────┐ ┌────────┐ ┌──────┐ ┌──────────────┐
              │columnar│ │session-│ │crm-  │ │notification- │
              │loader  │ │ization │ │sync  │ │dispatcher    │
              │(Go)    │ │(TS)    │ │(Go)  │ │(TS)          │
              └───┬───┘ └────┬───┘ └──┬───┘ └──────┬───────┘
                  │          │        │            │
                  ▼          ▼        ▼            ▼
              ClickHouse   Postgres  Salesforce/   Slack/
              events +     session,  HubSpot/      Teams/
              MVs          consent   Pipedrive/    Email/
                                          Dynamics   Push
                  │          │
                  ▼          ▼
              ┌──────────────────────┐
              │   analytics-warehouse │
              │   (TS Yoga GraphQL)  │
              │   + REST read API    │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐    ┌──────────────────┐
              │  apps/dashboard       │◄──►│  Postgres        │
              │  (Next.js 15 / Yoga)  │    │  (control plane) │
              └──────────────────────┘    └──────────────────┘
```

### 1.1 Hop-by-hop SLO checkpoints

| Hop                              | SLI                                          | Target                 |
|----------------------------------|----------------------------------------------|------------------------|
| client → event-ingest            | POST /v1/events accepted                     | p95 < 100 ms           |
| event-ingest → Kafka             | publish ack received                         | p95 < 50 ms            |
| Kafka → columnar-loader          | consumer lag (per partition)                 | < 5 s p95              |
| columnar-loader → ClickHouse     | rows landed, MVs refreshed                   | p95 < 2 s              |
| sessionization emit              | `session.ended` within inactivity timeout    | p95 < 60 s post-event  |
| crm-sync → vendor                | vendor ack received                          | p95 < 5 s              |
| notification-dispatcher → channel| vendor ack received                          | p95 < 10 s             |
| dashboard GraphQL response       | full resolver chain                          | p95 < 800 ms, p99 < 1.5 s |

---

## 2. Kafka topology

| Topic                       | Partitions | Retention | Producer                  | Consumers                              |
|-----------------------------|-----------:|-----------|---------------------------|----------------------------------------|
| `events.ingest.raw`         | 24         | 6 h       | `services/event-ingest`   | `workers/columnar-loader`, `sessionization`, `crm-sync`, `notification-dispatcher` |
| `events.ingest.normalized`  | 24         | 24 h      | `workers/columnar-loader` | (downstream dashboards, future replay) |
| `events.ingest.dlq`         | 6          | 7 d       | `services/event-ingest`   | ops replay tool                        |
| `notification.triggered`    | 12         | 24 h      | CEP rules engine          | `notification-dispatcher`              |
| `notification.sent`         | 12         | 7 d       | `notification-dispatcher` | (audit only)                           |
| `crm.sync.queued/sent/failed` | 6        | 7 d       | `crm-sync`                | (audit only)                           |
| `ab.exposure`               | 12         | 30 d      | `ab-assignment`           | `ab-measurement`                       |
| `experiment.concluded`      | 6          | 90 d      | `ab-statistics`           | dashboard, audit                       |
| `team_analytics.refreshed`  | 3          | 7 d       | `team-analytics`          | dashboard                              |
| `live_session_summary.*`    | 6          | 30 d      | `live-analytics`          | recap join                             |

Partition key is `workspace_id:viewer_id_key` for all `events.ingest.*`
topics — this guarantees per-viewer ordering across POPs and is the
precondition for sessionization correctness.

---

## 3. Storage tiers

| Tier        | Store                          | TTL                          | Owner                    | Data                            |
|-------------|--------------------------------|------------------------------|--------------------------|---------------------------------|
| Hot OLTP    | Postgres 16                    | per-table (90 d → 7 y)       | `services/control-plane` | viewer, identity_link, consent_event, session, ab_*, crm_*, notification_rule, live_session_summary, analytics_export_* |
| Hot OLAP    | ClickHouse 24                  | 13 months (`TTL ts + INTERVAL`) | `services/analytics-warehouse` | events, session_agg_mv, deck_metric_5m, slide_metric_5m, funnel_step_hourly, heatmap_tile, team_metric_mv, benchmark_snapshot, ab_exposure, ab_variant_metric, live_session_summary |
| Cold        | Parquet in S3-compatible store | 7 years                      | `workers/session-archiver` (extended) | `events/` sharded by `toYYYYMM(ts)` and `workspace_id` |
| Ephemeral   | Redis 7                        | 60 s for nonces; 24 h for rate-limit buckets | edge | HMAC nonces, rate-limit token buckets, dedup keys |
| Materialized| ClickHouse MVs                 | n/a (derived)                | `services/analytics-warehouse` | `session_agg_mv`, `deck_metric_5m`, `slide_metric_5m`, `funnel_step_hourly`, `heatmap_tile`, `team_metric_mv`, `ab_variant_metric` |

---

## 4. Privacy & residency boundaries

The analytics plane enforces the four-mode privacy model from
`services/viewer-identity` (W3) at three layers:

1. **Client (`@domio/analytics-sdk`)** — strips email/phone/IP/name
   *before* serialization when `consent_state` lacks the matching
   category; honors `DNT: 1` and `Sec-CH-Prefers-Reduced-Tracking`;
   `tracking.optout` flips `privacy_mode` to `anon_no_track` and the
   SDK stops emitting linkable events entirely (aggregated only).
2. **Edge (`services/event-ingest`)** — runs the same PII stripper
   server-side as defense-in-depth; rejects events where
   `consent_state` is missing a category the event needs.
3. **Warehouse (`services/analytics-warehouse` + ClickHouse)** —
   enforces workspace isolation at the ClickHouse role level; RLS on
   every Postgres table.

### 4.1 Bangladesh residency

| Predicate                                  | Routing                                    |
|--------------------------------------------|--------------------------------------------|
| `viewer.bd_resident == true`               | data lands on `ap-south-1` BD shard only   |
| `viewer.bd_resident == false`              | any region per the workspace's home region |
| `share_link.bd_only == true`               | events tagged `bd=true` only on BD shard   |
| `event.bd_tag == true` AND shard != BD     | rejected at ingest (409 `residency_violation`) |

The integration test in `tests/integration/team-analytics/`
(`bd_residency.test.ts`) verifies the predicate end-to-end — an event
with `bd=true` is sent and verified to land only on the BD shard's
`events` table partition.

### 4.2 GDPR erasure

The right-to-erasure pipeline scrubs `email_plain`, `email_hash`,
`display_name`, `company`, plus tombstoned rows in ClickHouse via
`LIGHTWEIGHT DELETE`. **The tombstone itself survives** so we can
prove the erasure happened (audit log row `gdpr_erasure_completed`).
Full erasure SLO: < 60 s on the hot ClickHouse tier; < 24 h on the
cold Parquet tier (covered by the 7-year retention archive job).

---

## 5. Observability hooks

- **OTel traces** — `event_id` is the trace ID, propagated from the
  SDK through ingest → Kafka → consumers → warehouse → dashboard.
- **Prom metrics** —
  - `analytics_ingest_events_total{event_name,workspace_tier}`
  - `analytics_ingest_duration_seconds_bucket{stage}`
  - `analytics_kafka_consumer_lag_seconds{topic,partition,group}`
  - `analytics_clickhouse_query_seconds_bucket{query_class}`
  - `analytics_ab_assignment_seconds_bucket`
  - `analytics_crm_sync_total{provider,status}`
  - `analytics_notification_total{channel,outcome}`
  - `analytics_dashboard_resolver_seconds_bucket{resolver}`
- **Grafana dashboard** — `infrastructure/local/grafana/dashboards/phase-17-analytics.json`
  (overview, ingest, warehouse, ab, crm, notifications, team, live, benchmarks, dashboard).
- **PagerDuty routing** — `infrastructure/observability/pagerduty-phase17.yaml`
  (6 alert rules wired to `analytics-oncall` rotation).

---

## 6. SLOs & alerts

The formal Phase 17 SLOs live at [`slo/phase-17.md`](../../slo/phase-17.md).
The burn-rate alert rules follow the standard 14.4× / 6× / 3× / 1× ladder
documented in [`slo/README.md`](../../slo/README.md#burn-rate-policy).

Critical burn alerts (see `slo/phase-17.md` §Burn-rate alerts):

| ALERT ID                       | Burn-rate | Window | Action |
|--------------------------------|-----------|--------|--------|
| Phase17IngestBurnFast          | 14.4×     | 5m     | page   |
| Phase17WarehouseLatencyBurn    | 14.4×     | 5m     | page   |
| Phase17DashboardLatencyBurn    | 14.4×     | 5m     | page   |
| Phase17CRMSyncFailureBurn      | 6×        | 30m    | page   |
| Phase17GDPRBreachBurn          | 14.4×     | 5m     | page   |

---

## 7. Failure modes & containment

| Failure                                | Effect                              | Mitigation                                          |
|----------------------------------------|-------------------------------------|-----------------------------------------------------|
| Kafka broker down                      | events buffer at POP disk spool     | 10 GB/pop buffer, `Retry-After: 30` on 503           |
| ClickHouse down                        | columnar-loader stalls              | Kafka consumer lag alert; resume from offset        |
| HMAC key compromise                    | forged events accepted              | hourly ephemeral session-key rotation; blast-radius per session |
| Replay storm (retries during incident) | downstream overload                 | token-bucket per-IP and per-deck rate limit         |
| crm-sync vendor 429 storm              | events queue at `crm_sync.outbox`   | DLQ + 24-h retry; reconciliation worker surfaces gaps |
| Notification channel down              | notifications dropped               | dead-letter to `notifications.dlq`; ops replay tool |
| Dashboard resolver regression          | dashboards slow / 5xx               | persisted-query cache + per-resolver timeout budget  |

---

## 8. Cross-references

- Spec: [`docs/development_phases/phase-17-spec.md`](../development_phases/phase-17-spec.md)
- SLOs: [`slo/phase-17.md`](../../slo/phase-17.md)
- Runbook: [`docs/analytics-runbook.md`](../analytics-runbook.md)
- DoD: [`docs/development_phases/phase-17-dod.md`](../development_phases/phase-17-dod.md)
- Verification log: [`docs/development_phases/phase-17-verification.md`](../development_phases/phase-17-verification.md)
- Commit log: [`docs/development_phases/phase-17-commit-log.md`](../development_phases/phase-17-commit-log.md)
- Parent event-flow doc: [`docs/architecture/event-flow.md`](event-flow.md)
- Parent data-residency doc: [`docs/architecture/data-residency.md`](data-residency.md)
