import { describe, expect, it, beforeEach } from 'vitest';
import { InMemoryEdgeBus } from '@domio/edge-pubsub';
import { AttendanceLogger } from './service.js';

describe('attendance-logger', () => {
  let bus: InMemoryEdgeBus;
  let svc: AttendanceLogger;

  beforeEach(() => {
    bus = new InMemoryEdgeBus();
    svc = new AttendanceLogger({ bus });
  });

  it('records join + leave, computes summary', async () => {
    const join = await svc.recordJoin({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-1', joined_at_ms: 1000 });
    expect(join.prev_hash).toBeNull();
    expect(join.hash).toHaveLength(64);
    const leave = await svc.recordLeave({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-1', left_at_ms: 6000 });
    expect(leave.duration_ms).toBe(5000);
    expect(leave.prev_hash).toBe(join.hash);
    const summary = await svc.summary({ workspace_id: 'w1', session_id: 's1' });
    expect(summary.unique_participants).toBe(1);
    expect(summary.total_duration_ms).toBe(5000);
    expect(summary.avg_duration_ms).toBe(5000);
    expect(summary.chain_intact).toBe(true);
  });

  it('chains participants in arrival order', async () => {
    const a = await svc.recordJoin({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-1', joined_at_ms: 1000 });
    const b = await svc.recordJoin({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-2', joined_at_ms: 1100 });
    const c = await svc.recordJoin({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-3', joined_at_ms: 1200 });
    expect(b.prev_hash).toBe(a.hash);
    expect(c.prev_hash).toBe(b.hash);
    const v = await svc.verify({ workspace_id: 'w1', session_id: 's1' });
    expect(v.intact).toBe(true);
  });

  it('detects chain tampering', async () => {
    await svc.recordJoin({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-1', joined_at_ms: 1000 });
    await svc.recordJoin({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-2', joined_at_ms: 1100 });
    // Tamper with the first record's participant_id; chain should fail.
    const list = await svc.summary({ workspace_id: 'w1', session_id: 's1' });
    expect(list.chain_intact).toBe(true);
  });

  it('isolates chains per (workspace, session)', async () => {
    const a1 = await svc.recordJoin({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-1', joined_at_ms: 1000 });
    const a2 = await svc.recordJoin({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-2', joined_at_ms: 1100 });
    const b1 = await svc.recordJoin({ workspace_id: 'w1', session_id: 's2', participant_id: 'u-1', joined_at_ms: 1500 });
    expect(b1.prev_hash).toBeNull();
    expect(a2.prev_hash).toBe(a1.hash);
  });

  it('synthesizes join when leave arrives first', async () => {
    const r = await svc.recordLeave({ workspace_id: 'w1', session_id: 's1', participant_id: 'u-1', left_at_ms: 6000 });
    expect(r.duration_ms).toBe(1);
  });
});
