import { describe, expect, it } from 'vitest';
import { tickStepForZoom } from './Rulers';

describe('tickStepForZoom', () => {
  it('returns 100 at zoom 1', () => {
    expect(tickStepForZoom(1)).toBe(100);
  });

  it('returns a denser step when zoomed in', () => {
    expect(tickStepForZoom(2)).toBe(50);
    expect(tickStepForZoom(4)).toBe(25);
  });

  it('returns a sparser step when zoomed out', () => {
    expect(tickStepForZoom(0.5)).toBe(200);
    expect(tickStepForZoom(0.1)).toBe(1000);
  });

  it('handles edge inputs gracefully', () => {
    expect(tickStepForZoom(0)).toBe(100);
    expect(tickStepForZoom(-1)).toBe(100);
    expect(tickStepForZoom(Number.NaN)).toBe(100);
    expect(tickStepForZoom(Number.POSITIVE_INFINITY)).toBe(100);
  });
});