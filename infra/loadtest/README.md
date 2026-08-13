# Phase 22-beta Load Tests

This directory holds the P22-beta load-test scripts. They exercise the
_existing_ surfaces (features #1–#204) at design-partner scale:

| Script               | Scale                                 | Service                                      | What it proves                               |
| -------------------- | ------------------------------------- | -------------------------------------------- | -------------------------------------------- |
| `audience_50k.js`    | 50,000 concurrent audience members    | realtime-gateway, audience-service           | Presence + reaction fanout under fanout load |
| `editors_10k.js`     | 10,000 concurrent editors on one deck | realtime-gateway, collab-service             | CRDT merge under heavy concurrent edits      |
| `presenter_2h.js`    | 2-hour sustained presenter session    | presenter-session, realtime-gateway          | Stability over a long-running session        |
| `decks_100k.js`      | 100,000 decks per tenant              | library-service, registry-service, asset-api | Catalog read paths at scale                  |
| `ingest_timeline.js` | timeline ingest at 10k events/s       | event-ingest, timeline-api                   | Event pipeline backpressure                  |

**Out of scope here (deferred to P22b):** kiosk 100-device soak, KG
100k-deck workspace queries — both depend on P21 services existing.

## Conventions

All scripts follow the P17 `tests/load/k6/` style:

- Pure ES5 / CommonJS (k6 doesn't support ES modules natively).
- WebSocket frames use length-prefixed protobuf framing; see
  `tests/load/README.md` §Wire Protocol.
- Thresholds are informational; CI tracks trend over time, not absolute
  pass/fail (some loads depend on infra scale that varies per env).
- Each script can be invoked directly with `k6 run <script.js> -e
URL=<base-url>`.

## CI integration

The CI workflow at `.github/workflows/loadtest-nightly.yml` runs each
script at 1% of design-partner scale nightly against staging and
reports the percentile summary to `#perf-ci` Slack.

Game-day (1× design-partner scale, full soak) runs only when manually
triggered; see `runbooks/chaos/README.md`.

## Output contract

Each script exports the same set of `Trend` / `Rate` / `Counter`
metrics so that the soak-test orchestrator (`soak.sh`) can collect
them uniformly:

- `*_latency_ms` (Trend)
- `*_error_rate` (Rate)
- `*_success_total` (Counter)
- `*_active` (Gauge — exposed via custom k6 metric)

## See also

- [`tests/load/`](../../tests/load/) — P17-era load tests
- [`runbooks/chaos/`](../../runbooks/chaos/) — chaos drill results
- [`docs/development_phases/phase-22-beta-hardening.md` §4.3](../../docs/development_phases/phase-22-beta-hardening.md) — WS-G3 scope
