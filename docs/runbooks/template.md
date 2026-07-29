# RB-NNN: <short title>

## Service / component

<!-- e.g., apps/api, services/realtime-gateway, postgres -->

## Symptoms

<!-- What the user / operator sees. -->

## Triage

1. Check `/healthz` and `/readyz`.
2. Look at the most recent deploy.
3. Look at the OTel traces in Jaeger.
4. Look at the Prometheus dashboards.
5. Search the structured logs for the trace_id from the failing request.

## Common fixes

- **Restart**: `kubectl rollout restart deployment/<service>` (or local equivalent).
- **Rollback**: revert to the previous image tag.
- **Scale**: bump replicas if CPU/memory-bound.
- **Drain**: drain a node before maintenance.

## Escalation path

<!-- On-call rotation → tech lead → principal architect. -->

## Postmortem

After every Sev1 / Sev2 incident, write a postmortem and link it here.