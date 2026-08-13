import type { ServiceDeps } from '../deps.js';

// ---------------------------------------------------------------------------
// Lottie validation
// ---------------------------------------------------------------------------

export interface LottieValidationResult {
  valid: boolean;
  errors: string[];
}

export interface LottieValidateOptions {
  maxBytes?: number;
  maxLayers?: number;
}

const DEFAULT_MAX_LAYERS = 500;

/**
 * Validate a Lottie JSON object for safety and correctness.
 *
 * Checks:
 *  - Non-object input
 *  - Missing required fields (`v`, `layers`)
 *  - Exceeds maxLayers count
 *  - Contains `"expression"` anywhere (dangerous scripting feature)
 *  - Contains `"__proto__"` or `"constructor"` keys (prototype pollution)
 *  - Any `fr` (frame rate) > 120
 *  - Optional size budget check against maxBytes on stringified JSON
 */
export function validateLottie(
  json: unknown,
  opts: LottieValidateOptions = {},
): LottieValidationResult {
  const errors: string[] = [];
  const maxLayers = opts.maxLayers ?? DEFAULT_MAX_LAYERS;

  // Non-object check
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return { valid: false, errors: ['Lottie JSON must be a non-null object'] };
  }

  const obj = json as Record<string, unknown>;

  // Required fields
  if (obj.v === undefined || obj.v === null) {
    errors.push('Missing required field "v" (version)');
  }
  if (obj.layers === undefined || obj.layers === null) {
    errors.push('Missing required field "layers"');
  }

  // Layer count check
  if (Array.isArray(obj.layers) && obj.layers.length > maxLayers) {
    errors.push(`Layer count ${obj.layers.length} exceeds maximum ${maxLayers}`);
  }

  // Frame rate check
  if (typeof obj.fr === 'number' && obj.fr > 120) {
    errors.push(`Frame rate ${obj.fr} exceeds maximum 120`);
  }

  // Size budget check
  if (opts.maxBytes !== undefined) {
    const size = new TextEncoder().encode(JSON.stringify(json)).byteLength;
    if (size > opts.maxBytes) {
      errors.push(`JSON size ${size} bytes exceeds budget ${opts.maxBytes} bytes`);
    }
  }

  // Deep safety checks via stringified scan
  const jsonStr = JSON.stringify(json);

  // Expression check (dangerous script feature)
  if (jsonStr.includes('"expression"')) {
    errors.push('Contains "expression" key (dangerous script feature)');
  }

  // Prototype pollution check
  if (jsonStr.includes('"__proto__"')) {
    errors.push('Contains "__proto__" key (prototype pollution risk)');
  }
  if (jsonStr.includes('"constructor"')) {
    errors.push('Contains "constructor" key (prototype pollution risk)');
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Lottie sanitization
// ---------------------------------------------------------------------------

/**
 * Deep-copy and sanitize a Lottie JSON object:
 *  - Strip `expression` keys
 *  - Drop `"ae"` / unused metadata keys
 *  - Rename `__proto__` / `constructor` keys to `_proto`
 *  - Keep `w`/`h` overrides
 */
export function sanitizeLottie(json: Record<string, unknown>): Record<string, unknown> {
  return sanitizeNode(json) as Record<string, unknown>;
}

function sanitizeNode(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => sanitizeNode(item));
  }

  if (typeof node !== 'object' || node === null) {
    return node;
  }

  const obj = node as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip expression keys
    if (key === 'expression') continue;

    // Skip ae metadata
    if (key === 'ae') continue;

    // Rename dangerous keys
    const safeKey = key === '__proto__' || key === 'constructor' ? '_proto' : key;

    result[safeKey] = sanitizeNode(value);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Lottie recolor
// ---------------------------------------------------------------------------

export interface LottieTokenMap {
  from: number[]; // [r, g, b, a] in 0-255
  to: number[]; // [r, g, b, a] in 0-255
}

/**
 * Convert hex color string to [r, g, b, a] array (0-255).
 */
function hexToRgba(hex: string): number[] {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const a = h.length === 8 ? parseInt(h.substring(6, 8), 16) : 255;
  return [r, g, b, a];
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Recolor a Lottie JSON: for each layer of type 4 (shape),
 * replace fill color arrays matching `tokenMap.from` with `tokenMap.to`.
 * Supports hex → rgba via hexToRgba conversion.
 */
export function recolorLottie(
  json: Record<string, unknown>,
  tokenMap: LottieTokenMap,
): Record<string, unknown> {
  const fromArray =
    typeof tokenMap.from[0] === 'string' ? hexToRgba(tokenMap.from[0] as string) : tokenMap.from;
  const toArray =
    typeof tokenMap.to[0] === 'string' ? hexToRgba(tokenMap.to[0] as string) : tokenMap.to;

  const result = structuredClone(json) as Record<string, unknown>;
  const layers = result.layers as Array<Record<string, unknown>> | undefined;

  if (!Array.isArray(layers)) return result;

  for (const layer of layers) {
    if (layer.ty !== 4) continue; // Only shape layers (type 4)

    const shapes = layer.shapes as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(shapes)) continue;

    for (const shape of shapes) {
      recolorShapeNode(shape, fromArray, toArray);
    }
  }

  return result;
}

function recolorShapeNode(node: Record<string, unknown>, from: number[], to: number[]): void {
  // Check if this node has a fill (ty: 'fl') or stroke (ty: 'st')
  if (
    (node.ty === 'fl' || node.ty === 'st') &&
    node.c !== undefined &&
    typeof node.c === 'object' &&
    node.c !== null &&
    !Array.isArray(node.c)
  ) {
    const colorGroup = node.c as Record<string, unknown>;
    const colorVal = colorGroup.k;
    if (Array.isArray(colorVal) && arraysEqual(colorVal, from)) {
      colorGroup.k = [...to];
    }
  }

  // Recurse into sub-shapes
  for (const [key, value] of Object.entries(node)) {
    if (key === 'ty' || key === 'c') continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
          recolorShapeNode(item as Record<string, unknown>, from, to);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// GIF transcode request
// ---------------------------------------------------------------------------

export interface GifTranscodeInput {
  gifUrl: string;
  maxBytes?: number;
  loop?: boolean;
  fps?: number;
}

export interface GifTranscodeResult {
  inputUrl: string;
  outputFormat: 'webm' | 'mp4';
  fps: number;
  loop: boolean;
  estimatedSizeKb: number;
  budgetWarning?: boolean;
}

/**
 * Request a GIF transcode job spec. No ffmpeg execution — documents the
 * interface for the ffmpeg worker.
 */
export function gifTranscodeRequest(
  deps: ServiceDeps,
  input: GifTranscodeInput,
): GifTranscodeResult {
  const fps = input.fps ?? 30;
  const loop = input.loop ?? true;
  const gifBudgetKb = deps.limits.gifBudgetKb;

  // Rough size estimation: assume 1 second of video ≈ fps * 5KB per frame
  // This is a heuristic; real size depends on content.
  const estimatedSizeKb = fps * 5;

  return {
    inputUrl: input.gifUrl,
    outputFormat: 'webm',
    fps,
    loop,
    estimatedSizeKb,
    ...(estimatedSizeKb > gifBudgetKb ? { budgetWarning: true } : {}),
  };
}
