# Domio SLO Index

This directory contains the per-component Service Level Objectives (SLOs)
that underwrite the platform's availability commitments and on-call
rotation. SLOs are derived from the observed user journey; if a budget
is consumed faster than the burn rate allows, alerts page the on-call
rotation defined in [`oncall.yaml`](./oncall.yaml).

## Files

| File                     | Purpose                                       |
| ------------------------ | --------------------------------------------- |
| `api-gateway.md`         | Public REST/GraphQL gateway SLOs              |
| `realtime-gateway.md`    | WebSocket realtime fanout SLOs                |
| `editor.md`              | Collab editor (CRDT) read/write SLOs          |
| `postgres.md`            | Primary database latency and replication SLOs |
| `oncall.yaml`            | Rotation schedule and escalation tree         |
| `rules/budget-burn.yaml` | Multi-window multi-burn-rate alert rules      |
| `dashboards/*.json`      | Grafana dashboard manifests                   |

## Methodology

We follow the [Google SRE workbook](https://sre.google/workbook/table-of-contents/)
approach:

1. **Identify the user journey** that matters (e.g. `POST /v1/documents`).
2. **Choose an SLI** (e.g. success rate, latency percentile, freshness).
3. **Set an SLO target** that is _just barely_ better than what we
   measured pre-Phase 1 and is _meaningfully worse_ than the user
   tolerance. We never pick 100% — that's a load-bearing lie.
4. **Compute the error budget** = `1 - SLO` over a 28-day rolling window.
5. **Define burn-rate alerts** at the 2%/1h and 9%/5min Google thresholds
   so we don't have to wait a full budget cycle to react.
6. **Track consumption** in the weekly review; if the budget runs out,
   the rule in [`oncall.yaml`](./oncall.yaml) freezes non-emergency
   deploys.

## Burn-Rate Policy

| Window | Burn-rate | Pages? | Reasoning                              |
| ------ | --------- | ------ | -------------------------------------- |
| 5 min  | ≥ 14.4×   | page   | "We will run out of budget in 2 days"  |
| 30 min | ≥ 6×      | page   | "We will run out of budget in 5 days"  |
| 1 h    | ≥ 3×      | ticket | "We will run out of budget in 10 days" |
| 6 h    | ≥ 1×      | ticket | Steady drain that may hide a release   |
| 3 d    | ≥ 1×      | ticket | Slow structural drift                  |

The full Prom ruleset implementing these rates lives in
[`rules/budget-burn.yaml`](./rules/budget-burn.yaml).
