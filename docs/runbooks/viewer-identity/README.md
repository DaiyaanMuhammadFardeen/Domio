# viewer-identity — runbook

> Tier-1 service. SLOs and alerts are defined in [`docs/slos/catalogue.md`](../../../slos/catalogue.md).

## Purpose

Anonymous viewer identity; ephemeral viewer tokens.

## SLOs covered

| SLO | Kind | Target | Window |
|---|---|---|---|
| `avail-viewer-identity` | availability | 99.9% | 30d |

## Triage

1. Check `/healthz` and `/readyz`.
2. Look at the most recent deploy (check `gh run list`).
3. Open the matching Grafana dashboard (`/d/viewer-identity-overview`).
4. Search structured logs by trace_id for the failing request.
5. Confirm OTel exporter is wired: `grep -r 'viewer-identity' packages/observability/dist`.

## Common fixes

- Viewer tokens are short-lived (15 min); rotate window is intentional.
- `viewer_identity_mint_p95` budget: < 10 ms.
- **Restart**: `kubectl rollout restart deployment/viewer-identity` (or local equivalent).
- **Rollback**: revert to the previous image tag.
- **Scale**: bump replicas if CPU/memory-bound.
- **Drain**: drain a node before maintenance.

## Escalation path

On-call rotation → tech lead → principal architect. See [`docs/runbooks/README.md`](../../README.md) for the rotation table.

## Postmortem

After every Sev1 / Sev2 incident, write a postmortem and link it here.
