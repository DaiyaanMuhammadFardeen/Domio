/**
 * Spring-physics easing (deterministic, fixed-step).
 *
 * Uses a fixed 120 Hz sub-step solver so the result is identical
 * regardless of the caller's frame rate.
 */

/** Configuration for a spring easing curve. */
export interface SpringConfig {
  /** Mass in [0.1, 10] */
  mass: number;
  /** Stiffness in [10, 1000] */
  stiffness: number;
  /** Damping in [1, 200] */
  damping: number;
  /** Initial velocity (default 0) */
  initialVelocity?: number;
}

const SUBSTEP = 1 / 120; // 120 Hz fixed step

const PRESETS: Record<string, SpringConfig> = {
  wobbly: { mass: 1, stiffness: 180, damping: 12 },
  snappy: { mass: 0.8, stiffness: 400, damping: 28 },
  gentle: { mass: 1, stiffness: 120, damping: 20 },
};

/** Clamp a value to a range. */
function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Spring easing — returns `(t) => number`.
 *
 * The spring is solved forward from t=0 to t=1 with fixed sub-steps,
 * producing a deterministic displacement curve. The output is clamped
 * to the same range as cubic-Bézier (`[-0.25, 1.25]`).
 *
 * @param config - Spring parameters (mass, stiffness, damping, initialVelocity)
 * @returns An easing function `(t: number) => number`
 */
export function springEase(config: SpringConfig): (t: number) => number {
  const mass = clamp(config.mass, 0.1, 10);
  const stiffness = clamp(config.stiffness, 10, 1000);
  const damping = clamp(config.damping, 1, 200);
  const v0 = config.initialVelocity ?? 0;

  const steps = Math.ceil(1 / SUBSTEP); // total number of sub-steps

  // Pre-compute displacement at every sub-step (deterministic)
  const curve = new Float64Array(steps + 1);
  let x = 0; // displacement from 0 toward 1
  let v = v0;

  for (let i = 0; i <= steps; i++) {
    curve[i] = x;
    // Spring force: -k * (x - 1) - c * v  (target = 1)
    const springForce = -stiffness * (x - 1);
    const dampingForce = -damping * v;
    const acceleration = (springForce + dampingForce) / mass;
    v += acceleration * SUBSTEP;
    x += v * SUBSTEP;
  }
  // Ensure endpoint is exactly 1
  curve[steps] = 1;

  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const idx = t * steps;
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, steps);
    const frac = idx - lo;
    const val = curve[lo]! * (1 - frac) + curve[hi]! * frac;
    if (val < -0.25) return -0.25;
    if (val > 1.25) return 1.25;
    return val;
  };
}

/**
 * Return a named spring preset.
 *
 * @param name - One of `"wobbly"`, `"snappy"`, `"gentle"`
 * @returns Spring configuration for that preset
 */
export function springPreset(name: string): SpringConfig {
  const p = PRESETS[name];
  if (!p) throw new Error(`Unknown spring preset: ${name}`);
  return { ...p };
}
