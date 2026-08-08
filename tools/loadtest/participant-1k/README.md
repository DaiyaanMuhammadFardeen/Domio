# Phase 16 W5 — 1000-participant demo load test

A scaled-down version of the production `tools/loadtest/participant-client/script.js`
(10k WS / 60m) suitable for running against a local docker stack.

## Run

```bash
k6 run script.js
```

With overrides:

```bash
TARGET_URL=http://localhost:8090 \
  SESSION_CODE=DEMO-0001 \
  WORKSPACE_ID=ws-demo \
  DURATION=5m \
  k6 run script.js
```

## SLO assertions

* `audience_ws_open_ms` — p95 < 2500 ms (join handshake)
* `audience_hello_ms` — p95 < 500 ms (hello → welcome)
* `audience_poll_vote_ms` — p95 < 1000 ms (vote round-trip)
* `audience_send_errors` — rate < 0.5% of sends
