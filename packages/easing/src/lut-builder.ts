/**
 * Look-Up Table (LUT) builder.
 *
 * Pre-computes a Float64Array of easing values for fast runtime use.
 * Uses Newton-Raphson fixed-step internally (via the supplied easing
 * function) and must complete in < 5 ms on a normal machine.
 */

/**
 * Build a LUT from any easing function.
 *
 * @param easingFn - An easing function `(t: number) => number`
 * @param size     - Number of entries (default 256)
 * @returns A `Float64Array` of size `size` with values in `[-0.25, 1.25]`
 */
export function buildLut(
  easingFn: (t: number) => number,
  size: number = 256,
): Float64Array {
  const lut = new Float64Array(size);
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    let v = easingFn(t);
    if (v < -0.25) v = -0.25;
    if (v > 1.25) v = 1.25;
    lut[i] = v;
  }
  return lut;
}
