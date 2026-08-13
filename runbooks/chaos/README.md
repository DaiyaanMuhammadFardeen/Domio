# runbooks/chaos — chaos drill history

Every chaos drill run leaves an audit trail here. Game days write a
per-run summary; the README tracks trends and recent regressions.

## Layout

```
runbooks/chaos/
├── README.md                          ← this file
├── postgres_failover/
│   ├── 2026-08-15-game-day.md        ← one file per run
│   └── ...
├── nats_partition/
│   ├── 2026-08-22-game-day.md
│   └── ...
├── ai_provider_fail/
├── cdn_outage/
└── region_isolation/
```

## When to run

| Drill               | Cadence            | Required for     | Defer to P22b? |
| ------------------- | ------------------ | ---------------- | -------------- |
| `postgres_failover` | monthly game day   | public-beta gate | no             |
| `nats_partition`    | monthly game day   | public-beta gate | no             |
| `ai_provider_fail`  | monthly game day   | public-beta gate | no             |
| `cdn_outage`        | monthly game day   | public-beta gate | no             |
| `region_isolation`  | quarterly game day | public-beta gate | no             |

Game day = scheduled event, on-call + SRE leadership + security on-call
attend; rollback authority is pre-delegated.

Ad-hoc drills (single-developer, staging only) are encouraged between
scheduled game days; record results in the same directory.

## What a per-run file looks like

```markdown
# postgres_failover drill — 2026-08-15

- Operator: @sre-on-call
- Cluster: domio-staging-aurora
- Failover target: domio-staging-aurora-replica-us-west-2
- RTO measured: 47 s
- RPO measured: 0 (synchronous replicas)
- Drill verdict: PASS
- Linked artifacts: drill runner log, CloudWatch metrics screenshot

## Action items

- AI-1: ...
```

Use the `drill-result-template.md` in this directory.

## Reading the trend

If the most recent N runs all show RTO close to budget, treat that as
a regression signal even if individual runs passed. The trend line
matters more than the absolute value.
