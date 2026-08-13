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
export declare class AnnotationValidationError extends Error {
  readonly code: 'ANNOTATION_VALIDATION_ERROR';
  constructor(message: string);
}
export declare class AnnotationNotFoundError extends Error {
  readonly code: 'ANNOTATION_NOT_FOUND';
  constructor(message: string);
}
export declare class AnnotationConflictError extends Error {
  readonly code: 'ANNOTATION_CONFLICT';
  constructor(message: string);
}
export declare function validateCommitInput(input: AnnotationCommitInput): void;
//# sourceMappingURL=types.d.ts.map
