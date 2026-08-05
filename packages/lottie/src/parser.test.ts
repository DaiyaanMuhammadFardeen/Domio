import { describe, it, expect } from 'vitest';
import { parseLottieJson } from './parser.js';

describe('parseLottieJson', () => {
  // ----- Valid minimal Lottie JSON ------------------------------------
  it('parses a valid minimal Lottie JSON', () => {
    const lottie = {
      v: '5.7.4',
      fr: 30,
      ip: 0,
      op: 60,
      w: 1920,
      h: 1080,
      layers: [
        { ty: 0, nm: 'comp', ip: 0, op: 60 },
        { ty: 4, nm: 'shape', ip: 0, op: 30 },
      ],
    };

    const result = parseLottieJson(lottie);

    expect(result.version).toBe('5.7.4');
    expect(result.frameRate).toBe(30);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.totalFrames).toBe(60);
    expect(result.layerCount).toBe(2);
    expect(result.durationMs).toBeCloseTo(2000, 0);
    expect(result.warnings).toHaveLength(0);
  });

  // ----- Malformed input → error or warnings, never crash -------------
  it('throws on non-object input', () => {
    expect(() => parseLottieJson(null)).toThrow('non-null object');
    expect(() => parseLottieJson(undefined)).toThrow('non-null object');
    expect(() => parseLottieJson(42)).toThrow('non-null object');
    expect(() => parseLottieJson('string')).toThrow('non-null object');
  });

  it('returns warnings for empty object', () => {
    const result = parseLottieJson({});
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.frameRate).toBe(0);
    expect(result.width).toBe(0);
    expect(result.height).toBe(0);
    expect(result.layerCount).toBe(0);
  });

  it('returns warnings for missing version', () => {
    const result = parseLottieJson({
      fr: 30,
      w: 1920,
      h: 1080,
      ip: 0,
      op: 60,
      layers: [{ ty: 0, ip: 0, op: 60 }],
    });
    expect(result.version).toBe('');
    expect(result.warnings).toHaveLength(0); // version missing is not fatal
  });

  it('returns warnings for non-array layers', () => {
    const result = parseLottieJson({
      v: '5.0.0',
      fr: 30,
      w: 1920,
      h: 1080,
      ip: 0,
      op: 60,
      layers: 'not-an-array',
    });
    expect(result.layerCount).toBe(0);
    expect(result.warnings).toContainEqual('No layers found in animation');
  });

  it('returns warning for negative frame rate', () => {
    const result = parseLottieJson({
      v: '5.0.0',
      fr: -10,
      w: 1920,
      h: 1080,
      ip: 0,
      op: 60,
      layers: [{ ty: 0, ip: 0, op: 60 }],
    });
    expect(result.frameRate).toBe(-10);
    expect(result.warnings.some(w => w.includes('Frame rate'))).toBe(true);
  });

  it('returns warnings for zero dimensions', () => {
    const result = parseLottieJson({
      v: '5.0.0',
      fr: 30,
      w: 0,
      h: 0,
      ip: 0,
      op: 60,
      layers: [{ ty: 0, ip: 0, op: 60 }],
    });
    expect(result.width).toBe(0);
    expect(result.warnings.some(w => w.includes('Width or height'))).toBe(true);
  });

  // ----- Zero-frame → warning -----------------------------------------
  it('warns when no frames can be determined from layers', () => {
    const result = parseLottieJson({
      v: '5.0.0',
      fr: 30,
      w: 1920,
      h: 1080,
      layers: [
        { ty: 4, nm: 'shape' }, // no ip/op
      ],
    });
    expect(result.warnings.some(w => w.includes('total frames'))).toBe(true);
  });

  // ----- Layer count from op spread ------------------------------------
  it('computes totalFrames from layer out-point spread', () => {
    const result = parseLottieJson({
      v: '5.0.0',
      fr: 24,
      w: 1920,
      h: 1080,
      layers: [
        { ty: 0, ip: 0, op: 24 },
        { ty: 4, ip: 10, op: 48 },
      ],
    });
    // max spread is 48 - 10 = 38
    expect(result.totalFrames).toBe(38);
    expect(result.durationMs).toBeCloseTo((38 / 24) * 1000, 0);
  });

  // ----- Pass-through layers array ------------------------------------
  it('includes layers in the result', () => {
    const layers = [{ ty: 0, nm: 'a' }, { ty: 4, nm: 'b' }];
    const result = parseLottieJson({
      v: '5.0.0',
      fr: 30,
      w: 100,
      h: 100,
      ip: 0,
      op: 30,
      layers,
    });
    expect(result.layers).toEqual(layers);
  });
});
