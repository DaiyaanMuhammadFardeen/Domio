/**
 * Waveform bar computation from audio samples.
 *
 * Buckets N samples into a target bar count with min/max per bucket.
 * Deterministic: same input always produces same output.
 */

export interface WaveformBar {
  /** Minimum sample value in this bucket. */
  min: number;
  /** Maximum sample value in this bucket. */
  max: number;
}

export interface WaveformResult {
  /** Array of bars, one per bucket. */
  bars: WaveformBar[];
  /** Number of samples per bucket (may have remainder in last bucket). */
  samplesPerBucket: number;
}

/**
 * Compute waveform bars from a Float32Array of samples.
 *
 * @param samples - Float32Array of audio samples (typically -1..1).
 * @param barCount - Target number of bars (default 48).
 * @returns WaveformResult with min/max per bar.
 */
export function computeWaveform(
  samples: Float32Array,
  barCount: number = 48,
): WaveformResult {
  const n = samples.length;
  if (n === 0) {
    return {
      bars: Array.from({ length: barCount }, () => ({ min: 0, max: 0 })),
      samplesPerBucket: 0,
    };
  }

  if (barCount <= 0) {
    throw new Error('barCount must be greater than 0');
  }

  const samplesPerBucket = Math.floor(n / barCount);
  const bars: WaveformBar[] = [];

  for (let i = 0; i < barCount; i++) {
    const start = i * samplesPerBucket;
    // Last bar gets the remainder
    const end = i === barCount - 1 ? n : start + samplesPerBucket;

    let min = Infinity;
    let max = -Infinity;

    for (let j = start; j < end; j++) {
      const val = samples[j]!;
      if (val < min) min = val;
      if (val > max) max = val;
    }

    // Handle edge case where bucket has no samples
    if (start >= end) {
      min = 0;
      max = 0;
    }

    bars.push({ min, max });
  }

  return { bars, samplesPerBucket };
}
