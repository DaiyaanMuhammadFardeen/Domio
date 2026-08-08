/**
 * @domio/recording-extensions — type definitions for the multi-track recorder.
 *
 * The recorder drives up to 4 parallel MediaRecorder streams (screen, camera,
 * microphone, system_audio). Each track produces timed chunks via the
 * `timeslice` option of MediaRecorder. Chunks flow into the
 * `ChunkUploader` (which uses @domio/object-store) and emit events back
 * to the host page for telemetry and lifecycle handling.
 */

import type { TrackKind } from '@domio/object-store';

export interface RecorderConfig {
  readonly workspace_id: string;
  readonly recording_session_id: string;
  /** Which tracks to start. Default: all four. */
  readonly tracks: readonly TrackKind[];
  /** Chunk size in ms passed to MediaRecorder.start(timeslice). Default 1000. */
  readonly chunk_ms?: number;
  /** MIME type preference, e.g. 'video/webm;codecs=vp9,opus'. */
  readonly mime_type?: string;
  /** Bitrate in bps. Default 2_500_000. */
  readonly bits_per_second?: number;
  /** Optional callback fired on every chunk upload (for progress UI). */
  readonly on_chunk?: (event: ChunkProgressEvent) => void;
  /** Optional callback fired on track start/stop/error. */
  readonly on_track_state?: (event: TrackStateEvent) => void;
  /** Optional callback fired when all tracks are stopped. */
  readonly on_complete?: () => void;
}

export interface ChunkProgressEvent {
  readonly track_kind: TrackKind;
  readonly sequence: number;
  readonly byte_size: number;
  readonly duration_ms: number;
  readonly storage_key: string;
  readonly sha256: string;
  readonly uploaded_at_ms: number;
}

export type TrackState =
  | 'pending'
  | 'requesting_media'
  | 'media_denied'
  | 'ready'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'stopped'
  | 'errored';

export interface TrackStateEvent {
  readonly track_kind: TrackKind;
  readonly state: TrackState;
  readonly error?: string;
  readonly occurred_at_ms: number;
}

export interface RecordedTrackSummary {
  readonly track_kind: TrackKind;
  readonly mime_type: string;
  readonly total_duration_ms: number;
  readonly chunk_count: number;
  readonly total_bytes: number;
}

export interface RecordingSummary {
  readonly workspace_id: string;
  readonly recording_session_id: string;
  readonly tracks: readonly RecordedTrackSummary[];
  readonly started_at_ms: number;
  readonly ended_at_ms: number;
}

export interface RecorderHandle {
  /** Stop all tracks and finalize. Idempotent. */
  stop(): Promise<RecordingSummary>;
  /** Pause all tracks. No-op if already paused. */
  pause(): void;
  /** Resume all tracks. No-op if already recording. */
  resume(): void;
  /** Returns the current state of each track. */
  state(): ReadonlyMap<TrackKind, TrackState>;
  /** Returns per-track chunk counts so far. */
  progress(): ReadonlyMap<TrackKind, number>;
}

/**
 * Abstract chunk uploader. The default impl uploads to @domio/object-store;
 * tests inject an in-memory uploader to avoid network calls.
 */
export interface ChunkUploader {
  upload(args: {
    readonly workspace_id: string;
    readonly recording_session_id: string;
    readonly track_kind: TrackKind;
    readonly sequence: number;
    readonly extension?: string;
    readonly body: Uint8Array;
  }): Promise<{ storage_key: string; sha256: string; byte_size: number }>;
}