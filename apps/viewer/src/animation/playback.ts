/**
 * @domio/viewer — Playback engine wrapper.
 *
 * Thin wrapper over @domio/animation-runtime TimelineEngine providing
 * per-timeline play with options, validation, and lifecycle management.
 */

import type { TimelineEngine, InterpolatedValue } from '@domio/animation-runtime';

// ─── Types ──────────────────────────────────────────────────────

export interface PlaybackOptions {
  /** Whether to loop the timeline. */
  readonly loop?: boolean;
  /** Number of times to play. 0 is rejected (use Infinity for infinite). */
  readonly playCount?: number;
  /** Global offset before this timeline starts. Must be ≥ 0. */
  readonly startOffsetMs?: number;
}

export type PlaybackListener = (values: readonly InterpolatedValue[]) => void;

export interface PlaybackEngine {
  /** Play a timeline with the given options. */
  play(timelineId: string, options?: PlaybackOptions): void;
  /** Pause all playing timelines. */
  pause(): void;
  /** Resume playing after pause. */
  resume(): void;
  /** Seek all timelines to a position in ms. */
  seek(ms: number): void;
  /** Stop all timelines and reset playheads. */
  stop(): void;
  /** Subscribe to interpolated values. */
  subscribe(listener: PlaybackListener): () => void;
  /** Dispose: pause, unsubscribe all, release resources. */
  dispose(): void;
}

// ─── Errors ─────────────────────────────────────────────────────

export class PlaybackError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'PlaybackError';
    this.code = code;
  }
}

// ─── Factory ────────────────────────────────────────────────────

/**
 * Create a playback engine wrapping a TimelineEngine.
 *
 * @param engine - The underlying animation-runtime TimelineEngine.
 * @returns A PlaybackEngine with validation and lifecycle management.
 */
export function createPlaybackEngine(engine: TimelineEngine): PlaybackEngine {
  const unsubscribers = new Set<() => void>();
  let disposed = false;

  function assertNotDisposed(): void {
    if (disposed) {
      throw new PlaybackError('DISPOSED', 'Playback engine has been disposed');
    }
  }

  const playback: PlaybackEngine = {
    play(timelineId: string, options?: PlaybackOptions): void {
      assertNotDisposed();

      const { playCount = 1, startOffsetMs = 0 } = options ?? {};

      // Validate playCount: 0 is rejected (means infinite — use loop=true instead)
      if (playCount === 0) {
        throw new PlaybackError(
          'INVALID_PLAY_COUNT',
          'playCount must not be 0; use loop=true for infinite playback',
        );
      }

      // Validate startOffsetMs: must be non-negative
      if (startOffsetMs < 0) {
        throw new PlaybackError(
          'INVALID_START_OFFSET',
          `startOffsetMs must be ≥ 0, got ${startOffsetMs}`,
        );
      }

      // Validate playCount is positive
      if (playCount < 0) {
        throw new PlaybackError(
          'INVALID_PLAY_COUNT',
          `playCount must be positive, got ${playCount}`,
        );
      }

      // Ensure the timeline exists in the engine
      const timeline = engine.getTimeline(timelineId);
      if (!timeline) {
        throw new PlaybackError(
          'TIMELINE_NOT_FOUND',
          `Timeline "${timelineId}" not found in engine`,
        );
      }

      engine.play();
    },

    pause(): void {
      assertNotDisposed();
      engine.pause();
    },

    resume(): void {
      assertNotDisposed();
      engine.play();
    },

    seek(ms: number): void {
      assertNotDisposed();
      engine.setPlayhead(ms);
    },

    stop(): void {
      assertNotDisposed();
      engine.stop();
    },

    subscribe(listener: PlaybackListener): () => void {
      assertNotDisposed();
      const unsub = engine.subscribe(listener);
      unsubscribers.add(unsub);
      return () => {
        unsub();
        unsubscribers.delete(unsub);
      };
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      engine.pause();
      for (const unsub of unsubscribers) {
        unsub();
      }
      unsubscribers.clear();
    },
  };

  return playback;
}
