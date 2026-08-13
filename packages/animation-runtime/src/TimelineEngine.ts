/**
 * @domio/animation-runtime — Core timeline engine.
 *
 * Manages timelines, interpolation, play/pause/stop, loop/playCount,
 * debounced persistence, and worker offload.
 */

import { interpolate } from './interpolate.js';
import type {
  Timeline,
  Track,
  TimelineListener,
  InterpolatedValue,
  PersistEvent,
  WorkerAdapter,
} from './types.js';

const DEBOUNCE_MS = 250;

type EngineEvent = { type: 'values'; values: readonly InterpolatedValue[] } | PersistEvent;

interface InternalTimeline {
  timeline: Timeline;
  /** Current playhead position in ms (0-based within the timeline). */
  playheadMs: number;
  /** Times played so far. */
  completedPlays: number;
  /** Whether currently playing. */
  playing: boolean;
}

export class TimelineEngine {
  private timelines = new Map<string, InternalTimeline>();
  private listeners = new Set<TimelineListener>();
  private eventListeners = new Set<(e: EngineEvent) => void>();

  /** Persist debounce state per timeline. */
  private persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Whether a leading-edge persist has already been emitted. */
  private persistLeadingEmitted = new Map<string, boolean>();

  /** Worker offload threshold in bytes (0 = disabled). */
  private workerThreshold = 0;
  private workerAdapter: WorkerAdapter | null = null;

  /** Global playing state. */
  private globalPlaying = false;

  /** The rAF adapter callback — set externally or via setRafAdapter. */
  private rafCallback: ((cb: FrameRequestCallback) => number) | null = null;
  private cancelRafCallback: ((id: number) => void) | null = null;
  private rafId: number | null = null;
  private lastFrameTime: number | null = null;

  // ─── Timeline management ────────────────────────────────────────

  addTimeline(timeline: Timeline): void {
    this.timelines.set(timeline.id, {
      timeline,
      playheadMs: 0,
      completedPlays: 0,
      playing: false,
    });
  }

  removeTimeline(id: string): void {
    this.timelines.delete(id);
    this.clearPersistTimer(id);
  }

  getTimeline(id: string): Timeline | undefined {
    return this.timelines.get(id)?.timeline;
  }

  // ─── Playhead ──────────────────────────────────────────────────

  setPlayhead(t: number): void {
    for (const [, internal] of this.timelines) {
      internal.playheadMs = Math.max(0, Math.min(t, internal.timeline.durationMs));
    }
    this.emitInterpolatedValues();
  }

  /** Set playhead for a specific timeline. */
  setTimelinePlayhead(timelineId: string, t: number): void {
    const internal = this.timelines.get(timelineId);
    if (!internal) return;
    internal.playheadMs = Math.max(0, Math.min(t, internal.timeline.durationMs));
    this.emitInterpolatedValues();
  }

  // ─── Transport ─────────────────────────────────────────────────

  play(): void {
    this.globalPlaying = true;
    this.lastFrameTime = null;
    for (const [, internal] of this.timelines) {
      internal.playing = true;
    }
    this.scheduleFrame();
  }

  pause(): void {
    this.globalPlaying = false;
    for (const [, internal] of this.timelines) {
      internal.playing = false;
    }
    this.cancelFrame();
  }

  stop(): void {
    this.pause();
    for (const [, internal] of this.timelines) {
      internal.playheadMs = 0;
      internal.completedPlays = 0;
    }
    this.emitInterpolatedValues();
  }

  // ─── Subscription ──────────────────────────────────────────────

