# Domio — Observability

> **Source of truth:** `slo/`, `runbooks/`, `infrastructure/observability/`,
> `infrastructure/local/`. **Last regenerated:** 2026-08-16.

## 1. Stack

- **Metrics:** Prometheus (`infrastructure/prometheus/`)
- **Logs:** Structured JSON, collected via the OpenTelemetry collector
  (`infrastructure/local/otel-collector-config.yaml`)
- **Traces:** OpenTelemetry SDK in every Go + TS service, exported via OTLP
- **Dashboards:** Grafana
- **Alerting:** Alertmanager → PagerDuty
- **Status page:** `infrastructure/status-page/` with synthetic probes in
  `infrastructure/synthetics/`

## 2. SLOs

| SLO file                          | Owning service              |
| --------------------------------- | --------------------------- |
| `slo/api-gateway.md`              | API gateway                 |
| `slo/editor.md`                   | Editor                      |
| `slo/postgres.md`                 | Postgres tier               |
| `slo/realtime-gateway.md`         | Realtime gateway            |
| `slo/phase-17.md`                 | Analytics plane             |
| `slo/oncall.yaml`                 | On-call routing             |
| `slo/rules/`                      | Alert rule packs            |
| `slo/__tests__/`                  | SLO rule tests              |

## 3. Dashboards

- `infrastructure/observability/grafana/dashboards/phase-17-analytics.json`
- `infrastructure/observability/grafana/dashboards/realtime-gateway.json`
- `infrastructure/grafana/provisioning/dashboards/phase-15-presenter.json`
- `infrastructure/grafana/provisioning/dashboards/realtime-gateway.json`
- `infrastructure/grafana/provisioning/alerting/realtime-gateway.yml`

## 4. PagerDuty

- `infrastructure/observability/pagerduty/phase17.yaml`

## 5. Runbooks

- `runbooks/README.md` — playbook conventions
- `runbooks/postmortem-template.md`
- `runbooks/chaos/` — chaos drill runbooks
- `runbooks/postmortems/`
- `runbooks/service-runbooks/`
- `runbooks/tabletop-tests/`

## 6. CI gates

- `chaos.yml` — chaos drills
- `p22-load.yml` — load at design-partner scale
- `load.yml` — long-running load tests
- `perf-nightly.yml` — canvas FPS regression suite
- `tracing-coverage.yml` — OTel coverage guard
