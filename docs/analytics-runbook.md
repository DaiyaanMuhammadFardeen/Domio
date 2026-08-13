# Phase 17 — Analytics on-call runbook

This runbook is the canonical on-call reference for the Phase 17
analytics & engagement-intelligence stack. It pairs with
[`infrastructure/observability/runbook-links.md`](../infrastructure/observability/runbook-links.md),
which maps every alert name to the matching section here.

For each alert:

1. **Acknowledge** the page in PagerDuty.
2. **Read** the corresponding section below.
3. **Mitigate** using the bash snippets.
4. **Document** what you changed in the post-incident channel.

---

## Triage decision tree

```
Page fires
  |
  +-- Alert name starts with "ingest-" or "Ingest"?
  |     --> [ Ingest](#ingest)
  |
  +-- Alert name contains "clickhouse" or "replication"?
  |     --> [ ClickHouse](#clickhouse)
  |
  +-- Alert name contains "crm"?
  |     --> [ CRM](#crm)
  |
  +-- Alert name starts with "ab-" or "A/B"?
  |     --> [ A/B testing](#ab-testing)
  |
  +-- Alert name starts with "benchmark"?
  |     --> [ Benchmarks](#benchmarks)
  |
  +-- Alert name contains "session" or "sessionization"?
  |     --> [ Sessionization](#sessionization)
  |
  +-- Alert name contains "heatmap"?
  |     --> [ Heatmap](#heatmap)
  |
  +-- Alert name contains "live" or "hud"?
  |     --> [ Live](#live)
  |
  +-- Alert name contains "notification" or "team"?
  |     --> [ Notifications + team](#notifications--team)
  |
  +-- Otherwise --> [ Master kill switch](#master-kill-switch)
```

---

## Master kill switch

If the incident crosses multiple workstreams, flip the master kill
switch first to stop the bleed:

```bash
# Via the feature-flag console (preferred)
#   feature-flags.domio.internal -> phase17.master_kill_switch -> rollout=100%

# Via Helm, if the console is down:
helm upgrade --reuse-values domio-platform ./infrastructure/helm/platform \
  --set analytics.masterKillSwitch=true
```

All Phase 17 services then return 503 from their public routes within
30 s. Investigate offline; flip back when resolved:

```bash
helm upgrade --reuse-values domio-platform ./infrastructure/helm/platform \
  --set analytics.masterKillSwitch=false
```

---

## Ingest

<a id="ingest"></a>

### {#ingest-lag}

`ingest-lag-page` — event-ingest p95 > 60 s.

```bash
# 1. Inspect ingest latency breakdown.
kubectl logs -l app=event-ingest --tail=200 | grep -E 'duration_ms|hmac_fail'

# 2. Check Kafka producer lag (event-ingest -> Kafka).
kubectl exec -it $(kubectl get pod -l app=event-ingest -o name | head -1) -- \
  kafka-consumer-groups --bootstrap-server kafka:9092 \
    --describe --group clickhouse-loader

# 3. If Kafka is the bottleneck, check broker health.
kubectl get pods -l app=kafka
```

### {#ingest-p95-latency}

`Ingest p95 > 5s` — general ingest latency SLO breach. Same
diagnosis as above; the threshold is tighter (5 s).

### {#ingest-5xx-rate}

`Ingest 5xx rate > 1%` — sustained 5xx on `/v1/events`.

```bash
# 1. Tail ingest logs for the error class.
kubectl logs -l app=event-ingest --tail=500 | grep -E 'status=5'

# 2. Common causes:
#    * HMAC validation failure spike (key rotation in progress?)
#    * Schema validation rejects (new schema_version mismatch?)
#    * Kafka producer timeout -> backpressure spool active?
```

### {#kafka-producer-lag}

`Kafka producer lag` — KafkaJS producer queue depth > 10 s.

### {#ingest-backpressure}

`Backpressure spool > 5 GB` — disk-spool buffer overflow.

```bash
# 1. Inspect spool size.
kubectl exec -it $(kubectl get pod -l app=event-ingest -o name | head -1) -- \
  du -sh /var/lib/domio/spool

# 2. If approaching 10 GB, drain manually:
kubectl exec -it $(kubectl get pod -l app=event-ingest -o name | head -1) -- \
  /usr/local/bin/spool-drain --target kafka:9092 --topic events.ingest.raw
```

### {#columnar-loader-stuck}

`Columnar loader lag > 60s` — clickhouse-loader stuck.

---

## ClickHouse

<a id="clickhouse"></a>

### {#clickhouse-replication-lag}

`clickhouse-replication-lag-warn` — replication lag > 5 m.

