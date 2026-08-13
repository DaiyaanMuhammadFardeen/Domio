# Phase B — Wire missing services into docker-compose

## Context

`docker-compose.full.yml` exposes 14 services. The dashboard pages (`/crm`,
`/ab`, `/team`, `/live`) call backend services that aren't in the compose file at all.
Today they hit connection-refused and silently fall back to the `STUB_*` arrays
(see `apps/dashboard/src/app/{crm,ab,team}/page.tsx`).

These services already exist in `services/` and have their own Dockerfiles;
they just need stanzas in compose.

## Services to add

| Service          | Internal port | Already in `services/`? | Path                       |
| ---------------- | ------------- | ----------------------- | -------------------------- |
| `crm-sync`       | 8095          | yes                     | `services/crm-sync/`       |
| `ab-assignment`  | 8090          | yes                     | `services/ab-assignment/`  |
| `ab-measurement` | 8091          | yes                     | `services/ab-measurement/` |
| `ab-statistics`  | 8092          | yes                     | `services/ab-statistics/`  |
| `team-analytics` | 8093          | yes                     | `services/team-analytics/` |
| `live-analytics` | 8094          | yes                     | `services/live-analytics/` |

All six are HTTP / GraphQL services with the same `Node 22` + pnpm shape as
`event-ingest` and `analytics-warehouse`. Mirror the existing stanza shape: an
image build from `./services/<name>`, port mapping under `full` profile, health
check on `/v1/health`, env wired to ClickHouse / Redis / NATS as the service
needs.

## Files to change

`docker-compose.full.yml` — add 6 service stanzas under the `full` profile.
For each:

```yaml
<name>:
  build:
    context: .
    dockerfile: services/<name>/Dockerfile
  image: domio/<name>:dev
  profiles: [full]
  ports:
    - '<external>:<internal>'
  environment:
    CLICKHOUSE_URL: http://clickhouse:8123
    CLICKHOUSE_DB: domio
    REDIS_URL: redis://redis:6379
    NATS_URL: nats://nats:4222
    PORT: '<internal>'
  depends_on:
    clickhouse:
      condition: service_healthy
    redis:
      condition: service_healthy
  healthcheck:
    test: ['CMD', 'wget', '-q', 'http://localhost:<internal>/v1/health']
    interval: 10s
    timeout: 3s
    retries: 5
```

Pick the exact env vars by reading each service's `src/config.ts` (or env
loader). Don't guess — if a service needs `KAFKA_BROKERS`, wire it; if it
doesn't, leave it out.

## Dashboard env wiring

Add to the dashboard container's `environment` block:

```yaml
CRM_SYNC_URL: http://crm-sync:8095
AB_ASSIGNMENT_URL: http://ab-assignment:8090
AB_MEASUREMENT_URL: http://ab-measurement:8091
AB_STATISTICS_URL: http://ab-statistics:8092
TEAM_ANALYTICS_URL: http://team-analytics:8093
NEXT_PUBLIC_LIVE_HOST: ws://live-analytics:8094
```

## Verification

```bash
./bin/up full
podman ps --filter "label=io.podman.compose.project=domio"
curl -s http://localhost:8095/v1/health  # crm-sync
curl -s http://localhost:8090/v1/health  # ab-assignment
curl -s http://localhost:8091/v1/health  # ab-measurement
curl -s http://localhost:8092/v1/health  # ab-statistics
curl -s http://localhost:8093/v1/health  # team-analytics
curl -s http://localhost:8094/v1/health  # live-analytics
```

All six must return `{"status":"ok"}` (or whatever the service's contract is —
read its `src/server.ts` to confirm the health endpoint shape).

## Risk / out of scope

- Does NOT modify the service code itself. If a service has a missing health
  endpoint or crashes on boot, that's a separate bug.
- Does NOT touch `apps/api` — that's the orchestration gateway and has its
  own gap.
- Does NOT yet change the dashboard pages to consume these. That happens in
  Phase D.
