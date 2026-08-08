/**
 * @domio/recording-orchestrator — service-level integration tests.
 *
 * Covers:
 *   - start → pause → resume → stop → finalize lifecycle.
 *   - Recording state machine: invalid transitions are rejected.
 *   - Optimistic concurrency: concurrent writes yield exactly one winner.
 *   - Idempotency: replaying the same key returns the existing session.
 *   - Chunk commits: lease-based, idempotent on (track, sequence).
 *   - Audit emission: every mutation produces a hash-chained event.
 *   - Metrics: counters increment on success.
 *   - Workspace isolation: cross-workspace reads return 404.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  type RecordingAuditEvent,
  type MetricsEmitter,
  InMemoryRecordingStore,
  NullIdempotencyStore,
  RecordingConflictError,
  RecordingInvalidTransitionError,
  RecordingNotFoundError,
  RecordingOrchestrator,
  RecordingChunkConflictError,
  type IdempotencyStore,
} from './index.js';
import { createHash, randomBytes } from 'node:crypto';

/** In-memory IdempotencyStore that survives claims (so we can exercise
 *  the idempotency replay path explicitly). */
class MemIdempotencyStore implements IdempotencyStore {
  private readonly claimed = new Set<string>();
  async claim(key: string): Promise<boolean> {
    if (this.claimed.has(key)) return false;
    this.claimed.add(key);
    return true;
  }
  async release(key: string): Promise<void> {
    this.claimed.delete(key);
  }
}

/** Capturing audit emitter — every emit is recorded. */
class CapturingAuditEmitter {
  public events: RecordingAuditEvent[] = [];
  async emit(event: RecordingAuditEvent): Promise<void> {
    this.events.push(event);
  }
}

/** Counting metrics emitter — counts inc() calls. */
class CountingMetricsEmitter implements MetricsEmitter {
  public counters: Map<string, number> = new Map();
  inc(name: string, _labels?: Record<string, string>): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + 1);
  }
  observe(_name: string, _value: number, _labels?: Record<string, string>): void {
    // No-op for these tests.
  }
}

function fakeBytes(): { size: number; sha256: string; key: string } {
  const buf = randomBytes(1024);
  return {
    size: buf.length,
    sha256: createHash('sha256').update(buf).digest('hex'),
    key: `recordings/test/blob-${buf.toString('hex').slice(0, 8)}`,
  };
}

