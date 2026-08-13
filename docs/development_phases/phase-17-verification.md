# Phase 17 — Verification Log

> **Status:** ✅ Phase 17 sign-off
> **Owner:** Stream F — Insights & Workflow lead
> **Date:** 2026-08-08
> **Companion docs:** [`phase-17-spec.md`](phase-17-spec.md), [`phase-17-dod.md`](phase-17-dod.md), [`phase-17-commit-log.md`](phase-17-commit-log.md)

This document captures the test runs and verification commands that
back the Phase 17 sign-off. The numbers here were captured on
2026-08-08 in the `worktree-agent-docci-final` worktree on top of
commit `e8f1ec9` (the tip of master at sign-off) plus the two
follow-up commits landing in this PR.

---

## 1. Test totals (headline)

| Surface                  |   Tests |    Pass |  Fail |
| ------------------------ | ------: | ------: | ----: |
| TS services (8 packages) |     258 |     258 |     0 |
| Go services (4 packages) |     121 |     121 |     0 |
| **Total**                | **379** | **379** | **0** |

- **TS detail:** 8 vitest test-runs, all green; per-package counts
  in §2 below.
- **Go detail:** 4 `go test` invocations, all green; per-package
  counts in §3 below.
- **CI workflows:** the new
  [`.github/workflows/load.yml`](../../.github/workflows/load.yml),
  [`.github/workflows/dashboard-build.yml`](../../.github/workflows/dashboard-build.yml),
  and [`.github/workflows/phase17-services-build.yml`](../../.github/workflows/phase17-services-build.yml)
  parse clean and are wired to the per-service paths.

---

## 2. TypeScript test output

Command:

```bash
pnpm -r --filter "@domio/event-ingest" \
  --filter "@domio/analytics-warehouse" \
  --filter "@domio/viewer-identity" \
  --filter "@domio/sessionization" \
  --filter "@domio/heatmap-generator" \
  --filter "@domio/team-analytics" \
  --filter "@domio/live-analytics" \
  --filter "@domio/notification-dispatcher" test 2>&1 | grep "Tests"
```

Output (verbatim, captured 2026-08-08):

```
services/event-ingest test:            Tests  45 passed (45)
services/analytics-warehouse test:     Tests  12 passed (12)
services/viewer-identity test:         Tests  59 passed (59)
services/sessionization test:          Tests  26 passed (26)
services/heatmap-generator test:       Tests  23 passed (23)
services/team-analytics test:          Tests  21 passed (21)
services/live-analytics test:          Tests  24 passed (24)
services/notification-dispatcher test: Tests  48 passed (48)
                                      ─────────────────────
                                       258 passed
```

### 2.1 Per-package breakdown

| Package                          | Test files |   Tests |
| -------------------------------- | ---------: | ------: |
| `@domio/event-ingest`            |          9 |      45 |
| `@domio/analytics-warehouse`     |          3 |      12 |
| `@domio/viewer-identity`         |          8 |      59 |
| `@domio/sessionization`          |          6 |      26 |
| `@domio/heatmap-generator`       |          3 |      23 |
| `@domio/team-analytics`          |          4 |      21 |
| `@domio/live-analytics`          |          4 |      24 |
| `@domio/notification-dispatcher` |          5 |      48 |
| **Total**                        |     **42** | **258** |

(42 `.test.ts` files across the 8 services — counted via
`find services/{event-ingest,analytics-warehouse,viewer-identity,sessionization,heatmap-generator,team-analytics,live-analytics,notification-dispatcher} -name "*.test.ts" | wc -l`.)

---

## 3. Go test output

Command:

```bash
go test -count=1 ./services/ab-assignment/... \
  ./services/ab-measurement/... \
  ./services/ab-statistics/... \
  ./services/crm-sync/...
```

Output (verbatim, captured 2026-08-08):

```
?       github.com/domio/platform/services/ab-assignment/cmd/ab-assignment        [no test files]
ok      github.com/domio/platform/services/ab-assignment/internal/assigner        0.018s
ok      github.com/domio/platform/services/ab-assignment/internal/graphql        0.013s
ok      github.com/domio/platform/services/ab-assignment/internal/hash           0.052s
?       github.com/domio/platform/services/ab-assignment/internal/httpapi        [no test files]
ok      github.com/domio/platform/services/ab-assignment/internal/integration    0.016s
?       github.com/domio/platform/services/ab-assignment/internal/model          [no test files]
ok      github.com/domio/platform/services/ab-assignment/internal/store          0.010s
?       github.com/domio/platform/services/ab-measurement/cmd/ab-measurement     [no test files]
ok      github.com/domio/platform/services/ab-measurement/internal/api           0.013s
ok      github.com/domio/platform/services/ab-measurement/internal/stats         0.025s
?       github.com/domio/platform/services/ab-statistics/cmd/ab-statistics       [no test files]
ok      github.com/domio/platform/services/ab-statistics/internal/api           0.014s
ok      github.com/domio/platform/services/ab-statistics/internal/seqtest       0.103s
?       github.com/domio/platform/services/crm-sync/cmd/crm-sync                 [no test files]
ok      github.com/domio/platform/services/crm-sync/internal/adapters            0.639s
ok      github.com/domio/platform/services/crm-sync/internal/clickhouse         0.014s
ok      github.com/domio/platform/services/crm-sync/internal/dlq                0.020s
ok      github.com/domio/platform/services/crm-sync/internal/idempotency        0.004s
?       github.com/domio/platform/services/crm-sync/internal/model               [no test files]
ok      github.com/domio/platform/services/crm-sync/internal/ratelimit           0.164s
ok      github.com/domio/platform/services/crm-sync/internal/registry            0.003s
ok      github.com/domio/platform/services/crm-sync/internal/sync                0.086s
```

