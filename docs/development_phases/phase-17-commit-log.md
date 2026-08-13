# Phase 17 — Commit Log

> **Purpose.** Audit-trail of every commit that landed in Phase 17 —
> Analytics & Engagement Intelligence. Generated with
> `git log --oneline 7e5d362^..HEAD` from the `worktree-agent-docci-final`
> worktree. SHAs are immutable and re-derivable from any clone of the
> repo.
>
> **Companion docs:** [`phase-17-spec.md`](phase-17-spec.md), [`phase-17-dod.md`](phase-17-dod.md), [`phase-17-verification.md`](phase-17-verification.md)

**Boundary commit:** `7e5d362` — `feat(analytics): add phase-17-spec.md mirroring phase-16-audience-participation.md`
(the first commit tagged with the Phase 17 spec; everything between
this SHA and HEAD is in-scope for Phase 17).

**Total commits in scope:** 67 (65 from feature work + 2 from this PR's sign-off).

---

## Wave 0 — Foundations (W0)

11 commits.

```
7e5d362  feat(analytics): add phase-17-spec.md mirroring phase-16-audience-participation.md
b7ac097  feat(infra): add infrastructure/kafka with KRaft single-broker dev config
000dd9f  feat(infra): add ClickHouse init schema + config + users
29f4ec0  feat(infra): add ClickHouse migrator tool (mirrors postgres migrator)
2a9ae81  feat(observability): add phase-17 feature flags + grafana dashboard + pagerduty rules
474486a  feat(contracts): add contracts/events/ingest/{view,interaction,scroll_progress,scroll_pause}.json
69a4181  feat(contracts): add contracts/events/ingest/{presenter_event,live_session_event}.json
79f7446  feat(contracts): add analytics OpenAPI + GraphQL schema
b703d33  feat(contracts): add contracts/proto/domio/v1/{analytics,ab}.proto
75a1512  feat(analytics-sdk): flesh out @domio/analytics-sdk with HMAC + batcher + transport + PII
b1579d6  feat(viewer): wire client-side event emitters + rtgw/pwg fan-out
```

---

## Wave 1 — Ingest + Warehouse (W1, W2)

7 commits.

```
8f2d678  feat(event-ingest): scaffold Phase 17 W1 ingest edge service
587f98e  feat(event-ingest): publish DLQ records to events.ingest.dlq Kafka topic
b04a14b  feat(clickhouse-loader): Phase 17 W2 Kafka→ClickHouse worker (Go)
17cadb6  feat(analytics-warehouse): Phase 17 W2 read API + rollup orchestrator
4d4f992  feat(db): Phase 17 analytics Postgres migrations 0059-0062
93b43e2  test(phase17): MV validation + ingest schema round-trip tests
3e48995  test(phase17): Kafka contract integration tests
```

---

## Wave 2 — Identity + Sessionization (W3, W4)

5 commits.

```
1820217  feat(viewer-identity): add Phase 17 identity graph and GDPR routes
96ecc75  feat(viewer-identity): mirror identity and consent to ClickHouse
fdaae43  feat(sessionization): add Phase 17 W4 inactivity rule engine and partition consumer
ab57fb3  test(sessionization): replay determinism over a 1000-event corpus
7540062  test(viewer-identity): GDPR erase/export/object integration suite
```

---

## Wave 3 — Heatmap + A/B + CRM adapters (W5, W6, W7 partial)

19 commits.

```
dfb9466  feat(heatmap-generator): W5 skeleton with 32x18 tile grid aggregator and PNG export
e108aff  feat(clickhouse+pg): heatmap AggregatingMergeTree with dwell histogram + ab_variant
a987491  test(heatmap-generator): aggregator dedup, export shape, PNG validity
d83154e  feat(ab-assignment): deterministic hash assignment, ClickHouse exposure writer, GraphQL schema
7c5fe1c  feat(ab-assignment): HTTP routes for CRUD/assign/exposure + chi-based main.go
b286c84  test(ab-assignment): cross-workspace contamination + determinism-across-restarts
fe9d40b  feat(ab-measurement): Bayesian Beta-Binomial + frequentist z-test, HTTP endpoint
2b83ec3  feat(crm-sync): HubSpot adapter + token-bucket rate limiter
06b6369  feat(crm-sync): Salesforce adapter with OAuth2 refresh + 429 backoff
660ea27  feat(crm-sync): Intercom contact adapter with event tagging
c8adf67  feat(crm-sync): Outreach mailbox + sequence upsert adapter
5b85592  feat(ab-statistics): sequential mSPRT with AVI alpha-spending + power analysis
14f268d  feat(crm-sync): SHA-256 idempotency key derivation
7b58a4a  test(ab-statistics): early-stopping on simulated effects (positive/negative/null)
5239f26  test(ab-assignment): integration smoke test exercising /v1/experiments + /v1/experiments/.../assign + /graphql
20aafe8  feat(clickhouse): ab_exposure table + ab_variant_metric rollup for measurement
d8d5add  feat(crm-sync): exponential-backoff retry + NATS DLQ publisher
fcf6bdd  test(crm-sync): orchestrator contract tests + idempotency collision
d9bfb1e  feat(crm-sync): ClickHouse warehouse table + HTTP writer
```

---

## Wave 4 — CRM sync + Team analytics (W7, W9)

7 commits.

```
39b4f35  test(crm-sync): HubSpot 100/10s burst-load throttle test
9303f3e  feat(crm-sync): adapter registry + plugin loader
47ee8e6  feat(team-analytics): Phase 17 W9 service skeleton with template/component/brand routes
5921942  feat(team-analytics): nightly workspace rollup daemon
f42c409  feat(team-analytics): retention cohort matrix with 1/7/30-day windows
5964533  feat(team-analytics): funnel analysis with order-sensitive step conversion
203d797  feat(clickhouse): add team_metric_materialized_view table for W9
01be272  test(team-analytics): vitest suite for retention, funnel, rollup, DAO
```

---

## Wave 5 — Live + Notification entrypoints + W7 finish (W7, W8, W10)

15 commits.

```
c28fc42  feat(live-analytics): Phase 17 W10 service skeleton with NATS bridge and ring buffer
68c6b4e  feat(live-analytics): real-time pulse derivation from NATS event stream
3d28662  feat(live-analytics): graphql-ws HUD subscription at /v1/live/{sessionID}/subscribe
cbd2e3e  feat(live-analytics): live_session_summary ClickHouse table and sink
991d1a0  test(live-analytics): vitest suite for pulse, hub, ring buffer, orchestrator
4fff6ef  feat(notification-dispatcher): sales-mode rules engine
da81bc5  feat(notification-dispatcher): multi-channel router
f0cc809  feat(notification-dispatcher): per-recipient daily caps via Redis
e883e85  feat(notification-dispatcher): audit log + GDPR redaction
9f43790  feat(notification-dispatcher): end-to-end orchestrator
5b2193a  feat(crm-sync): service entrypoint + health endpoints
9af041b  feat(notification-dispatcher): service entrypoint with test-event mode
8dcb8ed  test(crm-sync): expose SetTransportForTest on adapters for httptest routing
b46924d  Merge branch 'worktree-agent-a671682b' into master: Wave 5 (W9 team + W10 live analytics)
e8f1ec9  test(viewer-identity): drop unused store binding in lifecycle describe
```

---

## Wave 6 — Sign-off (this PR)

2 commits.

```
18c383c  feat(docs): phase-17 spec doc + architecture data-flow + runbook + SLOs + README updates
ae0098b  feat(ci): load.yml + dashboard-build.yml + per-service build matrix
```

---

## Re-derivation

To regenerate this log from a fresh clone:

```bash
git clone git@github.com:DaiyaanMuhammadFardeen/Domio.git domio
cd domio
git fetch --all

# Boundary SHA: the first commit of Phase 17
BOUNDARY=$(git log --oneline --all | grep "phase-17-spec.md mirroring" | awk '{print $1}' | head -1)

# Oldest-first list
git log --oneline "${BOUNDARY}^..HEAD" | tac

# Per-wave: pipe through grep
git log --oneline "${BOUNDARY}^..HEAD" | tac | grep -E "^(7e5d362|b7ac097|...)"
```

The Wave groupings above match the merge messages embedded in the
commit history (notably `b46924d` — `Merge branch 'worktree-agent-a671682b'
into master: Wave 5 (W9 team + W10 live analytics)`).

---

## Per-package tally

| Service                   | Wave  |  Commits | Tests (TS) |  Tests (Go) |
| ------------------------- | ----- | -------: | ---------: | ----------: |
| `event-ingest`            | 1     |        2 |         45 |           — |
| `clickhouse-loader`       | 1     |        1 |          — | (Go loader) |
| `analytics-warehouse`     | 1     |        1 |         12 |           — |
| `viewer-identity`         | 2     |        2 |         59 |           — |
| `sessionization`          | 2     |        1 |         26 |           — |
| `heatmap-generator`       | 3     |        1 |         23 |           — |
| `ab-assignment`           | 3     |        3 |          — |          25 |
| `ab-measurement`          | 3     |        1 |          — |          16 |
| `ab-statistics`           | 3     |        1 |          — |          12 |
| `crm-sync`                | 3,4   |        9 |          — |          68 |
| `team-analytics`          | 4     |        5 |         21 |           — |
| `live-analytics`          | 5     |        4 |         24 |           — |
| `notification-dispatcher` | 5     |        5 |         48 |           — |
| (infra, contracts, SDK)   | 0     |       11 |          — |           — |
| (db, clickhouse)          | 1,4   |        3 |          — |           — |
| (tests, doc, ci)          | 0,3,6 |        9 |          — |           — |
| (merges)                  | 5     |        1 |          — |           — |
| **TOTAL**                 |       | **65+2** |    **258** |     **121** |
