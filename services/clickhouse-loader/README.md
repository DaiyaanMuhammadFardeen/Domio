# clickhouse-loader (Phase 17 W2)

Kafka → ClickHouse ingestion worker.

The loader subscribes to the `events.ingest.raw` Kafka topic, batches
up to **5 000 rows** or **1 second** of wall-clock time (whichever
comes first), and INSERTs the batch into the `events` table using the
native ClickHouse protocol. Offsets are committed only after a
successful INSERT so a failed flush forces a re-read on restart.

## Layout

```
services/clickhouse-loader/
├── cmd/loader/main.go          # entrypoint
├── internal/
│   ├── kafkacons/              # consumer + DLQ writer
│   ├── clickhouse/             # native-protocol writer
│   ├── model/                  # IngestRecord
│   ├── config/                 # env-driven config
│   ├── metrics/                # Prometheus collectors
│   └── observability/          # zap logger
└── Dockerfile                  # multi-stage distroless image
```

## Configuration

| Env var | Default | Notes |
|---|---|---|
| `KAFKA_BROKERS` | `localhost:9092` | comma-separated host:port |
| `KAFKA_TOPIC` | `events.ingest.raw` | source topic |
| `KAFKA_GROUP_ID` | `clickhouse-loader` | consumer group |
| `KAFKA_DLQ_TOPIC` | `events.ingest.dlq` | DLQ for bad JSON |
| `CLICKHOUSE_ADDR` | `localhost:9000` | native protocol port |
| `CLICKHOUSE_DB` | `domio_analytics` | database |
| `CLICKHOUSE_USER` | `default` | auth |
| `CLICKHOUSE_PASSWORD` | `` | auth |
| `BATCH_MAX_ROWS` | `5000` | flush trigger |
| `BATCH_MAX_MS` | `1000` | flush trigger |
| `CONCURRENCY` | `4` | partition consumers |
| `HEALTH_PORT` | `8080` | exposed for `/healthz`, `/readyz`, `/metrics` |

## Health

| Endpoint | Notes |
|---|---|
| `GET /healthz` | process up |
| `GET /readyz` | 200 once the consumer is running, 503 otherwise |
| `GET /metrics` | Prometheus text format |

## Metrics

- `domio_clickhouse_loader_inserts_total` (counter)
- `domio_clickhouse_loader_insert_failures_total` (counter)
- `domio_clickhouse_loader_rows_total` (counter)
- `domio_clickhouse_loader_dlq_total{reason}` (counter)
- `domio_clickhouse_loader_kafka_read_errors_total` (counter)
- `domio_clickhouse_loader_batch_size` (histogram)
- `domio_clickhouse_loader_insert_latency_seconds` (histogram)

## Run locally

```bash
go test ./services/clickhouse-loader/...
go build -o bin/loader ./services/clickhouse-loader/cmd/loader
./bin/loader
```

Or via docker-compose:

```bash
docker compose -f infrastructure/local/docker-compose.yml \
  --profile phase17 up clickhouse-loader
```
