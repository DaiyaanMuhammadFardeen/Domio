# infra/chaos — chaos engineering

P22-beta chaos drills. Each drill is a Terraform module + Python
assertion script. The Terraform wires IAM and CloudWatch alarms; the
script drives the failure mode and asserts the budget is held.

## Drills

| Drill               | Budget                                     | Source                                         |
| ------------------- | ------------------------------------------ | ---------------------------------------------- |
| `postgres_failover` | RTO ≤ 60 s, RPO = 0                        | [`postgres_failover.tf`](postgres_failover.tf) |
| `nats_partition`    | consumer lag ≤ 300 s                       | [`nats_partition.tf`](nats_partition.tf)       |
| `ai_provider_fail`  | degradation ≤ 5 s                          | [`ai_provider_fail.tf`](ai_provider_fail.tf)   |
| `cdn_outage`        | core render ≤ 5000 ms; status page ≤ 120 s | [`cdn_outage.tf`](cdn_outage.tf)               |
| `region_isolation`  | traffic shift ≤ 30 s                       | [`region_isolation.tf`](region_isolation.tf)   |

## How a drill is wired

```
[drill_runner EC2 instance]
    │
    ├── assumes role: drill_runner (per-drill, scoped to target resource)
    │
    ├── invokes <drill>_asserts.py
    │
    │       (assertion script)
    │       1. captures baseline
    │       2. injects the failure
    │       3. measures the recovery
    │       4. publishes CloudWatch metrics under Domio/Chaos
    │       5. exits 0 (pass) or 1 (fail)
    │
    └── writes per-run summary to runbooks/chaos/<drill>/YYYY-MM-DD-...
```

## Master switch

Every drill's Terraform has `drill_enabled = false` by default.
`terraform apply` against any drill without flipping this is a no-op.
This is the safety gate: an accidental `terraform apply` in CI cannot
trigger a real failure injection.

## When drills run

Game day (monthly for postgres / nats / ai / cdn; quarterly for
region). See [`runbooks/chaos/README.md`](../../runbooks/chaos/README.md)
for the schedule and the audit-trail convention.

## Out of scope (P22b)

- Multi-region writer failover (single-region writer + read replica
  promotion today)
- Biometric sandbox escape drill (depends on F207/F208/F209/F214)
- Application-level circuit breaker drills (separate workstream)

## See also

- [`tests/chaos/drill-contracts.test.ts`](../../tests/chaos/drill-contracts.test.ts) — CI checks
- [`docs/development_phases/phase-22-beta-hardening.md` §4.3](../../docs/development_phases/phase-22-beta-hardening.md) — WS-G3 scope
- [`docs/development_phases/phase-22-beta-hardening.md` §6](../../docs/development_phases/phase-22-beta-hardening.md) — verification matrix
