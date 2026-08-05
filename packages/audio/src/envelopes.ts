/**
 * Fade in / fade out envelope math.
 *
 * Given fadeInMs / fadeOutMs and a playhead position, returns the gain multiplier
 * at that instant using a linear ramp with clamping.
 *
 * Also provides ducking: when voiceover is active, background music ducks to a
 * configurable ratio.
 */

// ─── Fade Envelope ──────────────────────────────────────────────────────────

export interface FadeConfig {
  fadeInMs: number;
  fadeOutMs: number;
  /** Total duration of the track in ms (needed to compute fade-out start) */
  durationMs: number;
}

/**
 * Compute the gain multiplier at `playheadMs` for a track with the given fade config.
 *
 * - During fade-in: ramp from 0 → 1 over [0, fadeInMs)
 * - During steady:  gain = 1
 * - During fade-out: ramp from 1 → 0 over [durationMs - fadeOutMs, durationMs)
 * - Before 0 or after duration: gain = 0 (clamped)
 */
export function fadeGain(playheadMs: number, config: FadeConfig): number {
  const { fadeInMs, fadeOutMs, durationMs } = config;

  // Before track starts or after it ends
  if (playheadMs < 0) return 0;
  if (playheadMs >= durationMs) return 0;

  // Fade-in region
  if (fadeInMs > 0 && playheadMs < fadeInMs) {
    return clamp(playheadMs / fadeInMs, 0, 1);
  }

  // Fade-out region
  if (fadeOutMs > 0) {
    const fadeOutStart = durationMs - fadeOutMs;
    if (playheadMs >= fadeOutStart) {
      const progress = (playheadMs - fadeOutStart) / fadeOutMs;
      return clamp(1 - progress, 0, 1);
    }
  }

  // Steady region
  return 1;
}

// ─── Ducking ────────────────────────────────────────────────────────────────

export interface DuckingConfig {
  /** Ratio to duck background to (0..1). 0.5 = background drops to 50%. */
  duckRatio: number;
  /** Whether ducking is applied (can be toggled per-scene) */
  enabled: boolean;
}

export interface DuckingState {
  /** Whether voiceover is currently playing */
  voiceoverActive: boolean;
  /** Current smoothing step (0 = instant transition, >0 = gradual) */
  smoothingSteps: number;
  /** Current smoothing step counter (0 = no smoothing applied yet) */
  currentStep: number;
}

/**
 * Compute the ducked gain multiplier for a background track.
 *
 * When voiceover is active, the background gain is multiplied by `duckRatio`.
 * Smoothing: if smoothingSteps > 0, the ducking ramps over that many steps
 * (each step is a unit of time the caller controls). Step 0 = full original,
 * step smoothingSteps = fully ducked.
 *
 * This is a pure function of (playhead, state).
 */
export function duckGain(
  baseGain: number,
  voiceoverActive: boolean,
  config: DuckingConfig,
  state?: Partial<DuckingState>,
): number {
  if (!config.enabled || !voiceoverActive) {
    return baseGain;
  }

  const steps = state?.smoothingSteps ?? 0;
  const currentStep = state?.currentStep ?? steps; // default: fully ducked

  if (steps <= 0) {
    // Instant ducking
    return baseGain * config.duckRatio;
  }

  // Smooth ramp: linearly interpolate from baseGain to (baseGain * duckRatio)
  const t = Math.min(currentStep / steps, 1);
  const duckedGain = baseGain * config.duckRatio;
  return baseGain + (duckedGain - baseGain) * t;
}

// ─── Combined: fade + duck ──────────────────────────────────────────────────

/**
 * Compute the final gain for a background track that has both a fade envelope
 * and ducking applied. Ducking multiplies the faded gain.
 */
export function backgroundGain(
  playheadMs: number,
  fadeConfig: FadeConfig,
  duckConfig: DuckingConfig,
  duckState?: Partial<DuckingState>,
): number {
  const faded = fadeGain(playheadMs, fadeConfig);
  return duckGain(faded, duckState?.voiceoverActive ?? false, duckConfig, duckState);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
