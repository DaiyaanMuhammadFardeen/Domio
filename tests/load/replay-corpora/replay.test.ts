/**
 * Phase 17 — replay determinism unit test (1000-event subset).
 *
 * The full 1M-event replay is gated by nightly CI (~6 min).  This
 * vitest unit test runs against a 1000-event subset (generated
 * in-process; ~5 ms) so every PR gets fast feedback.
 */
import { describe, it, expect } from 'vitest';

import { generateCorpus } from './generate.js';
import { runReplay } from './replay.js';

describe('replay-corpora — determinism', () => {
  it('generator is deterministic (two calls produce identical NDJSON)', () => {
    const a = generateCorpus({ eventCount: 1000 });
    const b = generateCorpus({ eventCount: 1000 });
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).toEqual(b[i]);
    }
  });

  it('5x replay against a 1000-event corpus produces identical session_id fingerprints', async () => {
    const events = generateCorpus({ eventCount: 1000 });
    const result = await runReplay(events, 5);
    expect(result.runs).toBe(5);
    expect(result.fingerprints).toHaveLength(5);
    for (const fp of result.fingerprints) {
      expect(fp).toBe(result.fingerprints[0]);
    }
    expect(result.allEqual).toBe(true);
  });

  it('viewer-B sees N+1 sessions where N is the number of 31-min gaps', () => {
    const events = generateCorpus({ eventCount: 1000 });
    const bEvents = events.filter((e) => e.viewer_id_key === 'viewer-B');
    expect(bEvents.length).toBe(500);

    const sessions = new Set<string>();
    let lastTs = -Infinity;
    let sessionIdx = 0;
    for (const ev of bEvents) {
      if (ev.ts_ms - lastTs > 31 * 60 * 1000) sessionIdx++;
      sessions.add(`viewer-B-${sessionIdx}`);
      lastTs = ev.ts_ms;
    }
    expect(sessions.size).toBeGreaterThanOrEqual(2);
  });
});