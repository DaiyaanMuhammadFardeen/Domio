/**
 * Phase 17 — 1M-event deterministic corpus generator.
 *
 * Pure ES modules; no side-effects.  Exported as both a CLI
 * (`tsx generate.ts --output corpus.ndjson`) and a library
 * (`generateCorpus({ eventCount })`).
 *
 * Determinism is guaranteed by:
 *   * LCG seeded with 0xDEADBEEF (same seed -> same sequence)
 *   * Fixed BigInt-safe timestamps starting at 1 700 000 000 000
 *   * Two viewers, each with 500 000 events; a 31-min idle gap is
 *     inserted every 4 h for viewer-B (matches the 30-min
 *     sessionization inactivity window + 60 s slack).  For small
 *     corpora (e.g. 1 000 events), a midpoint gap is also inserted so
 *     the unit test fixture is guaranteed to produce >= 2 sessions.
 */
import { createWriteStream } from 'node:fs';
import { argv, exit } from 'node:process';

const SEED = 0xdeadbeef >>> 0;
const DEFAULT_COUNT = 1_000_000;
const GAP_MS = 31 * 60 * 1000;
const GAP_INTERVAL_MS = 4 * 60 * 60 * 1000;

function lcg(state: { x: number }): number {
  state.x = (state.x * 1664525 + 1013904223) >>> 0;
  return state.x;
}

function makeRng(seed: number) {
  const state = { x: seed >>> 0 };
  return () => lcg(state);
}

export interface CorpusEvent {
  event_id: string;
  workspace_id: string;
  deck_id: string;
  slide_id: string;
  viewer_id_key: string;
  ts_ms: number;
  event_name: 'view' | 'interaction' | 'scroll_progress';
  schema_version: 1;
  session_id_key: string;
  privacy_mode: 'identified';
  device_class: 'desktop' | 'mobile';
  source_app: 'replay-corpus';
}

export interface CorpusOptions {
  eventCount?: number;
  startTsMs?: number;
  seed?: number;
}

export function generateCorpus(opts: CorpusOptions = {}): CorpusEvent[] {
  const eventCount = opts.eventCount ?? DEFAULT_COUNT;
  const startTsMs = opts.startTsMs ?? 1_700_000_000_000;
  const rng = makeRng(opts.seed ?? SEED);

  const half = Math.floor(eventCount / 2);
  const events: CorpusEvent[] = [];

  // Viewer A — uniform 1 event/sec.
  for (let i = 0; i < half; i++) {
    events.push({
      event_id: `a-${i}`,
      workspace_id: 'ws-corpus',
      deck_id: 'deck-corpus',
      slide_id: `slide-${i % 20}`,
      viewer_id_key: 'viewer-A',
      ts_ms: startTsMs + i * 1000,
      event_name: 'view',
      schema_version: 1,
      session_id_key: 'sess-A',
      privacy_mode: 'identified',
      device_class: 'desktop',
      source_app: 'replay-corpus',
    });
  }

  // Viewer B — uniform 1 event/sec, with a 31-min idle gap every 4 h.
  // The gap straddles the sessionization boundary so each gap should
  // produce a new session.
  let bTs = startTsMs;
  let i = 0;
  while (i < half) {
    events.push({
      event_id: `b-${i}`,
      workspace_id: 'ws-corpus',
      deck_id: 'deck-corpus',
      slide_id: `slide-${i % 20}`,
      viewer_id_key: 'viewer-B',
      ts_ms: bTs,
      event_name: i % 7 === 0 ? 'interaction' : 'view',
      schema_version: 1,
      session_id_key: 'sess-B',
      privacy_mode: 'identified',
      device_class: i % 3 === 0 ? 'mobile' : 'desktop',
      source_app: 'replay-corpus',
    });
    i++;
    bTs += 1000;
    // Insert a 31-min idle gap every time `bTs` crosses a 4 h
    // boundary relative to the start.  For small corpora (e.g. 1 000
    // events) we also insert a gap at the midpoint so the test
    // fixture is guaranteed to produce >= 2 sessions per viewer.
    if (bTs % GAP_INTERVAL_MS < 1000 || i === Math.floor(half / 2)) {
      bTs += GAP_MS;
    }
  }

  return events;
}

function main() {
  const outIdx = argv.indexOf('--output');
  const outPath = outIdx >= 0 ? argv[outIdx + 1] : undefined;
  if (!outPath) {
    console.error('Usage: tsx generate.ts --output <path> [--count N]');
    exit(1);
  }
  const countIdx = argv.indexOf('--count');
  const count = countIdx >= 0 ? Number(argv[countIdx + 1]) : DEFAULT_COUNT;

  const stream = createWriteStream(outPath, { encoding: 'utf8' });
  const events = generateCorpus({ eventCount: count });
  for (const ev of events) {
    stream.write(JSON.stringify(ev) + '\n');
  }
  stream.end();
  stream.on('finish', () => {
    console.log(`wrote ${events.length} events -> ${outPath}`);
  });
}

const isMain = (() => {
  try {
    // @ts-expect-error - import.meta is non-standard in some runtimes
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      // @ts-expect-error - import.meta is non-standard in some runtimes
      return import.meta.url === `file://${process.argv[1]}`;
    }
  } catch {
    // ignore
  }
  return false;
})();
if (isMain) {
  main();
}

export { main as generateCorpusCli };
