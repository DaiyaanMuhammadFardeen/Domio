import { describe, it, expect } from 'vitest';
import { interpolateAt, sampleChannel, type Keyframe } from './scrub.js';

describe('scrub', () => {
  describe('interpolateAt', () => {
    it('returns 0 for empty keyframes', () => {
      expect(interpolateAt([], 100)).toBe(0);
    });

    it('returns the value at exact keyframe time', () => {
      const kf: Keyframe[] = [
        { t: 0, v: 0 },
        { t: 500, v: 100 },
        { t: 1000, v: 200 },
      ];
      expect(interpolateAt(kf, 0)).toBe(0);
      expect(interpolateAt(kf, 500)).toBe(100);
      expect(interpolateAt(kf, 1000)).toBe(200);
    });

    it('interpolates linearly between keyframes', () => {
      const kf: Keyframe[] = [
        { t: 0, v: 0 },
        { t: 1000, v: 100 },
      ];
      // 500ms → halfway → 50
      expect(interpolateAt(kf, 500)).toBeCloseTo(50, 10);
      // 250ms → quarter → 25
      expect(interpolateAt(kf, 250)).toBeCloseTo(25, 10);
      // 750ms → three-quarter → 75
      expect(interpolateAt(kf, 750)).toBeCloseTo(75, 10);
    });

    it('clamps to first keyframe value before range', () => {
      const kf: Keyframe[] = [
        { t: 100, v: 50 },
        { t: 500, v: 100 },
      ];
      expect(interpolateAt(kf, 0)).toBe(50);
      expect(interpolateAt(kf, -100)).toBe(50);
      expect(interpolateAt(kf, 99)).toBe(50);
    });

    it('clamps to last keyframe value after range', () => {
      const kf: Keyframe[] = [
        { t: 0, v: 0 },
        { t: 500, v: 100 },
      ];
      expect(interpolateAt(kf, 600)).toBe(100);
      expect(interpolateAt(kf, 10000)).toBe(100);
    });

    it('handles single keyframe (constant value)', () => {
      const kf: Keyframe[] = [{ t: 500, v: 42 }];
      expect(interpolateAt(kf, 0)).toBe(42);
      expect(interpolateAt(kf, 500)).toBe(42);
      expect(interpolateAt(kf, 9999)).toBe(42);
    });

    it('handles multiple segments', () => {
      const kf: Keyframe[] = [
        { t: 0, v: 0 },
        { t: 200, v: 100 },
        { t: 400, v: 0 },
        { t: 600, v: 100 },
      ];
      // In each segment, linear interpolation
      expect(interpolateAt(kf, 100)).toBeCloseTo(50, 10);
      expect(interpolateAt(kf, 300)).toBeCloseTo(50, 10);
      expect(interpolateAt(kf, 500)).toBeCloseTo(50, 10);
    });

    it('defensively sorts unsorted keyframes', () => {
      const kf: Keyframe[] = [
        { t: 500, v: 100 },
        { t: 0, v: 0 },
      ];
      expect(interpolateAt(kf, 250)).toBeCloseTo(50, 10);
    });
  });

  describe('sampleChannel', () => {
    it('samples at 60fps over a 1-second channel', () => {
      const kf: Keyframe[] = [
        { t: 0, v: 0 },
        { t: 1000, v: 100 },
      ];
      const samples = sampleChannel(kf, 1000, 60);
      // 60fps over 1000ms → 60 intervals → 61 samples (0..60)
      expect(samples).toHaveLength(61);
      expect(samples[0]!.v).toBe(0);
      expect(samples[60]!.v).toBeCloseTo(100, 5);
      // Linear: frame 30 → 500ms → value 50
      expect(samples[30]!.v).toBeCloseTo(50, 5);
    });

    it('handles zero duration', () => {
      const kf: Keyframe[] = [{ t: 0, v: 42 }];
      const samples = sampleChannel(kf, 0, 60);
      expect(samples).toHaveLength(1);
      expect(samples[0]!.v).toBe(42);
    });

    it('respects custom fps', () => {
      const kf: Keyframe[] = [
        { t: 0, v: 0 },
        { t: 1000, v: 60 },
      ];
      const samples = sampleChannel(kf, 1000, 30);
      // 30fps over 1000ms → 31 samples
      expect(samples).toHaveLength(31);
    });
  });
});