```bash
# 1. Check ZooKeeper / ClickHouse Keeper quorum.
clickhouse-client --query "SELECT * FROM system.replicas WHERE is_readonly = 0"

# 2. Inspect replication queue.
clickhouse-client --query "SELECT * FROM system.replication_queue LIMIT 20"

# 3. If a replica is lagging, restart it.
kubectl delete pod -l app=clickhouse,role=replica --grace-period=0
```

### CH disk usage

See Grafana panel "ClickHouse disk usage". > 80 percent -> page. Mitigation:

```bash
# 1. Inspect largest tables.
clickhouse-client --query "
  SELECT database, table, formatReadableSize(total_bytes) AS size
  FROM system.tables
  WHERE database = 'domio_analytics'
  ORDER BY total_bytes DESC LIMIT 20"

# 2. Drop expired TTL partitions.
clickhouse-client --query "ALTER TABLE domio_analytics.events MODIFY TTL ts + INTERVAL 13 MONTH"

# 3. If still tight, scale the storage tier (PVC resize via Helm).
helm upgrade domio-clickhouse ./infrastructure/helm/clickhouse \
  --set persistence.size=2Ti
```

---

## CRM

<a id="crm"></a>

### {#crm-dlq-depth}

`crm-dlq-depth-page` — DLQ depth > 1000.

```bash
# 1. Inspect DLQ contents.
kubectl exec -it $(kubectl get pod -l app=crm-sync -o name | head -1) -- \
  kafka-console-consumer --bootstrap-server kafka:9092 \
    --topic crm.dlq --from-beginning --max-messages 10

# 2. If provider is the cause (e.g. HubSpot 429), flip the per-provider flag.
helm upgrade domio-crm-sync ./infrastructure/helm/crm-sync \
  --set adapters.hubspot.enabled=false

# 3. Drain the DLQ via the reconciler (manual).
kubectl create job --from=cronjob/crm-reconciler crm-reconciler-manual
```

### {#crm-sync-failures}

`CRM sync failure rate > 1%` — per-provider failures spiking. Same
diagnosis as above.

---

## A/B testing

<a id="ab-testing"></a>

### {#ab-cross-workspace-leak}

`A/B cross-workspace contamination` — **critical**: workspace_id
filter failed in `services/ab-assignment`. Page immediately.

```bash
# 1. Inspect the offending assignment.
kubectl logs -l app=ab-assignment --tail=1000 | grep cross_workspace

# 2. Quarantine the service (returns 503 on every assignment).
helm upgrade domio-ab-assignment ./infrastructure/helm/ab-assignment \
  --set replicaCount=0

# 3. Audit the assignment table for cross-workspace rows.
psql -c "
  SELECT workspace_id, experiment_id, COUNT(*)
  FROM ab_assignment
  GROUP BY 1,2
  HAVING COUNT(DISTINCT workspace_id) > 1"
```

### {#ab-sequential-stuck}

`ab-sequential-test-stuck-warn` — sequential test has not decided in
24 h.

```bash
# 1. Inspect experiment status.
psql -c "SELECT id, name, status, started_at FROM ab_test WHERE status='running'"

# 2. If traffic is the cause (low impressions), bump the horizon.
psql -c "UPDATE ab_test SET planned_horizon = planned_horizon * 2 WHERE id = '<id>'"
```

### {#ab-assignment-latency}

`A/B assignment p95 > 5ms` — sub-ms hot path regression. Restart the
service first; if it persists, check Redis cache hit rate.

---

## Sessionization

<a id="sessionization"></a>

### {#sessionization-lag}

`Sessionization consumer lag` — Kafka consumer lag > 50 000.

### {#bot-tag-false-positive}

`Bot tag false positive > 0.5%` — bot filter over-classifying human
traffic. Inspect UA rule set; revert last rule change.

---

## Heatmap

<a id="heatmap"></a>

### {#heatmap-refresh-slo}

`Heatmap refresh SLO breached` — heatmap-generator lag > 60 s.

```bash
# 1. Inspect queue depth.
redis-cli LLEN heatmap:queue

# 2. If queue is full, scale workers.
helm upgrade domio-heatmap ./infrastructure/helm/heatmap \
  --set replicaCount=10
```

---

## Live

<a id="live"></a>

### {#live-hud-latency}

`Live HUD p95 > 1s` — WebSocket fan-out slow.

```bash
# 1. Inspect live-analytics NATS consumer lag.
kubectl logs -l app=live-analytics --tail=200 | grep consumer_lag

# 2. Inspect WebSocket connection count.
redis-cli --stat | grep connected_clients
```

---

## Notifications + team

<a id="notifications--team"></a>

### {#notification-trigger-latency}

`Notification trigger p95 > 10s` — CEP rules engine slow.

### {#notification-rate-limit}

`Notification rate-limit bypass` — **critical**: rate-limit counter
failed; could lead to spam. Page the channel owner immediately.

