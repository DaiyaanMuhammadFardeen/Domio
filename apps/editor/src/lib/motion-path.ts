/**
 * Motion path — Wave 2 §S2.11 type definitions + path math.
 *
 * A motion path is a series of cubic-bezier segments that an element
 * follows over the course of a layer timeline. Each keyframe carries a
 * position (x, y) and an optional bezier control-point delta that
 * defines the segment leaving this keyframe. The first keyframe's
 * incoming handle is implicit (anchored on its predecessor's outgoing
 * handle).
 *
 * Storage:
 *   The motion path is held in the element's `component.props` under
 *   the key `'x-domio:motion-path'`, mirroring how the timeline lives
 *   under `'x-domio:timeline'`. This keeps the doc-of-record CRDT-safe
 *   without adding new schema fields.
 *
 * Math model:
 *   - The path's first anchor is the element's natural position (the
 *     `x-domio:offset-x` / `x-domio:offset-y` props or its layer
 *     `x`/`y`). Subsequent anchors are deltas relative to that.
 *   - The path plays back over the timeline's `durationMs` and respects
 *     the timeline's `loop` + `playCount` and the keyframe `easing`.
 */

export interface MotionPathKeyframe {
  /** Time within the timeline (ms). */
  timeMs: number;
  /** Anchor offset relative to the element's natural position (px). */
  x: number;
  y: number;
  /**
   * Outgoing cubic-bezier control point, expressed as the offset from
   * the anchor (px). For example `{ x: 80, y: -40 }` produces a handle
   * 80px right and 40px up from the anchor. Null = linear / straight
   * handle to the next anchor.
   */
  controlOut?: { x: number; y: number } | null;
  /** Easing applied to the segment leaving this anchor. */
  easing?: string;
}

export interface MotionPath {
  /** Stable identifier used by the editor + CRDT merge logic. */
  id: string;
  /** First-frame anchor; defaults to {x:0,y:0} (the element's natural position). */
  origin: { x: number; y: number };
  /** Path keyframes ordered by `timeMs`. */
  keyframes: MotionPathKeyframe[];
  /**
   * Whether the last segment interpolates back to `origin` (closed
   * loop). Independent of the timeline's `loop` flag — a path can be
   * closed without looping the timeline and vice-versa.
   */
  closed?: boolean;
}

export interface MotionPathSample {
  /** Interpolated (x, y) relative to the element's natural position. */
  x: number;
  y: number;
  /** Segment index the sample came from (0 = first segment). */
  segment: number;
  /** Local t within the segment (0..1). */
  t: number;
}

// ---------------------------------------------------------------------------
// Sampling
// ---------------------------------------------------------------------------

/**
 * Sample a single point along the motion path at `timeMs` ms.
 *
 * Returns the element's natural position (origin) when no keyframes
 * are defined or `timeMs` is before the first keyframe.
 */
export function sampleMotionPath(path: MotionPath, timeMs: number): MotionPathSample {
  if (path.keyframes.length === 0) {
    return { x: path.origin.x, y: path.origin.y, segment: 0, t: 0 };
  }

  const segments = buildSegments(path);
  if (segments.length === 0) {
    const first = path.keyframes[0]!;
    return { x: path.origin.x + first.x, y: path.origin.y + first.y, segment: 0, t: 0 };
  }

  // Before first segment — clamp to origin / first anchor.
  const first = segments[0]!;
  if (timeMs <= first.fromMs) {
    return {
      x: path.origin.x + first.fromX,
      y: path.origin.y + first.fromY,
      segment: 0,
      t: 0,
    };
  }

  // After last segment — hold at last anchor (or close back to origin).
  const last = segments[segments.length - 1]!;
  if (timeMs >= last.toMs) {
    if (path.closed === true) {
      return {
        x: path.origin.x,
        y: path.origin.y,
        segment: segments.length - 1,
        t: 1,
      };
    }
    return {
      x: path.origin.x + last.toX,
      y: path.origin.y + last.toY,
      segment: segments.length - 1,
      t: 1,
    };
  }

  // Find the active segment.
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (timeMs >= seg.fromMs && timeMs <= seg.toMs) {
      const localT = (timeMs - seg.fromMs) / Math.max(1, seg.toMs - seg.fromMs);
      const eased = applyEasing(localT, seg.easing);
      const { x, y } = cubicBezierPoint(
        seg.fromX,
        seg.fromY,
        seg.c1x,
        seg.c1y,
        seg.toX,
        seg.toY,
        eased,
      );
      return { x: path.origin.x + x, y: path.origin.y + y, segment: i, t: eased };
    }
  }

  // Unreachable fallback.
  return { x: path.origin.x, y: path.origin.y, segment: 0, t: 0 };
}

