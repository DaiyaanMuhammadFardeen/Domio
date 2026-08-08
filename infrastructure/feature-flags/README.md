# Phase 17 — feature-flag kill switches

This directory holds the per-workstream kill switches for the Phase 17
analytics stack.  They exist as a **last-resort circuit breaker** for
incident response — they do not affect normal operation.

## Files

| File | Purpose |
|------|---------|
| `phase-17.yaml` | Canonical per-W + master kill switches (W0–W11) |
| `phase-16.yaml`  | Phase 16 audience-participation flags |
| `phase-21.yaml`  | Phase 21 recording-studio flags |

## Wiring

Each service reads its kill-switch at boot via a typed environment
variable:

```ts
// services/event-ingest/src/index.ts (sketch)
const DISABLED = process.env.PHASE17_W1_DISABLED === 'true';
if (DISABLED) {
  throw new Error(
    'event-ingest is disabled via phase17.w1.kill_switch; ' +
    'see infrastructure/feature-flags/phase-17.yaml',
  );
}
```

The full mapping is:

| Flag | Env var | Service(s) |
|------|---------|------------|
| `phase17.master_kill_switch` | `PHASE17_MASTER_DISABLED` | All Phase 17 services |
| `phase17.w0.kill_switch`     | `PHASE17_W0_DISABLED`     | viewer / presenter / join-web emitters, @domio/analytics-sdk |
| `phase17.w1.kill_switch`     | `PHASE17_W1_DISABLED`     | services/event-ingest |
| `phase17.w2.kill_switch`     | `PHASE17_W2_DISABLED`     | services/clickhouse-loader, services/analytics-warehouse |
| `phase17.w3.kill_switch`     | `PHASE17_W3_DISABLED`     | services/viewer-identity |
| `phase17.w4.kill_switch`     | `PHASE17_W4_DISABLED`     | services/sessionization |
| `phase17.w5.kill_switch`     | `PHASE17_W5_DISABLED`     | services/heatmap-generator |
| `phase17.w6.kill_switch`     | `PHASE17_W6_DISABLED`     | services/ab-{assignment,measurement,statistics} |
| `phase17.w7.kill_switch`     | `PHASE17_W7_DISABLED`     | services/crm-sync |
| `phase17.w8.kill_switch`     | `PHASE17_W8_DISABLED`     | services/notification-dispatcher |
| `phase17.w9.kill_switch`     | `PHASE17_W9_DISABLED`     | services/team-analytics, workers/team-analytics-rollup |
| `phase17.w10.kill_switch`    | `PHASE17_W10_DISABLED`    | services/live-analytics |
| `phase17.w11.kill_switch`    | `PHASE17_W11_DISABLED`    | services/benchmark, apps/dashboard |

## How to flip a switch

The flags are exposed via the standard platform feature-flag system
(`feature-flags.domio.internal`).  For an emergency page-level
disable:

1. Open the feature-flag console.
2. Set `phase17.<scope>.kill_switch` -> `rollout: 100%` for the affected
   environment (prod / staging).
3. The platform syncs the env var to all matching services within 30 s.
4. The affected services restart (or, if wired with the dynamic
   loader, hot-reload) into degraded mode.

For the **master** kill switch, set `phase17.master_kill_switch` to
`rollout: 100%`.  This sets `PHASE17_MASTER_DISABLED=true` on every
Phase 17 service simultaneously, atomically.

## Verification

Run `tools/feature-flag-verify.ts` (planned W11 follow-up) to assert
that every service honours its env var at boot.  Today the boot
behaviour is covered by `tests/integration/phase17` unit tests that
mock `process.env`.