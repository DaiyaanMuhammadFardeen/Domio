# Chaos Tests — Realtime Gateway

## Overview

Chaos testing using [Toxiproxy](https://github.com/Shopify/toxiproxy) to inject
network faults between the realtime gateway and its dependencies (NATS, Redis).

## Architecture

```
k6 → gateway → Toxiproxy NATS proxy → NATS (localhost:4222)
                     → Toxiproxy Redis proxy → Redis (localhost:6379)
```

Toxiproxy sits between the gateway and real services, allowing us to inject:
- **Latency** (artificial delay on packets)
- **Timeouts** (connection drops)
- **Bandwidth limits** (slow transfer)
- **Connection resets** (TCP RST)

## Prerequisites

- Docker with `shopify/toxiproxy:latest` pulled
- NATS running on `localhost:4222`
- Redis running on `localhost:6379`
- k6 at `/tmp/opencode/k6`
- Gateway binary at `/tmp/opencode/rtgw`

## Running

```bash
# Run all chaos scenarios
tests/chaos/run.sh

# Or manually:
docker compose -f tests/chaos/toxiproxy-realtime.yaml up -d toxiproxy
tests/chaos/run.sh
```

## Scenarios

### 1. Baseline Connectivity
Verify that the gateway works correctly when traffic flows through Toxiproxy
proxies (no toxics active). Confirms the proxy layer introduces no issues.

### 2. NATS Partition (Timeout Toxic)
**Injection**: Timeout toxic on NATS proxy (`timeout=1ms, timeout_duration=0s`)

**Expected behavior**: Gateway HTTP endpoints (`/healthz`, `/readyz`) remain
responsive. Since the current gateway does not actively subscribe to NATS for
sync operations, the partition has no visible effect on HTTP health checks.

**Resilience claim**: The gateway's TCP connection to NATS may break, but the
HTTP server is decoupled and stays up.

### 3. Redis Latency (2000ms Toxic)
**Injection**: Latency toxic on Redis proxy (`latency=2000ms`)

**Expected behavior**: Gateway HTTP endpoints remain responsive. Redis latency
affects presence updates and session storage, but health checks pass since they
don't hit Redis synchronously.

### 4. Recovery After Toxic Removal
Remove all toxics and verify the gateway returns to full health (`/readyz` → 200).

## Expected Resilience Behavior

| Scenario | Gateway HTTP | WebSocket | Notes |
|----------|-------------|-----------|-------|
| NATS partition | ✓ Up | ✓ Connected | Gateway doesn't block on NATS for health |
| Redis 2000ms latency | ✓ Up | ✓ Connected | Health checks don't wait on Redis |
| Toxic removal | ✓ Recovered | ✓ Full service | No stale state to clean up |

## Known Limitations

The current gateway is a **connection-only** skeleton:
- `handleSyncWS` starts a `WritePump` but no `ReadPump`
- No NATS pub/sub for op fan-out
- No Redis persistence for session state

This means toxics don't exercise the gateway's actual I/O paths. Full chaos
testing requires:
1. Gateway with active NATS subscription for op broadcast
2. Gateway with Redis-backed session/presence store
3. k6 tests that send ops and verify fan-out through NATS
4. Presence tests that read/write through Redis

## Toxiproxy API Reference

```bash
# List proxies
curl http://localhost:8474/proxies

# Add a toxic
curl -X POST http://localhost:8474/proxies/nats/toxics \
  -H "Content-Type: application/json" \
  -d '{"name":"latency","type":"latency","attributes":{"latency":2000}}'

# Remove a toxic
curl -X DELETE http://localhost:8474/proxies/nats/toxics/latency

# Reset all toxics on a proxy
curl -X POST http://localhost:8474/proxies/nats/toxics/reset
```

## Docker Compose

The `toxiproxy-realtime.yaml` file defines:
- `toxiproxy`: The proxy server (API on :8474, NATS proxy on :14222, Redis proxy on :16379)
- `gateway-chaos`: Gateway pointed at toxiproxy addresses (optional, for Docker-only testing)
