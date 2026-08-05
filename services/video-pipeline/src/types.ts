/**
 * Video pipeline — core types, errors, and state machine (Phase 11).
 *
 * Defines the video job status lifecycle, rendition types, priority levels,
 * and typed errors used across the pipeline.  Mirrors the export-pipeline
 * pattern with a pure `isValidTransition` reducer.
 */

// ---------------------------------------------------------------------------
// Renditions, priority, status
// ---------------------------------------------------------------------------

export type Rendition = '240p' | '480p' | '720p' | '1080p';

export type VideoJobPriority = 'low' | 'normal' | 'high';

export type VideoJobStatus = 'queued' | 'processing' | 'ready' | 'failed';

// ---------------------------------------------------------------------------
// Create request
// ---------------------------------------------------------------------------

export interface CreateVideoJobInput {
  readonly videoAssetId: string;
  readonly renditions: Rendition[];
  readonly extractCaptions?: boolean;
  readonly extractWaveform?: boolean;
  readonly priority?: VideoJobPriority;
}

// ---------------------------------------------------------------------------
// Job record
// ---------------------------------------------------------------------------

export interface VideoJob {
  readonly id: string;
  readonly videoAssetId: string;
  readonly renditions: readonly Rendition[];
  readonly extractCaptions: boolean;
  readonly extractWaveform: boolean;
  readonly priority: VideoJobPriority;
  readonly status: VideoJobStatus;
  readonly statusUrl: string;
  readonly errorMessage?: string;
  readonly createdAt: string; // ISO-8601
}

// ---------------------------------------------------------------------------
// Job error envelope
// ---------------------------------------------------------------------------

export interface VideoJobError {
  readonly code: string;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Valid status transitions (pure reducer)
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<VideoJobStatus, readonly VideoJobStatus[]> = {
  queued: ['processing', 'failed'],
  processing: ['ready', 'failed'],
  ready: [],
  failed: [],
};

export function isValidTransition(from: VideoJobStatus, to: VideoJobStatus): boolean {
  return VALID_TRANSITIONS[from]!.includes(to);
}

// ---------------------------------------------------------------------------
// Transcoder result types (mirrors video-asset-v1.schema.json fields)
// ---------------------------------------------------------------------------

export interface TranscodeResultUrls {
  readonly hls?: string;
  readonly dash?: string;
}

export interface TranscodeResult {
  readonly urls: TranscodeResultUrls;
  readonly captionsUrl?: string;
  readonly waveformUrl?: string;
  readonly thumbnailUrl?: string;
}

export interface UnsupportedTranscodeResult {
  readonly unsupported: true;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class JobNotFoundError extends Error {
  readonly code = 'JOB_NOT_FOUND' as const;
  constructor(public readonly jobId: string) {
    super(`Video job ${jobId} not found`);
    this.name = 'JobNotFoundError';
  }
}

export class InvalidJobTransitionError extends Error {
  readonly code = 'INVALID_JOB_TRANSITION' as const;
  constructor(
    public readonly from: VideoJobStatus,
    public readonly to: VideoJobStatus,
  ) {
    super(`Invalid status transition: ${from} → ${to}`);
    this.name = 'InvalidJobTransitionError';
  }
}

export class ValidationError extends Error {
  readonly code = 'VALIDATION_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class CancelConflictError extends Error {
  readonly code = 'CANCEL_CONFLICT' as const;
  constructor(
    public readonly jobId: string,
    public readonly status: VideoJobStatus,
  ) {
    super(`Cannot cancel job ${jobId} in status "${status}"`);
    this.name = 'CancelConflictError';
  }
}

// ---------------------------------------------------------------------------
// Budget constants (mirrors export-pipeline VIDEO_MAX_SECONDS)
// ---------------------------------------------------------------------------

export const VIDEO_MAX_SECONDS = 30;

// ---------------------------------------------------------------------------
// Priority ordering (lower number = higher priority for FIFO-with-priority)
// ---------------------------------------------------------------------------

export const PRIORITY_ORDER: Record<VideoJobPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};
