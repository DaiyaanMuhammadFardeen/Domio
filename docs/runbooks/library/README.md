# library — runbook

> Tier-1 service. SLOs and alerts are defined in [`docs/slos/catalogue.md`](../../../slos/catalogue.md).

## Purpose

Deck library service; deck CRUD + listing + sharing.

## SLOs covered

| SLO | Kind | Target | Window |
|---|---|---|---|
| `avail-library` | availability | 99.9% | 30d |

## Triage

1. Check `/healthz` and `/readyz`.
2. Look at the most recent deploy (check `gh run list`).
3. Open the matching Grafana dashboard (`/d/library-overview`).
4. Search structured logs by trace_id for the failing request.
5. Confirm OTel exporter is wired: `grep -r 'library' packages/observability/dist`.

## Common fixes

- Check `library_deck_count` and `library_list_p95`.
- p95 budget is generous (200 ms); most regressions come from missing indexes.
- **Restart**: `kubectl rollout restart deployment/library` (or local equivalent).
- **Rollback**: revert to the previous image tag.
- **Scale**: bump replicas if CPU/memory-bound.
- **Drain**: drain a node before maintenance.

## Escalation path

On-call rotation → tech lead → principal architect. See [`docs/runbooks/README.md`](../../README.md) for the rotation table.

## Postmortem

After every Sev1 / Sev2 incident, write a postmortem and link it here.
