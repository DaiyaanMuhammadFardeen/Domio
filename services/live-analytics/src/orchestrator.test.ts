/**
 * Live-analytics — orchestrator + summary sink tests (Phase 17 W10).
 *
 * Verifies ingest → pulse → fan-out path, summary flushing into
 * ClickHouse, and the close-on-flush behavior of the WS hub.
 */

import { describe, it, expect, vi } from 'vitest';
import { buildOrchestrator } from './orchestrator.js';
import { buildInMemoryClickHouseClient } from './store/clickhouse.js';
import type { LiveEvent } from './types.js';

function ev(
  seq: number,
  kind: LiveEvent['kind'],
  opts: Partial<LiveEvent> = {},
): LiveEvent {
  return {
    seq,
    ts_ms: opts.ts_ms ?? 1_700_000_000_000 + seq,
    workspace_id: opts.workspace_id ?? 'ws-1',
    session_id: opts.session_id ?? 'sess-1',
    deck_id: opts.deck_id ?? 'deck-1',
    viewer_id_key: opts.viewer_id_key ?? '',
    kind,
    ...opts,
  };
}

describe('orchestrator', () => {
  it('ingest() pushes to the ring buffer and derives a pulse', async () => {
    const ch = buildInMemoryClickHouseClient();
    const orch = buildOrchestrator({ ch });
    await orch.ingest(ev(1, 'viewer_join', { viewer_id_key: 'v1' }));
    await orch.ingest(ev(2, 'viewer_join', { viewer_id_key: 'v2' }));
    await orch.ingest(ev(3, 'reaction'));
    const pulse = orch.pulse('ws-1', 'sess-1');
    expect(pulse.concurrent_viewers).toBe(2);
    expect(pulse.reaction_count).toBe(1);
    expect(pulse.last_seq).toBe(3);
    expect(orch.sessionCount()).toBe(1);
  });

  it('fans out the pulse to WS subscribers on every ingest', async () => {
    const ch = buildInMemoryClickHouseClient();
    const orch = buildOrchestrator({ ch });
    const sub = vi.fn();
    orch.hub().subscribe('ws-1', 'sess-1', sub);
    await orch.ingest(ev(1, 'viewer_join', { viewer_id_key: 'v1' }));
    await orch.ingest(ev(2, 'reaction'));
    expect(sub).toHaveBeenCalledTimes(2);
  });

  it('replay() returns the trailing window for a new subscriber', async () => {
    const ch = buildInMemoryClickHouseClient();
    const orch = buildOrchestrator({ ch });
    await orch.ingest(ev(1, 'viewer_join', { viewer_id_key: 'v1' }));
    await orch.ingest(ev(2, 'slide_change', { data: 'slide-1' }));
    const replay = orch.replay('ws-1', 'sess-1');
    expect(replay).toHaveLength(2);
    expect(replay[1]?.data).toBe('slide-1');
  });

  it('flush() writes a summary row and closes the WS channel', async () => {
    const ch = buildInMemoryClickHouseClient();
    const orch = buildOrchestrator({ ch });
    const sub = vi.fn();
    orch.hub().subscribe('ws-1', 'sess-1', sub);
    await orch.ingest(ev(1, 'viewer_join', { viewer_id_key: 'v1' }));
    await orch.ingest(ev(2, 'viewer_join', { viewer_id_key: 'v2' }));
    await orch.ingest(ev(3, 'reaction'));
    await orch.ingest(ev(4, 'reaction'));
    await orch.ingest(ev(5, 'reaction'));
    await orch.ingest(ev(6, 'viewer_leave', { viewer_id_key: 'v1' }));

    const summary = await orch.flush('ws-1', 'sess-1', 'deck-1');
    expect(summary).not.toBeNull();
    expect(summary?.total_events).toBe(6);
    expect(summary?.peak_concurrent_viewers).toBe(2);
    expect(summary?.total_reactions).toBe(3);
    expect(summary?.unique_viewers).toBe(2);
    expect(orch.sessionCount()).toBe(0);
    expect(ch.executes).toHaveLength(1);
    expect(ch.executes[0]?.sql).toMatch(/INSERT INTO live_session_summary/);
    // Final-pulse fan-out fired on close.
    expect(sub).toHaveBeenCalled();
    const lastCall = sub.mock.calls[sub.mock.calls.length - 1]?.[0] as { concurrent_viewers: number };
    expect(lastCall.concurrent_viewers).toBe(0);
  });

  it('flush() returns null when there are no events for the session', async () => {
    const ch = buildInMemoryClickHouseClient();
    const orch = buildOrchestrator({ ch });
    const summary = await orch.flush('ws-1', 'missing', 'deck-1');
    expect(summary).toBeNull();
    expect(ch.executes).toHaveLength(0);
  });
});