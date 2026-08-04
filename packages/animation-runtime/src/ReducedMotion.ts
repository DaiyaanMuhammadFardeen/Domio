/**
 * @domio/animation-runtime — Reduced motion handler.
 *
 * Wraps matchMedia('(prefers-reduced-motion: reduce)') with change
 * event listening and mode-based overrides.
 */

export type ReducedMotionMode = 'follow_os' | 'always_reduced' | 'always_full';

type ReducedMotionEvent =
  | { type: 'reduced_motion_observed'; reduced: boolean }
  | { type: 'reduced_motion_overridden'; mode: ReducedMotionMode };

type ReducedMotionListener = (event: ReducedMotionEvent) => void;

/** Minimal matchMedia interface for testability. */
interface MatchMediaResult {
  readonly matches: boolean;
  addEventListener(type: string, handler: (e: { matches: boolean }) => void): void;
  removeEventListener(type: string, handler: (e: { matches: boolean }) => void): void;
}

interface MatchMediaFn {
  (query: string): MatchMediaResult;
}

const REDUCED_DURATION_MAX_MS = 100;

export class ReducedMotion {
  private mode: ReducedMotionMode = 'follow_os';
  private osReduced = false;
  private listeners = new Set<ReducedMotionListener>();
  private mediaQuery: MatchMediaResult | null = null;
  private changeHandler: ((e: { matches: boolean }) => void) | null = null;
  private matchMediaFn: MatchMediaFn | null = null;

  constructor(matchMediaFn?: MatchMediaFn) {
    this.matchMediaFn = matchMediaFn ?? null;
  }

  /** Attach to the matchMedia change event. */
  attach(): void {
    const mm = this.matchMediaFn;
    if (!mm) return;

    try {
      this.mediaQuery = mm('(prefers-reduced-motion: reduce)');
      this.osReduced = this.mediaQuery.matches;

      this.changeHandler = (e: { matches: boolean }) => {
        this.osReduced = e.matches;
        this.emit({ type: 'reduced_motion_observed', reduced: this.osReduced });
      };
      this.mediaQuery.addEventListener('change', this.changeHandler);
    } catch {
      // matchMedia not supported — stay in default state
    }
  }

  /** Detach from the matchMedia change event. */
  detach(): void {
    if (this.mediaQuery && this.changeHandler) {
      this.mediaQuery.removeEventListener('change', this.changeHandler);
    }
    this.mediaQuery = null;
    this.changeHandler = null;
  }

  /** Set the override mode. */
  setMode(mode: ReducedMotionMode): void {
    const prev = this.mode;
    this.mode = mode;
    if (prev !== mode) {
      this.emit({ type: 'reduced_motion_overridden', mode });
    }
  }

  getMode(): ReducedMotionMode {
    return this.mode;
  }

  /** Whether animations should be reduced right now. */
  isReduced(): boolean {
    switch (this.mode) {
      case 'always_reduced':
        return true;
      case 'always_full':
        return false;
      case 'follow_os':
      default:
        return this.osReduced;
    }
  }

  /** Clamp a duration to the reduced maximum if reduced mode is active. */
  clampDuration(ms: number): number {
    return this.isReduced() ? Math.min(ms, REDUCED_DURATION_MAX_MS) : ms;
  }

  /** Whether particle effects should be disabled. */
  disableParticles(): boolean {
    return this.isReduced();
  }

  /** Whether scroll-linked animations should collapse to a single set_value. */
  collapseScrollLinked(): boolean {
    return this.isReduced();
  }

  /** Subscribe to reduced motion events. */
  subscribe(listener: ReducedMotionListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(event: ReducedMotionEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}
