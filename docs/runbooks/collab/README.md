# collab — runbook

> Tier-1 service. SLOs and alerts are defined in [`docs/slos/catalogue.md`](../../../slos/catalogue.md).

## Purpose

Yjs collab room service; awareness + undo + persistence.

## SLOs covered

| SLO            | Kind         | Target | Window |
| -------------- | ------------ | ------ | ------ |
| `avail-collab` | availability | 99.9%  | 30d    |

## Triage

1. Check `/healthz` and `/readyz`.
2. Look at the most recent deploy (check `gh run list`).
3. Open the matching Grafana dashboard (`/d/collab-overview`).
4. Search structured logs by trace_id for the failing request.
5. Confirm OTel exporter is wired: `grep -r 'collab' packages/observability/dist`.

## Common fixes

- Inspect `collab_room_count`, `collab_awareness_total`, and `collab_yjs_update_ms`.
- Persisted-Yjs in Postgres; a stuck snapshot worker stalls every deck.
- **Restart**: `kubectl rollout restart deployment/collab` (or local equivalent).
- **Rollback**: revert to the previous image tag.
- **Scale**: bump replicas if CPU/memory-bound.
- **Drain**: drain a node before maintenance.

## Escalation path

On-call rotation → tech lead → principal architect. See [`docs/runbooks/README.md`](../../README.md) for the rotation table.

## Postmortem

After every Sev1 / Sev2 incident, write a postmortem and link it here.
