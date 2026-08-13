# permission-engine — runbook

> Tier-1 service. SLOs and alerts are defined in [`docs/slos/catalogue.md`](../../../slos/catalogue.md).

## Purpose

Per-resource permission evaluation; < 5 ms p95 target.

## SLOs covered

| SLO                         | Kind         | Target | Window |
| --------------------------- | ------------ | ------ | ------ |
| `avail-permission-engine`   | availability | 99.9%  | 30d    |
| `lat-permission-engine-p95` | latency      | < 5 ms | 30d    |

## Triage

1. Check `/healthz` and `/readyz`.
2. Look at the most recent deploy (check `gh run list`).
3. Open the matching Grafana dashboard (`/d/permission-engine-overview`).
4. Search structured logs by trace_id for the failing request.
5. Confirm OTel exporter is wired: `grep -r 'permission-engine' packages/observability/dist`.

## Common fixes

- Latency budget is tight (5 ms). Profile with `pprof` if p95 drifts above 8 ms.
- Confirm permission cache (Redis) hit ratio is > 95%; invalidate on group changes.
- **Restart**: `kubectl rollout restart deployment/permission-engine` (or local equivalent).
- **Rollback**: revert to the previous image tag.
- **Scale**: bump replicas if CPU/memory-bound.
- **Drain**: drain a node before maintenance.

## Escalation path

On-call rotation → tech lead → principal architect. See [`docs/runbooks/README.md`](../../README.md) for the rotation table.

## Postmortem

After every Sev1 / Sev2 incident, write a postmortem and link it here.
