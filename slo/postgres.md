# SLO: postgres

Owner: `data-platform@example.com`
Reviewers: SRE on-call + DBA on-call
Window: 28-day rolling

## User journeys

| ID   | Journey                              | Mechanism                            |
|------|--------------------------------------|--------------------------------------|
| PG-1 | Online transactional read            | `SELECT` from app pool               |
| PG-2 | Online transactional write           | `INSERT/UPDATE/DELETE`               |
| PG-3 | Replica catch-up after failover      | Streaming replication                |
| PG-4 | Encrypted backup restore             | Restore from per-env KMS-encrypted snapshot |

## SLIs and SLOs

| SLI                                  | SLO target | Ticket threshold    | Page threshold     |
|--------------------------------------|------------|---------------------|--------------------|
| PG-1 read p99 latency                | 50 ms      | > 100 ms / 6h       | > 250 ms / 5m      |
| PG-2 write p99 latency               | 100 ms     | > 250 ms / 6h       | > 750 ms / 5m      |
| PG-3 replication lag                 | < 5 s p99  | > 30 s / 6h         | > 60 s / 5m        |
| PG-4 backup restore time             | < 30 min for 100 GB | > 60 min / 6h | > 120 min / 5m     |
| PG-x connection-pool saturation      | < 80%      | > 90% / 6h          | > 95% / 5m         |

## Burn-rate alerts

| ALERT ID                | Burn-rate | Window | Action |
|-------------------------|-----------|--------|--------|
| PostgresReadBurnFast    | 14.4×     | 5m     | page   |
| PostgresWriteBurnFast   | 14.4×     | 5m     | page   |
| PostgresReplicationLag  | threshold | 5m     | page   |

## Measurement details

- **Source**: `pg_stat_statements` (slow query log) → OTel collector →
  Prometheus; replication lag from `pg_stat_replication`.
- **Pool saturation**: derived from `pg_stat_activity` counts vs
  `max_connections`.
- **Backup restore**: SLO is gated by *nightly* restore drills; the
  Prom rule only fires if a live restore is taking too long.

## Notes

PG is our *one true source of consistency*. We do **not** count audit
log writes against the write latency SLI — audit writes are async and
have their own budget.
