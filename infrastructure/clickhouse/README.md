# Phase 17 — ClickHouse (analytics OLAP warehouse)

ClickHouse cluster for the Phase 17 analytics plane.

## Why ClickHouse (vs. Postgres-only)?

1. **Columnar scan cost.** Per-deck queries over 10M events scan ≤10% of
   the table width because only `view`-relevant columns are touched.
2. **Materialized views with partial state.** `SummingMergeTree` and
   `AggregatingMergeTree` rollups stay live and small (deck_metric_5m is
   one row per deck per 5-min bucket).
3. **Partition drops for retention + GDPR.** `ALTER TABLE ... DROP PARTITION
   'YYYYMM'` is O(1) and atomic; the tombstone table records per-viewer
   deletions for late-arriving events.
4. **TTL + object-store tiering.** Hot 13 months in ClickHouse; cold
   Parquet in object-store for 7 years.

## Layout

- `init/001_phase17_schema.sql` — `events` table (MergeTree) + projections
  + viewer_tombstone + consent_events.
- `init/002_phase17_views.sql` — `session_agg_mv`, `deck_metric_5m`,
  `slide_metric_5m`, `funnel_step_hourly`, `team_metric_mv`.
- `init/003_phase17_heatmap.sql` — `heatmap_tile` + `heatmap_mv`.
- `init/004_phase17_benchmark.sql` — `benchmark_snapshot` +
  `benchmark_cohort_index`.
- `config.xml` — server overrides mounted at
  `/etc/clickhouse-server/config.d/00-phase17.xml`.
- `users.xml` — `domio`, `domio_readonly`, `domio_admin` accounts.

## Local dev

The ClickHouse container is already defined in
`infrastructure/local/docker-compose.yml`. To wire the migrations:

```bash
# 1. Bring up the stack
docker compose -f infrastructure/local/docker-compose.yml up -d clickhouse

# 2. Wait for healthcheck
docker compose ps clickhouse

# 3. Apply migrations via the migrator (lands in Wave 0 commit 5)
make -C infrastructure/migrators/clickhouse migrate-up
```

## Production

Production clusters are 3-node replicated (`internal_replication=true`),
managed by `/infrastructure/terraform/modules/clickhouse/`. The
`domio_analytics_cluster` macro is used by every distributed query; the
single-node dev config in `config.xml` declares a single shard/replica so
the same SQL runs without modification.
