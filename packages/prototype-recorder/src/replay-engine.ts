/**
 * Replay engine — fast-forwards the VarStore then plays events at
 * 1×, 2×, or 4× speed. Produces variable-inspector snapshots at each
 * event so the editor can show what the viewer saw at that moment.
 */

import type { ReplayEvent, ReplaySnapshot } from './types.js';
import { VarStore } from '@domio/prototype-runtime';

export type ReplaySpeed = 1 | 2 | 4;

export interface ReplayEngineOptions {
  readonly initialVariables?: Readonly<Record<string, unknown>>;
  readonly clock?: () => number;
}

export class ReplayEngine {
  private readonly events: ReplayEvent[];
  private readonly vars: VarStore;
  private readonly clock: () => number;
  private cursor = 0;
  private playing = false;
  private speed: ReplaySpeed = 1;
  private onSnapshot: ((s: ReplaySnapshot) => void) | null = null;
  private playbackHandle: ReturnType<typeof setTimeout> | null = null;
  private startedAt = 0;
  private pausedAt = 0;

  constructor(events: readonly ReplayEvent[], opts: ReplayEngineOptions = {}) {
    this.events = [...events].sort((a, b) => a.seq - b.seq);
    this.vars = new VarStore();
    this.clock = opts.clock ?? (() => Date.now());
    if (opts.initialVariables) {
      this.vars.hydrate('session', opts.initialVariables);
    }
  }

  /** Load events synchronously and fast-forward the engine to a starting seq. */
  static load(events: readonly ReplayEvent[]): ReplayEngine {
    return new ReplayEngine(events);
  }

  onSnapshot_?: (s: ReplaySnapshot) => void;
  setOnSnapshot(cb: (s: ReplaySnapshot) => void): void {
    this.onSnapshot = cb;
  }

  /** Total events. */
  total(): number { return this.events.length; }

  /** Current cursor (event index). */
  position(): number { return this.cursor; }

  /** Start or resume playback. */
  play(speed: ReplaySpeed = 1): void {
    this.speed = speed;
    if (this.playing) return;
    this.playing = true;
    if (this.pausedAt > 0) {
      // Adjust start so the wall-clock gap is preserved.
      this.startedAt += this.clock() - this.pausedAt;
    } else {
      this.startedAt = this.clock();
    }
    this.tick();
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    this.pausedAt = this.clock();
    if (this.playbackHandle) {
      clearTimeout(this.playbackHandle as never);
      this.playbackHandle = null;
    }
  }

  /** Jump to a specific event index. */
  seekTo(seq: number): ReplaySnapshot {
    // Pause during seek.
    this.pause();
    const target = this.events.findIndex((e) => e.seq === seq);
    if (target < 0) {
      // snap to nearest
      const below = this.events.filter((e) => e.seq <= seq).slice(-1)[0];
      if (below) {
        this.cursor = this.events.indexOf(below);
      }
    } else {
      this.cursor = target;
    }
    this.vars.reset();
    this.fastForward();
    const snap = this.snapshotAt(this.cursor);
    this.onSnapshot?.(snap);
    return snap;
  }

  /** Apply every event up to (and including) `cursor` to the VarStore. */
  private fastForward(): void {
    for (let i = 0; i <= this.cursor; i++) {
      const e = this.events[i];
      if (!e) continue;
      this.applyEvent(e);
    }
  }

  private applyEvent(event: ReplayEvent): void {
    if (event.eventType === 'slide_enter' || event.eventType === 'slide_exit') {
      const slide = event.payload['slide'];
      if (typeof slide === 'string') this.vars.write('currentSlide', slide, { scope: 'session' });
    }
    if (event.eventType === 'consent_change') {
      const consent = event.payload['consent'];
      if (typeof consent === 'string') this.vars.write('consent', consent, { scope: 'session' });
    }
    if (event.eventType === 'form_submit') {
      const form = event.payload['form'];
      if (form && typeof form === 'object') {
        this.vars.hydrate('session', form as Record<string, unknown>);
      }
    }
    if (event.eventType === 'calculator_change') {
      const name = event.payload['name'];
      const value = event.payload['value'];
      if (typeof name === 'string') this.vars.write(name, value, { scope: 'session' });
    }
  }

  private tick(): void {
    if (!this.playing) return;
    const next = this.events[this.cursor + 1];
    if (!next) {
      this.playing = false;
      return;
    }
    const elapsed = this.clock() - this.startedAt;
    const speedup = this.speed;
    const targetElapsed = (next.createdAt - (this.events[0]?.createdAt ?? 0)) / speedup;
    if (elapsed >= targetElapsed) {
      this.cursor += 1;
      this.applyEvent(next);
      const snap = this.snapshotAt(this.cursor);
      this.onSnapshot?.(snap);
    }
    this.playbackHandle = setTimeout(() => this.tick(), 16);
  }

  private snapshotAt(cursor: number): ReplaySnapshot {
    const event = this.events[cursor];
    const snap = this.vars.snapshot('session');
    return {
      atEvent: event?.seq ?? 0,
      atMs: event?.createdAt ?? 0,
      variables: { ...snap.values },
    };
  }

  /** Returns the current VarStore snapshot. */
  currentSnapshot(): ReplaySnapshot {
    return this.snapshotAt(this.cursor);
  }

  dispose(): void {
    this.pause();
    this.onSnapshot = null;
  }
}
