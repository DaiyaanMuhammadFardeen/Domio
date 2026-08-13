/**
 * Export pipeline — core types and errors (Phase 09).
 *
 * Defines the export format, job status lifecycle, frame types,
 * budget constraints, and typed errors used across the pipeline.
 */

// ---------------------------------------------------------------------------
// Formats & status
// ---------------------------------------------------------------------------

export type ExportFormat = 'gif' | 'mp4' | 'webm';

export type ExportJobStatus = 'queued' | 'rendering' | 'encoding' | 'ready' | 'failed';

export interface ExportRange {
  /** Start frame index (0-based, inclusive). */
  readonly start: number;
  /** End frame index (0-based, inclusive). */
  readonly end: number;
}

export interface CreateExportJobInput {
  readonly tenantId: string;
  readonly deckId: string;
  readonly format: ExportFormat;
  readonly range: ExportRange;
  /** Scale factor for output dimensions (1 = native). */
  readonly scale: number;
  /** Frames per second. */
  readonly fps: number;
  /** Optional URL to render from. */
  readonly sourceUrl?: string;
}

export interface ExportJob {
  readonly id: string;
  readonly tenantId: string;
  readonly deckId: string;
  readonly format: ExportFormat;
  readonly range: ExportRange;
  readonly scale: number;
  readonly fps: number;
  readonly sourceUrl?: string;
  readonly status: ExportJobStatus;
  /** Path or URI of the rendered artifact (populated when ready). */
  readonly artifactUri?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** Error details when status is 'failed'. */
  readonly error?: ExportJobError;
}

export interface ExportJobError {
  readonly code: string;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Frames
// ---------------------------------------------------------------------------

/** A single raw RGBA frame ready for encoding. */
export interface ExportFrame {
  readonly width: number;
  readonly height: number;
  /** Raw RGBA pixel data (4 bytes per pixel, row-major). */
  readonly data: Uint8Array;
}

/**
 * Injectable frame source — resolves frames for a given deck + range.
 * Real implementation will use headless Chromium via Playwright.
 */
export interface FrameSource {
  resolveFrames(deckId: string, range: ExportRange, scale: number): Promise<ExportFrame[]>;
}

// ---------------------------------------------------------------------------
// Encoder
// ---------------------------------------------------------------------------

export interface EncodeOptions {
  readonly format: ExportFormat;
  readonly fps: number;
}

export interface Encoder {
  encodeVideo(
    frames: ExportFrame[],
    options: EncodeOptions,
  ): Promise<Uint8Array | { unsupported: true }>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class ExportBudgetError extends Error {
  readonly code = 'EXPORT_BUDGET_EXCEEDED' as const;
  constructor(
    public readonly format: ExportFormat,
    public readonly maxSeconds: number,
    public readonly actualSeconds: number,
  ) {
    super(
      `${format.toUpperCase()} budget exceeded: ${actualSeconds}s exceeds ${maxSeconds}s limit`,
    );
    this.name = 'ExportBudgetError';
  }
}

export class JobNotFoundError extends Error {
  readonly code = 'JOB_NOT_FOUND' as const;
  constructor(public readonly jobId: string) {
    super(`Export job ${jobId} not found`);
    this.name = 'JobNotFoundError';
  }
}

export class InvalidJobTransitionError extends Error {
  readonly code = 'INVALID_JOB_TRANSITION' as const;
  constructor(
    public readonly from: ExportJobStatus,
    public readonly to: ExportJobStatus,
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

// ---------------------------------------------------------------------------
// Budget constants
// ---------------------------------------------------------------------------

export const GIF_MAX_SECONDS = 12;
export const VIDEO_MAX_SECONDS = 30;

// ---------------------------------------------------------------------------
// Valid status transitions
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<ExportJobStatus, readonly ExportJobStatus[]> = {
  queued: ['rendering', 'failed'],
  rendering: ['encoding', 'failed'],
  encoding: ['ready', 'failed'],
  ready: [],
  failed: [],
};

export function isValidTransition(from: ExportJobStatus, to: ExportJobStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
