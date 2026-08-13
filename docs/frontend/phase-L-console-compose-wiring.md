# Phase L — Marketplace + Console services into docker-compose

## Context

Phase B wires the 6 services the dashboard talks to. Several OTHER apps
(`admin-console`, `creator-console`, `marketplace-web`, `join-web`) need a
much larger set of services that aren't yet in compose:

- `marketplace` (services/marketplace/) — listings, purchases
- `creator-analytics` — revenue, downloads, ratings
- `guests` — guest invites, redeem
- `library` — creator's saved components
- `suggestions` — merge-request suggestions
- `merge-requests` — merge-request workflow
- `expiry` — expiry policies
- `calendar` — calendar sync
- `meeting-integration` — Zoom/Meet/Teams
- `task-manager` — assignment tasks
- `participant-session` — audience WS
- `audience-service` — widgets (poll, qa, quiz, etc.)
- `embed-proxy` — share-link routing
- `permission-engine` — RBAC

## Services to add

Read each service's `src/server.ts` (or `src/index.ts`) to confirm its
default port and env requirements. The table below is the starting point:

| Service               | Default port | Notes                       |
| --------------------- | ------------ | --------------------------- |
| `marketplace`         | 8100         | needs Postgres for listings |
| `creator-analytics`   | 8099         | needs ClickHouse            |
| `guests`              | 8098         | needs Postgres              |
| `library`             | 8101         | needs Postgres              |
| `suggestions`         | 8102         | needs Postgres              |
| `merge-requests`      | 8103         | needs Postgres              |
| `expiry`              | 8104         | needs Postgres              |
| `calendar`            | 8105         | needs Postgres              |
| `meeting-integration` | 8106         | needs Postgres              |
| `task-manager`        | 8107         | needs Postgres              |
| `participant-session` | 3011         | needs Redis + NATS          |
| `audience-service`    | 8097         | needs Redis                 |
| `embed-proxy`         | 8096         | stateless, just config      |
| `permission-engine`   | 8108         | needs Postgres              |

For Postgres-needing services, add a shared `domio-postgres` container
(if not already in compose) or per-service schema migrations.

## Files to change

- `docker-compose.full.yml` — add all stanzas under the `full` profile,
  mirroring the Phase B pattern.

## Env wiring per app

### `admin-console`

```yaml
environment:
  MARKETPLACE_URL: http://marketplace:8100
  CREATOR_ANALYTICS_URL: http://creator-analytics:8099
```

### `creator-console`

```yaml
environment:
  MARKETPLACE_URL: http://marketplace:8100
  CREATOR_ANALYTICS_URL: http://creator-analytics:8099
  LIBRARY_URL: http://library:8101
```

### `marketplace-web`

```yaml
environment:
  MARKETPLACE_URL: http://marketplace:8100
  CREATOR_ANALYTICS_URL: http://creator-analytics:8099
```

### `join-web`

```yaml
environment:
  PARTICIPANT_SESSION_URL: ws://participant-session:3011
  AUDIENCE_SERVICE_URL: http://audience-service:8097
```

### `viewer`

```yaml
environment:
  EMBED_PROXY_URL: http://embed-proxy:8096
```

### `magic-link-landing`

```yaml
environment:
  GUESTS_URL: http://guests:8098
  PERMISSION_ENGINE_URL: http://permission-engine:8108
```

### `landing`

None — landing is static.

## Verification

```bash
./bin/up full
podman ps --filter "label=io.podman.compose.project=domio"
# all services must be healthy
for port in 8096 8097 8098 8099 8100 8101 8102 8103 8104 8105 8106 8107 8108 3011; do
  curl -s "http://localhost:$port/v1/health" && echo " : $port OK"
done
```

## Risk / out of scope

- Adding Postgres to compose if not already there.
- Service code bugs are out of scope — if a service crashes on boot,
  fix it in a separate phase.
- The console apps may not all 200 on their existing routes even with
  services up; that's the runtime fix in Phases H/K and any other
  console-specific phase we discover.
