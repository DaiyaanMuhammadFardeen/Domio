# Phase 04 — Convergence Test Suite

## Quick Start

```bash
# Run the convergence corpus (all 100 seeds × 335 scenarios + 3 specific scenarios)
cd /home/daiyaan2002/Desktop/Projects/domio
VITEST_WORKSPACE=1 npx vitest run --config vitest.config.ts tests/convergence/

# Run just the scenario corpus
VITEST_WORKSPACE=1 npx vitest run --config vitest.config.ts tests/convergence/yjs-scenarios.test.ts
```

## What the Corpus Covers

**335 generated concurrent-edit scripts** across 7 categories, each executed over **100 deterministic seeds** (mulberry32 PRNG, seeds 1–100), yielding **33,500+ scenario-cases**.

### Category Breakdown

| Category                     | Count | Description                                                                         |
| ---------------------------- | ----- | ----------------------------------------------------------------------------------- |
| `concurrent-property-edits`  | 90    | Different props / same prop on different elements / same prop on same element (LWW) |
| `concurrent-reorders`        | 60    | Element z-order moves + slide reorder on deck root                                  |
| `concurrent-text-image-ops`  | 45    | Text insertions + element prop mutations + overlapping text positions               |
| `concurrent-insert-delete`   | 50    | Element insert vs delete + text insert vs delete                                    |
| `concurrent-map-merge`       | 45    | Y.Map property bag merges + multi-key writes                                        |
| `concurrent-z-order-insert`  | 25    | Inserting new elements at the same position in z-order                              |
| `concurrent-cross-deck-drag` | 20    | Moving different elements to different positions in a deck array                    |

### Documented Scenarios

| ID    | Description                                                                          |
| ----- | ------------------------------------------------------------------------------------ |
| `(a)` | Single slide with 500 elements converges deterministically across **three replicas** |
| `(b)` | Concurrent slide reorder via RGA pattern on the deck root doc                        |
| `(d)` | Presence state merges correctly (last-write-wins on cursor position per user)        |

## Convergence Assertion

Every scenario follows this pattern:

1. Build identical initial state in two Y.Doc replicas
2. Apply a deterministic sequence of edits to each replica independently (concurrent, un-synced)
3. Sync both ways via `Y.encodeStateAsUpdate` / `Y.applyUpdate`
4. Assert **byte-equal convergence**:
   - `Y.encodeStateVector(docA) === Y.encodeStateVector(docB)`
   - `Y.encodeStateAsUpdate(docA) === Y.encodeStateAsUpdate(docB)`

## Seed Determinism

Each scenario uses a **mulberry32** seeded PRNG. The seed for each `(scenario, seed)` pair is:

```
rng = mulberry32(seed * 1000 + hashString(scenario.id))
```

This guarantees:

- Reproducibility: the same seed always produces the same edit sequence
- Independence: different scenarios at the same seed produce different edits
- Determinism: no `Math.random()` or external entropy

## File Structure

```
tests/convergence/
├── yjs-scenarios.test.ts   # Main corpus: 335 generated scenarios + 3 documented scenarios
└── README.md               # This file
```

## Technical Notes

- **yjs import**: `yjs` is not hoisted to the repo root by pnpm strict mode. Tests import it via the relative path `../../packages/yjs-shared/node_modules/yjs`.
- **vitest aliases**: `@domio/yjs-shared` and `@domio/schema` resolve at runtime via the workspace vitest config aliases (not available to LSP).
- **Performance**: ~62 seconds for the full corpus on a modern machine (335 tests × 100 seeds each).
