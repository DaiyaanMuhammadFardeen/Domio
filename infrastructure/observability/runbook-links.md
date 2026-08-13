# Phase 17 — Alert -> runbook quick-link table

This file maps every Phase 17 PagerDuty alert to its corresponding
section in [`docs/analytics-runbook.md`](../../docs/analytics-runbook.md).
Keep this table in sync whenever an alert is added, renamed, or
re-routed.

| Alert                               | PagerDuty severity | Runbook anchor                                                   | Suspected services              |
| ----------------------------------- | ------------------ | ---------------------------------------------------------------- | ------------------------------- |
| `ingest-lag-page`                   | critical (page)    | [`#ingest-lag`](#ingest-lag)                                     | event-ingest, clickhouse-loader |
| `clickhouse-replication-lag-warn`   | warning            | [`#clickhouse-replication-lag`](#clickhouse-replication-lag)     | clickhouse                      |
| `crm-dlq-depth-page`                | critical (page)    | [`#crm-dlq-depth`](#crm-dlq-depth)                               | crm-sync, crm-reconciler        |
| `ab-sequential-test-stuck-warn`     | warning            | [`#ab-sequential-stuck`](#ab-sequential-stuck)                   | ab-statistics, ab-measurement   |
| `benchmark-ingestion-error-warn`    | warning            | [`#benchmark-ingest-error-rate`](#benchmark-ingest-error-rate)   | benchmark                       |
| `Ingest p95 > 5s`                   | critical (page)    | [`#ingest-p95-latency`](#ingest-p95-latency)                     | event-ingest                    |
| `Ingest 5xx rate > 1%`              | critical (page)    | [`#ingest-5xx-rate`](#ingest-5xx-rate)                           | event-ingest                    |
| `Kafka producer lag`                | warning            | [`#kafka-producer-lag`](#kafka-producer-lag)                     | event-ingest, kafka             |
| `Backpressure spool > 5 GB`         | warning            | [`#ingest-backpressure`](#ingest-backpressure)                   | event-ingest                    |
| `Columnar loader lag > 60s`         | critical (page)    | [`#columnar-loader-stuck`](#columnar-loader-stuck)               | clickhouse-loader               |
| `GDPR erasure lag > 24h`            | critical (page)    | [`#gdpr-erasure-lag`](#gdpr-erasure-lag)                         | viewer-identity                 |
| `Identity merge collision rate`     | warning            | [`#identity-merge-collisions`](#identity-merge-collisions)       | viewer-identity                 |
| `Sessionization consumer lag`       | warning            | [`#sessionization-lag`](#sessionization-lag)                     | sessionization                  |
| `Bot tag false positive > 0.5%`     | warning            | [`#bot-tag-false-positive`](#bot-tag-false-positive)             | sessionization                  |
| `Heatmap refresh SLO breached`      | warning            | [`#heatmap-refresh-slo`](#heatmap-refresh-slo)                   | heatmap-generator               |
| `A/B assignment p95 > 5ms`          | warning            | [`#ab-assignment-latency`](#ab-assignment-latency)               | ab-assignment                   |
| `A/B cross-workspace contamination` | critical (page)    | [`#ab-cross-workspace-leak`](#ab-cross-workspace-leak)           | ab-assignment                   |
| `CRM sync failure rate > 1%`        | warning            | [`#crm-sync-failures`](#crm-sync-failures)                       | crm-sync                        |
| `Notification trigger p95 > 10s`    | warning            | [`#notification-trigger-latency`](#notification-trigger-latency) | notification-dispatcher         |
| `Notification rate-limit bypass`    | critical (page)    | [`#notification-rate-limit`](#notification-rate-limit)           | notification-dispatcher         |
| `Team rollup job missed`            | warning            | [`#team-rollup-missed`](#team-rollup-missed)                     | team-analytics                  |
| `Live HUD p95 > 1s`                 | warning            | [`#live-hud-latency`](#live-hud-latency)                         | live-analytics                  |
| `Dashboard query p95 > 800ms`       | warning            | [`#dashboard-query-latency`](#dashboard-query-latency)           | analytics-warehouse, dashboard  |
| `Benchmark nightly job missed`      | warning            | [`#benchmark-rollup-missed`](#benchmark-rollup-missed)           | benchmark, benchmark-rollup     |

## Dashboards

| Dashboard                 | URL                                                        |
| ------------------------- | ---------------------------------------------------------- |
| Phase 17 analytics (prod) | <https://grafana.domio.internal/d/phase-17-analytics-prod> |
| Phase 17 analytics (dev)  | <https://grafana.dev.domio.internal/d/phase-17-analytics>  |

## PagerDuty services

| Service                   | PagerDuty service key                |
| ------------------------- | ------------------------------------ |
| `analytics` (master)      | `pd-service:analytics`               |
| `event-ingest`            | `pd-service:event-ingest`            |
| `analytics-warehouse`     | `pd-service:analytics-warehouse`     |
| `viewer-identity`         | `pd-service:viewer-identity`         |
| `sessionization`          | `pd-service:sessionization`          |
| `heatmap-generator`       | `pd-service:heatmap-generator`       |
| `team-analytics`          | `pd-service:team-analytics`          |
| `live-analytics`          | `pd-service:live-analytics`          |
| `notification-dispatcher` | `pd-service:notification-dispatcher` |
| `clickhouse-loader`       | `pd-service:clickhouse-loader`       |
| `ab-assignment`           | `pd-service:ab-assignment`           |
| `ab-measurement`          | `pd-service:ab-measurement`          |
| `ab-statistics`           | `pd-service:ab-statistics`           |
| `crm-sync`                | `pd-service:crm-sync`                |
| `benchmark`               | `pd-service:benchmark`               |
| `dashboard`               | `pd-service:dashboard`               |
