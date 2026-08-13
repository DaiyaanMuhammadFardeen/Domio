# realtime-gateway — runbook

> Tier-1 service. SLOs and alerts are defined in [`docs/slos/catalogue.md`](../../../slos/catalogue.md).

## Purpose

WebSocket realtime collab (Yjs CRDT sync, presence, ops).

## SLOs covered

| SLO                  | Kind         | Target   | Window |
| -------------------- | ------------ | -------- | ------ |
| `avail-rt-gateway`   | availability | 99.9%    | 30d    |
| `lat-rt-gateway-p95` | latency      | < 200 ms | 30d    |

## Triage

1. Check `/healthz` and `/readyz`.
2. Look at the most recent deploy (check `gh run list`).
3. Open the matching Grafana dashboard (`/d/realtime-gateway-overview`).
4. Search structured logs by trace_id for the failing request.
5. Confirm OTel exporter is wired: `grep -r 'realtime-gateway' packages/observability/dist`.

## Common fixes

- Inspect `/metrics` for ws_open_total / ws_close_total counters — a sudden delta usually flags a partition.
- Confirm CRDT per-deck Redis-backed state store is reachable: `redis-cli PING`.
- If a single deck is wedged, drain it: `redis-cli HGET deck-state:<id>` and reject new connections at the router.
- **Restart**: `kubectl rollout restart deployment/realtime-gateway` (or local equivalent).
- **Rollback**: revert to the previous image tag.
- **Scale**: bump replicas if CPU/memory-bound.
- **Drain**: drain a node before maintenance.

## Escalation path

On-call rotation → tech lead → principal architect. See [`docs/runbooks/README.md`](../../README.md) for the rotation table.

## Postmortem

After every Sev1 / Sev2 incident, write a postmortem and link it here.
