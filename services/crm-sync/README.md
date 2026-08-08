# crm-sync

Phase 17 W7 — CRM sync worker.

Reads CRM sync events from NATS JetStream, applies the per-(workspace,
provider) field map, and pushes records to the configured CRM
(HubSpot, Salesforce, Intercom, Outreach, …). Writes each sync
result to ClickHouse `crm_sync_record` for audit and to the
`crm.dlq` NATS subject after exhausting retries.

## Layout

```
cmd/crm-sync/main.go           — entrypoint
internal/registry/             — adapter plugin registry
internal/sync/                 — orchestrator
internal/model/                — domain types
internal/ratelimit/            — token bucket
internal/idem/                 — idempotency keys
internal/dlq/                  — NATS DLQ publisher
internal/clickhouse/           — ClickHouse writer
internal/observability/        — logger + tracing
```

## Idempotency

`sha256(workspace_id | viewer_id_key | event_name | event_id)` is
stored on `crm_sync_record.idempotency_key`. Collisions indicate a
replay and the sync is skipped.
