/**
 * Phase 21 W1.9 — start-stop integration test.
 *
 * Exercises the full recording pipeline end-to-end:
 *   1. start a recording session
 *   2. capture 4 parallel tracks (screen, camera, mic, system_audio) via
 *      the multi-track recorder + an in-memory object-store uploader
 *   3. each chunk goes through the orchestrator's commitChunk with
 *      lease-based idempotency
 *   4. pause → resume mid-session
 *   5. stop → finalize
 *   6. assert:
 *      - all chunks are present in the in-memory store
 *      - the audit chain has the expected sequence of events
 *      - SHA-256 chains verify
 *      - chunk commits honor (track_kind, sequence) uniqueness
 *      - workspace isolation: cross-tenant reads return 404
 *
 * No Postgres, no S3 — fully in-process so it runs in CI without a
 * docker-compose stack.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { computeEventHash } from '@domio/audit-ts';
import {
  type RecordingAuditEvent,
  InMemoryRecordingStore,
  NullIdempotencyStore,
  RecordingChunkConflictError,
  RecordingNotFoundError,
  RecordingOrchestrator,
  type MetricsEmitter,
} from '@domio/recording-orchestrator';
import {
  InMemoryUploader,
  type ChunkUploader,
  type ChunkProgressEvent,
} from '@domio/recording-extensions';
import type { TrackKind } from '@domio/object-store';

/** Audit emitter that hashes every event into a chain. */
class HashChainedAuditEmitter {
  private readonly events: RecordingAuditEvent[] = [];
  private prevHash = '';
  // HMAC key for the chain. Hex-encoded.
  private readonly keyHex: string;
  constructor(keyHex: string) {
    this.keyHex = keyHex;
  }
  async emit(event: RecordingAuditEvent): Promise<void> {
    const hash = await computeEventHash(
      this.keyHex,
      event.payload ?? {},
      event.sequence,
      this.prevHash,
    );
    const stored: RecordingAuditEvent = { ...event, hash, prev_hash: this.prevHash };
    this.events.push(stored);
    this.prevHash = hash;
  }
  snapshot(): readonly RecordingAuditEvent[] {
    return this.events;
  }
  chainOk(): boolean {
    // Walk the chain and verify each link.
    let prev = '';
    for (const e of this.events) {
      if (e.prev_hash !== prev) return false;
      prev = e.hash ?? '';
    }
    return true;
  }
}

class CountingMetricsEmitter implements MetricsEmitter {
  public counters: Map<string, number> = new Map();
  inc(name: string, _labels?: Record<string, string>): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + 1);
  }
  observe(_name: string, _value: number, _labels?: Record<string, string>): void {}
}

/** Fake capture loop: emits N chunks per track on a fixed cadence. */
class FakeCaptureLoop {
  readonly chunks: ChunkProgressEvent[] = [];
  async run(args: {
    uploader: ChunkUploader;
    tracks: readonly TrackKind[];
    chunksPerTrack: number;
    workspace_id: string;
    recording_session_id: string;
    onChunk?: (event: ChunkProgressEvent) => void;
  }): Promise<void> {
    for (const track of args.tracks) {
      for (let sequence = 0; sequence < args.chunksPerTrack; sequence++) {
        const buf = randomBytes(256);
        const result = await args.uploader.upload({
          workspace_id: args.workspace_id,
          recording_session_id: args.recording_session_id,
          track_kind: track,
          sequence,
          body: buf,
        });
        const event: ChunkProgressEvent = {
          track_kind: track,
          sequence,
          byte_size: result.byte_size,
          duration_ms: 1000,
          storage_key: result.storage_key,
          sha256: result.sha256,
          uploaded_at_ms: Date.now(),
        };
        this.chunks.push(event);
        args.onChunk?.(event);
      }
    }
  }
}

