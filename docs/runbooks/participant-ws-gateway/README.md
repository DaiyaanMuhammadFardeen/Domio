# participant-ws-gateway — runbook

> Tier-1 service. SLOs and alerts are defined in [`docs/slos/catalogue.md`](../../../slos/catalogue.md).

## Purpose

WebSocket gateway for audience participation (poll, qa, quiz, reactions, nav-vote, sentiment).

## SLOs covered

| SLO | Kind | Target | Window |
|---|---|---|---|
| `avail-participant-ws` | availability | 99.9% | 30d |

## Triage

1. Check `/healthz` and `/readyz`.
2. Look at the most recent deploy (check `gh run list`).
3. Open the matching Grafana dashboard (`/d/participant-ws-gateway-overview`).
4. Search structured logs by trace_id for the failing request.
5. Confirm OTel exporter is wired: `grep -r 'participant-ws-gateway' packages/observability/dist`.

## Common fixes

- Inspect `/metrics` for `audience_publish_total`, `audience_fanout_ms`, `audience_participants_active`.
- Cross-check the audience shard mapping (session_code % shard_count); participants on the same code MUST share a shard.
- If a single shard is hot, temporarily bump `SHARD_COUNT` and re-shard via admin RPC.
- **Restart**: `kubectl rollout restart deployment/participant-ws-gateway` (or local equivalent).
- **Rollback**: revert to the previous image tag.
- **Scale**: bump replicas if CPU/memory-bound.
- **Drain**: drain a node before maintenance.

## Escalation path

On-call rotation → tech lead → principal architect. See [`docs/runbooks/README.md`](../../README.md) for the rotation table.

## Postmortem

After every Sev1 / Sev2 incident, write a postmortem and link it here.
