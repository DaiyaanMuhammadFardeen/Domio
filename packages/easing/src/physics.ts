/**
 * Physics-based easing presets (gravity / throw / bounce).
 *
 * Uses a deterministic fixed-step solver (same as spring.ts) so the
 * result is frame-rate-independent.
 */

/** Physics easing type. */
export type PhysicsEasingType = 'gravity' | 'throw' | 'bounce';

/** Options for `physicsEase`. */
export interface PhysicsConfig {
  type: PhysicsEasingType;
  /** Gravity acceleration (default 980) */
  gravity?: number;
  /** Initial upward velocity for throw/bounce (default -600) */
  initialVelocity?: number;
  /** Coefficient of restitution for bounce (default 0.6) */
  restitution?: number;
}

const SUBSTEP = 1 / 120;

/**
 * Physics easing — returns `(t) => number`.
 *
 * @param config - Physics configuration
 * @returns An easing function `(t: number) => number`
 */
export function physicsEase(config: PhysicsConfig): (t: number) => number {
  const type = config.type;
  const gravity = config.gravity ?? 980;
  const v0 = config.initialVelocity ?? -600;
  const restitution = config.restitution ?? 0.6;

  if (type === 'gravity') {
    return buildGravityCurve(gravity);
  }
  if (type === 'throw') {
    return buildThrowCurve(gravity, v0);
  }
  // bounce
  return buildBounceCurve(gravity, v0, restitution);
}

function buildGravityCurve(gravity: number): (t: number) => number {
  const steps = Math.ceil(1 / SUBSTEP);
  const curve = new Float64Array(steps + 1);
  let v = 0;
  let x = 0;
  for (let i = 0; i <= steps; i++) {
    curve[i] = x;
    v += gravity * SUBSTEP;
    x += v * SUBSTEP;
  }
  // normalise so that curve[steps] === 1
  const max = curve[steps]!;
  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const idx = t * steps;
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, steps);
    const frac = idx - lo;
    return (curve[lo]! * (1 - frac) + curve[hi]! * frac) / max;
  };
}

function buildThrowCurve(gravity: number, v0: number): (t: number) => number {
  const steps = Math.ceil(1 / SUBSTEP);
  const curve = new Float64Array(steps + 1);
  let v = v0;
  let x = 0;
  for (let i = 0; i <= steps; i++) {
    curve[i] = x;
    v += gravity * SUBSTEP;
    x += v * SUBSTEP;
  }
  const max = curve[steps]!;
  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const idx = t * steps;
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, steps);
    const frac = idx - lo;
    return (curve[lo]! * (1 - frac) + curve[hi]! * frac) / max;
  };
}

function buildBounceCurve(gravity: number, v0: number, restitution: number): (t: number) => number {
  const steps = Math.ceil(1 / SUBSTEP);
  const curve = new Float64Array(steps + 1);
  let v = v0;
  let x = 0;
  const floor = 1; // normalised "ground"
  for (let i = 0; i <= steps; i++) {
    curve[i] = x;
    v += gravity * SUBSTEP;
    x += v * SUBSTEP;
    if (x >= floor) {
      x = floor;
      v = -v * restitution;
    }
  }
  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const idx = t * steps;
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, steps);
    const frac = idx - lo;
    return curve[lo]! * (1 - frac) + curve[hi]! * frac;
  };
}