describe('recording pipeline — start → capture → stop → finalize', () => {
  let store: InMemoryRecordingStore;
  let idem: NullIdempotencyStore;
  let audit: HashChainedAuditEmitter;
  let metrics: CountingMetricsEmitter;
  let uploader: InMemoryUploader;
  let orchestrator: RecordingOrchestrator;
  let clock: { now: number };

  beforeEach(() => {
    store = new InMemoryRecordingStore();
    idem = new NullIdempotencyStore();
    audit = new HashChainedAuditEmitter('a'.repeat(64));
    metrics = new CountingMetricsEmitter();
    uploader = new InMemoryUploader();
    clock = { now: 1_700_000_000_000 };
    orchestrator = new RecordingOrchestrator({
      store,
      idempotency: idem,
      audit,
      metrics,
      now: () => new Date(clock.now),
      // The default IdempotencyStore is NullIdempotencyStore (no claims);
      // recording-orchestrator's signature expects the IdempotencyStore
      // interface from this package, so we pass it through `idempotency`.
    });
  });

  it('runs the full pipeline end-to-end with 4 tracks × 5 chunks', async () => {
    // 1. Start.
    const started = await orchestrator.start({
      workspace_id: 'ws-1',
      session_id: 'session-1',
      presenter_user_id: 'user-1',
      storage_prefix: 'ws-1/recording-1',
      title: 'Integration test session',
      language: 'en',
    });
    expect(started.status).toBe('recording');

    // 2. Capture 4 tracks × 5 chunks.
    const tracks: readonly TrackKind[] = ['screen', 'camera', 'microphone', 'system_audio'];
    const capture = new FakeCaptureLoop();
    await capture.run({
      uploader,
      tracks,
      chunksPerTrack: 5,
      workspace_id: 'ws-1',
      recording_session_id: started.id,
    });
    expect(capture.chunks).toHaveLength(20);

    // 3. Commit each chunk to the orchestrator (this is what the capture
    //    pipeline calls after uploading to object-store).
    for (const c of capture.chunks) {
      clock.now += 10;
      const out = await orchestrator.commitChunk({
        workspace_id: 'ws-1',
        recording_session_id: started.id,
        track_kind: c.track_kind,
        sequence: c.sequence,
        byte_size: c.byte_size,
        duration_ms: c.duration_ms,
        sha256: c.sha256,
        storage_key: c.storage_key,
        lease_id: `lease-${c.track_kind}-${c.sequence}`,
        lease_expires_at: new Date(clock.now + 60_000).toISOString(),
      });
      expect(out.track_kind).toBe(c.track_kind);
      expect(out.sequence).toBe(c.sequence);
    }

    // 4. Pause / resume mid-session.
    const paused = await orchestrator.pause({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      expected_version: started.version,
    });
    expect(paused.status).toBe('paused');

    // Chunks cannot be committed while paused (allowed: recording + paused).
    // We'll resume first to keep the test simple.
    const resumed = await orchestrator.resume({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      expected_version: paused.version,
    });
    expect(resumed.status).toBe('recording');

    // 5. Stop → finalize.
    const stopped = await orchestrator.stop({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      expected_version: resumed.version,
    });
    expect(stopped.status).toBe('finalizing');

    const ready = await orchestrator.finalize({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      expected_version: stopped.version,
    });
    expect(ready.status).toBe('ready');

    // 6. Assertions.

    // 6a. All 20 chunks are present in the store.
    const chunks = await orchestrator.listChunks('ws-1', started.id);
    expect(chunks).toHaveLength(20);
    const byTrack = new Map<TrackKind, number>();
    for (const c of chunks) {
      byTrack.set(c.track_kind, (byTrack.get(c.track_kind) ?? 0) + 1);
    }
    expect(byTrack.get('screen')).toBe(5);
    expect(byTrack.get('camera')).toBe(5);
    expect(byTrack.get('microphone')).toBe(5);
    expect(byTrack.get('system_audio')).toBe(5);

    // 6b. Hash chain integrity.
    const chain = audit.snapshot();
    expect(chain.length).toBeGreaterThan(0);
    expect(audit.chainOk()).toBe(true);

    // 6c. The expected sequence of audit kinds.
    const kinds = chain.map((e) => e.kind);
    expect(kinds).toContain('recording.started');
    expect(kinds).toContain('recording.paused');
    expect(kinds).toContain('recording.resumed');
    expect(kinds).toContain('recording.stopped');
    expect(kinds).toContain('recording.ready');
    expect(chain.filter((e) => e.kind === 'recording.chunk_committed')).toHaveLength(20);

    // 6d. Metrics counter health.
    expect(metrics.counters.get('recording_orchestrator_started_total')).toBe(1);
    expect(metrics.counters.get('recording_orchestrator_paused_total')).toBe(1);
    expect(metrics.counters.get('recording_orchestrator_resumed_total')).toBe(1);
    expect(metrics.counters.get('recording_orchestrator_stopped_total')).toBe(1);
    expect(metrics.counters.get('recording_orchestrator_finalized_total')).toBe(1);
    expect(metrics.counters.get('recording_orchestrator_chunk_committed_total')).toBe(20);
  });

  it('rejects duplicate (track_kind, sequence) commits', async () => {
    const started = await orchestrator.start({
      workspace_id: 'ws-1',
      session_id: 'session-1',
      presenter_user_id: 'user-1',
      storage_prefix: 'ws-1/recording-1',
    });
    const buf = randomBytes(256);
    const blob = await uploader.upload({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      track_kind: 'screen',
      sequence: 0,
      body: buf,
    });
    // First commit succeeds.
    await orchestrator.commitChunk({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      track_kind: 'screen',
      sequence: 0,
      byte_size: blob.byte_size,
      duration_ms: 1000,
      sha256: blob.sha256,
      storage_key: blob.storage_key,
      lease_id: 'lease-1',
      lease_expires_at: new Date(clock.now + 60_000).toISOString(),
    });
    // Second commit with a different idem key still hits the unique
    // (track_kind, sequence) constraint and throws a conflict.
    await expect(
      orchestrator.commitChunk({
        workspace_id: 'ws-1',
        recording_session_id: started.id,
        track_kind: 'screen',
        sequence: 0,
        byte_size: blob.byte_size,
        duration_ms: 1000,
        sha256: blob.sha256,
        storage_key: blob.storage_key,
        lease_id: 'lease-2',
        lease_expires_at: new Date(clock.now + 60_000).toISOString(),
        idempotency_key: 'distinct-key',
      }),
    ).rejects.toBeInstanceOf(RecordingChunkConflictError);
  });

  it('rejects chunks from a different workspace', async () => {
    const started = await orchestrator.start({
      workspace_id: 'ws-1',
      session_id: 'session-1',
      presenter_user_id: 'user-1',
      storage_prefix: 'ws-1/recording-1',
    });
    const buf = randomBytes(256);
    const blob = await uploader.upload({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      track_kind: 'screen',
      sequence: 0,
      body: buf,
    });
    await expect(
      orchestrator.commitChunk({
        workspace_id: 'ws-2',
        recording_session_id: started.id,
        track_kind: 'screen',
        sequence: 0,
        byte_size: blob.byte_size,
        duration_ms: 1000,
        sha256: blob.sha256,
        storage_key: blob.storage_key,
        lease_id: 'lease-1',
        lease_expires_at: new Date(clock.now + 60_000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(RecordingNotFoundError);
  });

  it('hash chain hashing propagates correctly across events', async () => {
    const started = await orchestrator.start({
      workspace_id: 'ws-1',
      session_id: 'session-1',
      presenter_user_id: 'user-1',
      storage_prefix: 'ws-1/recording-1',
    });
    const paused = await orchestrator.pause({
      workspace_id: 'ws-1',
      recording_session_id: started.id,
      expected_version: started.version,
    });
    const chain = audit.snapshot();
    expect(chain).toHaveLength(2);
    expect(chain[0]?.kind).toBe('recording.started');
    expect(chain[1]?.kind).toBe('recording.paused');
    expect(chain[0]?.prev_hash).toBe('');
    expect(chain[1]?.prev_hash).toBe(chain[0]?.hash);
    expect(chain[1]?.hash).not.toBe(chain[0]?.hash);
    expect(audit.chainOk()).toBe(true);
    // Verify the final hash is deterministic for the same sequence.
    const expected = await computeEventHash(
      'a'.repeat(64),
      chain[1]?.payload ?? {},
      chain[1]?.sequence ?? 0,
      chain[0]?.hash ?? '',
    );
    expect(chain[1]?.hash).toBe(expected);
    void paused;
  });
});
