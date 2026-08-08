# Analytics Runbook — Phase 17 On-Call

> **Audience.** This runbook is the first responder's reference for
> any alert that pages the `analytics-oncall` rotation. It pairs with
> the [Phase 17 SLOs](slo/phase-17.md), the
> [Phase 17 data-flow doc](docs/architecture/phase-17-data-flow.md), and the
> [Phase 17 spec](docs/development_phases/phase-17-spec.md).

**Owner:** `analytics-platform@example.com`
**Reviewers:** SRE on-call, Phase 17 lead
**Window:** 24/7 — pages the `analytics-oncall` rotation
**Last updated:** 2026-08-08

---

## 1. First-responder checklist (T+0 to T+15)

When an alert pages, run through this list before debugging anything
specific:

1. **Acknowledge the page** in PagerDuty within 5 min; this stops the
   escalation timer.
2. **Open the Grafana dashboard** —
   `https://grafana.internal/d/phase-17-analytics/phase-17-overview`.
   Confirm the burn rate against the SLO doc.
3. **Check `slo/phase-17.md` "Burn-rate alerts"** to identify which
   SLO is breached.
4. **Skim the deploy timeline** in `#deploys` for the last 60 min.
   Most Phase 17 alerts are deploy-induced regressions.
5. **Open `#analytics-oncall` war room** if the burn rate is fast
   (>6× over 30 min) — this is a P1 even if customer impact is low.
6. **Run the matching playbook below** (sections 3–10).
7. **Post a status update** in `#analytics-status` every 30 min until
   resolved.

---

## 2. Common tool belt

| Tool                        | When to use                                             |
|-----------------------------|---------------------------------------------------------|
| `pnpm --filter analytics-warehouse dev`     | hot-reload the warehouse read API                  |
| `go test -count=1 ./services/ab-...`        | verify A/B services after a deploy                 |
| `pnpm --filter @domio/event-ingest test`    | verify ingest edge                                 |
| `kafkactl consume events.ingest.raw -n 5`   | inspect raw events during a regression             |
| `clickhouse-client --query "SELECT ..."`    | warehouse debugging (read-only access required)    |
| `psql -h $DATABASE_URL -c "..."`            | control-plane debugging                            |
| `redis-cli -h $REDIS_HOST`                  | rate-limit / nonce / dedup inspection              |
| `kubectl logs -n analytics deploy/event-ingest` | service logs                                 |
| `gh run watch <run-id>`                     | watch the failing CI workflow                      |

---

## 3. Ingest burn-rate fast / p95 ingest latency > 100 ms (PHASE-17-INGEST)

**Symptom.** `Phase17IngestBurnFast` fires; `analytics_ingest_duration_seconds`
p95 climbs above 100 ms; 503 rate increases.

**Likely causes (in order):**
1. Kafka producer buffer full — disk-spool filling up.
2. HMAC verifier CPU saturation (key rotation storm).
3. Schema validator regression.

**Triage steps:**
1. `kubectl top pods -n analytics -l app=event-ingest` — confirm CPU
   and memory are within budget.
2. `redis-cli LLEN analytics:ingest:ratelimit:<workspace_id>` — check
   whether rate-limit queueing is the cause.
3. Check Kafka broker lag from `Phase17IngestConsumerLag` panel — if
   the columnar-loader is the slow side, the issue is downstream.
4. Tail the service logs: `kubectl logs -n analytics deploy/event-ingest --tail=200 | grep -E "(error|warn|backpressure)"`.

**Mitigations:**
- **Backpressure warning** — verify the 503+`Retry-After` response
  is being honored; client SDK retries with backoff up to 10 s.
- **Bump replicas**: `kubectl scale deploy/event-ingest -n analytics --replicas=12`.
- **Disable schema forward-compat** if the regression is on a single
  schema (kills the loose parser): `kubectl set env deploy/event-ingest -n analytics INGEST_FORWARD_COMPAT=false`.

**Rollback.** `git revert` the most recent deploy; redeploy via the
`analytics` ArgoCD application.

---

## 4. Warehouse query latency p95 > 2 s (PHASE-17-WAREHOUSE-LATENCY)

