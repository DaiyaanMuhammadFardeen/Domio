# audience — runbook

> Tier-1 service. SLOs and alerts are defined in [`docs/slos/catalogue.md`](../../../slos/catalogue.md).

## Purpose

Audience cross-shard coordinator; session-join + bundle envelope.

## SLOs covered

| SLO | Kind | Target | Window |
|---|---|---|---|
| `avail-audience` | availability | 99.9% | 30d |
| `lat-audience-render-p95` | latency | < 250 ms | 30d |

## Triage

1. Check `/healthz` and `/readyz`.
2. Look at the most recent deploy (check `gh run list`).
3. Open the matching Grafana dashboard (`/d/audience-overview`).
4. Search structured logs by trace_id for the failing request.
5. Confirm OTel exporter is wired: `grep -r 'audience' packages/observability/dist`.

## Common fixes

- Verify Postgres reachability: `psql $DATABASE_URL -c "select 1"`.
- Inspect `audience_session_count` gauge and `audience_join_total` counter.
- Confirm Idempotency-Key dedupe table is not over-filling; truncate if it is.
- **Restart**: `kubectl rollout restart deployment/audience` (or local equivalent).
- **Rollback**: revert to the previous image tag.
- **Scale**: bump replicas if CPU/memory-bound.
- **Drain**: drain a node before maintenance.

## Escalation path

On-call rotation → tech lead → principal architect. See [`docs/runbooks/README.md`](../../README.md) for the rotation table.

## Postmortem

After every Sev1 / Sev2 incident, write a postmortem and link it here.
