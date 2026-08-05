/**
 * Frame → value interpolation for a single numeric channel at 60fps.
 *
 * Given keyframes `[{t, v}...]` (time in ms, value as number) and a
 * playhead in ms, interpolate linearly between keyframes and clamp ends.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single keyframe: time in milliseconds, value as a number. */
export interface Keyframe {
  /** Time in milliseconds. */
  t: number;
  /** Numeric value at this keyframe. */
  v: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Interpolate a numeric channel at the given playhead position.
 *
 * - Linear interpolation between adjacent keyframes.
 * - Clamped to the first/last keyframe value outside the keyframe range.
 * - Keyframes must be sorted by ascending `t`. If they aren't, the
 *   function silently sorts a copy (defensive).
 *
 * @param keyframes  Array of `{t, v}` pairs, sorted by ascending `t`.
 * @param playhead   Current position in milliseconds.
 * @returns          The interpolated numeric value.
 */
export function interpolateAt(keyframes: Keyframe[], playhead: number): number {
  if (keyframes.length === 0) return 0;

  // Defensive sort (copy to avoid mutating input)
  const sorted = [...keyframes].sort((a, b) => a.t - b.t);

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  // Clamp: before first keyframe
  if (playhead <= first.t) return first.v;

  // Clamp: after last keyframe
  if (playhead >= last.t) return last.v;

  // Find the two surrounding keyframes
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;

    if (playhead >= a.t && playhead <= b.t) {
      // Linear interpolation
      const range = b.t - a.t;
      if (range === 0) return a.v;
      const t = (playhead - a.t) / range;
      return a.v + (b.v - a.v) * t;
    }
  }

  // Should never reach here with sorted input, but be defensive
  return last.v;
}

/**
 * Interpolate a channel and return the full sampled array at the given
 * frame rate (default 60fps). Useful for pre-baking or validation.
 *
 * @param keyframes   Array of `{t, v}` pairs.
 * @param durationMs  Total duration in milliseconds.
 * @param fps         Frames per second (default 60).
 * @returns           Array of `{frame, t, v}` entries.
 */
export function sampleChannel(
  keyframes: Keyframe[],
  durationMs: number,
  fps: number = 60,
): Array<{ frame: number; t: number; v: number }> {
  const intervalMs = 1000 / fps;
  const totalFrames = Math.ceil(durationMs / intervalMs);
  const result: Array<{ frame: number; t: number; v: number }> = [];

  for (let f = 0; f <= totalFrames; f++) {
    const t = f * intervalMs;
    result.push({
      frame: f,
      t,
      v: interpolateAt(keyframes, t),
    });
  }

  return result;
}
