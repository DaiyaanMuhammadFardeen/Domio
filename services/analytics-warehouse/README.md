# analytics-warehouse (Phase 17 W2)

Read API + rollup orchestrator over ClickHouse.

The warehouse exposes the same data the dashboard renders through two
surfaces:

1. **REST** (for curl-style smoke tests and older clients)
2. **GraphQL** (for the dashboard, via persisted queries)

Both paths funnel through the same `AnalyticsDao` so SQL lives in
exactly one place.

## Layout

```
services/analytics-warehouse/
├── src/
│   ├── client/clickhouse.ts    # HTTP client (param substitution)
│   ├── dao/queries.ts          # SQL + parameterisation
│   ├── graphql/                # GraphQL schema + resolvers
│   ├── routes/                 # REST routes + health
│   ├── rollup/orchestrator.ts  # hourly + nightly cron
│   ├── server.ts               # Hono app factory
│   └── main.ts                 # node:http entrypoint
└── Dockerfile
```

## Endpoints

| Method | Path                                        | Notes                                     |
| ------ | ------------------------------------------- | ----------------------------------------- |
| GET    | `/v1/decks/summary`                         | `?workspace_id=&from_ms=&to_ms=&deck_id=` |
| GET    | `/v1/decks/:deckId/slides`                  | `?workspace_id=&from_ms=&to_ms=`          |
| GET    | `/v1/decks/:deckId/funnel`                  | `?steps=dwell,scroll,click&...`           |
| GET    | `/v1/decks/:deckId/slides/:slideId/heatmap` | `?workspace_id=&from_ms=&to_ms=`          |
| POST   | `/graphql`                                  | see `graphql/schema.ts`                   |
| GET    | `/healthz` / `/readyz`                      | ClickHouse ping included                  |

## Rollup

The orchestrator runs in process and is safe to run multiple replicas
of (idempotent on each table). It honours:

| Cadence | Action                                                                     |
| ------- | -------------------------------------------------------------------------- |
| Hourly  | `OPTIMIZE TABLE FINAL` on `events`, `session_agg_mv`, `slide_metric_5m`    |
| Nightly | `TRUNCATE TABLE benchmark_snapshot` (re-populated by the benchmark worker) |

## Configuration

| Env                   | Default                 | Notes                                      |
| --------------------- | ----------------------- | ------------------------------------------ |
| `CLICKHOUSE_URL`      | `http://localhost:8123` | HTTP endpoint                              |
| `CLICKHOUSE_DB`       | `domio_analytics`       |                                            |
| `CLICKHOUSE_USER`     | `default`               |                                            |
| `CLICKHOUSE_PASSWORD` | ``                      |                                            |
| `PORT`                | `3030`                  |                                            |
| `READ_ONLY`           | `true`                  | adds `readonly = 1` setting to every query |

## Run

```bash
pnpm --filter @domio/analytics-warehouse test
pnpm --filter @domio/analytics-warehouse build
node services/analytics-warehouse/dist/main.js
```
