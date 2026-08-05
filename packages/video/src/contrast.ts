/**
 * Contrast-map algorithm for smart text-contrast protection (M6.1 #76/#77).
 *
 * For a synthetic single-frame luminance array (Float32Array of N×N luma 0..1),
 * computes:
 * - meanLuma: average luminance
 * - contrastRatio: RMS contrast (root mean square deviation from mean)
 * - WCAG-Accessible recommendation: scrim, shadow, label color
 *
 * Worker-offload hint: mark shouldOffloadToWorker when N*N > 1_000_000.
 */

export interface ContrastResult {
  /** Mean luminance (0..1). */
  meanLuma: number;
  /** RMS contrast ratio (higher = more contrast). */
  rmsContrast: number;
  /** Recommended scrim color (CSS string). */
  scrim: string;
  /** Whether to apply drop shadow. */
  shadow: boolean;
  /** Recommended label color. */
  labelColor: 'light' | 'dark';
  /** Whether computation should be offloaded to a Web Worker. */
  shouldOffloadToWorker: boolean;
}

/**
 * Compute RMS contrast from a luminance array.
 * RMS = sqrt(mean((luma - meanLuma)^2))
 */
function computeRMSContrast(luma: Float32Array): number {
  const n = luma.length;
  if (n === 0) return 0;

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += luma[i]!;
  }
  const mean = sum / n;

  let sumSqDiff = 0;
  for (let i = 0; i < n; i++) {
    const diff = luma[i]! - mean;
    sumSqDiff += diff * diff;
  }

  return Math.sqrt(sumSqDiff / n);
}

/**
 * Compute contrast analysis for a luminance array.
 *
 * @param luma - Float32Array of luminance values in range 0..1.
 * @param pixelCount - Total number of pixels in the frame (N×N). Used for offload hint.
 * @returns ContrastResult with WCAG-aware recommendations.
 */
export function analyzeContrast(
  luma: Float32Array,
  pixelCount: number,
): ContrastResult {
  const n = luma.length;
  if (n === 0) {
    return {
      meanLuma: 0,
      rmsContrast: 0,
      scrim: 'rgba(0,0,0,0)',
      shadow: false,
      labelColor: 'dark',
      shouldOffloadToWorker: pixelCount > 1_000_000,
    };
  }

  // Mean luminance
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += luma[i]!;
  }
  const meanLuma = sum / n;

  // RMS contrast
  const rmsContrast = computeRMSContrast(luma);

  // WCAG-Accessible recommendation
  let scrim: string;
  let shadow: boolean;
  let labelColor: 'light' | 'dark';

  if (meanLuma > 0.6) {
    // Light background → dark label + no shadow
    scrim = 'rgba(0,0,0,0)';
    shadow = false;
    labelColor = 'dark';
  } else if (rmsContrast < 0.15) {
    // Low contrast → white text + dark scrim + drop shadow
    scrim = 'rgba(0,0,0,0.55)';
    shadow = true;
    labelColor = 'light';
  } else {
    // Dark background with sufficient contrast → light label + subtle shadow
    scrim = 'rgba(0,0,0,0.25)';
    shadow = true;
    labelColor = 'light';
  }

  return {
    meanLuma,
    rmsContrast,
    scrim,
    shadow,
    labelColor,
    shouldOffloadToWorker: pixelCount > 1_000_000,
  };
}