### {#team-rollup-missed}

`Team rollup job missed` — workers/team-analytics-rollup did not
complete.

```bash
# Manual run:
kubectl create job --from=cronjob/team-analytics-rollup team-rollup-manual
```

---

## Identity & GDPR

<a id="identity"></a>

### {#gdpr-erasure-lag}

`GDPR erasure lag > 24h` — viewer-identity has not processed an
erasure in 24 h. Check the erasure queue:

```bash
psql -c "SELECT COUNT(*) FROM viewer_identity_erasure_queue WHERE processed_at IS NULL"
```

### {#identity-merge-collisions}

`Identity merge collision rate` — merge heuristic over-colliding.
Revert last merge_rules change.

---

## Benchmarks

<a id="benchmarks"></a>

### {#benchmark-ingest-error-rate}

`benchmark-ingestion-error-warn` — error rate > 5 percent over 10 m.

```bash
# 1. Inspect API key validity.
kubectl logs -l app=benchmark --tail=200 | grep -E 'invalid_key|signature'

# 2. Inspect target ClickHouse shard.
clickhouse-client --host ch-benchmarks --query "SELECT 1"
```

### {#benchmark-rollup-missed}

`Benchmark nightly job missed` — workers/benchmark-rollup did not
run.

```bash
kubectl create job --from=cronjob/benchmark-rollup benchmark-rollup-manual
```

---

## Dashboard

<a id="dashboard"></a>

### {#dashboard-query-latency}

`Dashboard query p95 > 800ms` — analytics-warehouse slow.

```bash
# 1. Inspect slow-query log.
clickhouse-client --query "SELECT * FROM system.query_log WHERE query_duration_ms > 800 ORDER BY event_time DESC LIMIT 20"

# 2. Verify persisted queries are being served (not the full document).
kubectl logs -l app=dashboard --tail=200 | grep persisted_query
```

---

## HMAC key rotation

The `INGEST_HMAC_KEY_HEX` secret signs every analytics event the
client SDK posts to `/v1/events`. Rotating it requires care so that
in-flight events from clients using the old key are still accepted
during the rotation window.

### Procedure

**Total window: ~30 min (24 h dual-write + 5 min drain + 1 min cutover).**

1. **Generate the new key.** Use Vault or `openssl rand -hex 32`:

   ```bash
   NEW_KEY=$(openssl rand -hex 32)
   echo "$NEW_KEY" | vault kv put secret/domio/analytics/hmac key=- < < "$NEW_KEY"
   ```

2. **Start a 24 h dual-write window.** The ingest service accepts both
   the current key and the new key. Push the new key into the
   `INGEST_HMAC_KEY_HEX_NEXT` env var on every event-ingest pod:

   ```bash
   helm upgrade domio-event-ingest ./infrastructure/helm/event-ingest \
     --set hmac.keyNext=$NEW_KEY
   ```

   During this window, the SDK still signs with the **current** key;
   the server accepts both. Verify the dual-write is active:

   ```bash
   kubectl logs -l app=event-ingest --tail=50 | grep dual_write_active
   ```

3. **Roll the SDK key.** Ship `@domio/analytics-sdk` 2.0.0 with the
   new key embedded. Wait for the 24 h window to drain so all
   clients have fetched the new bundle. Track via:

   ```bash
   clickhouse-client --query "
     SELECT COUNT(DISTINCT hmac_key_id)
     FROM domio_analytics.events
     WHERE ts > now() - INTERVAL 1 HOUR"
   ```

   The metric should report >= 2 (current + new).

4. **Cut over.** Swap the env var ordering so the new key is primary:

   ```bash
   helm upgrade domio-event-ingest ./infrastructure/helm/event-ingest \
     --set hmac.key=$NEW_KEY \
     --set hmac.keyNext=null
   ```

5. **Invalidate the old key.** After a 5 min drain, delete the old
   key from Vault and rotate the Vault lease:

   ```bash
   vault kv delete secret/domio/analytics/hmac-old
   vault token revoke -self
   ```

6. **Verify** that the cutover succeeded by tailing the
   `event_ingest_hmac_failures_total{reason="unknown_key"}` metric.
   It must return to its pre-rotation baseline within 5 min.

### Roll-back

If the cutover causes a spike in HMAC failures, revert by reordering
the env vars:

```bash
helm upgrade domio-event-ingest ./infrastructure/helm/event-ingest \
  --set hmac.key=$OLD_KEY \
  --set hmac.keyNext=$NEW_KEY
```

This restores the dual-write state for another 24 h so the SDK team
can ship a fix.

### Audit

Every rotation is recorded in `analytics_hmac_rotation_audit`
(inserted by the event-ingest boot path). The table is included in
the monthly security review (see `SECURITY.md`).
