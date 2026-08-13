/**
 * Cubic-Bézier easing evaluator.
 *
 * Uses Newton-Raphson (fixed 8 iterations) to solve x(t) for a given t,
 * then evaluates y at the same parametric time. Handles the degenerate
 * cases where the control points collapse to a straight line.
 *
 * @param x1 - x-coordinate of first control point (in [0, 1])
 * @param y1 - y-coordinate of first control point (may overshoot)
 * @param x2 - x-coordinate of second control point (in [0, 1])
 * @param y2 - y-coordinate of second control point (may overshoot)
 * @returns A function `(t: number) => number` with output clamped to `[-0.25, 1.25]`
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  // Degenerate: both x-controls at 0 → linear from (0,0) to (0,1) — output = y-axis
  const isLinearX = x1 === x2;
  if (isLinearX && x1 === 0) {
    // Straight vertical: map t → t
    return (t: number): number => clampY(t);
  }
  if (isLinearX && x1 === 1) {
    // Straight vertical at x=1: map t → t
    return (t: number): number => clampY(t);
  }

  // Pre-compute coefficients for the cubic polynomial
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  /** Evaluate cubic: a*t³ + b*t² + c*t */
  const sampleX = (tt: number): number => ((ax * tt + bx) * tt + cx) * tt;
  const sampleY = (tt: number): number => ((ay * tt + by) * tt + cy) * tt;

  /** Derivative dx/dt */
  const sampleDX = (tt: number): number => (3 * ax * tt + 2 * bx) * tt + cx;

  /** Newton-Raphson: find parametric t such that x(t) ≈ targetX */
  const solveForX = (targetX: number): number => {
    let tt = targetX; // initial guess
    for (let i = 0; i < 8; i++) {
      const err = sampleX(tt) - targetX;
      if (Math.abs(err) < 1e-7) break;
      const dx = sampleDX(tt);
      if (Math.abs(dx) < 1e-7) break;
      tt -= err / dx;
    }
    return Math.max(0, Math.min(1, tt));
  };

  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const paramT = solveForX(t);
    return clampY(sampleY(paramT));
  };
}

/** Clamp output to [-0.25, 1.25] */
function clampY(y: number): number {
  if (y < -0.25) return -0.25;
  if (y > 1.25) return 1.25;
  return y;
}
