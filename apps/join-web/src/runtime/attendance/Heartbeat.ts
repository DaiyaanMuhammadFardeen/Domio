/**
 * @domio/join-web — session heartbeat.
 *
 * Per Wave 5 §S5.4 of docs/frontend-roadmap/05-wave-audience-participation.md.
 * Fires a typed tick every 5s while a session is active. The shape of
 * each tick is `{ ts, sequence }` so consumers can detect gaps (e.g.
 * a stalled tab) and reason about the order of pings.
 *
 * Pure runtime: no DOM, no React. Browser/Node safe — falls back to
 * the global setInterval/clearInterval pair so callers may inject one
 * in tests.
 */

export interface HeartbeatTick {
  readonly ts: number;
  readonly sequence: number;
}

export type HeartbeatListener = (tick: HeartbeatTick) => void;

export interface HeartbeatOptions {
  /** Tick interval in ms. Default 5_000 per spec. */
  readonly intervalMs?: number;
  /** Clock function; defaults to Date.now. */
  readonly now?: () => number;
  /** Inject setInterval for tests; defaults to the global one. */
  readonly setIntervalFn?: typeof setInterval;
  /** Inject clearInterval for tests; defaults to the global one. */
  readonly clearIntervalFn?: typeof clearInterval;
}

const DEFAULT_INTERVAL_MS = 5_000;

export class Heartbeat {
  private readonly intervalMs: number;
  private readonly now: () => number;
  private readonly setIntervalFn: typeof setInterval;
  private readonly clearIntervalFn: typeof clearInterval;
  private readonly listeners = new Set<HeartbeatListener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private sequence = 0;
  private running = false;

  constructor(options: HeartbeatOptions = {}) {
    this.intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.now = options.now ?? Date.now;
    this.setIntervalFn = options.setIntervalFn ?? setInterval;
    this.clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  }

  /** Begin ticking. No-op if already running. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer = this.setIntervalFn(() => this.fire(), this.intervalMs);
  }

  /** Stop ticking and clear the timer. Safe to call when not running. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.timer !== null) {
      this.clearIntervalFn(this.timer);
      this.timer = null;
    }
  }

  /** Subscribe to ticks. Returns an unsubscribe function. */
  onTick(cb: HeartbeatListener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Synchronously fire one tick — primarily for tests. */
  private fire(): void {
    this.sequence += 1;
    const tick: HeartbeatTick = { ts: this.now(), sequence: this.sequence };
    for (const cb of this.listeners) {
      try {
        cb(tick);
      } catch {
        // listeners must not break the heartbeat loop; swallow.
      }
    }
  }
}
