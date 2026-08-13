/**
 * @domio/recording-extensions — tests for the multi-track recorder.
 *
 * Uses a fake MediaRecorder (driven by setInterval) and an InMemoryUploader
 * so tests run in Node without any browser globals.
 */

import { describe, it, expect } from 'vitest';
import {
  startMultiTrackRecorder,
  type MediaSourceFactory,
  type MultiTrackRecorderOptions,
} from './multi-track.js';
import { InMemoryUploader } from './object-store-uploader.js';
import type { RecorderConfig, TrackState } from './types.js';
import type { TrackKind } from '@domio/object-store';

/**
 * Minimal BlobEvent shim. The recorder only uses .data (a Blob).
 */
class FakeBlob {
  constructor(
    public readonly data: Uint8Array,
    public readonly size: number,
    public readonly type: string,
  ) {}
  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.data.buffer.slice(
      this.data.byteOffset,
      this.data.byteOffset + this.data.byteLength,
    );
  }
}

class FakeBlobEvent {
  constructor(public readonly data: FakeBlob) {}
}

class FakeMediaStream {
  private listeners: Array<() => void> = [];
  addEventListener(_kind: string, listener: () => void) {
    this.listeners.push(listener);
  }
  getTracks() {
    return [{ stop: () => undefined }];
  }
}

interface FakeMediaRecorderOpts {
  mimeType?: string;
  bitsPerSecond?: number;
}