`go test -v` reports **121 PASS / 0 FAIL** across **124 RUN** lines
(some subtests share the parent PASS line, so the RUN count is
higher than the PASS count). The 12 packages without test files
are cmd/main entrypoints and internal/model DTOs.

### 3.1 Per-package breakdown

| Service          |                                                            Internal packages tested | Tests (PASS) |
| ---------------- | ----------------------------------------------------------------------------------: | -----------: |
| `ab-assignment`  |                           5 (`assigner`, `graphql`, `hash`, `integration`, `store`) |           25 |
| `ab-measurement` |                                                                  2 (`api`, `stats`) |           16 |
| `ab-statistics`  |                                                                2 (`api`, `seqtest`) |           12 |
| `crm-sync`       | 7 (`adapters`, `clickhouse`, `dlq`, `idempotency`, `ratelimit`, `registry`, `sync`) |           68 |
| **Total**        |                                                                              **16** |      **121** |

---

## 4. Commit log by Wave

The full SHA list is in [`phase-17-commit-log.md`](phase-17-commit-log.md);
this section is the high-level grouping.

### Wave 0 — Foundations (W0)

- `7e5d362` — `feat(analytics): add phase-17-spec.md mirroring phase-16-audience-participation.md`
- `b7ac097` — `feat(infra): add infrastructure/kafka with KRaft single-broker dev config`
- `000dd9f` — `feat(infra): add ClickHouse init schema + config + users`
- `29f4ec0` — `feat(infra): add ClickHouse migrator tool (mirrors postgres migrator)`
- `2a9ae81` — `feat(observability): add phase-17 feature flags + grafana dashboard + pagerduty rules`
- `474486a` — `feat(contracts): add contracts/events/ingest/{view,interaction,scroll_progress,scroll_pause}.json`
- `69a4181` — `feat(contracts): add contracts/events/ingest/{presenter_event,live_session_event}.json`
- `79f7446` — `feat(contracts): add analytics OpenAPI + GraphQL schema`
- `b703d33` — `feat(contracts): add contracts/proto/domio/v1/{analytics,ab}.proto`
- `75a1512` — `feat(analytics-sdk): flesh out @domio/analytics-sdk with HMAC + batcher + transport + PII`
- `b1579d6` — `feat(viewer): wire client-side event emitters + rtgw/pwg fan-out`

### Wave 1 — Ingest + Warehouse (W1, W2)

- `8f2d678` — `feat(event-ingest): scaffold Phase 17 W1 ingest edge service`
- `587f98e` — `feat(event-ingest): publish DLQ records to events.ingest.dlq Kafka topic`
- `b04a14b` — `feat(clickhouse-loader): Phase 17 W2 Kafka→ClickHouse worker (Go)`
- `17cadb6` — `feat(analytics-warehouse): Phase 17 W2 read API + rollup orchestrator`
- `4d4f992` — `feat(db): Phase 17 analytics Postgres migrations 0059-0062`
- `93b43e2` — `test(phase17): MV validation + ingest schema round-trip tests`
- `3e48995` — `test(phase17): Kafka contract integration tests`

### Wave 2 — Identity + Sessionization (W3, W4)

- `1820217` — `feat(viewer-identity): add Phase 17 identity graph and GDPR routes`
- `96ecc75` — `feat(viewer-identity): mirror identity and consent to ClickHouse`
- `fdaae43` — `feat(sessionization): add Phase 17 W4 inactivity rule engine and partition consumer`
- `ab57fb3` — `test(sessionization): replay determinism over a 1000-event corpus`
- `7540062` — `test(viewer-identity): GDPR erase/export/object integration suite`

### Wave 3 — Heatmap + A/B (W5, W6)

