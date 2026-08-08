/**
 * @domio/recording-extensions — multi-track recorder.
 *
 * Drives up to 4 parallel MediaRecorder streams (screen, camera, mic,
 * system audio). Each track produces chunks via timeslice; chunks are
 * handed to the ChunkUploader (which writes to object-store).
 *
 * Browser-only — depends on MediaRecorder + getDisplayMedia + getUserMedia.
 * For Node test runs we use a fake MediaStreamSource that emits synthetic
 * blobs on a setInterval.
 */

import { createHash } from 'node:crypto';
import type { ChunkUploader, RecorderConfig, RecorderHandle, RecordingSummary, TrackState, TrackStateEvent, ChunkProgressEvent } from './types.js';
import type { TrackKind } from '@domio/object-store';

export interface MediaSourceFactory {
  /** Returns a MediaStream for the requested track. The recorder holds the
   *  stream and stops all tracks when stop() is called. */
  getMediaStream(track: TrackKind): Promise<MediaStream>;
  /** Optional: create a synthetic source for tests (no real device). */
  createSyntheticSource(track: TrackKind): MediaStream;
}

export interface MultiTrackRecorderOptions {
  readonly config: RecorderConfig;
  readonly uploader: ChunkUploader;
  readonly source: MediaSourceFactory;
  /** Override MediaRecorder (browser uses the global; tests inject a fake). */
  readonly mediaRecorderCtor?: typeof MediaRecorder;
  /** Override crypto.randomUUID if running in non-browser. */
  readonly randomUUID?: () => string;
}

const TRACKS: readonly TrackKind[] = ['screen', 'camera', 'microphone', 'system_audio'] as const;

export async function startMultiTrackRecorder(opts: MultiTrackRecorderOptions): Promise<RecorderHandle> {
  const cfg = opts.config;
  const trackStates = new Map<TrackKind, TrackState>();
  const chunkCounts = new Map<TrackKind, number>();
  const totalBytes = new Map<TrackKind, number>();
  const totalDurationMs = new Map<TrackKind, number>();
  const mimeTypes = new Map<TrackKind, string>();
  const chunkMs = cfg.chunk_ms ?? 1000;
  const startedAtMs = Date.now();
  const recorders: Array<{ track: TrackKind; recorder: MediaRecorder }> = [];

  const emit = (track: TrackKind, state: TrackState, error?: string) => {
    trackStates.set(track, state);
    const event: TrackStateEvent = error !== undefined
      ? { track_kind: track, state, error, occurred_at_ms: Date.now() }
      : { track_kind: track, state, occurred_at_ms: Date.now() };
    cfg.on_track_state?.(event);
  };

  const tracks = cfg.tracks.length > 0 ? cfg.tracks : TRACKS;
  for (const track of tracks) {
    emit(track, 'requesting_media');
    let stream: MediaStream;
    try {
      stream = await opts.source.getMediaStream(track);
    } catch (err) {
      emit(track, 'media_denied', (err as Error).message);
      continue;
    }
    emit(track, 'ready');
    const mime = cfg.mime_type ?? 'video/webm';
    const Recorder = opts.mediaRecorderCtor ?? (typeof MediaRecorder !== 'undefined' ? MediaRecorder : null);
    if (!Recorder) {
      emit(track, 'errored', 'MediaRecorder is not available');
      continue;
    }
    const recorder = new Recorder(stream, {
      mimeType: mime,
      bitsPerSecond: cfg.bits_per_second ?? 2_500_000,
    });
    mimeTypes.set(track, mime);
    let sequence = 0;
    let trackStart = Date.now();
    recorder.ondataavailable = async (event: BlobEvent) => {
      if (!event.data || event.data.size === 0) return;
      const buf = new Uint8Array(await event.data.arrayBuffer());
      const sha256 = createHash('sha256').update(buf).digest('hex');
      const result = await opts.uploader.upload({
        workspace_id: cfg.workspace_id,
        recording_session_id: cfg.recording_session_id,
        track_kind: track,
        sequence,
        body: buf,
      });
      sequence++;
      chunkCounts.set(track, sequence);
      totalBytes.set(track, (totalBytes.get(track) ?? 0) + buf.byteLength);
      totalDurationMs.set(track, Date.now() - trackStart);
      const chunkEvent: ChunkProgressEvent = {
        track_kind: track,
        sequence: sequence - 1,
        byte_size: result.byte_size,
        duration_ms: chunkMs,
        storage_key: result.storage_key,
        sha256,
        uploaded_at_ms: Date.now(),
      };
      cfg.on_chunk?.(chunkEvent);
    };
    recorder.onerror = (event: Event) => {
      emit(track, 'errored', (event as ErrorEvent).message ?? 'MediaRecorder error');
    };
    recorder.onstart = () => emit(track, 'recording');
    recorder.onpause = () => emit(track, 'paused');
    recorder.onresume = () => emit(track, 'recording');
    recorder.onstop = () => emit(track, 'stopped');

    recorder.start(chunkMs);
    recorders.push({ track, recorder });
  }

  let stopped = false;
  return {
    state: () => new Map(trackStates),
    progress: () => new Map(chunkCounts),
    pause: () => {
      for (const r of recorders) {
        if (r.recorder.state === 'recording') r.recorder.pause();
      }
    },
    resume: () => {
      for (const r of recorders) {
        if (r.recorder.state === 'paused') r.recorder.resume();
      }
    },
    stop: async (): Promise<RecordingSummary> => {
      if (stopped) {
        return {
          workspace_id: cfg.workspace_id,
          recording_session_id: cfg.recording_session_id,
          tracks: recorders.map(({ track }) => trackSummary(track, mimeTypes, chunkCounts, totalBytes, totalDurationMs)),
          started_at_ms: startedAtMs,
          ended_at_ms: Date.now(),
        };
      }
      stopped = true;
      for (const r of recorders) {
        if (r.recorder.state !== 'inactive') {
          emit(r.track, 'stopping');
          r.recorder.stop();
        }
      }
      // Wait for last ondataavailable to flush.
      await new Promise((resolve) => setTimeout(resolve, 50));
      cfg.on_complete?.();
      return {
        workspace_id: cfg.workspace_id,
        recording_session_id: cfg.recording_session_id,
        tracks: recorders.map(({ track }) => trackSummary(track, mimeTypes, chunkCounts, totalBytes, totalDurationMs)),
        started_at_ms: startedAtMs,
        ended_at_ms: Date.now(),
      };
    },
  };
}

