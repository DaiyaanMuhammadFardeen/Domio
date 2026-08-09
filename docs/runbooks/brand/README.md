# brand — runbook

> Tier-1 service. SLOs and alerts are defined in [`docs/slos/catalogue.md`](../../../slos/catalogue.md).

## Purpose

Brand / theme registry; brand tokens + asset resolution.

## SLOs covered

| SLO | Kind | Target | Window |
|---|---|---|---|
| `avail-brand` | availability | 99.9% | 30d |

## Triage

1. Check `/healthz` and `/readyz`.
2. Look at the most recent deploy (check `gh run list`).
3. Open the matching Grafana dashboard (`/d/brand-overview`).
4. Search structured logs by trace_id for the failing request.
5. Confirm OTel exporter is wired: `grep -r 'brand' packages/observability/dist`.

## Common fixes

- Brand assets are CDN-fronted; check CDN cache-hit ratio.
- Token resolution budget: < 20 ms p95.
- **Restart**: `kubectl rollout restart deployment/brand` (or local equivalent).
- **Rollback**: revert to the previous image tag.
- **Scale**: bump replicas if CPU/memory-bound.
- **Drain**: drain a node before maintenance.

## Escalation path

On-call rotation → tech lead → principal architect. See [`docs/runbooks/README.md`](../../README.md) for the rotation table.

## Postmortem

After every Sev1 / Sev2 incident, write a postmortem and link it here.
