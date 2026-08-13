# moderation-blocklist — runbook

> Tier-1 service. SLOs and alerts are defined in [`docs/slos/catalogue.md`](../../../slos/catalogue.md).

## Purpose

Real-time moderation blocklist; blocks take effect in < 1 s.

## SLOs covered

| SLO                          | Kind         | Target | Window |
| ---------------------------- | ------------ | ------ | ------ |
| `avail-moderation-blocklist` | availability | 99.9%  | 30d    |

## Triage

1. Check `/healthz` and `/readyz`.
2. Look at the most recent deploy (check `gh run list`).
3. Open the matching Grafana dashboard (`/d/moderation-blocklist-overview`).
4. Search structured logs by trace_id for the failing request.
5. Confirm OTel exporter is wired: `grep -r 'moderation-blocklist' packages/observability/dist`.

## Common fixes

- Blocklist is Redis-backed; confirm replication lag is < 200 ms.
- `moderation_blocklist_apply_ms` should stay well under 50 ms.
- **Restart**: `kubectl rollout restart deployment/moderation-blocklist` (or local equivalent).
- **Rollback**: revert to the previous image tag.
- **Scale**: bump replicas if CPU/memory-bound.
- **Drain**: drain a node before maintenance.

## Escalation path

On-call rotation → tech lead → principal architect. See [`docs/runbooks/README.md`](../../README.md) for the rotation table.

## Postmortem

After every Sev1 / Sev2 incident, write a postmortem and link it here.
