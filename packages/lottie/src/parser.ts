/**
 * Lottie JSON parser — defensive, zero-dependency data extraction.
 *
 * Validates the top-level Lottie JSON shape and extracts key metadata
 * without relying on lottie-web internals. Never crashes on hostile input.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal layer shape we care about. */
export interface LottieLayer {
  ty?: number;
  nm?: string;
  [key: string]: unknown;
}

/** Parsed result from a Lottie JSON blob. */
export interface LottieParsed {
  /** Lottie spec version string (e.g. "5.7.4"). */
  version: string;
  /** Frame rate (frames per second). */
  frameRate: number;
  /** Width in pixels. */
  width: number;
  /** Height in pixels. */
  height: number;
  /** Total frame count. */
  totalFrames: number;
  /** Duration in milliseconds. */
  durationMs: number;
  /** Number of layers. */
  layerCount: number;
  /** Non-fatal warnings encountered during parsing. */
  warnings: string[];
  /** The raw layers array (pass-through for downstream consumers). */
  layers: LottieLayer[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Coerce a value to a finite number, or return `undefined`. */
function toNum(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a Lottie JSON object (already parsed from string).
 *
 * Returns a structured result on success. On fatal structural errors the
 * function still returns a result with `warnings` rather than throwing —
 * only truly unusable input (null, non-object) throws a descriptive error.
 */
export function parseLottieJson(input: unknown): LottieParsed {
  // --- Guard: must be a non-null object --------------------------------
  if (input === null || typeof input !== 'object') {
    throw new Error('Lottie JSON must be a non-null object');
  }

  const obj = input as Record<string, unknown>;
  const warnings: string[] = [];

  // --- Version ---------------------------------------------------------
  const version = typeof obj['v'] === 'string' ? obj['v'] : '';

  // --- Frame rate (fr) -------------------------------------------------
  const fr = toNum(obj['fr']);
  const frameRate = fr !== undefined ? fr : 0;
  if (frameRate <= 0) {
    warnings.push('Frame rate (fr) is missing or non-positive; defaulting to 0');
  }

  // --- Dimensions (w / h) ----------------------------------------------
  const w = toNum(obj['w']);
  const h = toNum(obj['h']);
  const width = w !== undefined ? w : 0;
  const height = h !== undefined ? h : 0;
  if (width <= 0 || height <= 0) {
    warnings.push('Width or height is missing or non-positive');
  }

  // --- Layers ----------------------------------------------------------
  const rawLayers = obj['layers'];
  const layers: LottieLayer[] = Array.isArray(rawLayers) ? (rawLayers as LottieLayer[]) : [];
  const layerCount = layers.length;

  if (layerCount === 0) {
    warnings.push('No layers found in animation');
  }

  // --- Total frames (op - out-point) -----------------------------------
  // Lottie stores the total frame count in the `op` (out-point) property
  // of the first layer, or at the root level. We scan layers for the max.
  let totalFrames = 0;

  // Check root level first
  const rootIp = toNum(obj['ip']);
  const rootOp = toNum(obj['op']);
  if (rootOp !== undefined) {
    totalFrames = rootIp !== undefined ? Math.max(0, rootOp - rootIp) : rootOp;
  }

  // If no root-level frames, scan layers for max out-point
  if (totalFrames <= 0 && layerCount > 0) {
    for (const layer of layers) {
      const ip = toNum(layer['ip']);
      const op = toNum(layer['op']);
      if (op !== undefined) {
        const span = ip !== undefined ? Math.max(0, op - ip) : op;
        if (span > totalFrames) totalFrames = span;
      }
    }
  }

  if (totalFrames <= 0) {
    // Fallback: derive from frame-rate assumption (1 second of animation)
    totalFrames = frameRate > 0 ? frameRate : 60;
    warnings.push('Could not determine total frames from layers; using fallback');
  }

  // --- Duration in ms --------------------------------------------------
  const durationMs = frameRate > 0 ? (totalFrames / frameRate) * 1000 : 0;
  if (durationMs <= 0) {
    warnings.push('Duration is zero or unknown');
  }

  return {
    version,
    frameRate,
    width,
    height,
    totalFrames,
    durationMs,
    layerCount,
    warnings,
    layers,
  };
}
