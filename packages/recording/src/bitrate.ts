/**
 * Bitrate auto-scale for screen recording.
 *
 * Given resolution (width × height), frame rate, and a target bitrate tier,
 * computes a recommended bitrate in kbps using a deterministic formula.
 *
 * The formula: base = (width × height × fps) / 1000
 * Then multiplied by a tier-specific factor and clamped to sane bounds.
 *
 * Also supports mid-recording resolution changes (e.g. 1080p → 720p)
 * by computing the delta between old and new recommended bitrates.
 */

export type BitrateTier = 'low' | 'med' | 'high';

export interface BitrateParams {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly tier: BitrateTier;
}

/** Tier multipliers applied to the base formula. */
const TIER_MULTIPLIERS: Record<BitrateTier, number> = {
  low: 0.5,
  med: 1.0,
  high: 2.0,
};

/** Minimum allowed bitrate in kbps. */
const MIN_BITRATE_KBPS = 100;

/** Maximum allowed bitrate in kbps. */
const MAX_BITRATE_KBPS = 20_000;

/** Sane upper bound for 4K@60 high tier (clamped). */
// 3840 × 2160 × 60 / 1000 × 2 = ~995,328 → clamped to 20,000

/**
 * Compute the recommended bitrate in kbps for a given resolution, fps, and tier.
 */
export function computeBitrate(params: BitrateParams): number {
  const base = (params.width * params.height * params.fps) / 1000;
  const scaled = base * TIER_MULTIPLIERS[params.tier];
  return clamp(Math.round(scaled), MIN_BITRATE_KBPS, MAX_BITRATE_KBPS);
}

/**
 * Compute the recommended bitrate for a mid-recording resolution change.
 * Returns the delta (newKbps - oldKbps); negative means the bitrate should decrease.
 */
export function bitrateDelta(oldParams: BitrateParams, newParams: BitrateParams): number {
  return computeBitrate(newParams) - computeBitrate(oldParams);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