describe('RecordingOrchestrator — lifecycle', () => {
  let store: InMemoryRecordingStore;
  let idem: MemIdempotencyStore;
  let audit: CapturingAuditEmitter;
  let metrics: CountingMetricsEmitter;
  let service: RecordingOrchestrator;
  let clock: { now: number };

  beforeEach(() => {
    store = new InMemoryRecordingStore();
    idem = new MemIdempotencyStore();
    audit = new CapturingAuditEmitter();
    metrics = new CountingMetricsEmitter();
    clock = { now: 1_700_000_000_000 };
    service = new RecordingOrchestrator({
      store,
      idem,
      audit,
      metrics,
      now: () => new Date(clock.now),
    });
  });

  it('start → pause → resume → stop → finalize transitions through the full state machine', async () => {
    const started = await service.start({
      workspace_id: 'ws-1',
      session_id: 'session-1',
      presenter_user_id: 'user-1',
      storage_prefix: 'ws-1/recording-1',
      title: 'Test session',
    });
    expect(started.status).toBe('recording');
    expect(started.version).toBe(2);
    expect(started.title).toBe('Test session');

    const paused = await service.pause({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      expected_version: 2,
    });
    expect(paused.status).toBe('paused');
    expect(paused.version).toBe(3);
    expect(paused.paused_at).toBe(new Date(clock.now).toISOString());

    const resumed = await service.resume({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      expected_version: 3,
    });
    expect(resumed.status).toBe('recording');
    expect(resumed.version).toBe(4);

    const stopped = await service.stop({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      expected_version: 4,
    });
    expect(stopped.status).toBe('finalizing');
    expect(stopped.version).toBe(5);
    expect(stopped.stopped_at).toBe(new Date(clock.now).toISOString());

    const ready = await service.finalize({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      expected_version: 5,
    });
    expect(ready.status).toBe('ready');
    expect(ready.version).toBe(6);
    expect(ready.finalized_at).toBe(new Date(clock.now).toISOString());

    // Audit chain: started → paused → resumed → stopped → finalized.
    const kinds = audit.events.map((e) => e.kind);
    expect(kinds).toEqual([
      'recording.started',
      'recording.paused',
      'recording.resumed',
      'recording.stopped',
      'recording.ready',
    ]);

    // Metrics: all five counters ticked.
    expect(metrics.counters.get('recording_orchestrator_started_total')).toBe(1);
    expect(metrics.counters.get('recording_orchestrator_paused_total')).toBe(1);
    expect(metrics.counters.get('recording_orchestrator_resumed_total')).toBe(1);
    expect(metrics.counters.get('recording_orchestrator_stopped_total')).toBe(1);
    expect(metrics.counters.get('recording_orchestrator_finalized_total')).toBe(1);
  });

  it('rejects invalid transitions (recording → ready)', async () => {
    const started = await service.start({
      workspace_id: 'ws-1',
      session_id: 'session-1',
      presenter_user_id: 'user-1',
      storage_prefix: 'ws-1/recording-1',
    });
    // Cannot finalize from 'recording' (must stop first → finalizing → ready).
    await expect(
      service.finalize({
        workspace_id: 'ws-1',
        recording_session_id: started.id,
        expected_version: 2,
      }),
    ).rejects.toBeInstanceOf(RecordingInvalidTransitionError);
  });

  it('watchlist: pause → ready is rejected', async () => {
    const started = await service.start({
      workspace_id: 'ws-1',
      session_id: 'session-1',
      presenter_user_id: 'user-1',
      storage_prefix: 'ws-1/recording-1',
    });
    const paused = await service.pause({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      expected_version: 2,
    });
    await expect(
      service.finalize({
        workspace_id: 'ws-1',
        recording_session_id: started.id,
        expected_version: paused.version,
      }),
    ).rejects.toBeInstanceOf(RecordingInvalidTransitionError);
  });

  it('optimistic concurrency: staling the version rejects a write', async () => {
    const started = await service.start({
      workspace_id: 'ws-1',
      session_id: 'session-1',
      presenter_user_id: 'user-1',
      storage_prefix: 'ws-1/recording-1',
    });
    // Two concurrent pauses with distinct idempotency keys (so the writes
    // both proceed past the dedup layer) but the same expected_version.
    await service.pause({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      expected_version: 2,
      idempotency_key: 'pause-1',
    });
    await expect(
      service.pause({
        workspace_id: 'ws-1',
        recording_session_id: started.id,
        expected_version: 2,
        idempotency_key: 'pause-2',
      }),
    ).rejects.toBeInstanceOf(RecordingConflictError);
  });

  it('idempotency: replaying the same key short-circuits', async () => {
    const started = await service.start({
      workspace_id: 'ws-1',
      session_id: 'session-1',
      presenter_user_id: 'user-1',
      storage_prefix: 'ws-1/recording-1',
    });
    const key = 'idem-pause-1';
    const first = await service.pause({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      expected_version: 2,
      idempotency_key: key,
    });
    const replay = await service.pause({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      expected_version: 2,
      idempotency_key: key,
    });
    expect(replay.id).toBe(first.id);
    expect(replay.version).toBe(first.version);
    // Only one 'recording.paused' audit event was emitted.
    expect(audit.events.filter((e) => e.kind === 'recording.paused')).toHaveLength(1);
  });

  it('commitChunk: leases a chunk under (track_kind, sequence)', async () => {
    const started = await service.start({
      workspace_id: 'ws-1',
      session_id: 'session-1',
      presenter_user_id: 'user-1',
      storage_prefix: 'ws-1/recording-1',
    });
    const blob = fakeBytes();
    const out = await service.commitChunk({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      track_kind: 'screen',
      sequence: 0,
      byte_size: blob.size,
      duration_ms: 4000,
      sha256: blob.sha256,
      storage_key: blob.key,
      lease_id: 'lease-1',
      lease_expires_at: new Date(clock.now + 60_000).toISOString(),
    });
    expect(out.track_kind).toBe('screen');
    expect(out.sequence).toBe(0);
    expect(metrics.counters.get('recording_orchestrator_chunk_committed_total')).toBe(1);

    // Replay (same key) is a no-op (no second audit event).
    await service.commitChunk({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      track_kind: 'screen',
      sequence: 0,
      byte_size: blob.size,
      duration_ms: 4000,
      sha256: blob.sha256,
      storage_key: blob.key,
      lease_id: 'lease-1',
      lease_expires_at: new Date(clock.now + 60_000).toISOString(),
    });
    expect(metrics.counters.get('recording_orchestrator_chunk_committed_total')).toBe(1);
  });

  it('commitChunk: rejects duplicates with a different idem key', async () => {
    const started = await service.start({
      workspace_id: 'ws-1',
      session_id: 'session-1',
      presenter_user_id: 'user-1',
      storage_prefix: 'ws-1/recording-1',
    });
    const blob = fakeBytes();
    await service.commitChunk({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      track_kind: 'camera',
      sequence: 5,
      byte_size: blob.size,
      duration_ms: 4000,
      sha256: blob.sha256,
      storage_key: blob.key,
      lease_id: 'lease-1',
      lease_expires_at: new Date(clock.now + 60_000).toISOString(),
    });
    // No idempotency_key — auto-derived from (session, track, sequence), so
    // replay is a no-op. Use a distinct explicit key to surface the conflict.
    await expect(
      service.commitChunk({
        workspace_id: 'ws-1',
        recording_session_id: started.id,
        track_kind: 'camera',
        sequence: 5,
        byte_size: blob.size,
        duration_ms: 4000,
        sha256: blob.sha256,
        storage_key: blob.key,
        lease_id: 'lease-2',
        lease_expires_at: new Date(clock.now + 60_000).toISOString(),
        idempotency_key: 'different-key',
      }),
    ).rejects.toBeInstanceOf(RecordingChunkConflictError);
  });

  it('commitChunk: rejects chunks for non-recording sessions', async () => {
    const started = await service.start({
      workspace_id: 'ws-1',
      session_id: 'session-1',
      presenter_user_id: 'user-1',
      storage_prefix: 'ws-1/recording-1',
    });
    await service.stop({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      expected_version: 2,
    });
    const blob = fakeBytes();
    // Session is now 'finalizing' — chunks are not allowed.
    await expect(
      service.commitChunk({
        workspace_id: 'ws-1',
        recording_session_id: started.id,
        track_kind: 'screen',
        sequence: 0,
        byte_size: blob.size,
        duration_ms: 4000,
        sha256: blob.sha256,
        storage_key: blob.key,
        lease_id: 'lease-1',
        lease_expires_at: new Date(clock.now + 60_000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(RecordingInvalidTransitionError);
  });

  it('commitChunk: enforces workspace isolation', async () => {
    const started = await service.start({
      workspace_id: 'ws-1',
      session_id: 'session-1',
      presenter_user_id: 'user-1',
      storage_prefix: 'ws-1/recording-1',
    });
    const blob = fakeBytes();
    await expect(
      service.commitChunk({
        workspace_id: 'ws-2',
        recording_session_id: started.id,
        track_kind: 'screen',
        sequence: 0,
        byte_size: blob.size,
        duration_ms: 4000,
        sha256: blob.sha256,
        storage_key: blob.key,
        lease_id: 'lease-1',
        lease_expires_at: new Date(clock.now + 60_000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(RecordingNotFoundError);
  });

  it('fail: marks a session as failed and records the reason', async () => {
    const started = await service.start({
      workspace_id: 'ws-1',
      session_id: 'session-1',
      presenter_user_id: 'user-1',
      storage_prefix: 'ws-1/recording-1',
    });
    const failed = await service.fail({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      expected_version: 2,
      reason: 'presenter lost connection',
    });
    expect(failed.status).toBe('failed');
    expect(failed.error).toBe('presenter lost connection');
    expect(audit.events.some((e) => e.kind === 'recording.failed')).toBe(true);
  });

  it('get: enforces workspace isolation', async () => {
    const started = await service.start({
      workspace_id: 'ws-1',
      session_id: 'session-1',
      presenter_user_id: 'user-1',
      storage_prefix: 'ws-1/recording-1',
    });
    await expect(service.get('ws-2', started.id)).rejects.toBeInstanceOf(RecordingNotFoundError);
    const got = await service.get('ws-1', started.id);
    expect(got.id).toBe(started.id);
  });

  it('listChunks: returns the committed chunks for a session', async () => {
    const started = await service.start({
      workspace_id: 'ws-1',
      session_id: 'session-1',
      presenter_user_id: 'user-1',
      storage_prefix: 'ws-1/recording-1',
    });
    for (let i = 0; i < 3; i++) {
      const blob = fakeBytes();
      await service.commitChunk({
        workspace_id: 'ws-1',
        recording_session_id: started.id,
        track_kind: 'screen',
        sequence: i,
        byte_size: blob.size,
        duration_ms: 4000,
        sha256: blob.sha256,
        storage_key: blob.key,
        lease_id: `lease-${i}`,
        lease_expires_at: new Date(clock.now + 60_000).toISOString(),
      });
    }
    const chunks = await service.listChunks('ws-1', started.id);
    expect(chunks).toHaveLength(3);
    expect(chunks.map((c) => c.sequence)).toEqual([0, 1, 2]);
    expect(chunks.every((c) => c.track_kind === 'screen')).toBe(true);
  });

  it('default idempotency store (NullIdempotencyStore) does not collapse concurrent calls', async () => {
    const started = await service.start({
      workspace_id: 'ws-1',
      session_id: 'session-2',
      presenter_user_id: 'user-1',
      storage_prefix: 'ws-1/recording-2',
    });
    // Replace service with one that uses NullIdempotencyStore.
    const svc = new RecordingOrchestrator({
      store,
      idem: new NullIdempotencyStore(),
      audit,
      metrics,
      now: () => new Date(clock.now),
    });
    // Both calls pass through with distinct idempotency keys; the second
    // hits optimistic concurrency and rejects.
    await svc.pause({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      expected_version: 2,
      idempotency_key: 'a',
    });
    await expect(
      svc.pause({
        workspace_id: 'ws-1',
        recording_session_id: started.id,
        expected_version: 2,
        idempotency_key: 'b',
      }),
    ).rejects.toBeInstanceOf(RecordingConflictError);
  });

  it('emits a recording.started audit event on start', async () => {
    await service.start({
      workspace_id: 'ws-1',
      session_id: 'session-1',
      presenter_user_id: 'user-1',
      storage_prefix: 'ws-1/recording-1',
    });
    const started = audit.events.find((e) => e.kind === 'recording.started');
    expect(started).toBeDefined();
    expect(started?.payload).toMatchObject({
      from: 'pending',
      to: 'recording',
    });
  });
});
