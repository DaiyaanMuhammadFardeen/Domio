/**
 * @domio/viewer — Reduced-motion guard for the viewer.
 *
 * Wraps matchMedia('(prefers-reduced-motion: reduce)') with
 * mode-based overrides and viewer-specific collapse helpers.
 *
 * Per R-09-4: reduced mode collapses durations to 1 ms,
 * disables particles, and forces scroll-linked to end-state.
 */

// ─── Types ──────────────────────────────────────────────────────

export type ReducedMotionMode = 'follow_os' | 'always_reduced' | 'always_full';

export interface ReducedMotionGuardConfig {
  /** Injected matchMedia for testability. */
  readonly matchMedia?: (query: string) => MatchMediaResult;
  /** Called whenever the effective reduced state changes. */
  readonly onChange?: (reduced: boolean) => void;
}

interface MatchMediaResult {
  readonly matches: boolean;
  addEventListener(type: string, handler: (e: { matches: boolean }) => void): void;
  removeEventListener(type: string, handler: (e: { matches: boolean }) => void): void;
}

export interface ReducedMotionGuard {
  /** Get the current mode. */
  getMode(): ReducedMotionMode;
  /** Set the override mode. */
  setMode(mode: ReducedMotionMode): void;
  /** Whether animations should be reduced right now. */
  isReduced(): boolean;
  /** Clamp a duration to 1 ms when reduced (R-09-4). */
  clampDuration(ms: number): number;
  /** Whether particle effects should be disabled. */
  disableParticles(): boolean;
  /** Whether scroll-linked should collapse to end-state. */
  collapseScrollLinked(): boolean;
  /** Detach listeners. */
  destroy(): void;
}

// ─── Constants ──────────────────────────────────────────────────

/** Per R-09-4, reduced mode collapses all durations to 1 ms. */
const REDUCED_DURATION_CLAMP_MS = 1;

// ─── Factory ────────────────────────────────────────────────────

/**
 * Create a reduced-motion guard.
 *
 * @param config - Injectable matchMedia and change callback.
 * @returns A ReducedMotionGuard instance.
 */
export function createReducedMotionGuard(
  config: ReducedMotionGuardConfig = {},
): ReducedMotionGuard {
  let mode: ReducedMotionMode = 'follow_os';
  let osReduced = false;
  let mediaQuery: MatchMediaResult | null = null;
  let changeHandler: ((e: { matches: boolean }) => void) | null = null;
  const { matchMedia, onChange } = config;

  // ── Attach to OS media query ─────────────────────────────────
  if (matchMedia) {
    try {
      mediaQuery = matchMedia('(prefers-reduced-motion: reduce)');
      osReduced = mediaQuery.matches;

      changeHandler = (e: { matches: boolean }) => {
        osReduced = e.matches;
        onChange?.(isReduced());
      };
      mediaQuery.addEventListener('change', changeHandler);
    } catch {
      // matchMedia not supported — stay in default state
    }
  }

  // ── Core query ───────────────────────────────────────────────
  function isReduced(): boolean {
    switch (mode) {
      case 'always_reduced':
        return true;
      case 'always_full':
        return false;
      case 'follow_os':
      default:
        return osReduced;
    }
  }

  // ── Public API ───────────────────────────────────────────────
  const guard: ReducedMotionGuard = {
    getMode(): ReducedMotionMode {
      return mode;
    },

    setMode(newMode: ReducedMotionMode): void {
      const prev = mode;
      mode = newMode;
      if (prev !== newMode) {
        onChange?.(isReduced());
      }
    },

    isReduced,

    clampDuration(ms: number): number {
      return isReduced() ? REDUCED_DURATION_CLAMP_MS : ms;
    },

    disableParticles(): boolean {
      return isReduced();
    },

    collapseScrollLinked(): boolean {
      return isReduced();
    },

    destroy(): void {
      if (mediaQuery && changeHandler) {
        mediaQuery.removeEventListener('change', changeHandler);
      }
      mediaQuery = null;
      changeHandler = null;
    },
  };

  return guard;
}
