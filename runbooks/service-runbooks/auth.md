# Runbook: auth

> **Owner:** security (SEC)
> **On-call:** `@security-oncall` (PagerDuty: `pagerduty-platform-primary`)
> **Tier:** 1
> **Last reviewed:** 2026-08-09

## At a glance

`@domio/auth` is the authentication and authorization root. Every
authenticated request touches this service (or its cached verify path).

- **Source:** `services/auth/`
- **Deployment:** rolling, 6 replicas minimum
- **Health endpoint:** `https://auth.domio.app/healthz`
- **Dashboard:** `domio-auth`
- **SLOs:**
  - `avail-auth` — 99.9% over 30d (page)
  - `lat-auth-p95` — < 300 ms over 30d (page)

## Health checks

| Signal                         | Threshold      |
| ------------------------------ | -------------- |
| Login success rate             | > 99% over 5m  |
| Token-validate p95             | < 50 ms        |
| 5xx rate                       | < 0.1%         |
| Failed-login spike             | < 10× baseline |
| Session-store (Redis) hit rate | > 95%          |

## Common failure modes

1. **Redis outage.** Symptom: token-validate latency grows; cache misses
   hit Postgres.
   _Mitigation:_ see Redis incident runbook. Fallback: degraded mode
   (skip cache, accept latency).
2. **IdP (Google / Microsoft) outage.** Symptom: social-login 5xx.
   _Mitigation:_ status page update; IdP is external, no internal action.
3. **Password hash library CVEs.** Symptom: depends on the CVE.
   _Mitigation:_ rotate hashes (separate playbook).
4. **Rate-limit false positives.** Symptom: legitimate users see 429.
   _Mitigation:_ check the rate-limit rule logs; if rule too strict,
   raise threshold via runbook automation.
5. **JWT signing-key rotation stuck.** Symptom: tokens issued with
   old key not validating.
   _Mitigation:_ see "JWT key rotation" runbook (separate).

## Rollback

```sh
kubectl -n realtime rollout undo deploy auth
```

**Be careful:** rolling back auth may invalidate in-flight tokens if the
old version used a different algorithm. Confirm with security on-call
before rollback.

## Escalation

- Security on-call (primary)
- CISO for any data-exfiltration suspicion
- SEC Slack: `#sec-incidents`

## Dependencies

**Depends on:** Postgres (sessions), Redis (cache), Google/Microsoft IdPs
**Depended on by:** **every** authenticated service
