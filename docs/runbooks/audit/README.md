# audit — runbook

> Tier-1 service. SLOs and alerts are defined in [`docs/slos/catalogue.md`](../../../slos/catalogue.md).

## Purpose

Hash-chained audit trail; SEC-owned.

## SLOs covered

| SLO | Kind | Target | Window |
|---|---|---|---|
| `avail-audit` | availability | 99.9% | 30d |

## Triage

1. Check `/healthz` and `/readyz`.
2. Look at the most recent deploy (check `gh run list`).
3. Open the matching Grafana dashboard (`/d/audit-overview`).
4. Search structured logs by trace_id for the failing request.
5. Confirm OTel exporter is wired: `grep -r 'audit' packages/observability/dist`.

## Common fixes

- Audit chain head must advance continuously; if it stalls, page SEC.
- Check `audit_chain_head_lag_blocks` gauge; alert fires above 5.
- **Restart**: `kubectl rollout restart deployment/audit` (or local equivalent).
- **Rollback**: revert to the previous image tag.
- **Scale**: bump replicas if CPU/memory-bound.
- **Drain**: drain a node before maintenance.

## Escalation path

On-call rotation → tech lead → principal architect. See [`docs/runbooks/README.md`](../../README.md) for the rotation table.

## Postmortem

After every Sev1 / Sev2 incident, write a postmortem and link it here.