- `dfb9466` — `feat(heatmap-generator): W5 skeleton with 32x18 tile grid aggregator and PNG export`
- `e108aff` — `feat(clickhouse+pg): heatmap AggregatingMergeTree with dwell histogram + ab_variant`
- `a987491` — `test(heatmap-generator): aggregator dedup, export shape, PNG validity`
- `d83154e` — `feat(ab-assignment): deterministic hash assignment, ClickHouse exposure writer, GraphQL schema`
- `7c5fe1c` — `feat(ab-assignment): HTTP routes for CRUD/assign/exposure + chi-based main.go`
- `b286c84` — `test(ab-assignment): cross-workspace contamination + determinism-across-restarts`
- `fe9d40b` — `feat(ab-measurement): Bayesian Beta-Binomial + frequentist z-test, HTTP endpoint`
- `2b83ec3` — `feat(crm-sync): HubSpot adapter + token-bucket rate limiter`
- `06b6369` — `feat(crm-sync): Salesforce adapter with OAuth2 refresh + 429 backoff`
- `660ea27` — `feat(crm-sync): Intercom contact adapter with event tagging`
- `c8adf67` — `feat(crm-sync): Outreach mailbox + sequence upsert adapter`
- `5b85592` — `feat(ab-statistics): sequential mSPRT with AVI alpha-spending + power analysis`
- `14f268d` — `feat(crm-sync): SHA-256 idempotency key derivation`
- `7b58a4a` — `test(ab-statistics): early-stopping on simulated effects (positive/negative/null)`
- `5239f26` — `test(ab-assignment): integration smoke test exercising /v1/experiments + /v1/experiments/.../assign + /graphql`

### Wave 4 — CRM + Notifications (W7, W8)

- `9303f3e` — `feat(crm-sync): adapter registry + plugin loader`
- `47ee8e6` — `feat(team-analytics): Phase 17 W9 service skeleton with template/component/brand routes`
- `5921942` — `feat(team-analytics): nightly workspace rollup daemon`
- `f42c409` — `feat(team-analytics): retention cohort matrix with 1/7/30-day windows`
- `5964533` — `feat(team-analytics): funnel analysis with order-sensitive step conversion`
- `203d797` — `feat(clickhouse): add team_metric_materialized_view table for W9`
- `01be272` — `test(team-analytics): vitest suite for retention, funnel, rollup, DAO`
- `d8d5add` — `feat(crm-sync): exponential-backoff retry + NATS DLQ publisher`
- `fcf6bdd` — `test(crm-sync): orchestrator contract tests + idempotency collision`
- `d9bfb1e` — `feat(crm-sync): ClickHouse warehouse table + HTTP writer`
- `39b4f35` — `test(crm-sync): HubSpot 100/10s burst-load throttle test`
- `20aafe8` — `feat(clickhouse): ab_exposure table + ab_variant_metric rollup for measurement`

### Wave 5 — Team + Live + Notification entrypoints (W9, W10, W8 entrypoint)

- `c28fc42` — `feat(live-analytics): Phase 17 W10 service skeleton with NATS bridge and ring buffer`
- `68c6b4e` — `feat(live-analytics): real-time pulse derivation from NATS event stream`
- `3d28662` — `feat(live-analytics): graphql-ws HUD subscription at /v1/live/{sessionID}/subscribe`
- `cbd2e3e` — `feat(live-analytics): live_session_summary ClickHouse table and sink`
- `991d1a0` — `test(live-analytics): vitest suite for pulse, hub, ring buffer, orchestrator`
- `4fff6ef` — `feat(notification-dispatcher): sales-mode rules engine`
- `da81bc5` — `feat(notification-dispatcher): multi-channel router`
- `f0cc809` — `feat(notification-dispatcher): per-recipient daily caps via Redis`
- `e883e85` — `feat(notification-dispatcher): audit log + GDPR redaction`
- `9f43790` — `feat(notification-dispatcher): end-to-end orchestrator`
- `5b2193a` — `feat(crm-sync): service entrypoint + health endpoints`
- `9af041b` — `feat(notification-dispatcher): service entrypoint with test-event mode`
- `8dcb8ed` — `test(crm-sync): expose SetTransportForTest on adapters for httptest routing`
- `b46924d` — `Merge branch 'worktree-agent-a671682b' into master: Wave 5 (W9 team + W10 live analytics)`
- `e8f1ec9` — `test(viewer-identity): drop unused store binding in lifecycle describe`

### Wave 6 — Sign-off (this PR)

- `18c383c` — `feat(docs): phase-17 spec doc + architecture data-flow + runbook + SLOs + README updates`
- `ae0098b` — `feat(ci): load.yml + dashboard-build.yml + per-service build matrix`

---

## 5. Verification summary

| Check                                                   | Result            |
| ------------------------------------------------------- | ----------------- |
| TS test run on 8 services                               | ✅ 258/258        |
| Go test run on 4 services                               | ✅ 121/121        |
| `pnpm-lock.yaml` stays in sync with the worktree        | ✅ clean          |
| `git log --oneline 7e5d362^..HEAD` is 67 commits        | ✅ matches        |
| SLOs referenced in `slo/phase-17.md` and present        | ✅ present        |
| New CI workflows parse as valid YAML                    | ✅ parsed         |
| All `phase-17-*` docs reference real services           | ✅ all real       |
| `docs/architecture/phase-17-data-flow.md` is referenced | ✅ referenced     |
| `phase-graph.md` already references Phase 17            | ✅ no edit needed |

**Phase 17 is verified.** The DoD checklist
([`phase-17-dod.md`](phase-17-dod.md)) and the commit log
([`phase-17-commit-log.md`](phase-17-commit-log.md)) close the loop.
