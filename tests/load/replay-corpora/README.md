# Replay corpora — 1M-event determinism fixture

This fixture exercises the **sessionization determinism** invariant: given
the same input events, the sessionization consumer must produce the same
`session_id` sequences on every replay.  Without this guarantee, downstream
features (heatmap attribution, A/B exposure join, CRM scoring) cannot
trust session-bound events.

## Layout

```
tests/load/replay-corpora/
├── README.md           — this file
├── generate.ts         — deterministic 1M-event corpus generator
├── replay.ts           — runs the corpus through services/sessionization 5x
├── replay.test.ts      — vitest unit test (1000-event subset, runs in CI)
└── corpus-1m.ndjson    — (gitignored) generated artifact, ~120 MB
```

## Determinism

`generate.ts` builds the corpus deterministically using a tiny LCG
seeded by `0xDEADBEEF`.  The event distribution is:

| Viewer | Events | Pattern |
|--------|--------|---------|
| `viewer-A` | 500 000 | Uniform 1 event/sec |
| `viewer-B` | 500 000 | Uniform 1 event/sec with a 31-min idle gap every 4 h, plus a midpoint gap for small corpora |

The 31-min gap is the canonical Phase-17 sessionization boundary
(`sessionization.inactivity_ms = 30 min`), so the corpus produces
exactly **N+1 sessions per viewer** where N is the number of gaps.

`generate.ts` itself is unit-tested for determinism: calling
`generateCorpus()` twice must produce byte-identical NDJSON output.

## Replay determinism

`replay.ts` reads `corpus-1m.ndjson` and feeds it through
`services/sessionization`'s partition consumer 5 times.  After each
run, it computes a SHA-256 fingerprint of the `session_id` sequence
per viewer.  All 5 fingerprints must be identical.  Any divergence
indicates a sessionization regression (e.g. clock drift, non-stable
sort, hash instability).

The full 1M-event replay is gated by nightly CI (it takes ~6 min
on a single core).  The vitest unit test in `replay.test.ts` runs
against a 1 000-event subset which completes in <2 s on every PR.

## Usage

```bash
# 1. Generate the corpus (one-shot, ~120 MB on disk)
pnpm tsx tests/load/replay-corpora/generate.ts \
  --output tests/load/replay-corpora/corpus-1m.ndjson

# 2. Replay (5x, gated by nightly CI)
pnpm tsx tests/load/replay-corpora/replay.ts \
  --corpus tests/load/replay-corpora/corpus-1m.ndjson \
  --runs 5

# 3. Vitest unit test (subset, runs in PR CI)
pnpm --filter @domio/test-load-replay test
```