/**
 * @domio/recording-orchestrator — store interface + in-memory implementation.
 *
 * The store interface is the only seam between the service and persistence.
 * Production binds this to a pgx/Postgres adapter; tests use the in-memory
 * impl included here. Mirrors services/presenter-session/src/store/store.ts.
 */

import type {
  RecordingSession,
  RecordingTrack,
  RecordingChunk,
  RecordingStatus,
} from '../types.js';
import {
  RecordingNotFoundError,
  RecordingConflictError,
  RecordingChunkConflictError,
} from '../types.js';
import type { TrackKind } from '@domio/object-store';

export interface StoreError {
  readonly code: 'not_found' | 'conflict' | 'invalid';
}

export interface RecordingStore {
  /** Returns the session by id, or null. */
  get(id: string): Promise<RecordingSession | null>;
  /** Returns all chunks for a session, ordered by track_kind + sequence. */
  listChunks(recording_session_id: string): Promise<readonly RecordingChunk[]>;
  /** Returns all tracks for a session. */
  listTracks(recording_session_id: string): Promise<readonly RecordingTrack[]>;
  /** Insert a new recording session; throws on conflict. */
  insertSession(input: RecordingSession): Promise<RecordingSession>;
  /** Bump version + apply status transition atomically; throws on version mismatch. */
  transitionStatus(args: {
    id: string;
    expected_version: number;
    next_status: RecordingStatus;
    now_iso: string;
    paused_at?: string;
    stopped_at?: string;
    finalized_at?: string;
    error?: string;
  }): Promise<RecordingSession>;
  /** Upsert a track. */
  upsertTrack(track: RecordingTrack): Promise<RecordingTrack>;
  /** Commit a chunk; throws if (track_kind, sequence) already exists. */
  commitChunk(chunk: RecordingChunk): Promise<RecordingChunk>;
  /** Release a lease — set lease_id and lease_expires_at to null. */
  releaseLease(args: {
    recording_session_id: string;
    track_kind: TrackKind;
    sequence: number;
  }): Promise<void>;
}

export function isStore(x: unknown): x is RecordingStore {
  return (
    typeof x === 'object' &&
    x !== null &&
    typeof (x as { transitionStatus?: unknown }).transitionStatus === 'function'
  );
}

// --- In-memory impl --------------------------------------------------------

export class InMemoryRecordingStore implements RecordingStore {
  private readonly sessions = new Map<string, RecordingSession>();
  private readonly tracks = new Map<string, RecordingTrack>();
  private readonly chunks = new Map<string, RecordingChunk>();
  private chunkSeq = 0;

  private chunkKey(recording_session_id: string, track_kind: TrackKind, sequence: number): string {
    return `${recording_session_id}::${track_kind}::${sequence}`;
  }

  async get(id: string): Promise<RecordingSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async listChunks(recording_session_id: string): Promise<readonly RecordingChunk[]> {
    return [...this.chunks.values()].filter((c) => c.recording_session_id === recording_session_id);
  }

  async listTracks(recording_session_id: string): Promise<readonly RecordingTrack[]> {
    return [...this.tracks.values()].filter((t) => t.recording_session_id === recording_session_id);
  }

  async insertSession(input: RecordingSession): Promise<RecordingSession> {
    if (this.sessions.has(input.id)) {
      throw new RecordingConflictError(input.id, 0, this.sessions.get(input.id)?.version ?? 0);
    }
    this.sessions.set(input.id, input);
    return input;
  }

  async transitionStatus(args: {
    id: string;
    expected_version: number;
    next_status: RecordingStatus;
    now_iso: string;
    paused_at?: string;
    stopped_at?: string;
    finalized_at?: string;
    error?: string;
  }): Promise<RecordingSession> {
    const existing = this.sessions.get(args.id);
    if (!existing) throw new RecordingNotFoundError(args.id);
    if (existing.version !== args.expected_version) {
      throw new RecordingConflictError(args.id, args.expected_version, existing.version);
    }
    const next: RecordingSession = {
      ...existing,
      status: args.next_status,
      paused_at: args.paused_at ?? existing.paused_at,
      stopped_at: args.stopped_at ?? existing.stopped_at,
      finalized_at: args.finalized_at ?? existing.finalized_at,
      error: args.error ?? existing.error,
      version: existing.version + 1,
    };
    this.sessions.set(args.id, next);
    return next;
  }

  async upsertTrack(track: RecordingTrack): Promise<RecordingTrack> {
    const key = `${track.recording_session_id}::${track.track_kind}`;
    this.tracks.set(key, track);
    return track;
  }

  async commitChunk(chunk: RecordingChunk): Promise<RecordingChunk> {
    const key = this.chunkKey(chunk.recording_session_id, chunk.track_kind, chunk.sequence);
    if (this.chunks.has(key)) {
      throw new RecordingChunkConflictError(
        chunk.recording_session_id,
        chunk.track_kind,
        chunk.sequence,
      );
    }
    this.chunks.set(key, chunk);
    this.chunkSeq++;
    return chunk;
  }

  async releaseLease(args: {
    recording_session_id: string;
    track_kind: TrackKind;
    sequence: number;
  }): Promise<void> {
    const key = this.chunkKey(args.recording_session_id, args.track_kind, args.sequence);
    const existing = this.chunks.get(key);
    if (!existing) return;
    this.chunks.set(key, { ...existing, lease_id: null, lease_expires_at: null });
  }

  /** Test helper: total chunk count for assertions. */
  totalChunks(): number {
    return this.chunkSeq;
  }

  /** Test helper: total track count for assertions. */
  totalTracks(): number {
    return this.tracks.size;
  }
}
