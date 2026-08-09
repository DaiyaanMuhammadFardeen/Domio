# Tabletop test: realtime-gateway fanout hot-shard

> **Quarter:** 2026 Q3
> **Date:** 2026-08-09 (planned)
> **Facilitator:** SRE on-call
> **Participants:** realtime-platform on-call, SRE secondary, security
> on-call (observer)
> **Scenario source:** postmortem INC-20260612-01

## Goal

Validate that the realtime-platform team can identify and mitigate a
fanout hot-shard regression in <30 min. Specifically:

- The on-call knows which dashboards / metrics to look at
- The runbook rollback steps work end-to-end (in staging, not prod)
- The escalation path is clear

## Scenario

It is Tuesday 14:18 UTC. The realtime-platform team deployed v2.41.0
of `@domio/realtime-gateway` 4 minutes ago. The deploy included a
fanout sharding change (similar to INC-20260612-01).

At 14:23 UTC the SLOBurnHighT1RealtimeGatewayAvailRtGateway1h alert
fires. 5xx rate is climbing. Audience-side WebSocket connections to a
specific set of high-traffic rooms are disconnecting.

**You have 30 minutes.** Walk through the response as if it were a
real incident.

## What we'll observe

1. **Time to alert ack** — on-call must ack the page in <5 min.
2. **Time to identification** — on-call must identify the suspect
   deploy in <15 min.
3. **Time to rollback decision** — on-call must decide to roll back
   in <20 min.
4. **Time to rollback completion** — on-call must complete the
   rollback in <25 min.
5. **Communication cadence** — on-call must update the incident Slack
   channel at least every 10 min.

## What we'll inspect

- Realtime-platform team can name the runbook
  (`runbooks/service-runbooks/realtime-gateway.md`)
- Realtime-platform team knows the per-shard imbalance metric name
- Realtime-platform team knows the rollback command
- Escalation path is clear (who to page, when)

## Pre-test setup

1. Rehearse in staging: deploy the candidate sharding change to
   `staging/realtime-gateway`
2. Stage the alert: ensure SLOBurnHighT1RealtimeGatewayAvailRtGateway1h
   is configured in Alertmanager staging
3. Stage the rollback: have the previous image SHA pre-pulled
4. Brief the on-call: do not give away that this is a fanout scenario;
   let them read the alerts

## Post-test follow-ups

- File any AI- items in the linear backlog
- Update the runbook with any steps that were unclear
- Schedule the next tabletop test (different scenario)

## What this is not

This is not a load test. We are not validating performance under load.
We are validating that humans know the playbook.

## See also

- [`runbooks/postmortems/2026-06-12-realtime-gateway-connection-fanout.md`](../postmortems/2026-06-12-realtime-gateway-connection-fanout.md)
- [`runbooks/service-runbooks/realtime-gateway.md`](../service-runbooks/realtime-gateway.md)