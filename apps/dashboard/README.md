# @domio/dashboard

Phase 17 final — Next.js 15 analytics dashboard for Domio.

## Quick start

```bash
pnpm install
pnpm --filter @domio/dashboard dev      # http://localhost:3000
pnpm --filter @domio/dashboard typecheck # tsc --noEmit
pnpm --filter @domio/dashboard test      # vitest run
pnpm --filter @domio/dashboard build      # next build
```

## Routes

- `/overview` — KPI tiles + sparklines (sessions, viewers, avg dwell, completion)
- `/deck/[id]` — DeckSummary + SlideBreakdown sortable table
- `/heatmap` — 32×18 viridis-rendered heatmap (Canvas2D)
- `/ab` — A/B decision table with lift / p-value / 95% CI
- `/crm` — crm-sync adapter health + DLQ depth + idempotency collisions
- `/team` — team-analytics rankings + retention cohort heatmap
- `/live` — live-analytics HUD (graphql-ws subscribe)
- `/benchmarks` — industry benchmarks + MDE power-analysis calculator
- `/export` — streaming CSV / Parquet download

## API surface

- `POST /api/graphql` — graphql-yoga gateway with persisted queries
- `GET  /api/export/csv` — streaming CSV (backpressure-aware)
- `GET  /api/export/parquet` — JSON stub (real encoder lands in Phase 18+)

## Persisted queries

`src/lib/graphql/persisted-queries.json` lists the 8 hashed queries the
dashboard uses (`OverviewKPI`, `DeckSummary`, `SlideBreakdown`,
`FunnelChart`, `HeatmapTile`, `AbTestResults`, `TeamRollup`, `LivePulse`).
Send `extensions.persistedQuery.sha256Hash` to skip shipping the body.

## Environment variables

| Variable                      | Default                 | Purpose                           |
| ----------------------------- | ----------------------- | --------------------------------- |
| `DASHBOARD_PORT`              | `3000`                  | Port for `next start`             |
| `WAREHOUSE_URL`               | `http://localhost:8088` | analytics-warehouse gateway       |
| `AB_ASSIGNMENT_URL`           | `http://localhost:8090` | ab-assignment service             |
| `AB_MEASUREMENT_URL`          | `http://localhost:8091` | ab-measurement service            |
| `AB_STATISTICS_URL`           | `http://localhost:8092` | ab-statistics service             |
| `TEAM_ANALYTICS_URL`          | `http://localhost:8093` | team-analytics service            |
| `LIVE_ANALYTICS_URL`          | `http://localhost:8094` | live-analytics service            |
| `CRM_SYNC_URL`                | `http://localhost:8095` | crm-sync status endpoint          |
| `BENCHMARK_URL`               | `http://localhost:8096` | benchmark service                 |
| `NEXT_PUBLIC_WORKSPACE_ID`    | `ws-demo`               | Workspace header injection        |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | (unset)                 | OTLP collector (no-op when unset) |

## Docker

```bash
docker build -t domio/dashboard -f apps/dashboard/Dockerfile .
docker run --rm -p 3000:3000 domio/dashboard
```

The image is multi-stage: `builder` runs `pnpm install` + `next build`;
`runtime` is a slim Node 22 image that runs `next start`.
