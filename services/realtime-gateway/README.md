# realtime-gateway

Go WebSocket service for Phase 04 realtime collaboration. Replaces the earlier TypeScript stub.

## Endpoints

| Endpoint                    | Protocol                             | Purpose            |
| --------------------------- | ------------------------------------ | ------------------ |
| `GET /v1/sync/{deckId}`     | WebSocket (length-prefixed protobuf) | CRDT sync          |
| `GET /v1/presence/{deckId}` | WebSocket (length-prefixed protobuf) | Presence tracking  |
| `GET /healthz`              | HTTP                                 | Liveness probe     |
| `GET /readyz`               | HTTP                                 | Readiness probe    |
| `GET /metrics`              | HTTP                                 | Prometheus metrics |

## Wire format

Binary protobuf frames: 4-byte big-endian length prefix followed by a serialized `domio.realtime.v1.Message`.

## Environment variables

| Variable                       | Default                 | Description                  |
| ------------------------------ | ----------------------- | ---------------------------- |
| `PORT`                         | `8080`                  | HTTP listen port             |
| `NATS_URL`                     | `nats://localhost:4222` | NATS connection URL          |
| `REDIS_ADDR`                   | `localhost:6379`        | Redis address                |
| `POSTGRES_URL`                 | —                       | PostgreSQL connection string |
| `JWT_JWKS_URL` or `JWT_SECRET` | —                       | JWT verification             |
| `OTEL_EXPORTER_OTLP_ENDPOINT`  | —                       | OpenTelemetry exporter       |

## Build

```bash
go build ./services/realtime-gateway/cmd/rtgw
```

## Test

```bash
go test ./services/realtime-gateway/...
```
