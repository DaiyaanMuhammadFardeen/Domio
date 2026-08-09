# edge-pubsub — runbook

> Tier-1 service. SLOs and alerts are defined in [`docs/slos/catalogue.md`](../../../slos/catalogue.md).

## Purpose

Edge-side pub/sub bridge for low-latency event fanout.

## SLOs covered

| SLO | Kind | Target | Window |
|---|---|---|---|
| `avail-edge-pubsub` | availability | 99.9% | 30d |

## Triage

1. Check `/healthz` and `/readyz`.
2. Look at the most recent deploy (check `gh run list`).
3. Open the matching Grafana dashboard (`/d/edge-pubsub-overview`).
4. Search structured logs by trace_id for the failing request.
5. Confirm OTel exporter is wired: `grep -r 'edge-pubsub' packages/observability/dist`.

## Common fixes

- Check `pubsub_publish_total` and `pubsub_publish_err_total`.
- Edge-pubsub sits on the hot path — never restart a single instance without draining.
- **Restart**: `kubectl rollout restart deployment/edge-pubsub` (or local equivalent).
- **Rollback**: revert to the previous image tag.
- **Scale**: bump replicas if CPU/memory-bound.
- **Drain**: drain a node before maintenance.

## Escalation path

On-call rotation → tech lead → principal architect. See [`docs/runbooks/README.md`](../../README.md) for the rotation table.

## Postmortem

After every Sev1 / Sev2 incident, write a postmortem and link it here.
