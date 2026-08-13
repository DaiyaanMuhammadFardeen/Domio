# Domio — Run everything via Docker / Podman

Single-command bring-up of the entire public-beta surface, including
infrastructure, backend services, and the two Next.js apps.

## TL;DR

```bash
# First time: copy env template (optional; defaults work for local dev)
cp .env.example .env

# Bring up the whole stack:
./bin/up

# Or pick a smaller profile:
./bin/up core          # just Postgres/Redis/NATS/MinIO/ClickHouse/OpenSearch
./bin/up services      # core + event-ingest + clickhouse-loader + warehouse + presenter-session
./bin/up apps          # core + editor (3100) + dashboard (3000)
./bin/up obs           # core + observability tier (Prometheus/Grafana/Jaeger)
./bin/up full          # everything (default for ./bin/up with no arg)

# Tear down:
./bin/down             # stop containers (data preserved)
./bin/down --volumes   # wipe volumes (full reset)
```

> If `docker compose` is unavailable, `podman-compose` is detected automatically.

## What you get

| URL                       | What                       | Profile                       |
| ------------------------- | -------------------------- | ----------------------------- |
| `http://localhost:3000`   | Dashboard                  | apps / full                   |
| `http://localhost:3100`   | Editor                     | apps / full                   |
| `http://localhost:3010`   | Presenter session service  | services / full               |
| `http://localhost:3020`   | Event ingest (Phase 17)    | services / full               |
| `http://localhost:3030`   | Analytics warehouse        | services / full               |
| `http://localhost:3040`   | Clickhouse loader (health) | services / full               |
| `localhost:5432`          | Postgres 16 (pgvector)     | core / services / apps / full |
| `localhost:6379`          | Redis 7                    | core / services / apps / full |
| `localhost:4222`          | NATS JetStream             | core / services / full        |
| `localhost:9000` / `9001` | MinIO S3 API / console     | core / services / full        |
| `localhost:8123` / `9002` | ClickHouse HTTP / native   | core / services / full        |
| `localhost:9200`          | OpenSearch                 | core                          |
| `localhost:8025`          | MailHog (SMTP UI)          | core                          |
| `localhost:4317` / `4318` | OTel collector gRPC / HTTP | obs / full                    |
| `localhost:9090`          | Prometheus                 | obs / full                    |
| `http://localhost:3001`   | Grafana (admin/admin)      | obs / full                    |
| `http://localhost:16686`  | Jaeger                     | obs / full                    |

## Profile matrix

| Profile    | Postgres / Redis / NATS | MinIO / ClickHouse / OpenSearch / MailHog | OTel / Prometheus / Grafana / Jaeger | editor / dashboard | event-ingest / warehouse / loader / presenter-session |
| ---------- | :---------------------: | :---------------------------------------: | :----------------------------------: | :----------------: | :---------------------------------------------------: |
| `core`     |            ✓            |                     ✓                     |                  —                   |         —          |                           —                           |
| `services` |            ✓            |                     ✓                     |                  —                   |         —          |                           ✓                           |
| `apps`     |            ✓            |                     ✓                     |                  —                   |         ✓          |                           —                           |
| `obs`      |            ✓            |                     ✓                     |                  ✓                   |         —          |                           —                           |
| `full`     |            ✓            |                     ✓                     |                  ✓                   |         ✓          |                           ✓                           |

## Manual docker compose

If you'd rather use `docker compose` directly:

```bash
# Everything (default profile is 'full'):
docker compose -f docker-compose.full.yml --profile full up -d

# Just infrastructure + apps:
docker compose -f docker-compose.full.yml --profile apps up -d

# Build + start in one shot:
docker compose -f docker-compose.full.yml --profile full up -d --build
```

Podman users:

```bash
podman-compose -f docker-compose.full.yml --profile full up -d
```

## Layered compose (advanced)

If you prefer to layer the compose files — say, to start infra first,
wait for Postgres, then bring up services:

```bash
# Step 1: infra
docker compose -f docker-compose.full.yml --profile core up -d

# Step 2: tier-1 services
docker compose -f docker-compose.full.yml --profile services up -d

# Step 3: apps
docker compose -f docker-compose.full.yml --profile apps up -d
```

## Configuration

`.env` (copy from `.env.example`) controls ports and secrets. The
compose file reads:

```env
POSTGRES_USER=domio
POSTGRES_PASSWORD=domio
POSTGRES_DB=domio
POSTGRES_PORT=5432

REDIS_URL=redis://redis:6379
NATS_URL=nats://nats:4222

S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=domio
S3_SECRET_KEY=domio-dev-only
S3_BUCKET=domio-assets

CLICKHOUSE_URL=http://clickhouse:8123
CLICKHOUSE_USER=domio
CLICKHOUSE_PASSWORD=domio
CLICKHOUSE_DB=domio_analytics

INGEST_HMAC_KEY_HEX=00112233445566778899aabbccddeeff
```

## Database migrations

After the stack is up, apply migrations:

```bash
./bin/db-migrate
```

This is a thin wrapper around `pnpm --filter @domio/api migrate`.

## Reset everything

```bash
./bin/down --volumes
./bin/up
```

## What does NOT run via docker compose

- **k6 load tests** — run on the host against the running stack:
  ```bash
  INGEST_URL=http://localhost:3020 pnpm exec k6 run infra/loadtest/ingest_timeline.js
  ```
- **Playwright e2e suites** — see `.github/workflows/editor-e2e.yml`
  for the CI shape; locally run with:
  ```bash
  pnpm --filter @domio/editor exec playwright test
  pnpm --filter @domio/dashboard exec playwright test
  ```
- **Vitest unit tests** — `pnpm test` on the host.

## Production deployment

`docker-compose.full.yml` is for **local dev only**. Production runs
through:

- `.github/workflows/deploy.yml` — staging (auto on master push) and
  production (gated; manual approval via `environment: production`).
- `infrastructure/helm/` — Helm charts for the cluster.
- `infrastructure/argocd/` — ArgoCD app definitions.
- `infrastructure/terraform/` — cloud provisioning.

See [`docs/runbooks/release-readiness.md`](docs/runbooks/release-readiness.md)
for the release-cut checklist.

## Troubleshooting

| Symptom                                                         | Fix                                                                                                       |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `bind: address already in use` on `:5432` etc.                  | Another service on the host owns the port. Either stop it or override `POSTGRES_PORT` etc. in `.env`.     |
| Containers exit immediately with `permission denied` on `/data` | SELinux / AppArmor blocking volume mounts. Add `:z` to volume mounts, or disable for dev.                 |
| OOM kill on `clickhouse`                                        | Reduce `OPENSEARCH_JAVA_OPTS` (already `-Xms512m -Xmx512m`) and lower the `--memory` knob for ClickHouse. |
| `docker compose` not found                                      | Install Docker Desktop (macOS/Windows) or `docker-compose-plugin` (Linux).                                |
| `podman-compose` not found                                      | `brew install podman-compose` (macOS) or `pip install podman-compose` (Linux).                            |
| Editor 500 errors at startup                                    | Postgres isn't healthy yet — wait 10–20 s and refresh.                                                    |

## See also

- `infrastructure/local/docker-compose.yml` — the original data-plane
  compose. Kept for backward compatibility with `./bin/dev-up`.
- `infrastructure/local/README.md` — service-level docs for the data
  plane.
- `.github/workflows/deploy.yml` — production deploy pipeline.
