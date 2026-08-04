/**
 * @domio/animation-runtime — TimelineEngine tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TimelineEngine } from './TimelineEngine.js';
import type { Timeline, Track } from './types.js';

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

describe('TimelineEngine', () => {
  let engine: TimelineEngine;

  beforeEach(() => {
    vi.useFakeTimers();
    engine = new TimelineEngine();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('timeline management', () => {
    it('adds and retrieves a timeline', () => {
      const tl = makeTimeline();
      engine.addTimeline(tl);
      expect(engine.getTimeline('tl-1')).toBe(tl);
    });

    it('removes a timeline', () => {
      engine.addTimeline(makeTimeline());
      engine.removeTimeline('tl-1');
      expect(engine.getTimeline('tl-1')).toBeUndefined();
    });
  });

  describe('setPlayhead', () => {
    it('interpolates values at playhead position', () => {
      engine.addTimeline(makeTimeline());
      const values: Array<{ elementId: string; property: string; value: number | string }> = [];
      engine.subscribe((v) => values.push(...v));

      engine.setPlayhead(500);
      expect(values).toHaveLength(1);
      expect(values[0]?.elementId).toBe('el-1');
      expect(values[0]?.property).toBe('opacity');
      expect(values[0]?.value).toBe(0.5);
    });

    it('clamps playhead to [0, durationMs]', () => {
      engine.addTimeline(makeTimeline());
      const values: Array<{ value: number | string }> = [];
      engine.subscribe((v) => values.push(...v));

      engine.setPlayhead(-100);
      expect(values[0]?.value).toBe(0);

      values.length = 0;
      engine.setPlayhead(5000);
      expect(values[0]?.value).toBe(1);
    });
  });

  describe('play/pause/stop', () => {
    it('play starts the engine, pause stops it', () => {
      engine.addTimeline(makeTimeline());
      const values: Array<{ value: number | string }> = [];
      engine.subscribe((v) => values.push(...v));

      engine.play();
      // Simulate frame at 500ms
      vi.advanceTimersByTime(500);
      expect(values.length).toBeGreaterThan(0);

      engine.pause();
      const countAfterPause = values.length;
      vi.advanceTimersByTime(500);
      // No new values after pause (or minimal — the last frame might fire)
      expect(values.length).toBeLessThanOrEqual(countAfterPause + 1);
    });

    it('stop resets playhead to 0', () => {
      engine.addTimeline(makeTimeline());
      const values: Array<{ value: number | string }> = [];
      engine.subscribe((v) => values.push(...v));

      engine.play();
      vi.advanceTimersByTime(500);
      engine.stop();

      // After stop, playhead is at 0 → value should be 0
      const lastValues = values[values.length - 1];
      expect(lastValues?.value).toBe(0);
    });
  });

  describe('subscribe', () => {
    it('emits interpolated values for all tracks', () => {
      const track2: Track = {
        id: 'track-2',
        property: 'translateX',
        keyframes: [
          { timeMs: 0, value: 'translate(0px, 0px)' },
          { timeMs: 1000, value: 'translate(100px, 0px)' },
        ],
        startOffsetMs: 0,
      };
      engine.addTimeline(makeTimeline({ tracks: [makeTrack(), track2] }));

      const values: Array<{ property: string; value: number | string }> = [];
      engine.subscribe((v) => values.push(...v));

      engine.setPlayhead(500);
      const opacity = values.find((v) => v.property === 'opacity');
      const tx = values.find((v) => v.property === 'translateX');
      expect(opacity?.value).toBe(0.5);
      expect(tx?.value).toBe('translate(50px, 0px)');
    });

    it('unsubscribe stops emissions', () => {
      engine.addTimeline(makeTimeline());
      const values: Array<{ value: number | string }> = [];
      const unsub = engine.subscribe((v) => values.push(...v));

      engine.setPlayhead(500);
      expect(values.length).toBe(1);

      unsub();
      engine.setPlayhead(750);
      expect(values.length).toBe(1); // No new values
    });
  });

  describe('loop and playCount', () => {
    it('loops when loop=true', () => {
      const tl = makeTimeline({ durationMs: 1000, loop: true, playCount: Infinity });
      engine.addTimeline(tl);
      const values: Array<{ value: number | string }> = [];
      engine.subscribe((v) => values.push(...v));

      engine.play();
      // Manually tick 1500ms — should loop (500ms into second loop)
      engine.tickManually(1500);
      const lastVal = values[values.length - 1];
      expect(lastVal?.value).toBe(0.5);
    });

    it('respects playCount', () => {
      const tl = makeTimeline({ durationMs: 1000, loop: false, playCount: 2 });
      engine.addTimeline(tl);
      const values: Array<{ value: number | string }> = [];
      engine.subscribe((v) => values.push(...v));

      engine.play();
      engine.tickManually(2500);
      const lastVal = values[values.length - 1];
      // After 2 plays, should be at end
      expect(lastVal?.value).toBe(1);
    });
  });

  describe('debounced writes', () => {
    it('emits persist event immediately (leading-edge)', () => {
      engine.addTimeline(makeTimeline());
      const events: Array<{ type: string }> = [];
      engine.onEvent((e) => events.push(e));

      engine.play();
      vi.advanceTimersByTime(100);

      // Leading-edge persist should have fired
      const persistEvents = events.filter((e) => e.type === 'persist');
      expect(persistEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('debounces persist at 250ms', () => {
      engine.addTimeline(makeTimeline());
      const events: Array<{ type: string }> = [];
      engine.onEvent((e) => events.push(e));

      engine.play();
      vi.advanceTimersByTime(100);
      const countAt100 = events.filter((e) => e.type === 'persist').length;

      vi.advanceTimersByTime(200); // total 300ms
      const countAt300 = events.filter((e) => e.type === 'persist').length;

      // Should not have more than 2 persist events (leading + trailing)
      expect(countAt300).toBeLessThanOrEqual(countAt100 + 1);
    });
  });

  describe('worker offload', () => {
    it('routes large values through worker adapter', () => {
      const adapter = {
        interpolate: vi.fn().mockReturnValue('worker-result'),
      };

      const largeValue = 'M'.repeat(200);
      const track: Track = {
        id: 'track-large',
        property: 'd',
        keyframes: [
          { timeMs: 0, value: largeValue },
          { timeMs: 1000, value: 'M100,100' },
        ],
        startOffsetMs: 0,
      };
      engine.addTimeline(makeTimeline({ tracks: [track] }));
      engine.setWorkerOffloadThreshold(100);
      engine.setWorkerAdapter(adapter);

      const values: Array<{ value: number | string }> = [];
      engine.subscribe((v) => values.push(...v));

      engine.setPlayhead(500);
      expect(adapter.interpolate).toHaveBeenCalled();
      expect(values[0]?.value).toBe('worker-result');
    });
  });

  describe('custom easing', () => {
    it('applies per-keyframe easing', () => {
      const easeIn = (t: number) => t * t;
      const track: Track = {
        id: 'track-ease',
        property: 'opacity',
        keyframes: [
          { timeMs: 0, value: 0, easing: easeIn },
          { timeMs: 1000, value: 1 },
        ],
        startOffsetMs: 0,
      };
      engine.addTimeline(makeTimeline({ tracks: [track] }));

      const values: Array<{ value: number | string }> = [];
      engine.subscribe((v) => values.push(...v));

      engine.setPlayhead(500);
      // rawT = 0.5, eased = 0.5*0.5 = 0.25, value = 0 + 0.25 = 0.25
      expect(values[0]?.value).toBe(0.25);
    });
  });
});
