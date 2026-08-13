# auth — runbook

> Tier-1 service. SLOs and alerts are defined in [`docs/slos/catalogue.md`](../../../slos/catalogue.md).

## Purpose

Authentication; inherited upstream (deferred for P22-beta).

## SLOs covered

| SLO            | Kind         | Target   | Window |
| -------------- | ------------ | -------- | ------ |
| `avail-auth`   | availability | 99.9%    | 30d    |
| `lat-auth-p95` | latency      | < 300 ms | 30d    |

## Triage

1. Check `/healthz` and `/readyz`.
2. Look at the most recent deploy (check `gh run list`).
3. Open the matching Grafana dashboard (`/d/auth-overview`).
4. Search structured logs by trace_id for the failing request.
5. Confirm OTel exporter is wired: `grep -r 'auth' packages/observability/dist`.

## Common fixes

- Catalogue marks this as `inherited` — SLO rolls up from the upstream IdP.
- Local mitigation: refresh-token rotation; check IdP status page first.
- **Restart**: `kubectl rollout restart deployment/auth` (or local equivalent).
- **Rollback**: revert to the previous image tag.
- **Scale**: bump replicas if CPU/memory-bound.
- **Drain**: drain a node before maintenance.

## Escalation path

On-call rotation → tech lead → principal architect. See [`docs/runbooks/README.md`](../../README.md) for the rotation table.

## Postmortem

After every Sev1 / Sev2 incident, write a postmortem and link it here.
