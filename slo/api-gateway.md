# SLO: api-gateway

Owner: `api-platform@example.com`
Reviewers: SRE on-call
Window: 28-day rolling
Severity routing: `oncall.yaml`

## User journeys

| ID    | Journey                              | Endpoint(s)                         |
|-------|--------------------------------------|-------------------------------------|
| AG-1  | Authenticated read of a resource     | `GET /v1/:type/:id`                 |
| AG-2  | Authenticated write of a resource    | `POST /v1/:type` + `PUT /v1/:type/:id` |
| AG-3  | Cross-tenant list / search           | `GET /v1/:type?filter=...`          |

## SLIs and SLOs

| SLI                            | SLO target | Lower-bound (ticket) | Page threshold       |
|--------------------------------|------------|----------------------|----------------------|
| AG-1 availability              | 99.9%      | 99.5% over 6h        | 99% over 5m          |
| AG-1 latency p95 (read)        | 200 ms     | > 350 ms / 6h        | > 750 ms / 5m        |
| AG-2 availability              | 99.5%      | 99.0% over 6h        | 98% over 5m          |
| AG-2 latency p99 (write)       | 500 ms     | > 1s / 6h            | > 2s / 5m            |
| AG-3 cross-tenant leak rate    | 0 / month  | any 1 / 6h           | any 1 / 5m           |

**Error-budget calculation** (example for AG-1, 28-day window):

```
total_requests_28d = 250_000_000        # production estimate
allowable_failures = 0.001 × total     # = 250,000 failures
```

## Burn-rate alerts

| ALERT ID                | Burn-rate | Window | Action  |
|-------------------------|-----------|--------|---------|
| ApiGatewayAvailBurnFast | 14.4×     | 5m     | page    |
| ApiGatewayAvailBurnSlow | 6×        | 30m    | page    |
| ApiGatewayLatBurnFast   | 14.4×     | 5m     | page    |
| ApiGatewayLatBurnSlow   | 6×        | 30m    | page    |

Concrete Prom expressions are emitted into
[`../infrastructure/helm/observability/templates/slo-alerts.yaml`](../infrastructure/helm/observability/templates/slo-alerts.yaml).

## Measurement details

- **Source**: `http_requests_total` and `http_request_duration_seconds_bucket`
  emitted by the gateway's request middleware.
- **Filtering**: `service="api-gateway"` plus `route_group=~"v1\\..*"`.
- **Tenant scope**: SLI is computed *per tenant class* (free vs paid);
  budgets are summed, not averaged.
- **Exclusions**: synthetic probes (`user_agent=~"k6-.*"`), 429s emitted
  by our rate limiter (those are part of `D` in the threat model, not
  the SLI).

## Runbook hooks

- `runbooks/api-gateway-5xx.md` — pages first responder
- `runbooks/api-gateway-latency.md` — pages when p99 > 2s

## Notes

We do *not* include `429 Too Many Requests` in the availability SLI —
those are intentional rejection of an abusive client and budget them
separately under the rate-limit SLI.
