# Phase 17 — ClickHouse migrator

Idempotent migrations for the Phase 17 ClickHouse analytics warehouse.

## Why this exists

The repo's Postgres migration style is "ordered `.sql` files applied by the
service that owns the schema at boot". That works for Postgres because every
service co-locates its own schema. ClickHouse is centralized — every
Phase 17 service reads from the same `domio_analytics` database — so we
need a deterministic migrator that tracks each applied file in a metadata
table (`__migrations`) and refuses to re-apply.

The migrator is forward-only by default; rollback is a best-effort
companion file (`.down.sql`) for the migrations that are reversible.

## Layout

- `src/cli.ts` — entrypoint. Subcommands: `up`, `down`, `status`, `verify`.
- `src/config.ts` — env-driven config (`CLICKHOUSE_URL`, etc.).
- `src/discovery.ts` — discovers `NNNN_<slug>.sql` files in `init/`.
- `src/runner.ts` — applies / reverts migrations, splits multi-statement
  `.sql` files on `;` so we can attribute errors.
- `src/tracker.ts` — `__migrations` table + drift detection.
- `src/cli.test.ts` — Vitest unit tests for the splitter, discovery, and
  checksum utility (no ClickHouse server required).
- `Makefile` — `make migrate-up`, `make migrate-status`, etc.

## Naming convention

```
infrastructure/clickhouse/init/
  001_phase17_schema.sql
  001_phase17_schema.down.sql   # optional — only for reversible migrations
  002_phase17_views.sql
  003_phase17_heatmap.sql
  004_phase17_benchmark.sql
```

## Commands

```bash
# Apply all pending migrations.
make -C infrastructure/migrators/clickhouse migrate-up

# Apply up to a specific ordinal.
pnpm --filter @domio/clickhouse-migrator migrate:up -- --to=0042

# Revert a single migration (requires .down.sql).
make -C infrastructure/migrators/clickhouse migrate-down ONE=0042

# Show applied vs pending.
make -C infrastructure/migrators/clickhouse migrate-status

# Exit non-zero if any applied migration has drifted from disk.
make -C infrastructure/migrators/clickhouse migrate-verify
```

## Drift detection

The tracker records a SHA-256 of every applied file. `migrate:verify` (and
`migrate:up`) refuses to proceed if any applied migration's checksum no
longer matches the file on disk. To fix drift, either revert the on-disk
changes or write a follow-up migration.

## Why not a popular tool

We considered `node-pg-migrate`, `umzug`, and `sqlx` (Go). They either
require a Postgres connection (wrong) or are stateful long-running daemons
(wrong for a one-shot CLI). The migrator is intentionally a single
TypeScript file with one external dep (`@clickhouse/client`) so it stays
in lock-step with the rest of the TS services.
