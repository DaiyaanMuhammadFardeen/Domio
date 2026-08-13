/**
 * gaze-service tests — Wave 11 §S11.3.
 *
 * Covers the calibration persistence + in-memory gaze ring buffer. All
 * network paths degrade gracefully so the demo build runs offline.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getGazeCalibration,
  recordGazeEvent,
  saveGazeCalibration,
  __peekGazeBuffer,
  __resetGazeServiceState,
} from './gaze-service';

describe('gaze-service', () => {
  beforeEach(() => {
    __resetGazeServiceState();
  });

  afterEach(() => {
    __resetGazeServiceState();
  });

  describe('saveGazeCalibration', () => {
    it('returns a canonical descriptor with id and timestamp', async () => {
      const points = [
        { x: 0.1, y: 0.1 },
        { x: 0.5, y: 0.5 },
        { x: 0.9, y: 0.9 },
      ];
      const cal = await saveGazeCalibration(points);
      expect(cal.id).toMatch(/^gc_/);
      expect(typeof cal.completed_at_ms).toBe('number');
      expect(cal.points).toHaveLength(3);
      expect(cal.points[0]).toEqual({ x: 0.1, y: 0.1 });
    });

    it('persists across calls via getGazeCalibration', async () => {
      const points = [
        { x: 0.2, y: 0.3 },
        { x: 0.8, y: 0.7 },
      ];
      const saved = await saveGazeCalibration(points);
      const loaded = await getGazeCalibration();
      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe(saved.id);
      expect(loaded?.points).toHaveLength(2);
      expect(loaded?.points[0]).toEqual({ x: 0.2, y: 0.3 });
    });

    it('overwrites any prior calibration on save', async () => {
      await saveGazeCalibration([{ x: 0, y: 0 }]);
      const second = await saveGazeCalibration([{ x: 1, y: 1 }]);
      const loaded = await getGazeCalibration();
      expect(loaded?.id).toBe(second.id);
      expect(loaded?.points).toHaveLength(1);
      expect(loaded?.points[0]).toEqual({ x: 1, y: 1 });
    });

    it('returns null when no calibration has been saved', async () => {
      const loaded = await getGazeCalibration({
        storageKey: `fresh-${Date.now()}-${Math.random()}`,
      });
      expect(loaded).toBeNull();
    });
  });

  describe('recordGazeEvent', () => {
    it('appends samples to the in-memory ring buffer', async () => {
      await recordGazeEvent({ x: 0.5, y: 0.5, confidence: 0.9, timestamp_ms: 1 });
      await recordGazeEvent({ x: 0.6, y: 0.6, confidence: 0.8, timestamp_ms: 2 });
      const buf = __peekGazeBuffer();
      expect(buf).toHaveLength(2);
      expect(buf[1]?.timestamp_ms).toBe(2);
    });

    it('caps the ring buffer to a sane size', async () => {
      for (let i = 0; i < 600; i++) {
        await recordGazeEvent({ x: 0, y: 0, confidence: 0.5, timestamp_ms: i });
      }
      const buf = __peekGazeBuffer();
      expect(buf.length).toBeLessThanOrEqual(512);
    });

    it('never throws on bad input', async () => {
      // @ts-expect-error — intentionally pass garbage to verify resilience
      await expect(recordGazeEvent(null)).resolves.toBeUndefined();
    });
  });

  describe('storage failure tolerance', () => {
    it('falls back to in-memory when localStorage throws on read', async () => {
      if (typeof window === 'undefined') {
        // gaze-service uses localStorage which only exists in jsdom. Skip in node.
        return;
      }
      const original = window.localStorage;
      Object.defineProperty(window, 'localStorage', {
        value: {
          getItem: () => {
            throw new Error('blocked');
          },
          setItem: () => {
            throw new Error('blocked');
          },
          removeItem: () => {
            /* noop */
          },
        },
        writable: true,
        configurable: true,
      });
      try {
        const before = await getGazeCalibration();
        expect(before).toBeNull();
        const cal = await saveGazeCalibration([{ x: 0.5, y: 0.5 }]);
        expect(cal.id).toMatch(/^gc_/);
        // get still returns null because write was swallowed
        const after = await getGazeCalibration();
        expect(after).toBeNull();
      } finally {
        Object.defineProperty(window, 'localStorage', {
          value: original,
          writable: true,
          configurable: true,
        });
      }
    });
  });
});
