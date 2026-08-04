/**
 * @domio/animation-runtime — interpolate tests.
 */

import { describe, it, expect } from 'vitest';
import { interpolate } from './interpolate.js';

describe('interpolate', () => {
  describe('numbers', () => {
    it('linear lerp between two numbers', () => {
      expect(interpolate(0, 100, 0)).toBe(0);
      expect(interpolate(0, 100, 0.5)).toBe(50);
      expect(interpolate(0, 100, 1)).toBe(100);
    });

    it('handles negative numbers', () => {
      expect(interpolate(-50, 50, 0.5)).toBe(0);
    });

    it('handles decimal precision', () => {
      const result = interpolate(0, 1, 0.33);
      expect(result).toBeCloseTo(0.33, 5);
    });
  });

  describe('colors', () => {
    it('interpolates hex colors (#rrggbb)', () => {
      const result = interpolate('#000000', '#ffffff', 0.5) as string;
      expect(result).toBe('#808080');
    });

    it('interpolates hex colors (#rgb)', () => {
      const result = interpolate('#000', '#fff', 0.5) as string;
      expect(result).toBe('#808080');
    });

    it('interpolates hex colors (#rrggbbaa)', () => {
      const result = interpolate('#00000000', '#ffffff80', 0.5) as string;
      expect(result).toBe('#80808040');
    });

    it('interpolates rgb() colors', () => {
      const result = interpolate('rgb(0, 0, 0)', 'rgb(255, 255, 255)', 0.5) as string;
      expect(result).toBe('#808080');
    });

    it('interpolates rgba() colors', () => {
      const result = interpolate('rgba(0, 0, 0, 0)', 'rgba(255, 255, 255, 1)', 0.5) as string;
      expect(result).toBe('#80808080');
    });

    it('preserves full-opacity hex without alpha', () => {
      const result = interpolate('#ff0000', '#00ff00', 0.5) as string;
      expect(result).toBe('#808000');
    });
  });

  describe('string-with-number', () => {
    it('interpolates numeric parts in translate()', () => {
      const result = interpolate(
        'translate(10px, 20px)',
        'translate(50px, 80px)',
        0.5,
      ) as string;
      expect(result).toBe('translate(30px, 50px)');
    });

    it('handles single numeric value', () => {
      const result = interpolate('rotate(0deg)', 'rotate(90deg)', 0.5) as string;
      expect(result).toBe('rotate(45deg)');
    });

    it('handles negative numbers in strings', () => {
      const result = interpolate(
        'translate(-10px, 0px)',
        'translate(10px, 0px)',
        0.5,
      ) as string;
      expect(result).toBe('translate(0px, 0px)');
    });

    it('returns b as-is when strings have no numbers', () => {
      const result = interpolate('foo', 'bar', 0.5);
      expect(result).toBe('bar');
    });

    it('returns b as-is when number counts differ', () => {
      const result = interpolate('translate(10px)', 'translate(10px, 20px)', 0.5);
      expect(result).toBe('translate(10px, 20px)');
    });
  });

  describe('mixed types (fallback)', () => {
    it('returns b when t >= 0.5', () => {
      expect(interpolate(0, 'foo', 0.5)).toBe('foo');
      expect(interpolate(0, 'foo', 0.6)).toBe('foo');
    });

    it('returns a when t < 0.5', () => {
      expect(interpolate(0, 'foo', 0.4)).toBe(0);
    });
  });
});