  subscribe(listener: TimelineListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  onEvent(listener: (e: EngineEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  // ─── Worker offload ────────────────────────────────────────────

  setWorkerOffloadThreshold(bytes: number): void {
    this.workerThreshold = bytes;
  }

  setWorkerAdapter(adapter: WorkerAdapter): void {
    this.workerAdapter = adapter;
  }

  // ─── rAF adapter ───────────────────────────────────────────────

  setRafAdapter(
    requestAnimationFrame: (cb: FrameRequestCallback) => number,
    cancelAnimationFrame: (id: number) => void,
  ): void {
    this.rafCallback = requestAnimationFrame;
    this.cancelRafCallback = cancelAnimationFrame;
  }

  /**
   * Manually advance the engine by `deltaMs` milliseconds.
   * Interpolates all playing timelines and emits values.
   * Useful for testing or headless operation without rAF.
   */
  tickManually(deltaMs: number): void {
    for (const [, internal] of this.timelines) {
      if (!internal.playing) continue;
      internal.playheadMs += deltaMs;

      const { timeline } = internal;

      // Handle end of timeline — loop for large deltas that span multiple plays
      while (internal.playheadMs >= timeline.durationMs) {
        if (timeline.loop || internal.completedPlays + 1 < timeline.playCount) {
          internal.playheadMs -= timeline.durationMs;
          internal.completedPlays++;
        } else {
          internal.playheadMs = timeline.durationMs;
          internal.playing = false;
          break;
        }
      }
    }

    this.emitInterpolatedValues();
  }

  // ─── Internal ──────────────────────────────────────────────────

  private scheduleFrame(): void {
    if (!this.globalPlaying) return;
    if (this.rafCallback) {
      this.rafId = this.rafCallback((timestamp) => {
        this.tick(timestamp);
        this.scheduleFrame();
      });
    } else {
      // No rAF adapter — use a simple setTimeout fallback for headless
      setTimeout(() => {
        this.tick(performance.now());
        this.scheduleFrame();
      }, 16);
    }
  }

  private cancelFrame(): void {
    if (this.rafId !== null && this.cancelRafCallback) {
      this.cancelRafCallback(this.rafId);
    }
    this.rafId = null;
  }

  private tick(timestamp: number): void {
    if (this.lastFrameTime === null) {
      this.lastFrameTime = timestamp;
      return;
    }
    const dt = timestamp - this.lastFrameTime;
    this.lastFrameTime = timestamp;

    for (const [, internal] of this.timelines) {
      if (!internal.playing) continue;
      internal.playheadMs += dt;

      const { timeline } = internal;

      // Handle end of timeline — loop for large deltas that span multiple plays
      while (internal.playheadMs >= timeline.durationMs) {
        if (timeline.loop || internal.completedPlays + 1 < timeline.playCount) {
          internal.playheadMs -= timeline.durationMs;
          internal.completedPlays++;
        } else {
          internal.playheadMs = timeline.durationMs;
          internal.playing = false;
          break;
        }
      }
    }

    this.emitInterpolatedValues();
  }

  /** Interpolate all tracks at current playhead positions. */
  private emitInterpolatedValues(): void {
    const results: InterpolatedValue[] = [];

    for (const [, internal] of this.timelines) {
      const { timeline, playheadMs } = internal;
      const effectiveTime = playheadMs + timeline.startOffsetMs;

      for (const track of timeline.tracks) {
        const value = this.interpolateTrack(track, effectiveTime, timeline.durationMs);
        if (value !== undefined) {
          results.push({
            elementId: timeline.elementId,
            property: track.property,
            value,
          });
        }
      }
    }

    if (results.length > 0) {
      for (const listener of this.listeners) {
        listener(results);
      }
      this.schedulePersist();
    }
  }

  /** Interpolate a single track at a given time. */
  private interpolateTrack(
    track: Track,
    timeMs: number,
    timelineDurationMs: number,
  ): number | string | undefined {
    const { keyframes, startOffsetMs } = track;
    if (keyframes.length === 0) return undefined;

    const localTime = timeMs - startOffsetMs;

    // Before first keyframe — return first value
    if (localTime <= (keyframes[0]?.timeMs ?? 0)) {
      return keyframes[0]?.value;
    }

    // After last keyframe — return last value
    const lastKf = keyframes[keyframes.length - 1];
    if (lastKf && localTime >= lastKf.timeMs) {
      return lastKf.value;
    }

    // Find surrounding keyframes
    for (let i = 0; i < keyframes.length - 1; i++) {
      const kfA = keyframes[i];
      const kfB = keyframes[i + 1];
      if (kfA && kfB && localTime >= kfA.timeMs && localTime <= kfB.timeMs) {
        const segDuration = kfB.timeMs - kfA.timeMs;
        const rawT = segDuration === 0 ? 1 : (localTime - kfA.timeMs) / segDuration;
        // Apply easing: per-keyframe or per-track
        const easingFn = kfA.easing ?? track.easing;
        const t = easingFn ? easingFn(rawT) : rawT;

        // Check worker offload
        if (this.workerThreshold > 0 && this.workerAdapter) {
          const valueStr = String(kfA.value);
          if (valueStr.length > this.workerThreshold) {
            return this.workerAdapter.interpolate(
              track,
              kfA.timeMs,
              kfB.timeMs,
              timelineDurationMs,
            );
          }
        }

        return interpolate(kfA.value, kfB.value, t);
      }
    }

    return undefined;
  }

  // ─── Debounced persistence ─────────────────────────────────────

  private schedulePersist(): void {
    for (const [id, internal] of this.timelines) {
      if (!internal.playing) continue;

      // Leading-edge: emit immediately on first call
      if (!this.persistLeadingEmitted.get(id)) {
        this.persistLeadingEmitted.set(id, true);
        this.emitPersist(id, internal);
      }

      // Trailing-edge: debounce at DEBOUNCE_MS
      this.clearPersistTimer(id);
      this.persistTimers.set(
        id,
        setTimeout(() => {
          this.persistLeadingEmitted.set(id, false);
          this.emitPersist(id, internal);
        }, DEBOUNCE_MS),
      );
    }
  }

  private emitPersist(id: string, internal: InternalTimeline): void {
    const event: PersistEvent = {
      type: 'persist',
      timelineId: id,
      elementId: internal.timeline.elementId,
    };
    for (const listener of this.eventListeners) {
      listener(event);
    }
  }

  private clearPersistTimer(id: string): void {
    const timer = this.persistTimers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.persistTimers.delete(id);
    }
  }
}
