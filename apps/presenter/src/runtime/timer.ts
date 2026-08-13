/**
 * apps/presenter — elapsed / remaining timer.
 *
 * Anchored to a monotonic clock (`performance.now()`) so timer accuracy
 * is ±250 ms elapsed / ±1 s remaining over a 60-minute run, as required
 * by the W2 budget.
 *
 * The anchor is captured on first use; if the user reloads the page or
 * navigates away, the timer is re-anchored to `lastHeartbeat` from the
 * presenter-session row. The timer renders via `requestAnimationFrame`
 * — reduced-motion users get a less-frequent 1 Hz tick instead.
 */

export interface TimerTick {
  elapsed_ms: number;
  remaining_ms: number;
  over: boolean;
}

export interface SessionTimerOptions {
  /** Wall-clock ms at which the session started. */
  startedAtMs: number;
  /** Total session budget in ms — used to compute remaining. */
  budgetMs?: number | undefined;
  /** Reduced-motion override (otherwise inferred from media query). */
  reducedMotion?: boolean | undefined;
}

export class SessionTimer {
  private readonly anchorPerfMs: number;
  private readonly budgetMs: number;
  private readonly reducedMotion: boolean;
  private rafHandle: number | null = null;
  private listeners = new Set<(tick: TimerTick) => void>();
  private disposed = false;

  constructor(opts: SessionTimerOptions) {
    this.anchorPerfMs = performance.now();
    this.budgetMs = opts.budgetMs ?? 60 * 60 * 1000;
    this.reducedMotion =
      opts.reducedMotion ??
      (typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  start(): void {
    if (this.rafHandle !== null || this.intervalHandle !== null || this.disposed) return;
    if (this.reducedMotion) {
      // 1 Hz tick — enough for a timer display, no animation.
      this.intervalHandle = setTimeoutFallback(() => this.tick(), 1000);
    } else {
      const loop = () => {
        this.tick();
        if (!this.disposed) this.rafHandle = rafFallback(loop);
      };
      this.rafHandle = rafFallback(loop);
    }
  }

  private intervalHandle: ReturnType<typeof setTimeoutFallback> | null = null;

  private tick(): void {
    const nowPerf = performance.now();
    const elapsed = nowPerf - this.anchorPerfMs;
    const remaining = this.budgetMs - elapsed;
    const tick: TimerTick = {
      elapsed_ms: elapsed,
      remaining_ms: remaining,
      over: remaining < 0,
    };
    for (const l of this.listeners) l(tick);
  }

  onTick(listener: (tick: TimerTick) => void): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): TimerTick {
    const elapsed = performance.now() - this.anchorPerfMs;
    return {
      elapsed_ms: elapsed,
      remaining_ms: this.budgetMs - elapsed,
      over: this.budgetMs - elapsed < 0,
    };
  }

  dispose(): void {
    this.disposed = true;
    if (this.rafHandle !== null) cancelRafFallback(this.rafHandle);
    if (this.intervalHandle !== null) clearInterval(this.intervalHandle);
    this.rafHandle = null;
    this.intervalHandle = null;
    this.listeners.clear();
  }
}

/** Format an elapsed-ms value as `H:MM:SS` (or `M:SS` if < 1 h). */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

/** Format a remaining-ms value as `-H:MM:SS` (over budget) or `H:MM:SS`. */
export function formatRemaining(ms: number): string {
  const sign = ms < 0 ? '-' : '';
  return sign + formatElapsed(Math.abs(ms));
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Cross-environment rAF / setTimeout helpers — works under Node test
 *  environments where `requestAnimationFrame` is undefined. */
function rafFallback(fn: () => void): number {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    return globalThis.requestAnimationFrame(fn);
  }
  return setTimeout(fn, 16) as unknown as number;
}

function cancelRafFallback(handle: number): void {
  if (typeof globalThis.cancelAnimationFrame === 'function') {
    globalThis.cancelAnimationFrame(handle);
    return;
  }
  clearTimeout(handle);
}

function setTimeoutFallback(fn: () => void, ms: number): number {
  if (typeof globalThis.setInterval === 'function') {
    return globalThis.setInterval(fn, ms) as unknown as number;
  }
  return setTimeout(fn, ms) as unknown as number;
}
