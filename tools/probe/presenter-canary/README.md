# Presenter Canary Probe (Phase 15 W16)

End-to-end probe that exercises the full presenter lifecycle through
`apps/api` and reports the four pinned SLOs.

## Lifecycle exercised

1. `POST /v1/presenter/sessions` — create a fresh session
2. `POST /v1/presenter/sessions/:id/advance` — walk through 12 slides
3. `POST /v1/presenter/sessions/:id/annotate` — apply one annotation
4. `POST /v1/presenter/sessions/:id/handover/init` — mint a token
5. `POST /v1/presenter/sessions/:id/handover` — finalize the handover
6. `POST /v1/presenter/sessions/:id/end` — end the session
7. `GET /v1/presenter/sessions/:id/recap` — read the recap

## SLOs surfaced

| Metric                           | p95 target | PagerDuty rule                         |
| -------------------------------- | ---------- | -------------------------------------- |
| `presenter_ws_open_ms`           | 800 ms     | `presenter-ws-p95-open-high`           |
| `presenter_annotation_replay_ms` | 200 ms     | `presenter-annotation-p95-replay-high` |
| `presenter_handoff_ms`           | 1500 ms    | `presenter-handoff-p95-high`           |
| `presenter_recap_ms`             | 2000 ms    | `presenter-recap-p95-high`             |

## Usage

```sh
# Defaults: 100 VUs, 30m duration, http://localhost:8080
k6 run tools/probe/presenter-canary/script.js

# Override:
API_BASE=https://api.staging.domio \
CANARY_VUS=250 \
CANARY_DURATION=10m \
  k6 run tools/probe/presenter-canary/script.js
```

## Pass criteria

`k6` thresholds declared inline in the script must hold for the
specified duration. A failure aborts the run with exit code 99, which
the CI pipeline surfaces as a red status on the canary job.

## Dashboards

- Grafana: `infrastructure/grafana/provisioning/dashboards/phase-15-presenter.json`
- PromQL alerts: `infrastructure/observability/prometheus-alerts.yaml`
- PagerDuty routing: `infrastructure/observability/pagerduty.yaml`