**Symptom.** Dashboard tiles spin, click-through drilldowns lag; Grafana
panel "Top dashboard query latency" shows red.

**Likely causes:**
1. ClickHouse MV refresh lag (a new `events` partition not yet merged).
2. Query regression from a recent deploy to `analytics-warehouse`.
3. ClickHouse disk pressure (`/var/lib/clickhouse` full).

**Triage steps:**
1. `clickhouse-client --query "SELECT * FROM system.parts WHERE table='events' AND active ORDER BY modification_time DESC LIMIT 10"` —
   confirm MVs are merging.
2. `clickhouse-client --query "SELECT * FROM system.metrics WHERE metric LIKE '%Query%'"` —
   check running queries; kill long-runners with `KILL QUERY`.
3. `df -h` on the ClickHouse nodes; the `data` mount should be < 80%
   used.
4. Tail `services/analytics-warehouse` logs for slow-query warnings.

**Mitigations:**
- Restart the warehouse service to flush the GraphQL resolver cache:
  `kubectl rollout restart deploy/analytics-warehouse -n analytics`.
- If ClickHouse disk is full, run `ALTER TABLE events MODIFY TTL ts + INTERVAL 13 MONTH` and
  trigger a manual merge.
- Persisted-query cache is hit-rate-keyed — if hit rate is dropping,
  redeploy the dashboard with a warm cache.

---

## 5. A/B cross-workspace contamination alert (PHASE-17-AB-CONTAMINATION)

**Symptom.** The nightly contract test
`tests/integration/ab/cross_workspace_contamination.test.ts` fails or
PagerDuty fires `Phase17ABContamination`.

**Severity: P0.** This is a data-isolation bug; every workspace that
touched the affected `ab_test` row in the last 24 h may have leaked
exposures. Page the Security on-call immediately.

**Triage steps:**
1. Stop the experiment: `POST /v1/ab/conclude` for the affected
   `experiment_id` with `reason=contamination`.
2. Pull the audit log from `analytics_export_audit` for the
   `experiment_id` to enumerate the affected workspaces.
3. Notify each workspace admin via the in-app incident banner
   (`incident.publish` MCP tool).
4. Open a Phase 20 (Security & Enterprise) escalation ticket.

**Mitigations:**
- The regression is almost always a missing `WHERE workspace_id = $1`
  in a `services/ab-measurement` query. Revert the offending commit
  and ship a hotfix.
- Add the missing filter to the contract test suite so the regression
  cannot recur.

---

## 6. CRM sync failure rate > 1 % (PHASE-17-CRM-FAILURE)

**Symptom.** `crm.sync.failed` rate climbs; `/admin/crm-health`
shows red on one provider.

**Likely causes:**
1. Provider rate limit (HubSpot 100/10s, Salesforce concurrent-request
   cap).
2. OAuth refresh-token expiry (Salesforce).
3. Adapter field-map drift after a vendor API change.

**Triage steps:**
1. `/admin/crm-health` — identify the failing provider.
2. Check the token-bucket depth: `redis-cli LLEN crm-sync:bucket:<provider>`.
3. For Salesforce, force a token refresh:
   `POST /admin/crm/salesforce/refresh-token`.
4. Tail `services/crm-sync` logs for the failing workspace.

**Mitigations:**
- The DLQ holds failed events for 24 h; if the failure is transient,
  the retry job will catch up.
- If a workspace admin reports dropped engagements, run the
  reconciliation job: `pnpm --filter @domio/crm-sync run reconcile --workspace=<id>`.
- For HubSpot, the adapter honors the 100/10s bucket and queues
  silently — a "burst" alert means the queue is filling faster than
  the bucket drains.

---

## 7. GDPR erasure breach / audit missing (PHASE-17-GDPR-BREACH)

**Symptom.** Erasure pipeline didn't complete in 60 s, or the
`gdpr_erasure_completed` audit row is missing.

**Severity: P0.** This is a regulatory breach; page the Compliance
on-call immediately.

**Triage steps:**
1. Replay the erasure: `POST /v1/viewers/{id}/erase` with
   `?force=true`.
