/**
 * @domio/join-web — engagement score tracker.
 *
 * Per Wave 5 §S5.4 of docs/frontend-roadmap/05-wave-audience-participation.md.
 *
 * Score formula (rolling 5-minute window):
 *   +1 point per widget interaction, capped at 100 / 5 min
 *   -1 point per rejoin (mild penalty)
 *   +0.1 point per second of dwell time
 *
 * The rolling window applies uniformly: interactions, rejoins, and
 * accumulated dwell seconds older than `windowMs` are dropped.
 *
 * Pure: no DOM, no React. The constructor takes an injectable clock so
 * tests can drive time deterministically. Subscribers are notified on
 * every mutation with the new score.
 */

export type InteractionKind = 'click' | 'submit' | 'reaction' | 'dwell';

export type EngagementListener = (score: number) => void;

export interface EngagementTrackerOptions {
  readonly windowMs?: number;
  readonly now?: () => number;
}

const DEFAULT_WINDOW_MS = 5 * 60 * 1_000; // 5 minutes
const INTERACTION_CAP = 100;
const REJOIN_PENALTY = -1;
const DWELL_PER_SECOND = 0.1;
const INTERACTION_POINTS = 1;

interface InteractionRecord {
  readonly kind: InteractionKind;
  readonly ts: number;
  readonly slideId?: string;
}

export class EngagementTracker {
  private readonly windowMs: number;
  private readonly now: () => number;
  private interactions: InteractionRecord[] = [];
  private rejoins: number[] = [];
  /** Per-second timestamps of dwell inside the rolling window. */
  private dwellSeconds: number[] = [];
  private lastDwellTs: number | null = null;
  private listeners = new Set<EngagementListener>();

  constructor(options: EngagementTrackerOptions = {}) {
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.now = options.now ?? Date.now;
  }

  /** Record a widget interaction. Capped at INTERACTION_CAP per window. */
  recordInteraction(kind: InteractionKind, slideId?: string): void {
    const ts = this.now();
    const record: InteractionRecord = slideId !== undefined
      ? { kind, ts, slideId }
      : { kind, ts };
    this.interactions.push(record);
    this.notify();
  }

  /** Record a session rejoin — mild penalty. */
  recordRejoin(): void {
    const ts = this.now();
    this.rejoins.push(ts);
    this.notify();
  }

  /** Current rolling-window score. */
  getScore(): number {
    this.sampleDwell();
    this.evict();
    return this.computeScore();
  }

  /** Subscribe to score changes. Returns an unsubscribe function. */
  subscribe(cb: EngagementListener): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Convert "ms since last sample" into per-second dwell stamps. */
  private sampleDwell(): void {
    const ts = this.now();
    if (this.lastDwellTs === null) {
      this.lastDwellTs = ts;
      return;
    }
    const deltaMs = Math.max(0, ts - this.lastDwellTs);
    this.lastDwellTs = ts;
    if (deltaMs < 1_000) return;

    const fullSeconds = Math.floor(deltaMs / 1_000);
    // Each second is stamped at its end-ts. Older seconds are
    // evictable by cutoff = now - windowMs.
    const endTs = ts;
    const startTs = endTs - fullSeconds * 1_000;
    for (let i = 1; i <= fullSeconds; i += 1) {
      this.dwellSeconds.push(startTs + i * 1_000);
    }
  }

  private evict(): void {
    const cutoff = this.now() - this.windowMs;
    this.interactions = this.interactions.filter((r) => r.ts >= cutoff);
    this.rejoins = this.rejoins.filter((ts) => ts >= cutoff);
    this.dwellSeconds = this.dwellSeconds.filter((ts) => ts >= cutoff);
  }

  private computeScore(): number {
    const interactionPoints = Math.min(this.interactions.length, INTERACTION_CAP) * INTERACTION_POINTS;
    const rejoinPoints = this.rejoins.length * REJOIN_PENALTY;
    const dwellPoints = this.dwellSeconds.length * DWELL_PER_SECOND;
    return interactionPoints + rejoinPoints + dwellPoints;
  }

  private notify(): void {
    const score = this.computeScore();
    for (const cb of this.listeners) {
      try {
        cb(score);
      } catch {
        // swallow — listeners must not break the tracker.
      }
    }
  }
}