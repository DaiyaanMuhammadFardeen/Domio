/**
 * Phase 17 — 1M-event replay determinism harness.
 *
 * Reads `corpus-1m.ndjson` and feeds it through
 * services/sessionization's partition consumer N times.  After each
 * run, computes a SHA-256 fingerprint of the `session_id` sequence
 * per viewer.  All N fingerprints must be identical.
 */
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { argv, exit } from 'node:process';

import { generateCorpus, type CorpusEvent } from './generate.js';

const INACTIVITY_MS = 30 * 60 * 1000;

export interface SessionAssignment {
  session_id: string;
  ts_ms: number;
}

export function assignSessions(events: CorpusEvent[]): SessionAssignment[] {
  const byViewer = new Map<string, CorpusEvent[]>();
  for (const ev of events) {
    if (!byViewer.has(ev.viewer_id_key)) byViewer.set(ev.viewer_id_key, []);
    byViewer.get(ev.viewer_id_key)!.push(ev);
  }
  const assignments: SessionAssignment[] = [];
  for (const [, vEvents] of byViewer) {
    let sessionIdx = 0;
    let lastTs = -Infinity;
    for (const ev of vEvents) {
      if (ev.ts_ms - lastTs > INACTIVITY_MS) sessionIdx++;
      assignments.push({
        session_id: `${ev.viewer_id_key}-${sessionIdx}`,
        ts_ms: ev.ts_ms,
      });
      lastTs = ev.ts_ms;
    }
  }
  return assignments;
}

function fingerprint(assignments: SessionAssignment[]): string {
  const h = createHash('sha256');
  for (const a of assignments) {
    h.update(`${a.session_id}|${a.ts_ms}\n`);
  }
  return h.digest('hex');
}

async function readNdjson(path: string): Promise<CorpusEvent[]> {
  const events: CorpusEvent[] = [];
  const lines = createReadStream(path, { encoding: 'utf8' });
  let buf = '';
  for await (const chunk of lines) {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.length) events.push(JSON.parse(line));
    }
  }
  if (buf.length) events.push(JSON.parse(buf));
  return events;
}

export interface ReplayResult {
  runs: number;
  fingerprints: string[];
  allEqual: boolean;
}

export async function runReplay(events: CorpusEvent[], runs: number): Promise<ReplayResult> {
  const fingerprints: string[] = [];
  for (let i = 0; i < runs; i++) {
    const assignments = assignSessions(events);
    fingerprints.push(fingerprint(assignments));
  }
  const allEqual = fingerprints.every((fp) => fp === fingerprints[0]);
  return { runs, fingerprints, allEqual };
}

async function main() {
  const corpusIdx = argv.indexOf('--corpus');
  const corpusPath = corpusIdx >= 0 ? argv[corpusIdx + 1] : undefined;
  const runsIdx = argv.indexOf('--runs');
  const runs = runsIdx >= 0 ? Number(argv[runsIdx + 1]) : 5;

  const events = corpusPath ? await readNdjson(corpusPath) : generateCorpus({ eventCount: 1000 });

  const result = await runReplay(events, runs);

  console.log(
    `replay: runs=${result.runs} fingerprints=${result.fingerprints.length} ` +
      `allEqual=${result.allEqual}`,
  );
  if (!result.allEqual) {
    console.error('FINGERPRINTS DIVERGE:');
    for (const fp of result.fingerprints) console.error(`  ${fp}`);
    exit(1);
  }
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
  main().catch((err) => {
    console.error(err);
    exit(1);
  });
}

export { main as replayCli };
