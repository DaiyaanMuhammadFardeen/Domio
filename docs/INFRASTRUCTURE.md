# Domio — Infrastructure

> **Source of truth:** `infrastructure/`, `infra/`, `docker-compose.full.yml`,
> `Dockerfile`s, Helm charts, Terraform. **Last regenerated:** 2026-08-16.

## 1. Local stack

`docker-compose.full.yml` brings up the entire public-beta surface in one
command. Profiles:

- `core` — infra only (default)
- `services` — core + tier-1 services
- `apps` — core + editor + dashboard
- `full` — everything (default)
- `observability` — core + observability tier

Layers:

1. **Infrastructure** — Postgres, Redis, NATS, MinIO, ClickHouse, OpenSearch,
   MailHog, OTel collector, Prometheus, Grafana, Jaeger.
2. **Tier-1 backend services** — `event-ingest`, `clickhouse-loader`,
   `analytics-warehouse`, `presenter-session`.
3. **Front-end apps** — `editor`, `dashboard`.

## 2. Terraform

`infrastructure/terraform/`:

- **envs** — `dev`, `staging`, `prod`
- **modules** — `cluster`, `minio`, `nats`, `network`, `observability`,
  `oncall`, `postgres`, `valkey`, `vault`

## 3. Helm

`infrastructure/helm/`:

- `domio/` — main platform chart
- `ingress/` — ingress configurations
- `observability/` — observability stack
- `participant-session/` — audience-tier chart
- `secrets/` — sealed-secret templates
- `__tests__/` — Helm chart tests

## 4. ArgoCD

`infrastructure/argocd/`:

- `applications/` — `app-of-apps.yaml` + per-app manifests
- `projects/` — project definitions

## 5. Postgres

178 migrations under `infrastructure/postgres/`. Every schema change ships
with a paired up/down migration. Migrations are gated by
`schema-migration-lint.yml` and `schema-validate.yml`.

## 6. ClickHouse

`infrastructure/clickhouse/`:

- `config.xml`, `users.xml`
- `init/` — table DDL + initial materialised views
- `README.md`

Plus `infrastructure/migrators/clickhouse/` for ClickHouse-side migrations.

## 7. Kafka

`infrastructure/kafka/`:

- `kraft/` — KRaft mode config
- `docker-compose.kafka.yml` — local cluster
- `broker.env`, `README.md`

## 8. Observability

`infrastructure/observability/` and `infrastructure/local/`:

- Grafana dashboards in `grafana/dashboards/`:
  - `phase-15-presenter.json`
  - `realtime-gateway.json`
  - `phase-17-analytics.json`
- PagerDuty rules in `pagerduty/` (`phase17.yaml`)
- Prometheus in `prometheus/`
- OTel collector config in `local/otel-collector-config.yaml`
- `runbooks/`, `slo/`, `threat-model/`, `runbooks/chaos/` provide the
  operational layer.

## 9. Feature flags

`infrastructure/feature-flags/`:

- `phase-16.yaml`, `phase-17.yaml`, `phase-18.yaml`, `phase-19.yaml`,
  `phase-21.yaml` — per-phase flag registry.
- `README.md` — convention (`FEATURE_<GROUP>_<NAME>`, owner, SRM).

## 10. Mirrors

`infrastructure/mirrors/`:

- Registry mirror config + `apply.sh` + `healthcheck.sh` for restricted
  regions.

## 11. Chaos

`infrastructure/chaos/` — chaos drill definitions referenced by `chaos.yml`
and `p22-load.yml`.

## 12. Load testing

`infrastructure/loadtest/` — k6 + Locust scripts at design-partner scale
(`audience_50k.js`, `editors_10k.js`, `presenter_2h.js`, `decks_100k.js`).

## 13. SLOs

`slo/`:

- `README.md` — SLO conventions
- `api-gateway.md`, `editor.md`, `postgres.md`, `realtime-gateway.md`,
  `phase-17.md`
- `oncall.yaml` — on-call routing
- `rules/` — alert rules
- `__tests__/` — SLO rule tests

## 14. Runbooks

`runbooks/`:

- `README.md`, `postmortem-template.md`
- `chaos/`, `postmortems/`, `service-runbooks/`, `tabletop-tests/`

## 15. Threat model

`threat-model/`:

- `00-process.md`, `01-definitions.md`
- `components/` — per-component threat models (e.g. `realtime-gateway.md`,
  `editor.md`)
- `__tests__/` — threat model tests

## 16. Synthetic monitoring

`infrastructure/synthetics/` — staged synthetic probes for status page.

## 17. Status page

`infrastructure/status-page/` — public status page config.

## 18. CDN

`infrastructure/cdn/` — CDN front-door config + cache plans.

## 19. Local dev

`infrastructure/local/`:

- `docker-compose.yml` (the infra-only compose)
- `init-postgres.sh`
- `prometheus.yml`
- `otel-collector-config.yaml`
- `grafana/` (local Grafana provisioning)
