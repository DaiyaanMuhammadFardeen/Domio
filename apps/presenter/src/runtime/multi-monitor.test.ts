/**
 * Multi-monitor helpers tests — S4.1.
 */

import { describe, it, expect } from 'vitest';
import { formatPresentations, formatResolution } from '../runtime/multi-monitor';

describe('formatPresentations', () => {
  it('returns empty list when no availability value', () => {
    expect(formatPresentations(undefined)).toEqual([]);
  });

  it('returns the secondary display when value=true', () => {
    const list = formatPresentations({ value: true } as never);
    expect(list.length).toBe(1);
    expect(list[0]?.id).toBe('secondary');
    expect(list[0]?.isPrimary).toBe(false);
  });

  it('returns empty list when value=false', () => {
    const list = formatPresentations({ value: false } as never);
    expect(list).toEqual([]);
  });
});

describe('formatResolution', () => {
  it('returns null when either dimension is undefined', () => {
    expect(formatResolution(undefined, 1080)).toBe(null);
    expect(formatResolution(1920, undefined)).toBe(null);
  });

  it('joins width and height with ×', () => {
    expect(formatResolution(1920, 1080)).toBe('1920×1080');
  });
});