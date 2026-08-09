# Error Budget Policy — Phase 22-beta (G2)

Implements the burn-rate alert pattern from Google's SRE Workbook
(https://sre.google/workbook/alerting-on-slos/) for every SLO in
`docs/slos/catalogue.md`.

## Definitions

- **SLO** — a target like 99.9 % availability over 30 days.
- **Error budget** — `(1 - SLO) × window`. For 99.9 % over 30d, the
  budget is 43.2 minutes of allowed downtime.
- **Burn rate** — how fast the budget is being consumed, expressed as a
  multiple. Burn rate 1 means the budget will be exhausted exactly at the
  end of the window. Burn rate 2 means it will be exhausted in half the
  window. Burn rate 14.4 means it will be exhausted in 1/14.4 of the window.

## Burn-rate windows

The SRE Workbook recommends alerting on multiple burn-rate windows so
that fast burns are caught quickly and slow burns are caught before the
budget runs out. We adopt the following multi-window strategy:

| Window | Burn-rate threshold | Page severity | Rationale |
|---|---|---|---|
| **1 h** | 14.4× | **page** (tier-1) / **ticket** (tier-2/3) | Catches catastrophic regressions within an hour. |
| **6 h** | 6× | **page** (tier-1) / **ticket** (tier-2/3) | Catches fast sustained burns. |
| **24 h** | 3× | **ticket** | Catches slow sustained burns. |
| **72 h** | 1× | **ticket** | Catches "we will exhaust the budget in 30 days at this rate" trends. |

**PagerDuty service routing:** the alert manager fires `page` severity
directly; `ticket` severity opens a low-urgency PagerDuty ticket that
becomes a backlog item for the on-call's next business day.

## Alert name convention

Alerts derived from burn-rate windows are named:

```
SLOBurnHigh<Tier><Service><SloSuffix>
SLOBurnMed<Tier><Service><SloSuffix>
SLOBurnLow<Tier><Service><SloSuffix>
```

Where `<Tier>` is `T1` / `T2` / `T3`. Examples:

- `SLOBurnHighT1Audience` — tier-1 audience-service availability, 1h burn.
- `SLOBurnMedT1Audience` — tier-1 audience-service availability, 6h burn.
- `SLOBurnLowT2AiAdapterLat` — tier-2 ai-adapters latency, 72h burn.

These names are the contract between `docs/slos/catalogue.md`,
`infra/prometheus/alerts/`, and `infra/alertmanager/routes.yaml`. CI
asserts the three files agree.

## Burn-rate computation

For an availability SLO with target `p` and short-window error rate `e`:

```
burn_rate = e / (1 - p)
```

For a latency SLO with target `(p, threshold)` and the fraction of
requests slower than `threshold`:

```
burn_rate = (fraction_slow) / (1 - p)
```

The Prometheus alert rule uses `sloth` or equivalent tooling to compute
SLI error rates from raw metrics. We standardise on:

- **Availability SLI:** `1 - (sum(rate(http_requests_total{status=~"5.."}[<window>])) / sum(rate(http_requests_total[<window>])))`
- **Latency SLI:** `sum(rate(http_request_duration_seconds_bucket{le="<threshold>"}[<window>])) / sum(rate(http_request_duration_seconds_count[<window>]))`

## Budget enforcement

When a tier-1 service burns through 50 % of its 30-day budget:

- The release captain is notified.
- All non-critical deploys to that service are paused until burn rate
  drops below 1×.
- A post-mortem is required if the burn continues to 75 %.

When a tier-1 service burns through 100 % (budget exhausted):

- The service is auto-flagged in `infra/status-page/` as "degraded".
- The release captain + head of engineering are paged.
- All deploys across the platform are paused until the SLO is recovered.

## Multi-window alert example (Prometheus)

For an SLO of `99.9 % availability over 30d`:

```yaml
groups:
  - name: slo-burn-rate
    rules:
      # 1h window, 14.4× burn → page tier-1
      - alert: SLOBurnHighT1Audience
        expr: |
          (
            sum(rate(http_requests_total{service="audience",status=~"5.."}[1h]))
            /
            sum(rate(http_requests_total{service="audience"}[1h]))
          ) > (1 - 0.999) * 14.4
        for: 2m
        labels:
          severity: page
          slo: audience-availability
          tier: tier-1
        annotations:
          summary: "audience burning budget at >14.4× over 1h"
          runbook: "runbooks/audience/availability.md"

      # 6h window, 6× burn → page tier-1
      - alert: SLOBurnMedT1Audience
        expr: |
          (
            sum(rate(http_requests_total{service="audience",status=~"5.."}[6h]))
            /
            sum(rate(http_requests_total{service="audience"}[6h]))
          ) > (1 - 0.999) * 6
        for: 5m
        labels:
          severity: page
          slo: audience-availability
          tier: tier-1
        annotations:
          summary: "audience burning budget at >6× over 6h"
          runbook: "runbooks/audience/availability.md"

      # 24h window, 3× burn → ticket
      - alert: SLOBurnLowT1Audience
        expr: |
          (
            sum(rate(http_requests_total{service="audience",status=~"5.."}[24h]))
            /
            sum(rate(http_requests_total{service="audience"}[24h]))
          ) > (1 - 0.999) * 3
        for: 10m
        labels:
          severity: ticket
          slo: audience-availability
          tier: tier-1
        annotations:
          summary: "audience burning budget at >3× over 24h"
          runbook: "runbooks/audience/availability.md"
```

The full set of alert rules lives in `infra/prometheus/alerts/`,
generated by `services/obs-control-plane/` from the SLO catalogue.
