/**
 * Cubic-Bézier validation.
 *
 * Validates that control points produce a usable easing curve.
 * Rejects degenerate, non-monotonic, or out-of-range inputs.
 */

/** Successful validation result. */
interface BezierOk {
  ok: true;
}

/** Failed validation result. */
interface BezierFail {
  ok: false;
  reason: string;
}

export type BezierValidation = BezierOk | BezierFail;

/**
 * Validate cubic-Bézier control points.
 *
 * @param x1 - x of first control point
 * @param y1 - y of first control point (may overshoot)
 * @param x2 - x of second control point
 * @param y2 - y of second control point (may overshoot)
 * @returns `{ ok: true }` or `{ ok: false, reason }`
 */
export function validateBezier(x1: number, _y1: number, x2: number, _y2: number): BezierValidation {
  // x must be in [0, 1]
  if (x1 < 0 || x1 > 1) {
    return { ok: false, reason: `x1 must be in [0, 1], got ${x1}` };
  }
  if (x2 < 0 || x2 > 1) {
    return { ok: false, reason: `x2 must be in [0, 1], got ${x2}` };
  }

  // Degenerate: both x-controls at 0 (straight vertical — no easing)
  if (x1 === 0 && x2 === 0) {
    return { ok: false, reason: 'Degenerate: x1 and x2 are both 0 (vertical line)' };
  }

  // Degenerate: both x-controls at 1
  if (x1 === 1 && x2 === 1) {
    return { ok: false, reason: 'Degenerate: x1 and x2 are both 1 (vertical line)' };
  }

  // Non-monotonic: x1 must not exceed x2
  if (x1 > x2) {
    return { ok: false, reason: `Non-monotonic: x1 (${x1}) > x2 (${x2})` };
  }

  return { ok: true };
}
