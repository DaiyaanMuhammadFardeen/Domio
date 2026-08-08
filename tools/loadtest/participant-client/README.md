# Participant load test (k6)

Phase 16 W1 — 10 000 concurrent audience WS connections over 60 minutes.
Exercises the join RTT, hello→welcome, and poll-vote round-trips.

## Run

```
k6 run --out json=results.json script.js
```

Env (all optional):

| Var          | Default               | Purpose                |
|--------------|-----------------------|------------------------|
| `TARGET_URL` | `http://localhost:8090` | participant-ws-gateway |
| `SESSION_CODE` | `ABCD-1234`         | the audience shard     |
| `WORKSPACE_ID` | `ws-loadtest`       | the workspace tenant   |

## SLOs

| Metric               | Threshold | Meaning |
|----------------------|-----------|---------|
| `audience_ws_open_ms`  | p95 < 2500 ms | WS upgrade |
| `audience_hello_ms`    | p95 < 500 ms  | hello→welcome |
| `audience_poll_vote_ms`| p95 < 1000 ms | vote ack round-trip |
| `audience_send_errors` | rate < 0.5%   | socket send failures |

## Notes

* The default stage ramp goes 2k → 10k over 6 minutes then plateaus
  for 50 minutes. Adjust for shorter smoke runs.
* Each VU is bound to one WS connection; no respawning.
* Heartbeat every 30s, poll_vote every 60s.
* Connection lifetime is 55 minutes so the 4-minute ramp-down can
  proceed cleanly.