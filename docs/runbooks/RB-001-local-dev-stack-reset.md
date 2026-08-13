# RB-001: Local dev stack reset

## Symptoms

- `./bin/dev-up` fails or hangs.
- Postgres / Redis / MinIO / NATS behave erratically.
- "Permission denied" on a volume mount.
- Container won't start.

## Quick reset

```bash
./bin/dev-down --volumes
./bin/dev-up
```

This wipes the `./data/` directory (gitignored) and brings the stack
back up cleanly.

## If that doesn't work

```bash
# Stop everything.
docker compose -f infrastructure/local/docker-compose.yml down --volumes --remove-orphans

# Prune unused Docker bits.
docker system prune --volumes --filter "label=name=domio"

# Bring it back up.
./bin/dev-up
```

## Things to check

- Disk space: `df -h`. Compose state lives in `./data/`; large datasets
  can fill the disk.
- Docker daemon: `docker info`. If the daemon is hung, restart Docker
  Desktop.
- Port conflicts: `lsof -i :5432` (Postgres), `lsof -i :6379` (Redis),
  `lsof -i :4222` (NATS), `lsof -i :9000` (MinIO). Another process
  holding the port will break the stack.

## Escalation

- Slack: `#domio-engineering`.
- If the issue persists across multiple developers, it's likely a Docker
  daemon issue. File a bug.
