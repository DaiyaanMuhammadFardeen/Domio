# @domio/crdt-bench

> Convergence benchmark for the Domio Yjs CRDT substrate. Phase 22-beta G1-4.

## Why this package exists

P22-beta G1-4 promises:

- **1,000 concurrent editors** on a single deck
- **<5 s p95 convergence** for any single edit to reach all peers
- Convergence under **mixed workloads** (text + shapes + slide inserts)

We need a deterministic in-process benchmark that exercises the **same**
Yjs version and **same** `SubDocRegistry` that production uses. The
official `yjs-bench` doesn't speak the SubDoc protocol and only
benchmarks ops/sec — neither is what we need.

## Public API

```ts
import {
  runConvergenceBench,
  createEditor,
  SCENARIO_MIXED_1K,
  reportBench,
  serializeReport,
} from '@domio/crdt-bench';
```

### `runConvergenceBench(opts)`

Spawns `opts.editorCount` virtual editors. Each has its own `Y.Doc`
and `SubDocRegistry`. The harness simulates a server by relaying
Yjs updates between peers — including sub-doc updates, so per-slide
CRDT convergence is measured.

Returns a `BenchResult` with p50/p95/p99/max/mean convergence latency
in milliseconds.

### `createEditor({ id })`

Creates a fresh `VirtualEditor` with its own deck doc + seeded
`slide-0` sub-doc.

### Scenarios

| Preset                  | Editors | Edits/editor | Cadence | Use case              |
|-------------------------|---------|--------------|---------|------------------------|
| `SCENARIO_TEXT_INSERT_SMOKE` | 100 | 50  | 10 ms | Sanity check           |
| `SCENARIO_MIXED_1K`          | 1000 | 50 | 0 ms  | P22-beta headline      |
| `SCENARIO_SHAPE_ADD_CI`      | 500 | 100 | 5 ms  | CI steady-state        |
| `SCENARIO_TEXT_INSERT_SOAK`  | 100 | 1000 | 1 ms | 100k-edit soak / leak  |

## Report format

`reportBench(result)` produces a `BenchReport` with `schemaVersion: 1`.
`serializeReport` emits the JSON with sorted keys at every depth, so
two equivalent runs (modulo `generatedAt`) byte-compare.

## How a regression is wired into CI

```
1. The headline 1k-editor run produces a BenchReport JSON.
2. The report is committed to the `perf-baselines` branch.
3. The next day's run diffs the report against the baseline.
4. If `p95` regressed by >10%, CI fails.
```

## Out of scope here

- Real network transport (this is in-process; the production relay
  is `services/collab-relay/` and uses the same Yjs encoding).
- Browser-driven replay (Puppeteer lives in
  `apps/editor/perf/canvas_fps.spec.ts`, G1-3).

## See also

- `apps/editor/perf/canvas_fps.spec.ts` — G1-3 (canvas FPS)
- `packages/perf-harness/` — G1-2 (frame-time measurement)
- `docs/development_phases/phase-22-beta-hardening.md` §4.1 — WS-G1
- `docs/p22b/gap-inventory.md` §K — crdt-bench status