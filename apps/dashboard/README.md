# Domio Dashboard (`apps/dashboard`)

> **Phase 17 — Analytics & Engagement Intelligence.** The owner-facing
> control surface for every analytics plane service. Built with
> Next.js 15 (App Router), Tailwind CSS, GraphQL Yoga, and the shared
> `@domio/chart` package.

The dashboard consumes the analytics plane via a single GraphQL gateway
that fans out to Postgres (control plane) and ClickHouse (analytics).
See [`docs/architecture/phase-17-data-flow.md`](../../docs/architecture/phase-17-data-flow.md)
for the full pipeline and [`docs/analytics-runbook.md`](../../docs/analytics-runbook.md)
for the on-call playbook.

---

## Quick start

```bash
# 1. Install dependencies (workspace root)
pnpm install

# 2. Bring up the analytics dependencies
docker compose -f infrastructure/docker-compose.yml up -d \
  postgres redis nats clickhouse kafka

# 3. Run migrations (Postgres + ClickHouse)
make migrate-up
make migrate-up-clickhouse

# 4. Run the dashboard in dev mode
pnpm --filter @domio/dashboard dev

# 5. Open
#    Dashboard:  http://localhost:3010
#    GraphQL:    http://localhost:3010/api/graphql
#    Health:     http://localhost:3010/api/healthz
```

---

## Routes

The dashboard ships seven routes surfaced through the GraphQL gateway:

| Route               | Purpose                                                | GraphQL query class            |
|---------------------|--------------------------------------------------------|--------------------------------|
| `/overview`         | workspace KPI tiles + recent decks                     | `OverviewQuery`                |
| `/deck/[id]`        | per-deck drill-down (dwell, drop-off, click overlay)   | `DeckDetailQuery`              |
| `/heatmap`          | scroll-mode attention heatmaps                         | `HeatmapQuery`                 |
| `/ab`               | A/B experiments — per-variant metrics, declare winner  | `ABExperimentQuery`            |
| `/crm`              | CRM sync health + per-provider failure rate            | `CRMSyncStatusQuery`           |
| `/team`             | team analytics — template / component / brand rankings | `TeamAnalyticsQuery`           |
| `/live`             | live session HUD + post-session summary                | `LiveSessionQuery`             |
| `/benchmarks`       | anonymized cohort benchmarks (p25/50/75/95)            | `BenchmarkQuery`               |
| `/exports`          | CSV / Parquet export of per-viewer analytics           | `AnalyticsExportMutation`      |

Each route persists its GraphQL query (`persistedQuery`); the gateway
hashes the query body and short-circuits to the cached result when
the hash matches.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                       apps/dashboard (Next.js 15)                    │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  App Router pages  ─►  React Server Components                  │  │
│  │       │                                                         │  │
│  │       ▼                                                         │  │
│  │  Yoga GraphQL gateway  (apps/dashboard/src/app/api/graphql/)    │  │
│  │       │                                                         │  │
│  │       ├──► Postgres  (control plane, viewer / deck / ab)        │  │
│  │       └──► ClickHouse  (analytics warehouse, MVs)                │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                              ▲
                              │
                ┌─────────────┴────────────────┐
                │  services/analytics-warehouse │
                │  + services/{ab,crm,heatmap,  │
                │   team,live,benchmark}        │
                └──────────────────────────────┘
```

### Refresh model

| Indicator                          | Refresh cadence                |
|------------------------------------|--------------------------------|
| Live HUD counts                    | 1 s WebSocket (graphql-ws)     |
| Deck overview KPIs                 | 30 s polling                   |
| Per-slide drilldown                | on-demand                      |
| Heatmap                            | on-demand + 60 s on `session.ended` |
| A/B live primary metric            | 5 s polling                    |
| Team analytics rankings            | 24 h (nightly rollup)          |
| Benchmark percentiles              | 24 h cache                     |

### Persisted queries

`apps/dashboard/src/app/api/graphql/persisted/` holds the SHA-256 hash
of every GraphQL query the dashboard can issue. The gateway uses the
hash as the cache key; cache TTLs follow the refresh cadence above.

---

## Accessibility

The dashboard conforms to WCAG 2.1 AA. Every route is verified by:

- **axe-core** — 0 serious / 0 critical violations on every page.
- **Manual screen-reader pass** — VoiceOver + NVDA.
- **Keyboard-only navigation** — all interactive elements reachable
  without a mouse.

Run the local scan:

```bash
pnpm --filter @domio/dashboard start &
sleep 5
node tests/axe/run-axe.mjs http://localhost:3010 \
  --config .axe/config.json --fail-on serious critical
```

The CI equivalent lives at
[`.github/workflows/dashboard-build.yml`](../../.github/workflows/dashboard-build.yml).

---

## Testing

| Layer             | Tool                      | Command                                                                |
|-------------------|---------------------------|------------------------------------------------------------------------|
| Unit              | Vitest                    | `pnpm --filter @domio/dashboard test`                                  |
| GraphQL contract  | GraphQL Inspector         | `pnpm --filter @domio/dashboard test:contracts`                        |
| E2E               | Playwright                | `pnpm --filter @domio/dashboard test:e2e`                              |
| A11y              | axe-core                  | `pnpm --filter @domio/dashboard test:a11y`                             |
| Load (10k concurrent) | k6                    | `k6 run tests/load/k6/dashboard-10k.js`                                |

The dashboard-load test lives at
[`tests/load/k6/dashboard-10k.js`](../../tests/load/k6/dashboard-10k.js).

---

## Telemetry

- **OTel** — every GraphQL resolver is traced via `event_id` propagated
  from the analytics SDK; spans flow into the `dashboard.resolver` service.
- **Prom metrics** — `analytics_dashboard_resolver_seconds_bucket{resolver}`,
  `analytics_dashboard_cache_hits_total{query}`,
  `analytics_dashboard_errors_total{resolver,code}`.
- **Grafana dashboard** — `phase-17-analytics.json` includes a
  dashboard-tab panel group.
- **SLOs** — see [`slo/phase-17.md`](../../slo/phase-17.md) §A-6.

---

## References

- Phase 17 spec — [`docs/development_phases/phase-17-spec.md`](../../docs/development_phases/phase-17-spec.md)
- Architecture data-flow — [`docs/architecture/phase-17-data-flow.md`](../../docs/architecture/phase-17-data-flow.md)
- Analytics runbook — [`docs/analytics-runbook.md`](../../docs/analytics-runbook.md)
- Phase 17 SLOs — [`slo/phase-17.md`](../../slo/phase-17.md)
- Phase 17 DoD — [`docs/development_phases/phase-17-dod.md`](../../docs/development_phases/phase-17-dod.md)
- Phase 17 verification log — [`docs/development_phases/phase-17-verification.md`](../../docs/development_phases/phase-17-verification.md)
