# Local infrastructure

Bring up the local dev stack with `./bin/dev-up`.

## Services

| Service        | Port                                          | Notes                                                   |
| -------------- | --------------------------------------------- | ------------------------------------------------------- |
| Postgres 16    | 5432                                          | Control plane source of truth. `pgvector` enabled.      |
| Redis 7        | 6379                                          | Cache, rate-limit, idempotency.                         |
| NATS JetStream | 4222 (client), 8222 (monitor), 6222 (cluster) | Event bus.                                              |
| MinIO          | 9000 (S3 API), 9001 (console)                 | Object storage. Default creds `domio / domio-dev-only`. |
| ClickHouse     | 8123 (HTTP), 9000 (native TCP)                | Analytics OLAP.                                         |
| OpenSearch     | 9200 (HTTP), 9600 (perf)                      | Search + semantic queries.                              |
| MailHog        | 1025 (SMTP), 8025 (web UI)                    | Local email testing.                                    |
| OTel collector | 4317 (gRPC), 4318 (HTTP)                      | OTLP ingest.                                            |
| Prometheus     | 9090                                          | Metrics scrape.                                         |
| Grafana        | 3001                                          | Dashboards. Default creds `admin / admin`.              |
| Jaeger         | 16686 (UI)                                    | Tracing UI.                                             |

## Resetting

```bash
./bin/dev-down --volumes
```

This wipes the `./data/` directory.

## Connection strings

See `.env.example` for defaults. Copy to `.env` to override.
