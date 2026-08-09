# @domio/perf-harness

> Frame-time measurement, replay, and regression detection for the
> Domio perf suite. Phase 22-beta G1-2.

## Why this package exists

P22-beta G1 promises hard perf budgets on existing surfaces:

- Canvas sustains **60 fps p50** with **500+ elements** for 60 min
- CRDT convergence **<5 s p95** with 1k concurrent editors
- Presenter session **stable for 2 hours** with no OOM

None of those budgets can be enforced without a harness that:

1. **Measures frame times** deterministically (p50 / p95 / p99).
2. **Replays a canonical scenario** at adjustable time-scale (so CI
   can finish in minutes, not hours).
3. **Detects regressions** vs a recorded baseline.

This package provides those three primitives. The actual workload
("render 500 elements") is owned by the consumer — the harness is
workload-agnostic.

## Public API

```ts
import {
  measureFrames,
  detectRegression,
  runReplay,
  reportFrameStats,
  reportReplay,
  serializeReport,
  syntheticFrameSource,
  syntheticPresenterSource,
  PRESENTER_2H_STABILITY,
  getReplayScenario,
} from '@domio/perf-harness';
```

### `measureFrames({ frameCount, source })`

Measures `frameCount` frames from a `FrameSource`, returns
`FrameStats` with p50/p95/p99/jitter.

### `detectRegression(baseline, current, thresholds)`

Compares two `FrameStats`. Returns an array of verdicts; each verdict
indicates whether a metric regressed by more than the threshold (default
10% for p95 and fps drop, 20% for p99).

### `runReplay({ scenario, sourceFactory })`

Replays a `ReplayScenario` for `durationMs / timeScale` ms. Aborts on
jank (frames below `minFps` for `jankToleranceMs`), on memory budget
breach, or on external abort signal.

### `reportFrameStats` / `reportReplay` / `serializeReport`

Produce a deterministic JSON report (key-sorted, schemaVersion 1).
The format is stable across runs so the regression detector can do
byte-for-byte comparison.

### `syntheticPresenterSource` / `PRESENTER_2H_STABILITY`

In-process mirror of `infra/loadtest/presenter_2h.js`. Emits a
frame per slide advance with poll markers every 5th slide. Use
together with `runReplay` to exercise the G1-5 stability budget
in CI without scheduling a 2-hour k6 run.

## Scenarios shipped with the harness

| Scenario id | Source | Wall time (CI) | Wall time (game day) |
|-------------|--------|----------------|------------------------|
| `canvas-fps-500-elems` | `@domio/canvas` | 6 min (`timeScale=10`) | 60 min (`timeScale=1`) |
| `crdt-converge-1k-editors` | `@domio/yjs-shared` | 30 s | 5 min |
| `presenter-2h-stability` | presenter synthetic | 12 s (`timeScale=600`) | 2 h |

## How a regression is wired into CI

```
1. Nightly run produces a PerfReport JSON.
2. The report is committed to the `perf-baselines` branch
   (separate, write-only from CI).
3. The next day's run diffs the report against the baseline.
4. If `detectRegression` returns any `regressed: true`, CI fails.
```

## Out of scope here

- Real browser integration (Puppeteer driver lives in
  `apps/editor/perf/canvas_fps.spec.ts`, G1-3).
- Distributed replay (single-process harness; multi-process for
  G1-4 CRDT bench lives in `packages/crdt-bench/`).

## See also

- `apps/editor/perf/canvas_fps.spec.ts` — G1-3
- `packages/crdt-bench/` — G1-4
- `docs/development_phases/phase-22-beta-hardening.md` §4.1 — WS-G1
- `docs/p22b/gap-inventory.md` §J — perf-harness status