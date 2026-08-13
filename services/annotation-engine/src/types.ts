/**
 * @domio/annotation-engine — public types and errors.
 *
 * Phase 15 W4. The annotation engine persists overlay strokes for live
 * presenter sessions. Strokes can be ephemeral (cleared on session end)
 * or saved (promoted to the slide).
 *
 * Geometry formats per kind:
 *   - pen / highlighter: { strokes: Stroke[] }
 *     where Stroke = Array<{ x: number, y: number, pressure: number, t: number }>
 *   - spotlight: { x, y, radius, shape: 'circle' | 'rect' }
 *   - zoom:      { x, y, radius, magnification }
 *   - blur:      { x, y, width, height, radius }
 *
 * Replay determinism: each stroke is a typed point array with monotonically
 * increasing `t`. The renderer is expected to use a stable sample rate
 * (e.g. requestAnimationFrame timestamps in `t`). Two presenters viewing
 * the same stroke see identical output.
 */

export type AnnotationKind = 'pen' | 'highlighter' | 'spotlight' | 'zoom' | 'blur';

export interface Point {
  /** Normalized 0..1 within the slide viewport. */
  x: number;
  y: number;
  /** Pressure 0..1. Defaults to 0.5 if hardware doesn't report. */
  pressure: number;
  /** Monotonic time (ms since stroke start). */
  t: number;
}

export interface PenGeometry {
  strokes: Point[][];
}

export interface SpotlightGeometry {
  x: number;
  y: number;
  radius: number;
  shape: 'circle' | 'rect';
}

export interface ZoomGeometry {
  x: number;
  y: number;
  radius: number;
  magnification: number;
}

export interface BlurGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

export type AnnotationGeometry = PenGeometry | SpotlightGeometry | ZoomGeometry | BlurGeometry;

export interface AnnotationCommitInput {
  session_id: string;
  workspace_id: string;
  slide_id: string;
  layer_id?: string;
  kind: AnnotationKind;
  geometry: AnnotationGeometry;
  style?: Record<string, unknown>;
  color?: string;
  stroke_width?: number;
  ephemeral?: boolean;
  drawn_by: string;
  drawn_by_display_name?: string;
  /** Optimistic-CC etag from the presenter session. */
  expected_version: number;
  idempotency_key?: string;
}

export interface AnnotationRollbackInput {
  session_id: string;
  workspace_id: string;
  annotation_id: string;
  expected_version: number;
  idempotency_key?: string;
}

export interface AnnotationPromoteInput {
  session_id: string;
  workspace_id: string;
  annotation_id: string;
  expected_version: number;
  idempotency_key?: string;
}

export interface AnnotationLayerRecord {
  id: string;
  session_id: string;
  workspace_id: string;
  slide_id: string;
  layer_id: string | null;
  kind: AnnotationKind;
  geometry: AnnotationGeometry;
  style: Record<string, unknown>;
  color: string | null;
  stroke_width: number | null;
  ephemeral: boolean;
  saved_overlay_id: string | null;
  drawn_by: string;
  drawn_by_display_name: string | null;
  created_at_ms: number;
}

/** Snapshot returned to the caller after commit. */
export interface AnnotationCommitResult {
  annotation: AnnotationLayerRecord;
  /** Etag of the session row after the bump. */
  version: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class AnnotationValidationError extends Error {
  readonly code = 'ANNOTATION_VALIDATION_ERROR' as const;
  constructor(message: string) {
    super(message);
    this.name = 'AnnotationValidationError';
  }
}

export class AnnotationNotFoundError extends Error {
  readonly code = 'ANNOTATION_NOT_FOUND' as const;
  constructor(message: string) {
    super(message);
    this.name = 'AnnotationNotFoundError';
  }
}

export class AnnotationConflictError extends Error {
  readonly code = 'ANNOTATION_CONFLICT' as const;
  constructor(message: string) {
    super(message);
    this.name = 'AnnotationConflictError';
  }
}

const VALID_KINDS: AnnotationKind[] = ['pen', 'highlighter', 'spotlight', 'zoom', 'blur'];

export function validateCommitInput(input: AnnotationCommitInput): void {
  if (!input.session_id) throw new AnnotationValidationError('session_id is required');
  if (!input.workspace_id) throw new AnnotationValidationError('workspace_id is required');
  if (!input.slide_id) throw new AnnotationValidationError('slide_id is required');
  if (!input.drawn_by) throw new AnnotationValidationError('drawn_by is required');
  if (!VALID_KINDS.includes(input.kind)) {
    throw new AnnotationValidationError(`invalid kind: ${input.kind}`);
  }
  if (!Number.isInteger(input.expected_version) || input.expected_version < 1) {
    throw new AnnotationValidationError('expected_version must be a positive integer');
  }
  validateGeometry(input.kind, input.geometry);
}

function validateGeometry(kind: AnnotationKind, g: AnnotationGeometry): void {
  switch (kind) {
    case 'pen':
    case 'highlighter': {
      const pen = g as PenGeometry;
      if (!Array.isArray(pen.strokes) || pen.strokes.length === 0) {
        throw new AnnotationValidationError(`${kind}: strokes must be a non-empty array`);
      }
      for (const stroke of pen.strokes) {
        if (!Array.isArray(stroke) || stroke.length === 0) {
          throw new AnnotationValidationError(`${kind}: each stroke must have at least one point`);
        }
        let prevT = -Infinity;
        for (const p of stroke) {
          if (typeof p.x !== 'number' || typeof p.y !== 'number') {
            throw new AnnotationValidationError(`${kind}: x/y must be numbers`);
          }
          if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) {
            throw new AnnotationValidationError(`${kind}: x/y must be normalized 0..1`);
          }
          if (typeof p.t !== 'number' || p.t < prevT) {
            throw new AnnotationValidationError(`${kind}: t must be monotonically non-decreasing`);
          }
          prevT = p.t;
        }
      }
      break;
    }
    case 'spotlight': {
      const s = g as SpotlightGeometry;
      if (typeof s.x !== 'number' || typeof s.y !== 'number' || typeof s.radius !== 'number') {
        throw new AnnotationValidationError('spotlight: x/y/radius must be numbers');
      }
      if (s.radius <= 0) throw new AnnotationValidationError('spotlight: radius must be > 0');
      if (s.shape !== 'circle' && s.shape !== 'rect') {
        throw new AnnotationValidationError('spotlight: shape must be circle or rect');
      }
      break;
    }
    case 'zoom': {
      const z = g as ZoomGeometry;
      if (typeof z.x !== 'number' || typeof z.y !== 'number' || typeof z.radius !== 'number') {
        throw new AnnotationValidationError('zoom: x/y/radius must be numbers');
      }
      if (z.magnification !== undefined && z.magnification <= 0) {
        throw new AnnotationValidationError('zoom: magnification must be > 0');
      }
      break;
    }
    case 'blur': {
      const b = g as BlurGeometry;
      if (typeof b.x !== 'number' || typeof b.y !== 'number') {
        throw new AnnotationValidationError('blur: x/y must be numbers');
      }
      if (b.width <= 0 || b.height <= 0) {
        throw new AnnotationValidationError('blur: width/height must be > 0');
      }
      if (b.radius < 0) throw new AnnotationValidationError('blur: radius must be >= 0');
      break;
    }
  }
}
