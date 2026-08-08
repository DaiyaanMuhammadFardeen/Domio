/**
 * Viridis 5-stop color scale.
 *
 * Five anchor colors approximating the matplotlib viridis colormap.
 * `intensityToColor(t)` clamps `t` to [0, 1] and interpolates between
 * the stops in linear RGB space.
 *
 * Used by `HeatmapCanvas.tsx` to color 32×18 dwell-intensity tiles.
 *
 * The anchors are pinned (not sampled from a palette table) so the
 * dashboard bundle stays small and the test is fully deterministic.
 */

const STOPS: ReadonlyArray<readonly [number, number, number]> = [
  [68, 1, 84],   // deep purple (cold)
  [59, 82, 139], // indigo
  [33, 145, 140], // teal
  [94, 201, 98], // green
  [253, 231, 37], // yellow (hot)
];

/**
 * Returns an `[r, g, b]` triple (each channel 0..255) for an input
 * intensity `t`. Values outside [0, 1] are clamped. Monotonic by
 * design: a higher `t` always yields equal-or-higher perceived
 * brightness in the CIE L* sense (the implementation has been
 * tested with a luminance assertion in ViridisScale.test.ts).
 */
export function intensityToColor(t: number): [number, number, number] {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  const slot = x * (STOPS.length - 1);
  const idx = Math.min(STOPS.length - 2, Math.floor(slot));
  const frac = slot - idx;
  const lo = STOPS[idx] as readonly [number, number, number];
  const hi = STOPS[idx + 1] as readonly [number, number, number];
  return [
    Math.round(lo[0] + (hi[0] - lo[0]) * frac),
    Math.round(lo[1] + (hi[1] - lo[1]) * frac),
    Math.round(lo[2] + (hi[2] - lo[2]) * frac),
  ];
}

/** Build a CSS rgb() string from an intensity value. */
export function intensityToCss(t: number): string {
  const [r, g, b] = intensityToColor(t);
  return `rgb(${r}, ${g}, ${b})`;
}