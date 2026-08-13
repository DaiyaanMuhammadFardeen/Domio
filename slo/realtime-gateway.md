# SLO: realtime-gateway

Owner: `realtime-platform@example.com`
Reviewers: SRE on-call
Window: 28-day rolling

## User journeys

| ID   | Journey                            | Mechanism                      |
| ---- | ---------------------------------- | ------------------------------ |
| RT-1 | Open a presence-bearing connection | WebSocket upgrade + heartbeat  |
| RT-2 | Fan out a typed broadcast          | Server → N subscribers message |
| RT-3 | Apply a CRDT merge update          | Acked CRDT write               |

## SLIs and SLOs

| SLI                                   | SLO target     | Ticket threshold | Page threshold |
| ------------------------------------- | -------------- | ---------------- | -------------- |
| RT-1 connect success rate             | 99.5%          | < 99% over 6h    | < 95% over 5m  |
| RT-1 connection freshness (heartbeat) | 99% within 30s | < 95% / 6h       | < 80% / 5m     |
| RT-2 broadcast delivery within 1s     | 99%            | < 95% / 6h       | < 80% / 5m     |
| RT-3 CRDT merge accepted              | 99.9%          | < 99% / 6h       | < 95% / 5m     |
| RT-3 CRDT merge latency p95           | 100 ms         | > 250 ms / 6h    | > 750 ms / 5m  |

## Burn-rate alerts

| ALERT ID                | Burn-rate | Window | Action |
| ----------------------- | --------- | ------ | ------ |
| RealtimeConnectBurnFast | 14.4×     | 5m     | page   |
| RealtimeFanOutBurnFast  | 14.4×     | 5m     | page   |
| RealtimeMergeBurnFast   | 14.4×     | 5m     | page   |

## Measurement details

- **Source**: `rt_messages_total`, `rt_connections_active`,
  `rt_merge_duration_seconds_bucket`.
- **Heartbeat freshness**: `time() - rt_last_heartbeat_seconds > 30`.
- **Exclusions**: clients that explicitly close within the first 5
  seconds of the connection (their handshake counts as a usage event,
  not a failure).

## Notes

Realtime operates on a _separate_ error budget from api-gateway; the
two share an SLO review cadence but never share burn. This avoids one
component starving the other during an incident.
