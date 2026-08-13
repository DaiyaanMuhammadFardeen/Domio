/**
 * @domio/recording-orchestrator — type definitions.
 *
 * The recording orchestrator is transport-agnostic. It depends on:
 *   - {@link RecordingStore} — persistence (Postgres-backed in prod, in-mem in tests).
 *   - {@link AuditEmitter}    — hash-chained audit log emission.
 *   - {@link IdempotencyStore} — replay-safe mutation dedup.
 *   - {@link ObjectStore}     — chunk storage (S3/MinIO).
 *
 * Capabilities (recording:*):
 *   - recording:start    — POST /v1/recording/sessions
 *   - recording:pause    — POST /v1/recording/sessions/{id}/pause
 *   - recording:resume   — POST /v1/recording/sessions/{id}/resume
 *   - recording:stop     — POST /v1/recording/sessions/{id}/stop
 *   - recording:commit   — POST /v1/recording/sessions/{id}/chunks (lease-based)
 *   - recording:finalize — POST /v1/recording/sessions/{id}/finalize
 *   - recording:get      — GET  /v1/recording/sessions/{id}
 *   - recording:list     — GET  /v1/recording/sessions
 */

import type { TrackKind } from '@domio/object-store';

export type RecordingStatus =
  | 'pending'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'finalizing'
  | 'ready'
  | 'failed'
  | 'expired'
  | 'revoked';

export interface RecordingSession {
  readonly id: string;
  readonly workspace_id: string;
  readonly session_id: string;
  readonly presenter_user_id: string | null;
  readonly status: RecordingStatus;
  readonly started_at: string; // ISO-8601
  readonly paused_at: string | null;
  readonly stopped_at: string | null;
  readonly finalized_at: string | null;
  readonly expires_at: string | null;
  readonly storage_prefix: string;
  readonly title: string | null;
  readonly description: string | null;
  readonly language: string;
  readonly error: string | null;
  readonly version: number;
}

export interface RecordingTrack {
  readonly workspace_id: string;
  readonly recording_session_id: string;
  readonly track_kind: TrackKind;
  readonly mime_type: string;
  readonly codec: string | null;
  readonly sample_rate_hz: number | null;
  readonly channel_layout: string | null;
  readonly total_duration_ms: number;
  readonly chunk_count: number;
  readonly total_bytes: number;
}

export interface RecordingChunk {
  readonly workspace_id: string;
  readonly recording_session_id: string;
  readonly track_kind: TrackKind;
  readonly sequence: number;
  readonly byte_size: number;
  readonly duration_ms: number;
  readonly sha256: string;
  readonly storage_key: string;
  readonly lease_id: string | null;
  readonly lease_expires_at: string | null;
  readonly committed_at: string;
}

export interface StartRecordingInput {
  readonly workspace_id: string;
  readonly session_id: string;
  readonly presenter_user_id: string;
  readonly storage_prefix: string;
  readonly title?: string;
  readonly description?: string;
  readonly language?: string;
  readonly expires_at?: string;
}

export interface CommitChunkInput {
  readonly workspace_id: string;
  readonly recording_session_id: string;
  readonly track_kind: TrackKind;
  readonly sequence: number;
  readonly byte_size: number;
  readonly duration_ms: number;
  readonly sha256: string;
  readonly storage_key: string;
  readonly lease_id: string;
  readonly lease_expires_at: string;
  readonly idempotency_key?: string;
}

export interface TransitionInput {
  readonly workspace_id: string;
  readonly recording_session_id: string;
  readonly expected_version: number;
  readonly idempotency_key?: string;
}

export interface FinalizeInput {
  readonly workspace_id: string;
  readonly recording_session_id: string;
  readonly expected_version: number;
  readonly idempotency_key?: string;
}

// --- Errors -----------------------------------------------------------------

export class RecordingNotFoundError extends Error {
  constructor(public readonly recording_session_id: string) {
    super(`Recording session ${recording_session_id} not found`);
    this.name = 'RecordingNotFoundError';
  }
}

export class RecordingConflictError extends Error {
  constructor(
    public readonly recording_session_id: string,
    public readonly expected_version: number,
    public readonly actual_version: number,
  ) {
    super(
      `Recording ${recording_session_id} version mismatch: expected ${expected_version}, actual ${actual_version}`,
    );
    this.name = 'RecordingConflictError';
  }
}

export class RecordingInvalidTransitionError extends Error {
  constructor(
    public readonly from: RecordingStatus,
    public readonly to: RecordingStatus,
  ) {
    super(`Invalid recording transition: ${from} -> ${to}`);
    this.name = 'RecordingInvalidTransitionError';
  }
}

export class RecordingChunkConflictError extends Error {
  constructor(
    public readonly recording_session_id: string,
    public readonly track_kind: TrackKind,
    public readonly sequence: number,
  ) {
    super(`Chunk ${sequence} already committed for ${track_kind} of ${recording_session_id}`);
    this.name = 'RecordingChunkConflictError';
  }
}

// --- Validation -------------------------------------------------------------

export function validateStartInput(input: StartRecordingInput): void {
  if (!input.workspace_id) throw new Error('workspace_id required');
  if (!input.session_id) throw new Error('session_id required');
  if (!input.presenter_user_id) throw new Error('presenter_user_id required');
  if (!input.storage_prefix) throw new Error('storage_prefix required');
}

export function validateCommitChunkInput(input: CommitChunkInput): void {
  if (!input.workspace_id) throw new Error('workspace_id required');
  if (!input.recording_session_id) throw new Error('recording_session_id required');
  if (input.byte_size < 0) throw new Error('byte_size must be >= 0');
  if (input.sequence < 0) throw new Error('sequence must be >= 0');
  if (!input.sha256) throw new Error('sha256 required');
  if (!input.storage_key) throw new Error('storage_key required');
}
