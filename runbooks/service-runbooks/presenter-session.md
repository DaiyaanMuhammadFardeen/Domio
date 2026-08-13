# Runbook: presenter-session

> **Owner:** realtime-platform
> **On-call:** `@realtime-platform-oncall` > **Tier:** 1
> **Last reviewed:** 2026-08-09

## At a glance

`@domio/presenter-session` owns the presenter-side session lifecycle:
create / end / pause / resume a session, manage presenter tokens,
broadcast control plane commands to audience.

- **Source:** `services/presenter-session/`
- **Deployment:** rolling, 4 replicas minimum
- **Health endpoint:** `https://presenter-session.domio.app/healthz`
- **Dashboard:** `domio-presenter-session`
- **SLOs:**
  - `avail-presenter-session` — 99.9% over 30d (page)
  - `lat-presenter-action-p95` — < 150 ms over 30d (ticket)

## Health checks

| Signal                              | Threshold                  |
| ----------------------------------- | -------------------------- |
| Action latency p95                  | < 150ms                    |
| 5xx rate                            | < 0.1%                     |
| Active sessions                     | trend (sudden drops = bad) |
| Presenter-token-validate error rate | < 0.5%                     |

## Common failure modes

1. **Bad presenter token.** Symptom: 401s spike on `/action`.
   _Mitigation:_ check auth-service for the signing-key rotation log.
2. **Session creation stuck.** Symptom: 5xx on `POST /sessions`.
   _Mitigation:_ check `presenter_session_create_duration_seconds` for
   which stage is slow (auth, DB, kafka).
3. **Pause/resume misfire.** Symptom: audience sees "session ended"
   when presenter paused. _Mitigation:_ roll back the deploy that
   changed the pause state machine.
4. **DB write contention.** Symptom: session-update latency grows.
   _Mitigation:_ check `pg_locks` for the `sessions` table; consider
   advisory-lock redesign (AI-2 in latest postmortem).
5. **Kafka producer lag.** Symptom: control-plane commands delayed.
   _Mitigation:_ check `kafka_producer_record_queue_time_ms`; if
   sustained, restart pod.

## Rollback

```sh
kubectl -n realtime rollout undo deploy presenter-session
```

## Escalation

- Primary on-call (PagerDuty platform primary)

## Dependencies

**Depends on:** auth, session-coordinator, kafka
**Depended on by:** realtime-gateway (control plane), audience-service (presence)
