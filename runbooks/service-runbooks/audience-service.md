# Runbook: audience-service

> **Owner:** realtime-platform
> **On-call:** `@realtime-platform-oncall` > **Tier:** 1
> **Last reviewed:** 2026-08-09

## At a glance

`@domio/audience-service` is the audience-facing read path for live
sessions. It serves presence, reactions, polls, and Q&A. Read-heavy.

- **Source:** `services/audience-service/`
- **Deployment:** rolling, 4 replicas minimum
- **Health endpoint:** `https://audience.domio.app/healthz`
- **Dashboard:** `domio-audience-service`
- **SLOs:**
  - `avail-audience` — 99.9% over 30d (page)

## Health checks

| Signal         | Where                                                                           | Threshold |
| -------------- | ------------------------------------------------------------------------------- | --------- |
| Read p95       | `histogram_quantile(0.95, ...)`                                                 | < 100ms   |
| 5xx rate       | `rate(http_requests_total{status=~"5.."}[1m])`                                  | < 0.1%    |
| Cache hit rate | `rate(audience_cache_hits_total[5m]) / rate(audience_cache_requests_total[5m])` | > 90%     |

## Common failure modes

1. **Cache miss storm.** Likely after a Redis flush. Symptom: p95
   spikes, downstream DB load grows.
   _Mitigation:_ pre-warm cache via canary deploy, or temporarily raise
   pod count to handle the extra load.
2. **DB connection pool exhaustion.** Symptom: 5xx with `ECONNREFUSED`
   to Postgres. _Mitigation:_ scale audience-service pods, alert
   `pg_stat_activity` to find slow queries.
3. **Slow downstream (realtime-gateway).** Audience reads depend on
   realtime for presence; see realtime-gateway runbook.
4. **Bad deploy.** Rollback via:
   ```sh
   kubectl -n realtime rollout undo deploy audience-service
   ```
5. **Region degraded.** Check `audience_region_health` dashboard panel.

## Rollback

```sh
kubectl -n realtime rollout undo deploy audience-service
```

Expected time-to-rollback: ~2 minutes.

## Escalation

- Primary on-call (PagerDuty platform primary)
- realtime-platform secondary after 15 min no-ack

## Dependencies

**Depends on:** realtime-gateway, session-coordinator, Redis
**Depended on by:** None (terminal service)