function trackSummary(
  track: TrackKind,
  mimeTypes: Map<TrackKind, string>,
  chunkCounts: Map<TrackKind, number>,
  totalBytes: Map<TrackKind, number>,
  totalDurationMs: Map<TrackKind, number>,
) {
  return {
    track_kind: track,
    mime_type: mimeTypes.get(track) ?? 'video/webm',
    total_duration_ms: totalDurationMs.get(track) ?? 0,
    chunk_count: chunkCounts.get(track) ?? 0,
    total_bytes: totalBytes.get(track) ?? 0,
  };
}

/**
 * Default MediaSourceFactory: uses getDisplayMedia + getUserMedia on the
 * browser. The `screen` track uses getDisplayMedia (which also captures
 * system audio when the user opts in); camera + mic use getUserMedia.
 * System audio is captured as a separate getUserMedia request with
 * audio: { echoCancellation: false } when the user grants it.
 */
export class BrowserMediaSourceFactory implements MediaSourceFactory {
  async getMediaStream(track: TrackKind): Promise<MediaStream> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      throw new Error('navigator.mediaDevices is not available in this environment');
    }
    if (track === 'screen') {
      return navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    }
    if (track === 'camera') {
      return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }
    if (track === 'microphone') {
      return navigator.mediaDevices.getUserMedia({ video: false, audio: { echoCancellation: true, noiseSuppression: true } });
    }
    if (track === 'system_audio') {
      return navigator.mediaDevices.getUserMedia({ video: false, audio: { echoCancellation: false, noiseSuppression: false } });
    }
    throw new Error(`Unsupported track kind: ${track}`);
  }

  createSyntheticSource(_track: TrackKind): MediaStream {
    throw new Error('createSyntheticSource is not implemented in BrowserMediaSourceFactory');
  }
}