interface FakeMediaRecorder extends EventTarget {
  state: 'inactive' | 'recording' | 'paused';
  ondataavailable: ((event: FakeBlobEvent) => Promise<void>) | null;
  onstart: (() => void) | null;
  onstop: (() => void) | null;
  onpause: (() => void) | null;
  onresume: (() => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
  start: (timesliceMs?: number) => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
}

function makeFakeMediaRecorderCtor(intervalMs = 50, chunksPerTrack = 3): typeof MediaRecorder {
  const counterByTrack = new Map<string, number>();

  class Ctor implements FakeMediaRecorder {
    state: 'inactive' | 'recording' | 'paused' = 'inactive';
    ondataavailable: ((event: FakeBlobEvent) => Promise<void>) | null = null;
    onstart: (() => void) | null = null;
    onstop: (() => void) | null = null;
    onpause: (() => void) | null = null;
    onresume: (() => void) | null = null;
    onerror: ((event: { message?: string }) => void) | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;
    private emitted = 0;

    constructor(_stream: unknown, _opts?: FakeMediaRecorderOpts) {}

    start(timesliceMs?: number): void {
      this.state = 'recording';
      this.onstart?.();
      const period = timesliceMs ?? intervalMs;
      this.timer = setInterval(() => {
        const body = new Uint8Array([this.emitted & 0xff, (this.emitted >> 8) & 0xff]);
        this.ondataavailable?.(
          new FakeBlobEvent(new FakeBlob(body, body.byteLength, 'video/webm')),
        );
        this.emitted++;
        if (this.emitted >= chunksPerTrack) this.stop();
      }, period);
    }

    stop(): void {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.state = 'inactive';
      this.onstop?.();
    }

    pause(): void {
      this.state = 'paused';
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.onpause?.();
    }

    resume(): void {
      this.state = 'recording';
      this.onresume?.();
      this.start(intervalMs);
    }
  }

  void counterByTrack;
  return Ctor as unknown as typeof MediaRecorder;
}

const fakeSource: MediaSourceFactory = {
  async getMediaStream(_track) {
    return new FakeMediaStream() as unknown as MediaStream;
  },
};

async function setup(opts: { chunks?: number; tracks?: readonly TrackKind[] } = {}) {
  const uploader = new InMemoryUploader();
  const chunkEvents: Array<{ track: TrackKind; sequence: number; byte_size: number }> = [];
  const stateEvents: Array<{ track: TrackKind; state: TrackState }> = [];
  const cfg: RecorderConfig = {
    workspace_id: 'ws-test',
    recording_session_id: 'sess-test',
    tracks: opts.tracks ?? ['microphone'],
    chunk_ms: 20,
    on_chunk: (e) =>
      chunkEvents.push({ track: e.track_kind, sequence: e.sequence, byte_size: e.byte_size }),
    on_track_state: (e) => stateEvents.push({ track: e.track_kind, state: e.state }),
  };
  const recorderOpts: MultiTrackRecorderOptions = {
    config: cfg,
    uploader,
    source: fakeSource,
    mediaRecorderCtor: makeFakeMediaRecorderCtor(20, opts.chunks ?? 3),
  };
  const handle = await startMultiTrackRecorder(recorderOpts);
  return { handle, uploader, chunkEvents, stateEvents, cfg };
}

describe('MultiTrackRecorder', () => {
  it('starts one recorder per requested track and uploads chunks', async () => {
    const { handle, uploader, chunkEvents } = await setup({ chunks: 3 });
    await new Promise((r) => setTimeout(r, 200));
    const summary = await handle.stop();
    expect(summary.workspace_id).toBe('ws-test');
    expect(summary.recording_session_id).toBe('sess-test');
    expect(summary.tracks.length).toBe(1);
    expect(summary.tracks[0]?.track_kind).toBe('microphone');
    expect(summary.tracks[0]?.chunk_count).toBe(3);
    expect(summary.tracks[0]?.total_bytes).toBe(6);
    expect(uploader.uploads.length).toBe(3);
    expect(uploader.uploads[0]?.track_kind).toBe('microphone');
    expect(uploader.uploads[0]?.sequence).toBe(0);
    expect(uploader.uploads[2]?.sequence).toBe(2);
    expect(chunkEvents.length).toBe(3);
    expect(chunkEvents[0]?.byte_size).toBe(2);
  });

  it('records 4 tracks in parallel', async () => {
    const { handle, uploader } = await setup({
      chunks: 2,
      tracks: ['screen', 'camera', 'microphone', 'system_audio'],
    });
    await new Promise((r) => setTimeout(r, 150));
    const summary = await handle.stop();
    expect(summary.tracks.length).toBe(4);
    const counts = uploader.uploads.reduce<Record<string, number>>((acc, u) => {
      acc[u.track_kind] = (acc[u.track_kind] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts.screen).toBe(2);
    expect(counts.camera).toBe(2);
    expect(counts.microphone).toBe(2);
    expect(counts.system_audio).toBe(2);
  });

  it('emits requesting_media -> ready -> recording -> stopping -> stopped state events', async () => {
    const { handle, stateEvents } = await setup({ chunks: 1 });
    await new Promise((r) => setTimeout(r, 100));
    await handle.stop();
    const states = new Set(stateEvents.map((e) => e.state));
    expect(states.has('requesting_media')).toBe(true);
    expect(states.has('ready')).toBe(true);
    expect(states.has('recording')).toBe(true);
    expect(states.has('stopping') || states.has('stopped')).toBe(true);
  });

  it('stop() is idempotent', async () => {
    const { handle } = await setup({ chunks: 1 });
    await new Promise((r) => setTimeout(r, 100));
    const a = await handle.stop();
    const b = await handle.stop();
    expect(a.started_at_ms).toBe(b.started_at_ms);
    expect(a.ended_at_ms).toBe(b.ended_at_ms);
  });

  it('state() and progress() reflect the live counts', async () => {
    // 50 chunks at 20ms interval = 1s recording, slower than auto-stop
    const { handle } = await setup({ chunks: 50 });
    await new Promise((r) => setTimeout(r, 80));
    const states = handle.state();
    expect(states.get('microphone')).toBe('recording');
    const progress = handle.progress();
    expect((progress.get('microphone') ?? 0) >= 1).toBe(true);
    await handle.stop();
  });

  it('marks media_denied when getUserMedia throws', async () => {
    const uploader = new InMemoryUploader();
    const stateEvents: Array<{ track: TrackKind; state: TrackState }> = [];
    const cfg: RecorderConfig = {
      workspace_id: 'ws-test',
      recording_session_id: 'sess-test',
      tracks: ['microphone'],
      chunk_ms: 20,
      on_track_state: (e) => stateEvents.push({ track: e.track_kind, state: e.state }),
    };
    const deniedSource: MediaSourceFactory = {
      async getMediaStream(_t) {
        throw new Error('Permission denied by user');
      },
    };
    const handle = await startMultiTrackRecorder({
      config: cfg,
      uploader,
      source: deniedSource,
      mediaRecorderCtor: makeFakeMediaRecorderCtor(),
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(stateEvents.map((e) => e.state)).toContain('media_denied');
    const summary = await handle.stop();
    expect(summary.tracks.length).toBe(0);
    expect(uploader.uploads.length).toBe(0);
  });
});
