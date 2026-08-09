# Postmortem — INC-20260612-01 — realtime-gateway connection fanout regression

> **Status:** draft
> **Author:** on-call sre
> **Reviewers:** realtime-platform, SRE on-call

## Header

- **Incident ID:** INC-20260612-01
- **Title:** realtime-gateway connection fanout regression on EU traffic
- **Severity:** SEV-2
- **Service(s):** @domio/realtime-gateway
- **SLO(s) impacted:** `avail-rt-gateway` (99.9% / 30d)
- **Detection time:** 2026-06-12 14:23 UTC (first alert: SLOBurnHighT1RealtimeGatewayAvailRtGateway1h)
- **Mitigation time:** 2026-06-12 14:51 UTC (rolled back deployment)
- **Resolution time:** 2026-06-12 15:02 UTC (alerts clear, traffic stable)
- **Author:** sre-on-call
- **Reviewers:** realtime-platform owner, SRE on-call

## Timeline

```
T+00:00   14:23 UTC  SLOBurnHighT1RealtimeGatewayAvailRtGateway1h fires
T+00:02   14:25 UTC  on-call paged via PagerDuty primary
T+00:04   14:27 UTC  on-call ack'd; #inc-20260612-01 Slack channel opened
T+00:12   14:35 UTC  identified the 14:18 UTC deploy as suspect (new fanout sharding)
T+00:28   14:51 UTC  rolled back the deploy; 5xx rate drops
T+00:39   15:02 UTC  SLO alert clears; incident closed
```

## Impact

- **User-visible:** audience-side presence drops for ~3% of EU sessions
  for 28 minutes. Editors received "disconnected" toasts.
- **Duration:** 28 min of degraded service (14:23 – 14:51 UTC).
- **Customers affected:** ~3% of EU sessions (~12k concurrent users).
- **SLO burn:** 0.4% of the 30-day error budget for `avail-rt-gateway`.

## Root cause

A 14:18 UTC deploy of `@domio/realtime-gateway` introduced a new fanout
sharding strategy keyed on `session_id` instead of `room_id`. The new
strategy produced a hot key on a small set of high-traffic rooms, which
caused per-shard backpressure and 5xx spikes for connections to those
rooms. The change passed unit tests but not the 10k-connection load test
that exercises the fanout path under realistic concurrency.

## Contributing factors

- Proximate: hot key in the new fanout sharding strategy.
- Contributing: load test suite only goes to 1k concurrent connections,
  not 10k+.
- Contributing: the SLO alert is a *symptom* alert; we have no alert on
  fanout shard balance.
- Contributing: rollback procedure requires a manual `kubectl rollout
  undo`, not a button. Increased TTR by ~5 minutes.

## What went well

- Burn-rate alert fired within 60 s of the 5xx spike.
- On-call was paged and acked in <5 min.
- Rollback procedure is in the runbook.

## What went poorly

- 14 minutes from detection to identification of the suspect deploy.
  Better deploy-correlation tooling would cut this to <2 min.
- No automated rollback. We rely on a human to roll back.

## Action items

```
AI-1: Extend load test to 10k concurrent connections.
  Owner: realtime-platform  Priority: P0  Due: 2026-06-19
AI-2: Alert on per-shard fanout request imbalance (stddev / mean > 2.0).
  Owner: realtime-platform  Priority: P1  Due: 2026-07-12
AI-3: Add one-click rollback via runbook automation.
  Owner: sre  Priority: P1  Due: 2026-07-31
AI-4: Document fanout sharding key choice in design doc; require design
  review for any future sharding changes.
  Owner: realtime-platform  Priority: P0  Due: 2026-06-19
```

## Lessons learned

The fanout sharding decision was made in a hurry because we were
already past the G2.6 SLO timeline; we should treat sharding changes
with the same review weight as a schema migration, regardless of SLO
pressure. **Push back on timeline > review rigor; the latter pays
compound interest.**

## Appendix

- Slack: #inc-20260612-01 (transcript in archive)
- Grafana: `domio-realtime-gateway` (panels 1-5, 14:00–15:30 UTC)
- Alertmanager: SLOBurnHighT1RealtimeGatewayAvailRtGateway1h
