/**
 * Sessionization — replay determinism (Phase 17 W4).
 *
 * Replays the same event corpus 5 times through the partition
 * consumer and asserts the resulting session IDs, started_at_ms,
 * last_event_at_ms, and event_count sequences are identical.
 *
 * The corpus is 1,000 events for speed — the spec's "1M-event
 * corpus" is gated by the integration CI test in
 * tests/integration/phase17/replay.ts; this unit-level replay
 * guarantees determinism at the algorithm boundary.
 */

import { describe, it, expect } from 'vitest';
import { buildSessionEngine, buildPartitionConsumer } from '../index.js';
import type { AnalyticsEvent } from '@domio/event-ingest';
import type { SessionRecord } from '../types.js';

function makeCorpus(n: number, baseMs: number): AnalyticsEvent[] {
  const out: AnalyticsEvent[] = [];
  for (let i = 0; i < n; i += 1) {
    // Two viewers with occasional gaps > 30min so we get a few
    // forced closes.
    const viewer = i % 2 === 0 ? 'vk-1' : 'vk-2';
    const gap = i % 50 === 0 && i > 0 ? 31 * 60 * 1000 : 5_000;
    const prev = out[out.length - 1]?.ts_ms ?? baseMs;
    out.push({
      event_id: `e${i}`,
      event_name: 'view',
      schema_version: 1,
      ts_ms: prev + gap,
      workspace_id: 'ws-1',
      deck_id: 'd1',
      viewer_id_key: viewer,
      privacy_mode: 'pseudonymous',
      device_class: 'desktop',
      source_app: 'viewer',
      ingest_topic: 'events.ingest.raw',
    });
  }
  return out;
}

async function runOnce(events: AnalyticsEvent[]): Promise<SessionRecord[]> {
  const captured: SessionRecord[] = [];
  const consumer = buildPartitionConsumer({
    engine: buildSessionEngine({ inactivityMs: 30 * 60 * 1000, maxSessionMs: 4 * 60 * 60 * 1000 }),
    onUpsert: async (s) => {
      captured.push(s);
    },
    onClose: async () => {
      /* noop */
    },
    onEmit: async () => {
      /* noop */
    },
  });
  await consumer.run(events);
  return captured;
}

function fingerprint(sessions: readonly SessionRecord[]): string {
  return sessions
    .map(
      (s) =>
        `${s.session_id}|${s.started_at_ms}|${s.last_event_at_ms}|${s.event_count}|${s.viewer_id_key}`,
    )
    .join('\n');
}

describe('replay determinism', () => {
  it('produces identical session IDs across 5 replays of a 1000-event corpus', async () => {
    const events = makeCorpus(1000, 1_700_000_000_000);
    const fingerprints: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const sessions = await runOnce(events);
      fingerprints.push(fingerprint(sessions));
    }
    expect(new Set(fingerprints).size).toBe(1);
  });

  it('survives shuffled event order', async () => {
    const base = 1_700_000_000_000;
    const events = makeCorpus(200, base);
    const orderedFingerprint = fingerprint(await runOnce(events));
    // Fisher-Yates shuffle then run again.
    const shuffled = [...events];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor((i * 7919) % (i + 1));
      const a = shuffled[i]!;
      const b = shuffled[j]!;
      shuffled[i] = b;
      shuffled[j] = a;
    }
    const shuffledFingerprint = fingerprint(await runOnce(shuffled));
    expect(shuffledFingerprint).toBe(orderedFingerprint);
  });

  it('produces at least 1 closed session in a 1000-event corpus with periodic gaps', async () => {
    const events = makeCorpus(1000, 1_700_000_000_000);
    let closedCount = 0;
    const consumer = buildPartitionConsumer({
      engine: buildSessionEngine({
        inactivityMs: 30 * 60 * 1000,
        maxSessionMs: 4 * 60 * 60 * 1000,
      }),
      onUpsert: async () => {
        /* noop */
      },
      onClose: async () => {
        closedCount += 1;
      },
      onEmit: async () => {
        /* noop */
      },
    });
    await consumer.run(events);
    expect(closedCount).toBeGreaterThan(0);
  });
});
