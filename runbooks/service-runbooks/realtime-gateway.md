# Runbook: realtime-gateway

> **Owner:** realtime-platform
> **On-call:** `@realtime-platform-oncall` (PagerDuty: `pagerduty-platform-primary`)
> **Tier:** 1
> **Last reviewed:** 2026-08-09

## At a glance

`@domio/realtime-gateway` is the WebSocket fanout layer for presence
and CRDT broadcast. Every editor and audience connection terminates
here.

- **Source:** `services/realtime-gateway/`
- **Deployment:** rolling, 6 replicas minimum, 3 AZs
- **Health endpoint:** `https://realtime-gateway.domio.app/healthz`
- **Dashboard:** `domio-realtime-gateway`
- **SLOs:**
  - `avail-rt-gateway` — 99.9% over 30d (page)
  - `lat-rt-gateway-p95` — < 200 ms over 30d (ticket)

## Health checks

| Signal                     | Where                                                                     | Threshold    |
| -------------------------- | ------------------------------------------------------------------------- | ------------ |
| Open connection count      | `realtime_gateway_open_connections`                                       | < 80k / pod  |
| 5xx rate                   | `rate(http_requests_total{service="realtime-gateway",status=~"5.."}[1m])` | < 0.1%       |
| Per-shard fanout imbalance | `stddev(fanout_shard_requests) / mean(fanout_shard_requests)`             | < 2.0        |
| WebSocket close code 1011  | `rate(ws_close_total{code="1011"}[5m])`                                   | < 1 / minute |
| Heartbeat freshness        | `histogram_quantile(0.95, ws_heartbeat_age_seconds_bucket)`               | < 30s        |

## Common failure modes

### 1. Hot-shard in fanout

**Symptoms:** SLOBurnHighT1RealtimeGatewayAvailRtGateway1h fires.
Per-shard request imbalance > 2.0. 5xx concentrated on a small set of
rooms.

**Diagnosis:**

```promql
sum by (shard) (rate(realtime_fanout_requests_total[1m]))
```

**Mitigation:**

1. Identify the hot shard: `topk(5, sum by (shard) (rate(...)))`
2. If hot shard is from a single bad room, manually re-shard that room:
   ```sh
   ./scripts/realtime-reshard-room.sh <room-id>
   ```
3. If widespread, page realtime-platform secondary and consider
   rollback of the latest deploy.

### 2. Connection storm

**Symptoms:** `realtime_gateway_open_connections` climbs sharply. New
connection success rate drops.

**Diagnosis:**

```promql
sum(rate(realtime_new_connections_total[1m]))
```

**Mitigation:**

1. Check auth service for stale tokens: are clients retrying with
   expired tokens?
2. If legitimate spike (campaign launch, scheduled event), scale up:
   ```sh
   kubectl scale deploy realtime-gateway --replicas=12
   ```
3. If attack, enable per-IP rate limit:
   ```sh
   ./scripts/rt-enable-rate-limit.sh
   ```

### 3. CRDT merge backlog

**Symptoms:** `lat-rt-gateway-p95` rises. CRDT queue depth grows.

**Diagnosis:**

```promql
realtime_crdt_queue_depth
```

**Mitigation:**

1. Check upstream: are collab-service writes slow?
2. Check downstream: are session-coordinator writes slow?
3. If queue depth > 100k sustained for 5 min, scale realtime-gateway
   and page the realtime-platform secondary.

### 4. Heartbeat freshness degradation

**Symptoms:** WebSocket 30s heartbeat p95 > 30s. Audience sees
"stale" state.

**Diagnosis:**

```promql
histogram_quantile(0.95, ws_heartbeat_age_seconds_bucket)
```

**Mitigation:**

1. Check network: is there a regional issue? (`realtime_ws_rtt_ms`)
2. Check pod CPU: is the pod CPU-saturated? `container_cpu_usage_seconds_total`
3. If pod CPU saturated, scale up.

### 5. WebSocket upgrade failures

**Symptoms:** 5xx rate spikes on `/ws` endpoint. Clients see
connection refused.

**Diagnosis:**

```promql
sum(rate(http_requests_total{service="realtime-gateway",status=~"5..",route="/ws"}[1m]))
```

**Mitigation:**

1. Check auth-service for the auth pre-flight: are tokens valid?
2. Check TLS termination: is the cert expiring soon?
3. If cert issue, see [TLS rotation runbook](#tls-rotation).

## Rollback procedure

```sh
# Identify the current revision
kubectl -n realtime get deploy realtime-gateway -o jsonpath='{.metadata.generation}'

# Roll back to the previous revision
kubectl -n realtime rollout undo deploy realtime-gateway

# Watch rollout
kubectl -n realtime rollout status deploy realtime-gateway

# Expected time-to-rollback: ~3 minutes
```

If rollback fails (e.g., bad image), pin to a known-good revision:

```sh
kubectl -n realtime set image deploy/realtime-gateway \
  realtime-gateway=ghcr.io/domio/realtime-gateway@sha256:<good-sha>
```

## Escalation

- **Primary on-call:** paged via PagerDuty platform primary
- **Secondary on-call:** PagerDuty platform secondary (auto-paged after
  15 min no-ack)
- **SRE leadership:** paged after 60 min unresolved, or at SEV-1
- **Vendor (Cloudflare, Postgres):** contact via SRE leadership

## Dependencies

**This service depends on:**

- `@domio/auth` (token validation)
- `@domio/edge-pubsub` (cross-region fanout)
- `@domio/session-coordinator` (room state)
- `@domio/participant-session` (presence aggregation)

**Services that depend on this:**

- `@domio/audience-service` (audience presence)
- `@domio/presenter-session` (presenter presence)
- `@domio/collab-service` (CRDT writes)
