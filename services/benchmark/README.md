# benchmark

Phase 17 W11 — Benchmark service.

Manages a registry of statistical benchmarks (A/B comparisons of a
metric over two cohorts), persists per-day snapshots, runs the chosen
inference method (Welch's t-test, Mann-Whitney U, or Bayesian
normal-normal), and signs payloads for tamper-evident export.

## Layout

```
cmd/benchmark/main.go           — entrypoint
internal/model/                 — domain types
internal/store/                 — in-memory + ClickHouse + Postgres mirror
internal/registry/              — CRUD + SHA-256 payload signing
internal/stats/                 — Welch, Mann-Whitney, Bayesian (pure Go)
internal/inference/             — dispatcher + shared result type
internal/httpapi/               — chi router, routes, HMAC verify
internal/hmac/                  — HMAC-SHA256 signing-key utilities
internal/integration/           — smoke harness
```

## Endpoints

```
GET    /healthz                       liveness
GET    /readyz                        readiness
POST   /v1/benchmarks                 register a benchmark
GET    /v1/benchmarks                 list benchmarks for the workspace
GET    /v1/benchmarks/{id}            fetch one benchmark
POST   /v1/benchmarks/{id}/archive    archive a benchmark
POST   /v1/benchmarks/{id}/sign       compute the SHA-256 signature
POST   /v1/benchmarks/{id}/snapshots  ingest a snapshot (HMAC-protected)
POST   /v1/benchmarks/{id}/infer      run the chosen inference method
```

All routes use `X-Workspace-Id` as the tenant boundary (UUID). Missing
or mismatched workspace ids are 400.

## Example: register and sign

```bash
curl -s -X POST http://localhost:8095/v1/benchmarks \
  -H 'content-type: application/json' \
  -H "X-Workspace-Id: $WS" \
  -d '{
        "name": "dwell_ms_control_vs_treatment",
        "metric_name": "session_dwell_ms",
        "variant_a_key": "control",
        "variant_b_key": "treatment",
        "method": "welch_t"
      }'

curl -s -X POST http://localhost:8095/v1/benchmarks/$ID/sign \
  -H "X-Workspace-Id: $WS"
# → {"signature": "8c8c4d..."}
```

## Configuration

| Env var                | Default           | Notes                            |
| ---------------------- | ----------------- | -------------------------------- |
| `PORT`                 | `8095`            | listen port                      |
| `CLICKHOUSE_URL`       | _(empty)_         | enables the warehouse sink       |
| `CLICKHOUSE_DB`        | `domio_analytics` |                                  |
| `CLICKHOUSE_USER`      | `default`         |                                  |
| `CLICKHOUSE_PASSWORD`  | _(empty)_         |                                  |
| `DATABASE_URL`         | _(empty)_         | enables the Postgres mirror      |
| `BENCHMARK_INGEST_KEY` | _(empty)_         | required for `/snapshots` (HMAC) |