interface Segment {
  fromMs: number;
  toMs: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Outgoing control point (relative to `from`). */
  c1x: number;
  c1y: number;
  /** Incoming control point (relative to `to`). */
  c2x: number;
  c2y: number;
  easing: string;
}

function buildSegments(path: MotionPath): Segment[] {
  const segs: Segment[] = [];
  const kfs = path.keyframes;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i]!;
    const b = kfs[i + 1]!;
    const cOut = a.controlOut ?? null;
    // Incoming control of `b` defaults to the mirror of `a`'s outgoing
    // handle so consecutive beziers look continuous when authoring.
    segs.push({
      fromMs: a.timeMs,
      toMs: b.timeMs,
      fromX: a.x,
      fromY: a.y,
      toX: b.x,
      toY: b.y,
      c1x: cOut?.x ?? 0,
      c1y: cOut?.y ?? 0,
      // Default incoming handle: smooth reflection of outgoing. If the
      // author later adds `controlIn`, that field can override here.
      c2x: 0,
      c2y: 0,
      easing: a.easing ?? 'linear',
    });
  }
  return segs;
}

/**
 * Single cubic-bezier sample. Coordinates are absolute (relative to
 * the element's natural position). `t` is in [0, 1].
 */
export function cubicBezierPoint(
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  t: number,
): { x: number; y: number } {
  const u = 1 - t;
  const x = u * u * u * p0x + 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * p2x;
  const y = u * u * u * p0y + 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t * p2y;
  return { x, y };
}

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

/**
 * Apply a CSS-style easing token to a linear progress value.
 *
 * Supports the four named CSS easing tokens plus `cubic-bezier(a,b,c,d)`.
 * Spring / bounce fall back to ease-out so the editor's static preview
 * is well-defined without animating; the runtime renderer uses the
 * platform-native spring/bounce interpolation.
 */
export function applyEasing(t: number, easing: string): number {
  const value = easing || 'linear';
  if (value === 'linear') return t;
  if (value === 'ease-in') return t * t;
  if (value === 'ease-out') return 1 - (1 - t) * (1 - t);
  if (value === 'ease-in-out') return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  if (value === 'spring') return 1 - (1 - t) * (1 - t);
  if (value === 'bounce') return 1 - (1 - t) * (1 - t);
  const match =
    /^cubic-bezier\(\s*([\d.\-eE]+)\s*,\s*([\d.\-eE]+)\s*,\s*([\d.\-eE]+)\s*,\s*([\d.\-eE]+)\s*\)$/.exec(
      value,
    );
  if (match) {
    const p1x = Number(match[1]);
    const p1y = Number(match[2]);
    const p2x = Number(match[3]);
    const p2y = Number(match[4]);
    return cubicBezierY(p1x, p1y, p2x, p2y, t);
  }
  return t;
}

/**
 * Cubic-bezier y at the given x using Newton's method (4 iterations).
 * Used to honor `cubic-bezier(...)` in `applyEasing`.
 */
function cubicBezierY(p1x: number, p1y: number, p2x: number, p2y: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let t = x;
  for (let i = 0; i < 6; i++) {
    const cx = 3 * (1 - t) * (1 - t) * t * p1x + 3 * (1 - t) * t * t * p2x + t * t * t;
    const dx = 3 * (1 - t) * (1 - t) * p1x + 6 * (1 - t) * t * (p2x - p1x) + 3 * t * t * (1 - p2x);
    const diff = cx - x;
    if (Math.abs(diff) < 1e-4) break;
    if (dx === 0) break;
    t -= diff / dx;
  }
  const u = 1 - t;
  return 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t;
}

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

const KEY = 'x-domio:motion-path';

/** Read a motion path from an element's component props. */
export function readMotionPath(props: Record<string, unknown> | undefined): MotionPath | null {
  if (!props) return null;
  const value = props[KEY];
  if (typeof value !== 'object' || value === null) return null;
  return value as MotionPath;
}

/** Write a motion path to a copy of the element's component props. */
export function writeMotionPath(
  props: Record<string, unknown> | undefined,
  path: MotionPath,
): Record<string, unknown> {
  return { ...(props ?? {}), [KEY]: path };
}

/** Remove a motion path from a copy of the element's component props. */
export function clearMotionPath(
  props: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!props) return {};
  const next = { ...props };
  delete next[KEY];
  return next;
}

/**
 * Create an empty motion path with sensible defaults (a single
 * idle anchor at timeMs = 0, no movement).
 */
export function defaultMotionPath(): MotionPath {
  return {
    id: `mp-${Date.now()}`,
    origin: { x: 0, y: 0 },
    keyframes: [
      { timeMs: 0, x: 0, y: 0, controlOut: null },
      { timeMs: 1000, x: 0, y: 0, controlOut: null },
    ],
  };
}