2. Verify the ClickHouse tombstone: `clickhouse-client --query "SELECT * FROM events WHERE viewer_id_key='<id>' LIMIT 1"` —
   should be empty for the matching tombstone marker.
3. Verify the audit row: `psql -c "SELECT * FROM gdpr_erasure_audit WHERE viewer_id='<id>'"`.

**Mitigations:**
- If the tombstone is missing, the `LIGHTWEIGHT DELETE` didn't
  complete. Run it manually:
  `ALTER TABLE events DELETE WHERE viewer_id_key='<id>'`.
- If the audit row is missing, re-emit from the `viewer-identity`
  service: `POST /v1/viewers/{id}/erase/audit-replay`.

---

## 8. Heatmap not refreshed within 60 s (PHASE-17-HEATMAP-LATENCY)

**Symptom.** `/heatmap` page shows stale data after a session ended.

**Likely causes:**
1. The `session.ended` event didn't reach `services/heatmap-generator`.
2. The `heatmap_tile` rollup MV has lag.

**Triage steps:**
1. Confirm the `session.ended` event arrived:
   `kafkactl consume events.ingest.normalized -n 5 | grep session.ended`.
2. Check the heatmap job queue: `psql -c "SELECT * FROM heatmap_jobs WHERE status='pending' AND created_at < now() - INTERVAL '60 seconds'"`.
3. Check the `heatmap_mv` last-merge timestamp:
   `clickhouse-client --query "SELECT max(insertion_time) FROM heatmap_tile"`.

**Mitigations:**
- Trigger an on-demand refresh: `POST /v1/decks/{id}/heatmap/refresh`.
- If the MV has lag, restart `services/heatmap-generator` to flush
  the in-process aggregator.

---

## 9. Notification dispatcher DND / quota bug (PHASE-17-NOTIFICATION)

**Symptom.** Either too many notifications (quota breach) or too few
(recipients missing).

**Triage steps:**
1. Inspect the rate-limit state:
   `redis-cli HGETALL notification:caps:<recipient_id>`.
2. Inspect the rule evaluation log:
   `psql -c "SELECT * FROM notification_rule_log WHERE recipient_id='<id>' ORDER BY created_at DESC LIMIT 20"`.

**Mitigations:**
- If the cap was bypassed, the per-recipient Redis key probably
  expired — manually reset and re-emit the rule evaluator.
- If the rule fired but the channel failed, the dead-letter is in
  `notifications.dlq`; replay with `pnpm --filter @domio/notification-dispatcher run replay`.

---

## 10. Dashboard resolver regression (PHASE-17-DASHBOARD-LATENCY)

**Symptom.** p95 > 800 ms or p99 > 1.5 s on `/overview`,
`/deck/[id]`, or `/ab`; persisted-query cache hit rate drops.

**Triage steps:**
1. Per-resolver timing in Grafana: identify the slow resolver
   (`deckMetrics`, `slideMetrics`, `heatmap`, `abResults`, `funnel`).
2. Check persisted-query cache hit rate in the dashboard panel.
3. Tail `apps/dashboard` server logs for resolver errors.

**Mitigations:**
- Warm the persisted-query cache by issuing a synthetic request to
  each route.
- Roll back the dashboard deploy if the regression is in app code.
- If the regression is in `services/analytics-warehouse`, restart it
  to flush the Yoga resolver cache.

---

## 11. Post-incident

After an incident:

1. Write a post-mortem in [`docs/postmortems/`](postmortems/) within
   48 h.
2. File a tracking issue in the Phase 17 backlog.
3. Add a new alert rule or burn-rate tuning if the SLO is under-tested.
4. Update this runbook with any new triage steps discovered during
   the incident.

---

## 12. Escalation

| Severity | First responder        | Escalation             |
|----------|------------------------|------------------------|
| P0       | analytics-oncall       | platform-eng-lead, security-oncall (if isolation/GDPR) |
| P1       | analytics-oncall       | analytics-platform-eng |
| P2       | analytics-oncall       | next business day      |
| P3       | analytics-oncall (async)| next sprint planning  |

**Always** notify `compliance@example.com` for any GDPR, residency,
or data-leakage incident, regardless of severity.
