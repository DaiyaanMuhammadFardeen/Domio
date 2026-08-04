/**
 * Stepped easing — quantises time into discrete steps.
 *
 * @param t     - Normalised time in [0, 1]
 * @param steps - Number of discrete steps (≥ 1)
 * @returns Quantised value in [0, 1]
 */
export function stepEase(t: number, steps: number): number {
  if (steps < 1) steps = 1;
  const s = Math.floor(t * steps) / (steps - 1 || 1);
  return Math.min(1, Math.max(0, s));
}
