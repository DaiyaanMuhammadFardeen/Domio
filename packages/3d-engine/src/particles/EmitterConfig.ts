/**
 * Particle emitter configuration with deterministic seedable RNG.
 *
 * Presets: snow, confetti, dust, sparks, aurora.
 * Brand colour slots auto-bind to theme tokens.
 * GPUComputeEmitter path selector: webgpu (1M) vs webgl2 (250k).
 */

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

export type EmitterPreset = 'snow' | 'confetti' | 'dust' | 'sparks' | 'aurora';

export type GPUBackend = 'webgpu' | 'webgl2';

export type BrandToken =
  | 'color.brand.primary'
  | 'color.brand.secondary'
  | 'color.brand.accent';

export interface EmitterConfigInput {
  preset: EmitterPreset;
  backend: GPUBackend;
  /** Seed for deterministic RNG (default 42). */
  seed?: number;
  /** Brand token resolver — maps token paths to colour values. */
  tokenResolver?: (token: string) => string;
}

export interface EmitterConfigResult {
  preset: EmitterPreset;
  backend: GPUBackend;
  /** Resolved particle count for the backend. */
  particleCount: number;
  /** Brand colours resolved from tokens. */
  brandColors: { primary: string; secondary: string; accent: string };
  /** Seeded RNG function — returns [0, 1). */
  rng: () => number;
  /** Emitter-specific parameters. */
  params: EmitterParams;
}

export interface EmitterParams {
  /** Emission rate (particles per second). */
  emissionRate: number;
  /** Lifetime in seconds. */
  lifetime: number;
  /** Initial velocity range [min, max]. */
  velocityRange: [number, number];
  /** Gravity vector. */
  gravity: { x: number; y: number; z: number };
  /** Size range [min, max]. */
  sizeRange: [number, number];
}

// ---------------------------------------------------------------------------
// Mulberry32 seeded RNG
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Particle budgets
// ---------------------------------------------------------------------------

const PARTICLE_BUDGETS: Record<GPUBackend, number> = {
  webgl2: 250_000,
  webgpu: 1_000_000,
};

// ---------------------------------------------------------------------------
// Default brand colours
// ---------------------------------------------------------------------------

const DEFAULT_BRAND = {
  primary: '#4A90D9',
  secondary: '#7B61FF',
  accent: '#FF6B6B',
};

// ---------------------------------------------------------------------------
// Preset parameters
// ---------------------------------------------------------------------------

const PRESET_PARAMS: Record<EmitterPreset, EmitterParams> = {
  snow: {
    emissionRate: 500,
    lifetime: 4,
    velocityRange: [0.1, 0.5],
    gravity: { x: 0, y: -0.5, z: 0 },
    sizeRange: [0.01, 0.03],
  },
  confetti: {
    emissionRate: 200,
    lifetime: 3,
    velocityRange: [2, 5],
    gravity: { x: 0, y: -9.8, z: 0 },
    sizeRange: [0.02, 0.06],
  },
  dust: {
    emissionRate: 100,
    lifetime: 6,
    velocityRange: [0.05, 0.2],
    gravity: { x: 0, y: -0.1, z: 0 },
    sizeRange: [0.005, 0.015],
  },
  sparks: {
    emissionRate: 1000,
    lifetime: 1,
    velocityRange: [1, 3],
    gravity: { x: 0, y: -2, z: 0 },
    sizeRange: [0.005, 0.01],
  },
  aurora: {
    emissionRate: 50,
    lifetime: 8,
    velocityRange: [0.01, 0.05],
    gravity: { x: 0, y: 0.02, z: 0 },
    sizeRange: [0.1, 0.3],
  },
};

// ---------------------------------------------------------------------------
// EmitterConfig
// ---------------------------------------------------------------------------

/**
 * Create an emitter configuration from a preset and backend.
 */
export function createEmitterConfig(
  input: EmitterConfigInput,
): EmitterConfigResult {
  const seed = input.seed ?? 42;
  const rng = mulberry32(seed);
  const particleCount = PARTICLE_BUDGETS[input.backend];

  // Resolve brand colours
  const resolve = input.tokenResolver;
  const brandColors = {
    primary: resolve?.('color.brand.primary') ?? DEFAULT_BRAND.primary,
    secondary: resolve?.('color.brand.secondary') ?? DEFAULT_BRAND.secondary,
    accent: resolve?.('color.brand.accent') ?? DEFAULT_BRAND.accent,
  };

  return {
    preset: input.preset,
    backend: input.backend,
    particleCount,
    brandColors,
    rng,
    params: { ...PRESET_PARAMS[input.preset] },
  };
}

/**
 * Get the particle budget for a backend.
 */
export function getParticleBudget(backend: GPUBackend): number {
  return PARTICLE_BUDGETS[backend];
}
