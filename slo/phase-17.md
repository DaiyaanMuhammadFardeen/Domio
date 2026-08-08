# SLO: Phase 17 — Analytics & Engagement Intelligence

Owner: `analytics-platform@example.com`
Reviewers: SRE on-call, Phase 17 lead
Window: 28-day rolling
Severity routing: [`oncall.yaml`](./oncall.yaml) (analytics-oncall rotation)

This document defines the Service Level Objectives for the Phase 17
analytics plane. It follows the [SLO methodology](./README.md#methodology)
used for every other component in this directory. The companion
implementation reference is
[`docs/architecture/phase-17-data-flow.md`](../docs/architecture/phase-17-data-flow.md);
the on-call playbook is [`docs/analytics-runbook.md`](../docs/analytics-runbook.md).

---

## User journeys

| ID    | Journey                                                                    | Mechanism                              |
|-------|----------------------------------------------------------------------------|----------------------------------------|
| A-1   | Viewer / presenter / join-web emits an analytics event                     | `POST /v1/events` to `event-ingest`    |
| A-2   | Event ingested into the warehouse and available to the dashboard           | Kafka → ClickHouse → `analytics-warehouse` |
| A-3   | A session is closed and its derived metrics are queryable                  | `sessionization` → `session_agg_mv`    |
| A-4   | Per-slide heatmap is rendered for a scroll-mode deck                       | `heatmap-generator` → `heatmap_tile`   |
| A-5   | Live presenter HUD pulses attendance / poll / Q&A volume                   | `live-analytics` graphql-ws            |
| A-6   | Dashboard GraphQL query returns per-viewer / per-deck metrics               | `apps/dashboard` → Yoga GraphQL        |
| A-7   | A/B test variant is assigned and the winner is declared                    | `ab-assignment` + `ab-statistics`      |
| A-8   | CRM sync pushes an engagement event to Salesforce / HubSpot / Pipedrive / Dynamics | `crm-sync` adapters              |
| A-9   | Sales notification fires on a high-intent event                           | `notification-dispatcher`              |
| A-10  | GDPR / right-to-erasure request is honored                                 | `viewer-identity`                      |
| A-11  | Replay determinism: archived corpus replays deterministically              | `tests/load/replay-corpora/`          |

---

## SLIs and SLOs

### A-1 — Ingest (event-ingest)

| SLI                                  | SLO target                | Ticket threshold        | Page threshold         |
|--------------------------------------|---------------------------|-------------------------|------------------------|
| A-1 accept rate (2xx)                | 99.9%                     | < 99.5% / 6h            | < 99% / 5m             |
| A-1 ingest latency p95               | < 5 s                     | > 5 s / 6h              | > 10 s / 5m            |
| A-1 ingest latency p99               | < 30 s                    | > 30 s / 6h             | > 60 s / 5m            |
| A-1 ingest‑to‑Kafka p95              | < 100 ms                  | > 200 ms / 6h           | > 500 ms / 5m          |
| A-1 DLQ rate (events dropped)        | < 0.01%                   | > 0.05% / 6h            | > 0.1% / 5m            |

**Measurement.** `analytics_ingest_events_total{result}` and
`analytics_ingest_duration_seconds_bucket{stage}` emitted by the
edge service. The 5 s / 30 s targets are stronger than the existing
api-gateway targets because ingest is the platform's hot path.

### A-2 — Warehouse landing (analytics-warehouse)

| SLI                                   | SLO target                | Ticket threshold        | Page threshold         |
|---------------------------------------|---------------------------|-------------------------|------------------------|
| A-2 ClickHouse query p95              | < 500 ms                  | > 1 s / 6h              | > 2 s / 5m             |
| A-2 ClickHouse query p99              | < 1.5 s                   | > 2 s / 6h              | > 3 s / 5m             |
| A-2 columnar-loader consumer lag      | < 5 s p95                 | > 30 s / 6h             | > 60 s / 5m            |
| A-2 MV refresh latency (5m rollup)    | < 5 min lag               | > 10 min / 6h           | > 20 min / 5m          |

### A-3 — Sessionization

| SLI                                    | SLO target                | Ticket threshold        | Page threshold         |
|----------------------------------------|---------------------------|-------------------------|------------------------|
| A-3 session closed within inactivity   | 99.9% within 60 s         | < 99.5% / 6h            | < 99% / 5m             |
| A-3 drift correction accuracy          | ± 5% of client dwell      | drift > 10% / 6h        | drift > 25% / 5m       |
| A-3 bot false-positive rate            | < 0.5%                    | > 0.75% / 6h            | > 1% / 5m              |

### A-4 — Heatmap

| SLI                                    | SLO target                | Ticket threshold        | Page threshold         |
|----------------------------------------|---------------------------|-------------------------|------------------------|
| A-4 heatmap refresh latency (per session end) | < 60 s            | > 90 s / 6h             | > 180 s / 5m           |
| A-4 heatmap-tile cache hit rate        | > 90%                     | < 85% / 6h              | < 75% / 5m             |
| A-4 privacy-floor (≥ 5 impressions)    | 100% of tiles suppressed  | any leak / 6h           | any leak / 5m          |

### A-5 — Live analytics

| SLI                                    | SLO target                | Ticket threshold        | Page threshold         |
|----------------------------------------|---------------------------|-------------------------|------------------------|
| A-5 HUD pulse latency p95              | < 1 s                     | > 2 s / 6h              | > 5 s / 5m             |
| A-5 post-session summary compute       | < 5 min from session end  | > 10 min / 6h           | > 30 min / 5m          |
| A-5 dedup accuracy (live + replay)     | 100% of dupe sessions     | any 1 / 6h              | any 1 / 5m             |

### A-6 — Dashboard GraphQL

| SLI                                    | SLO target                | Ticket threshold        | Page threshold         |
|----------------------------------------|---------------------------|-------------------------|------------------------|
| A-6 dashboard resolver p95             | < 800 ms                  | > 1.2 s / 6h            | > 2 s / 5m             |
| A-6 dashboard resolver p99             | < 1.5 s                   | > 2.5 s / 6h            | > 4 s / 5m             |
| A-6 dashboard error rate (5xx)         | < 0.5%                    | > 1% / 6h               | > 2% / 5m              |
| A-6 persisted-query cache hit rate     | > 80%                     | < 70% / 6h              | < 60% / 5m             |
| A-6 export streaming (CSV/Parquet)     | < 100 MB streamed         | > 100 MB / 6h           | > 250 MB / 5m          |

### A-7 — A/B testing

| SLI                                    | SLO target                | Ticket threshold        | Page threshold         |
|----------------------------------------|---------------------------|-------------------------|------------------------|
| A-7 assignment lookup p95              | < 5 ms                    | > 10 ms / 6h            | > 25 ms / 5m           |
| A-7 cross-workspace contamination      | 0 (perfect isolation)     | any 1 / 6h              | any 1 / 5m             |
| A-7 sequential test early stop         | within 24h of detection   | > 24h after boundary / 6h | > 48h / 5m            |
| A-7 statistical confidence threshold   | enforced server-side      | any UI bypass / 6h      | any UI bypass / 5m     |

### A-8 — CRM sync

| SLI                                    | SLO target                | Ticket threshold        | Page threshold         |
|----------------------------------------|---------------------------|-------------------------|------------------------|
| A-8 idempotency-key uniqueness         | 100% (0 duplicates)       | any 1 / 6h              | any 1 / 5m             |
| A-8 sync failure rate                  | < 1%                      | > 2% / 6h               | > 5% / 5m              |
| A-8 rate-limit burst handling          | 0 drops (or DLQ)          | > 0.1% drops / 6h       | > 1% drops / 5m        |
| A-8 vendor ack latency p95             | < 5 s                     | > 10 s / 6h             | > 30 s / 5m            |
| A-8 webhook signature verification     | 100% (rejects unsigned)   | any 1 / 6h              | any 1 / 5m             |

### A-9 — Notifications

| SLI                                    | SLO target                | Ticket threshold        | Page threshold         |
|----------------------------------------|---------------------------|-------------------------|------------------------|
| A-9 trigger latency p95                | < 10 s                    | > 15 s / 6h             | > 30 s / 5m            |
| A-9 daily-cap obedience                | 100% (no over-quota)      | any 1 / 6h              | any 1 / 5m             |
| A-9 DND / quiet-hours obedience        | 100%                      | any 1 / 6h              | any 1 / 5m             |
| A-9 anonymous-viewer PII leakage       | 0 (no PII in payload)     | any 1 / 6h              | any 1 / 5m             |

### A-10 — GDPR

| SLI                                    | SLO target                | Ticket threshold        | Page threshold         |
|----------------------------------------|---------------------------|-------------------------|------------------------|
| A-10 erasure latency (ClickHouse)      | < 60 s                    | > 5 min / 6h            | > 30 min / 5m          |
| A-10 audit row present                  | 100% of erasure requests  | any missing / 6h        | any missing / 5m       |
| A-10 export streaming (NDJSON)          | returns valid NDJSON     | any invalid / 6h        | any invalid / 5m       |
| A-10 tombstone survives                 | 100%                      | any lost / 6h           | any lost / 5m          |

### A-11 — Replay determinism

| SLI                                    | SLO target                | Ticket threshold        | Page threshold         |
|----------------------------------------|---------------------------|-------------------------|------------------------|
| A-11 1M-event corpus replay wall time  | < 10 min                  | > 12 min / 6h           | > 20 min / 5m          |
| A-11 session-ID matches across replays | 0 mismatches             | any 1 / 6h              | any 1 / 5m             |
| A-11 aggregate delta vs. reference     | < 0.5% (50 golden files) | > 0.5% / 6h             | > 1% / 5m              |

---

## Burn-rate alerts

The burn-rate ladder follows the [policy](./README.md#burn-rate-policy)
documented in the SLO index. Concrete Prom expressions live in
[`infrastructure/observability/pagerduty-phase17.yaml`](../infrastructure/observability/pagerduty-phase17.yaml).

| ALERT ID                       | SLO    | Burn-rate | Window | Action |
|--------------------------------|--------|-----------|--------|--------|
| Phase17IngestBurnFast          | A-1    | 14.4×     | 5m     | page   |
| Phase17IngestBurnSlow          | A-1    | 6×        | 30m    | page   |
| Phase17IngestLatencyBurn       | A-1    | 14.4×     | 5m     | page   |
| Phase17WarehouseLatencyBurn    | A-2    | 14.4×     | 5m     | page   |
| Phase17WarehouseLagBurn        | A-2    | 6×        | 30m    | page   |
| Phase17SessionizationBurnFast  | A-3    | 14.4×     | 5m     | page   |
| Phase17HeatmapLatencyBurn      | A-4    | 6×        | 30m    | page   |
| Phase17LivePulseBurn           | A-5    | 14.4×     | 5m     | page   |
| Phase17DashboardLatencyBurn    | A-6    | 14.4×     | 5m     | page   |
| Phase17DashboardErrorBurn      | A-6    | 14.4×     | 5m     | page   |
| Phase17ABContamination         | A-7    | n/a       | n/a    | page   |
| Phase17ABAssignmentLatency     | A-7    | 14.4×     | 5m     | page   |
| Phase17CRMSyncFailureBurn      | A-8    | 6×        | 30m    | page   |
| Phase17CRMBurstDropBurn        | A-8    | 14.4×     | 5m     | page   |
| Phase17NotificationCapBurn     | A-9    | 14.4×     | 5m     | page   |
| Phase17NotificationPIIBurn     | A-9    | 14.4×     | 5m     | page   |
| Phase17GDPRBreachBurn          | A-10   | 14.4×     | 5m     | page   |
| Phase17ReplaySlowBurn          | A-11   | 6×        | 30m    | page   |

---

## Error-budget policy

Each Phase 17 SLO gets its own 28-day budget, independent of the
api-gateway and realtime-gateway budgets. When a budget is exhausted
the policy in [`oncall.yaml`](./oncall.yaml) freezes non-emergency
deploys to the analytics plane until the next budget cycle begins.

**Budget freeze escalation:**
- **Single SLO exhausted** → freeze non-emergency deploys to the
  affected service only.
- **Two SLOs exhausted** → freeze all Phase 17 deploys.
- **Three or more SLOs exhausted** → freeze deploys and notify
  `analytics-platform-lead@example.com` and `platform-eng-lead@example.com`.

---

## Measurement details

- **Source metrics** — emitted by every analytics-plane service;
  scraped via Prometheus on a 30-second interval.
- **Service→team mapping** — `analytics-platform@example.com` owns
  every SLO in this document; sub-owners per workstream inherit
  paged rotation responsibility.
- **Tenant scope** — SLOs are computed *per tenant class* (free vs
  paid) and budgets are summed, not averaged.
- **Exclusions** — synthetic probes (`user_agent=~"k6-.*"`); Seoul
  migration windows (documented in the room's `#analytics-migrations`).
- **Cross-references** — the implementation pipeline is described in
  [`docs/architecture/phase-17-data-flow.md`](../docs/architecture/phase-17-data-flow.md);
  the on-call playbook is [`docs/analytics-runbook.md`](../docs/analytics-runbook.md).

---

## Notes

- We do *not* include the 100% target anywhere — every SLO here ships
  with a measurable budget.
- A-7 contamination is a 0-budget SLO: any single event crossing
  workspace boundaries is a P0.
- A-10 erasure is a 60-second SLO on the hot tier; the cold Parquet
  tier guarantees < 24 h scrub and is tracked in a separate budget.
- A-11 replay determinism is exercised nightly by the
  `tests/load/replay-corpora/` job and quarterly by the SRE team.
