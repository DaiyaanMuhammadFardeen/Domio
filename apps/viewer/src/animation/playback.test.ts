/**
 * @domio/viewer — playback tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPlaybackEngine, PlaybackError } from './playback.js';
import { TimelineEngine, type Timeline, type Track } from '@domio/animation-runtime';

// ─── Helpers ────────────────────────────────────────────────────

function makeTrack(overrides?: Partial<Track>): Track {
  return {
    id: 'track-1',
    property: 'opacity',
    keyframes: [
      { timeMs: 0, value: 0 },
      { timeMs: 1000, value: 1 },
    ],
    startOffsetMs: 0,
    ...overrides,
  };
}

function makeTimeline(overrides?: Partial<Timeline>): Timeline {
  return {
    id: 'tl-1',
    elementId: 'el-1',
    durationMs: 2000,
    loop: false,
    playCount: 1,
    startOffsetMs: 0,
    tracks: [makeTrack()],
    triggers: [],
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────

describe('createPlaybackEngine', () => {
  let engine: TimelineEngine;
  let playback: ReturnType<typeof createPlaybackEngine>;

  beforeEach(() => {
    vi.useFakeTimers();
    engine = new TimelineEngine();
    playback = createPlaybackEngine(engine);
  });

  // ── play ─────────────────────────────────────────────────────
  describe('play', () => {
    it('plays a timeline that exists in the engine', () => {
      engine.addTimeline(makeTimeline());
      expect(() => playback.play('tl-1')).not.toThrow();
    });

    it('throws when timeline not found', () => {
      expect(() => playback.play('nonexistent')).toThrow(PlaybackError);
    });

    it('rejects playCount = 0', () => {
      engine.addTimeline(makeTimeline());
      expect(() => playback.play('tl-1', { playCount: 0 })).toThrow(PlaybackError);
    });

    it('rejects playCount = 0 with INVALID_PLAY_COUNT code', () => {
      engine.addTimeline(makeTimeline());
      try {
        playback.play('tl-1', { playCount: 0 });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(PlaybackError);
        expect((e as PlaybackError).code).toBe('INVALID_PLAY_COUNT');
      }
    });

    it('rejects negative startOffsetMs', () => {
      engine.addTimeline(makeTimeline());
      expect(() => playback.play('tl-1', { startOffsetMs: -100 })).toThrow(PlaybackError);
    });

    it('rejects negative startOffsetMs with INVALID_START_OFFSET code', () => {
      engine.addTimeline(makeTimeline());
      try {
        playback.play('tl-1', { startOffsetMs: -100 });
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(PlaybackError);
        expect((e as PlaybackError).code).toBe('INVALID_START_OFFSET');
      }
    });

    it('rejects negative playCount', () => {
      engine.addTimeline(makeTimeline());
      expect(() => playback.play('tl-1', { playCount: -1 })).toThrow(PlaybackError);
    });
  });

  // ── pause / resume ───────────────────────────────────────────
  describe('pause and resume', () => {
    it('pause stops playback, resume restarts', () => {
      engine.addTimeline(makeTimeline());
      const values: Array<{ value: number | string }> = [];
      playback.subscribe((v) => values.push(...v));

      playback.play('tl-1');
      vi.advanceTimersByTime(500);
      expect(values.length).toBeGreaterThan(0);

      playback.pause();
      const countAfterPause = values.length;
      vi.advanceTimersByTime(500);
      // No significant new values after pause
      expect(values.length).toBeLessThanOrEqual(countAfterPause + 1);

      playback.resume();
      vi.advanceTimersByTime(500);
      expect(values.length).toBeGreaterThan(countAfterPause);
    });
  });

  // ── seek ─────────────────────────────────────────────────────
  describe('seek', () => {
    it('seeks to a position', () => {
      engine.addTimeline(makeTimeline());
      const values: Array<{ value: number | string }> = [];
      playback.subscribe((v) => values.push(...v));

      playback.seek(500);
      const last = values[values.length - 1];
      expect(last?.value).toBe(0.5);
    });
  });

  // ── stop ─────────────────────────────────────────────────────
  describe('stop', () => {
    it('stops and resets playhead', () => {
      engine.addTimeline(makeTimeline());
      const values: Array<{ value: number | string }> = [];
      playback.subscribe((v) => values.push(...v));

      playback.play('tl-1');
      vi.advanceTimersByTime(500);
      playback.stop();

      const lastVal = values[values.length - 1];
      expect(lastVal?.value).toBe(0);
    });
  });

  // ── subscribe ────────────────────────────────────────────────
  describe('subscribe', () => {
    it('receives interpolated values', () => {
      engine.addTimeline(makeTimeline());
      const values: Array<{ property: string; value: number | string }> = [];
      playback.subscribe((v) => values.push(...v));

      playback.seek(500);
      expect(values.length).toBeGreaterThan(0);
      expect(values[0]?.property).toBe('opacity');
    });

    it('unsubscribe stops emissions', () => {
      engine.addTimeline(makeTimeline());
      const values: Array<{ value: number | string }> = [];
      const unsub = playback.subscribe((v) => values.push(...v));

      playback.seek(500);
      expect(values.length).toBe(1);

      unsub();
      playback.seek(750);
      expect(values.length).toBe(1);
    });
  });

  // ── dispose ──────────────────────────────────────────────────
  describe('dispose', () => {
    it('unsubscribes all listeners', () => {
      engine.addTimeline(makeTimeline());
      const values: Array<{ value: number | string }> = [];
      playback.subscribe((v) => values.push(...v));
      playback.subscribe((v) => values.push(...v));

      playback.dispose();

      engine.setPlayhead(500);
      expect(values.length).toBe(0);
    });

    it('throws on operations after dispose', () => {
      engine.addTimeline(makeTimeline());
      playback.dispose();

      expect(() => playback.play('tl-1')).toThrow(PlaybackError);
      expect(() => playback.pause()).toThrow(PlaybackError);
      expect(() => playback.resume()).toThrow(PlaybackError);
      expect(() => playback.seek(100)).toThrow(PlaybackError);
      expect(() => playback.stop()).toThrow(PlaybackError);
    });

    it('dispose is idempotent', () => {
      engine.addTimeline(makeTimeline());
      playback.dispose();
      expect(() => playback.dispose()).not.toThrow();
    });
  });
});
